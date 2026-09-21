"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadWindowState } from "@/lib/uploadWindow";
import { POLL_FALLBACK_MS } from "@/components/manage/constants";
import type { Event } from "@/lib/supabase/types";

type PolledFields = Pick<
  Event,
  "upload_starts_at" | "upload_ends_at" | "uploads_paused" | "photo_limit"
>;

// The organizer's one-action "make it stop" (US-23, design.md §5 —
// corrected after review). Writes only `uploads_paused`; it never touches
// `upload_ends_at`, which belongs to EventSettingsForm alone (the
// schedule). Two components writing the same column, one of them caching
// it in client state, is exactly the bug that shipped here originally —
// one writer per column now. Kept deliberately far from anything in
// `btn-danger*` — this pauses uploads, it doesn't touch a single photo
// (Feature 003 US-11 is the precedent for keeping that distinction
// visible, not just documented).
//
// Live counts and upload state (design.md §7): this component keeps its
// own state seeded from initial (server-rendered) props, then refreshes
// itself on a 30s poll and immediately after its own Stop/Resume calls —
// the same self-healing shape Slideshow already uses — rather than
// depending on a parent re-render to stay current. A count frozen at page
// load cannot warn anyone and actively reassures while uploads are being
// refused.
export function UploadStatusControl({
  eventId,
  initialUploadStartsAt,
  initialUploadEndsAt,
  initialUploadsPaused,
  initialPhotoLimit,
  initialPhotoCount,
}: {
  eventId: string;
  initialUploadStartsAt: string | null;
  initialUploadEndsAt: string | null;
  initialUploadsPaused: boolean;
  initialPhotoLimit: number;
  initialPhotoCount: number;
}) {
  const [supabase] = useState(() => createClient());
  const [uploadStartsAt, setUploadStartsAt] = useState(initialUploadStartsAt);
  const [uploadEndsAt, setUploadEndsAt] = useState(initialUploadEndsAt);
  const [paused, setPaused] = useState(initialUploadsPaused);
  const [photoLimit, setPhotoLimit] = useState(initialPhotoLimit);
  const [photoCount, setPhotoCount] = useState(initialPhotoCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped every time a local Stop/Resume write starts, and compared
  // against on every poll response before it's applied — a poll that was
  // already in flight when the organizer clicked Stop must not land
  // afterwards with the old (pre-write) value and briefly show the
  // emergency stop as undone (design.md §7).
  const writeVersionRef = useRef(0);

  // The organizer already has full RLS visibility on their own event's
  // photos (unlike the anonymous guest/slideshow pages), so a plain count
  // query is accurate here — no need for the event_photo_count() RPC.
  const refresh = useCallback(async () => {
    const version = writeVersionRef.current;
    const [{ data: freshEvent }, { count: freshCount }] = await Promise.all([
      supabase
        .from("events")
        .select("upload_starts_at, upload_ends_at, uploads_paused, photo_limit")
        .eq("id", eventId)
        .maybeSingle<PolledFields>(),
      supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId),
    ]);
    if (version !== writeVersionRef.current) return;
    if (freshEvent) {
      setUploadStartsAt(freshEvent.upload_starts_at);
      setUploadEndsAt(freshEvent.upload_ends_at);
      setPaused(freshEvent.uploads_paused);
      setPhotoLimit(freshEvent.photo_limit);
    }
    if (typeof freshCount === "number") setPhotoCount(freshCount);
  }, [eventId, supabase]);

  useEffect(() => {
    const id = setInterval(() => {
      void refresh();
    }, POLL_FALLBACK_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const { notOpenYet, closed } = uploadWindowState(uploadStartsAt, uploadEndsAt);
  // `photoLimit` reads as `undefined` at runtime if this feature's
  // migration hasn't been applied yet, even though the type says
  // `number` (specs/PROJECT.md, "Migrations and deploy order"). Guarded
  // so this renders "N photos" rather than "N / undefined photos", and
  // never claims "full" when there's nothing to compare against.
  const photoLimitKnown = typeof photoLimit === "number";
  const atLimit = photoLimitKnown && photoCount >= photoLimit;
  const nearLimit = photoLimitKnown && !atLimit && photoCount >= photoLimit * 0.9;

  async function togglePaused() {
    writeVersionRef.current += 1;
    setPending(true);
    setError(null);
    const nextPaused = !paused;
    const { error: updateError } = await supabase
      .from("events")
      .update({ uploads_paused: nextPaused })
      .eq("id", eventId);
    setPending(false);
    if (updateError) {
      // PGRST204 ("Could not find the 'uploads_paused' column ... in the
      // schema cache") is what PostgREST actually returns for a
      // write to a column it doesn't know about yet — verified directly
      // against the live, unmigrated project rather than assumed; a
      // plain SELECT naming a missing column errors with Postgres's own
      // 42703 instead, but PATCH bodies are validated against PostgREST's
      // schema cache before a query is even built, so that's not the
      // error this call can produce. Either way this means the database
      // update for this feature hasn't been applied yet, which must read
      // as a stalled feature, not surface Postgres/PostgREST internals to
      // someone trying to stop uploads mid-event (specs/PROJECT.md,
      // "Migrations and deploy order").
      setError(
        updateError.code === "PGRST204" || updateError.code === "42703"
          ? "Stop/Resume isn't available yet — this event needs a database update first."
          : updateError.message,
      );
      return;
    }
    setPaused(nextPaused);
  }

  return (
    <section className="card mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <p className="text-sm font-semibold">
          {paused ? (
            <span className="text-warn">Uploads are stopped</span>
          ) : notOpenYet ? (
            <span className="text-ink-soft">Uploads haven&apos;t opened yet</span>
          ) : closed ? (
            <span className="text-ink-soft">Uploads are closed</span>
          ) : (
            <span className="text-success">Uploads are open</span>
          )}
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          <span
            className={
              atLimit
                ? "font-semibold text-danger"
                : nearLimit
                  ? "font-semibold text-warn"
                  : undefined
            }
          >
            {photoLimitKnown ? `${photoCount} / ${photoLimit} photos` : `${photoCount} photos`}
          </span>
          {atLimit &&
            // Rejecting doesn't free capacity — the cap counts rows of
            // every status — so "raise the limit" alone steers away from
            // the remedy that costs nothing (design.md §7).
            " — event is full. Delete photos to free capacity, or raise the limit in Settings."}
        </p>
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>

      {/* Renders regardless of window state (design.md §5) — an organizer
          setting up before the window opens still needs to be able to
          pre-emptively pause, and paused always wins over the schedule. */}
      <button
        type="button"
        onClick={togglePaused}
        disabled={pending}
        className={paused ? "btn btn-secondary" : "btn btn-accent"}
      >
        {paused ? "Resume uploads" : "Stop uploads"}
      </button>
    </section>
  );
}
