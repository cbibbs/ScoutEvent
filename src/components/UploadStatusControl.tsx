"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadWindowState } from "@/lib/uploadWindow";
import type { Event } from "@/lib/supabase/types";

const POLL_MS = 30_000;

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

  // The organizer already has full RLS visibility on their own event's
  // photos (unlike the anonymous guest/slideshow pages), so a plain count
  // query is accurate here — no need for the event_photo_count() RPC.
  const refresh = useCallback(async () => {
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
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const { notOpenYet, closed } = uploadWindowState(uploadStartsAt, uploadEndsAt);
  const atLimit = photoCount >= photoLimit;
  const nearLimit = !atLimit && photoCount >= photoLimit * 0.9;

  async function togglePaused() {
    setPending(true);
    setError(null);
    const nextPaused = !paused;
    const { error: updateError } = await supabase
      .from("events")
      .update({ uploads_paused: nextPaused })
      .eq("id", eventId);
    setPending(false);
    if (updateError) {
      setError(updateError.message);
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
            {photoCount} / {photoLimit} photos
          </span>
          {atLimit && " — event is full, raise the limit in Settings to allow more"}
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
