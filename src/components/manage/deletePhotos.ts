import type { createClient } from "@/lib/supabase/client";
import type { Photo } from "@/lib/supabase/types";

type Supabase = ReturnType<typeof createClient>;

// How many photos go to Storage and to the `photos` table per round trip.
// Small enough that a failure is reported against a bounded group and one
// request body stays modest; large enough that a 1500-photo clean-up is
// 30 round trips rather than 1500.
const CHUNK_SIZE = 50;
const PROBE_CONCURRENCY = 8;
// Consecutive probes that come back "unknown" before the run gives up. A
// handful of unknowns is a flaky request; this many in a row is Storage down,
// the network gone, or the probe no longer matching the bucket (see the note
// on probeObject) — and without a limit a 600-photo run is ~1200 doomed
// round trips with the UI stuck on "Deleting…".
const MAX_CONSECUTIVE_UNKNOWN = 5;

export type DeleteFailure = {
  id: string;
  reason: string;
  /**
   * True when this photo's file is known to be gone but its row survives, so
   * it now renders as a broken image. False when the photo was left exactly
   * as it was. Lets the caller word a headline that matches the outcome.
   */
  fileDeleted: boolean;
};

export type DeleteResult = {
  /** Photos whose file is confirmed gone AND whose row is confirmed gone. */
  deletedIds: Set<string>;
  /** Everything else, each with a specific reason. Row and/or file may remain. */
  failures: DeleteFailure[];
};

// Reasons are shown to the organizer verbatim and grouped by identical text,
// so the same cause across 300 photos reads as one line with a count.
export const REASON_REFUSED =
  "Storage refused to delete this photo's file, so the photo was left exactly as it was. " +
  "Nothing was lost or changed. This is a setup problem that only the site maintainer " +
  "can fix, so please tell them. In the meantime, Reject or Remove from slideshow will " +
  "still take the photo off the screen.";
// Diagnostic detail for whoever maintains the deployment. Shown in the console,
// not to the organizer, who can do nothing with a migration filename.
const REFUSED_DIAGNOSTIC =
  "[deletePhotos] Storage returned no error but did not delete a file that still " +
  "exists. The storage.objects SELECT policy for owners is probably missing: apply " +
  "supabase/migrations/20261005000000_storage_select_policy_for_delete.sql.";
export const REASON_UNCONFIRMED =
  "Storage did not confirm the file was deleted and its state could not be checked, " +
  "so the photo was kept. Try again; if it keeps happening, Storage may be " +
  "unreachable, so try again later.";
export const REASON_ROW_FAILED =
  "The file was deleted but the photo record could not be removed, so this photo now " +
  "shows as a broken image. Delete it again to finish.";
export const REASON_NOT_ATTEMPTED =
  "Not attempted — an earlier step failed and the rest were skipped. The photo was kept.";

type ProbeResult = "present" | "absent" | "unknown";

// !!! COUPLED TO THE BUCKET BEING PUBLIC — REWRITE THIS WHEN FEATURE 006 !!!
// !!! MAKES THE `photos` BUCKET PRIVATE.                                 !!!
//
// This probe reads `getPublicUrl()` and the public endpoint. Once the bucket
// is private that endpoint no longer answers "does this object exist": it
// returns "Bucket not found" for every path, so every probe comes back
// "unknown". Nothing will error and nothing will say why. The effect is:
//   * Photos `remove()` reports deleting still delete (the probe is skipped).
//   * Anything `remove()` does NOT report — an already-gone file, OR a file
//     RLS hid from the caller — can never be confirmed, so its row is never
//     deleted. If `remove()` can return an empty `data` on a genuine success
//     (the vendor's own docstring shows such an example response), deletion
//     becomes permanently inoperative: it fails safe, but never completes.
//   * The circuit breaker below trips, and the organizer sees "could not be
//     checked, try again" — which will be wrong, because retrying cannot help.
// The replacement must be an *authenticated* existence check made as the
// owner (e.g. a signed URL, or the SDK's authenticated exists/info call —
// check the installed storage-js version), and it must still tell "no such
// object" apart from "denied" and from a transport failure. The README's
// "delete it again" advice for broken-image photos depends on this too.
//
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

// Runs `fn` over `items` with bounded concurrency. Once `shouldStop()` is true
// no further items are started (those already in flight finish); skipped items
// are left `undefined` in the result.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  shouldStop: () => boolean = () => false,
): Promise<(R | undefined)[]> {
  const results = new Array<R | undefined>(items.length).fill(undefined);
  let next = 0;
  async function worker() {
    while (next < items.length && !shouldStop()) {
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
  const fail = (batch: Photo[], reason: string, fileDeleted = false) => {
    for (const p of batch) failures.push({ id: p.id, reason, fileDeleted });
  };
  let consecutiveUnknown = 0;
  const breakerTripped = () => consecutiveUnknown >= MAX_CONSECUTIVE_UNKNOWN;

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
      const probes = await mapWithConcurrency(
        unreported,
        PROBE_CONCURRENCY,
        async (p) => {
          const result = await probeObject(supabase, p.storage_path);
          consecutiveUnknown = result === "unknown" ? consecutiveUnknown + 1 : 0;
          return result;
        },
        breakerTripped,
      );
      unreported.forEach((p, i) => {
        const probe = probes[i];
        if (probe === "absent") {
          confirmed.push(p); // already gone — finish the job on the row
        } else if (probe === "present") {
          sawRefusal = true;
          failures.push({ id: p.id, reason: REASON_REFUSED, fileDeleted: false });
        } else {
          // "unknown", or never probed because the breaker tripped mid-chunk.
          // remove() was already called for these, so "not attempted" would
          // be untrue; their state is simply unconfirmed.
          failures.push({ id: p.id, reason: REASON_UNCONFIRMED, fileDeleted: false });
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
        fail(confirmed, `${REASON_ROW_FAILED} (${rowError.message})`, true);
      } else {
        const removed = new Set((gone ?? []).map((r) => r.id));
        const unmatched: Photo[] = [];
        for (const p of confirmed) {
          if (removed.has(p.id)) deletedIds.add(p.id);
          else unmatched.push(p);
        }

        // A DELETE that matches nothing is ambiguous: the row may already be
        // gone (another tab, a double-click before the realtime echo) or the
        // DELETE may have been blocked. Ask which.
        if (unmatched.length > 0) {
          const { data: still, error: checkError } = await supabase
            .from("photos")
            .select("id")
            .in(
              "id",
              unmatched.map((p) => p.id),
            );
          if (checkError) {
            fail(unmatched, `${REASON_ROW_FAILED} (${checkError.message})`, true);
          } else {
            const present = new Set((still ?? []).map((r) => r.id));
            for (const p of unmatched) {
              if (present.has(p.id)) fail([p], REASON_ROW_FAILED, true);
              else deletedIds.add(p.id); // already gone: that is a success
            }
          }
        }
      }
    }

    // A file that exists but was not deleted, without an error, is a
    // permissions problem — it will recur on every remaining chunk, so
    // stop instead of probing and failing thousands more.
    if (sawRefusal) {
      console.warn(REFUSED_DIAGNOSTIC);
      fail(photos.slice(start + CHUNK_SIZE), REASON_NOT_ATTEMPTED);
      break;
    }

    // Likewise a run of probes that cannot tell us anything is systematic.
    if (breakerTripped()) {
      console.warn(
        `[deletePhotos] ${MAX_CONSECUTIVE_UNKNOWN} consecutive existence probes were ` +
          "inconclusive; stopping. Storage may be down, or the probe no longer " +
          "matches the bucket (see the note on probeObject).",
      );
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
