import type { createClient } from "@/lib/supabase/client";
import type { Photo } from "@/lib/supabase/types";

type Supabase = ReturnType<typeof createClient>;

// How many photos go to Storage and to the `photos` table per round trip.
// Small enough that a failure is reported against a bounded group and one
// request body stays modest; large enough that a 1500-photo clean-up is
// 30 round trips rather than 1500.
const CHUNK_SIZE = 50;
const PROBE_CONCURRENCY = 8;

export type DeleteFailure = { id: string; reason: string };

export type DeleteResult = {
  /** Photos whose file is confirmed gone AND whose row is confirmed gone. */
  deletedIds: Set<string>;
  /** Everything else, each with a specific reason. Row and/or file may remain. */
  failures: DeleteFailure[];
};

// Reasons are shown to the organizer verbatim and grouped by identical text,
// so the same cause across 300 photos reads as one line with a count.
export const REASON_REFUSED =
  "Storage did not delete the file, so the photo was kept (nothing was changed). " +
  "This usually means the storage delete permission is missing — apply the latest " +
  "migration, supabase/migrations/20261005000000_storage_select_policy_for_delete.sql.";
export const REASON_UNCONFIRMED =
  "Storage did not confirm the file was deleted and its state could not be checked, " +
  "so the photo was kept. Try again.";
export const REASON_ROW_FAILED =
  "The file was deleted but the photo record could not be removed, so this photo now " +
  "shows as a broken image. Delete it again to finish.";
export const REASON_NOT_ATTEMPTED =
  "Not attempted — an earlier step failed and the rest were skipped. The photo was kept.";

type ProbeResult = "present" | "absent" | "unknown";

// Asks the public endpoint — which never consults RLS — whether an object
// really exists. This exists because `remove()` cannot tell "already gone"
// from "hidden from you by RLS": both come back as an empty list with no
// error. Without it, a photo whose file was removed on an earlier attempt
// (and whose row delete then failed) could never be deleted, and a missing
// policy would be indistinguishable from success.
//
// Deliberately strict about "absent": only Storage's own "no such object"
// answer counts. Any other response (a different 4xx, a 5xx, a network
// error, and — important when the bucket goes private — "Bucket not found")
// is "unknown", which the caller treats as a failure that keeps the row.
async function probeObject(supabase: Supabase, path: string): Promise<ProbeResult> {
  const base = supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
  // Cache-bust: a CDN can answer for a deleted object for a while.
  const url = `${base}${base.includes("?") ? "&" : "?"}probe=${Date.now()}`;
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) return "present";
    // HEAD has no body; fetch it to see *why* it wasn't found.
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) return "present";
    const body: unknown = await res.json().catch(() => null);
    const code =
      body && typeof body === "object" && "code" in body
        ? (body as { code?: unknown }).code
        : undefined;
    return code === "NoSuchKey" ? "absent" : "unknown";
  } catch {
    return "unknown";
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

/**
 * Permanently deletes photos: the Storage object first, the row second, and
 * the row only for photos whose object is confirmed gone.
 *
 * Order, and why: if the object goes first and the row delete then fails, the
 * organizer is left with a row pointing at a missing file — visible (a broken
 * image), recoverable (delete again; the already-gone file is recognised),
 * and nothing is lost that was not meant to be. The reverse order leaves a
 * file with no row — invisible, unfindable from the app, and publicly
 * fetchable forever. That is the bug this replaces.
 *
 * Never throws for an expected failure; every photo either lands in
 * `deletedIds` or in `failures` with a reason.
 */
export async function deletePhotos(
  supabase: Supabase,
  photos: Photo[],
): Promise<DeleteResult> {
  const deletedIds = new Set<string>();
  const failures: DeleteFailure[] = [];
  const fail = (batch: Photo[], reason: string) => {
    for (const p of batch) failures.push({ id: p.id, reason });
  };

  for (let start = 0; start < photos.length; start += CHUNK_SIZE) {
    const chunk = photos.slice(start, start + CHUNK_SIZE);

    // 1. Storage.
    const { data, error } = await supabase.storage
      .from("photos")
      .remove(chunk.map((p) => p.storage_path));

    if (error) {
      fail(chunk, `Storage error: ${error.message}. The photo was kept.`);
      // An error (expired session, offline, service down) will not fix
      // itself between chunks; stop rather than hammer it.
      fail(photos.slice(start + CHUNK_SIZE), REASON_NOT_ATTEMPTED);
      break;
    }

    // 2. Which files are confirmed gone? Anything Storage reported deleting
    //    is. Anything it did not report is either already gone or hidden by
    //    RLS — `remove()` returns the same empty answer for both — so ask
    //    the public endpoint.
    const reported = new Set((data ?? []).map((o) => o.name));
    const confirmed: Photo[] = [];
    const unreported = chunk.filter((p) => {
      if (reported.has(p.storage_path)) {
        confirmed.push(p);
        return false;
      }
      return true;
    });

    let sawRefusal = false;
    if (unreported.length > 0) {
      const probes = await mapWithConcurrency(unreported, PROBE_CONCURRENCY, (p) =>
        probeObject(supabase, p.storage_path),
      );
      unreported.forEach((p, i) => {
        if (probes[i] === "absent") {
          confirmed.push(p); // already gone — finish the job on the row
        } else if (probes[i] === "present") {
          sawRefusal = true;
          failures.push({ id: p.id, reason: REASON_REFUSED });
        } else {
          failures.push({ id: p.id, reason: REASON_UNCONFIRMED });
        }
      });
    }

    // 3. Rows — only for photos whose file is confirmed gone.
    if (confirmed.length > 0) {
      const { data: gone, error: rowError } = await supabase
        .from("photos")
        .delete()
        .in(
          "id",
          confirmed.map((p) => p.id),
        )
        .select("id");
      if (rowError) {
        fail(confirmed, `${REASON_ROW_FAILED} (${rowError.message})`);
      } else {
        const removed = new Set((gone ?? []).map((r) => r.id));
        for (const p of confirmed) {
          if (removed.has(p.id)) deletedIds.add(p.id);
          else failures.push({ id: p.id, reason: REASON_ROW_FAILED });
        }
      }
    }

    // A file that exists but was not deleted, without an error, is a
    // permissions problem — it will recur on every remaining chunk, so
    // stop instead of probing and failing thousands more.
    if (sawRefusal) {
      fail(photos.slice(start + CHUNK_SIZE), REASON_NOT_ATTEMPTED);
      break;
    }
  }

  return { deletedIds, failures };
}

/** Groups failures by identical reason, most common first. */
export function summarizeFailures(
  failures: DeleteFailure[],
): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const f of failures) counts.set(f.reason, (counts.get(f.reason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}
