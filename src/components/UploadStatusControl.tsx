"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadWindowState } from "@/lib/uploadWindow";
import type { Event } from "@/lib/supabase/types";

// The organizer's one-action "make it stop" (US-23, design.md §5). Reuses
// upload_ends_at rather than a second "paused" flag, so submit_photo() and
// the slideshow's QR gating react through machinery that already exists
// and there's never two answers to "can anyone upload right now". Kept
// deliberately far from anything in `btn-danger*` — this pauses uploads,
// it doesn't touch a single photo (Feature 003 US-11 is the precedent for
// keeping that distinction visible, not just documented).
export function UploadStatusControl({
  event,
  photoCount,
}: {
  event: Pick<
    Event,
    "id" | "upload_starts_at" | "upload_ends_at" | "photo_limit"
  >;
  photoCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { notOpenYet, closed } = uploadWindowState(
    event.upload_starts_at,
    event.upload_ends_at,
  );
  const uploadsOpen = !notOpenYet && !closed;
  const atLimit = photoCount >= event.photo_limit;
  const nearLimit = !atLimit && photoCount >= event.photo_limit * 0.9;

  async function setUploadEndsAt(value: string | null) {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("events")
      .update({ upload_ends_at: value })
      .eq("id", event.id);
    setPending(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <section className="card mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <p className="text-sm font-semibold">
          {notOpenYet ? (
            <span className="text-ink-soft">Uploads haven&apos;t opened yet</span>
          ) : uploadsOpen ? (
            <span className="text-success">Uploads are open</span>
          ) : (
            <span className="text-warn">Uploads are stopped</span>
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
            {photoCount} / {event.photo_limit} photos
          </span>
          {atLimit && " — event is full, raise the limit in Settings to allow more"}
        </p>
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>

      {uploadsOpen && (
        <button
          type="button"
          onClick={() => setUploadEndsAt(new Date().toISOString())}
          disabled={pending}
          className="btn btn-accent"
        >
          Stop uploads
        </button>
      )}
      {closed && (
        <button
          type="button"
          onClick={() => setUploadEndsAt(null)}
          disabled={pending}
          className="btn btn-secondary"
        >
          Resume uploads
        </button>
      )}
    </section>
  );
}
