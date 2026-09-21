"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Event } from "@/lib/supabase/types";

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time, no timezone.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventSettingsForm({ event }: { event: Event }) {
  const router = useRouter();
  const [name, setName] = useState(event.name);
  const [eventDate, setEventDate] = useState(event.event_date ?? "");
  const [uploadStartsAt, setUploadStartsAt] = useState(
    toLocalInputValue(event.upload_starts_at),
  );
  const [uploadEndsAt, setUploadEndsAt] = useState(
    toLocalInputValue(event.upload_ends_at),
  );
  const [moderationEnabled, setModerationEnabled] = useState(
    event.moderation_enabled,
  );
  const [slideshowInterval, setSlideshowInterval] = useState(
    event.slideshow_interval_seconds,
  );
  // `event.photo_limit` reads as `undefined` at runtime if Feature 007's
  // migration hasn't been applied yet, even though the type says
  // `number` — Postgres just never sent the column back. Tracked
  // separately from a plain "is it falsy" check so the rest of this
  // form can tell "not yet migrated" apart from "the organizer typed 0"
  // (specs/PROJECT.md, "Migrations and deploy order"; design.md §2/§3).
  const photoLimitKnown = typeof event.photo_limit === "number";
  const [photoLimit, setPhotoLimit] = useState(event.photo_limit);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    // Clearing the number input to retype it yields "", and Number("")
    // is 0 — `min={1}` alone does not stop a non-required empty field
    // from submitting. Refuse client-side rather than letting that save a
    // limit that makes the event permanently full; the DB check
    // constraint is the backstop, not the only guard (design.md §2).
    //
    // Only validated (and only sent) when the column is actually known to
    // exist. Absent is not invalid: before this validation existed, this
    // form's only job for stopping uploads was editing `upload_ends_at`,
    // and a migration not being applied yet must never take that away —
    // an `undefined` limit failing this guard would refuse *every* save,
    // including one that has nothing to do with the photo limit
    // (specs/PROJECT.md, "Migrations and deploy order").
    if (photoLimitKnown && (!Number.isFinite(photoLimit) || photoLimit < 1)) {
      setStatus("error");
      setError("Photo limit must be at least 1.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("events")
      .update({
        name,
        event_date: eventDate || null,
        upload_starts_at: uploadStartsAt
          ? new Date(uploadStartsAt).toISOString()
          : null,
        upload_ends_at: uploadEndsAt
          ? new Date(uploadEndsAt).toISOString()
          : null,
        moderation_enabled: moderationEnabled,
        slideshow_interval_seconds: slideshowInterval,
        // Omitted entirely (not sent as `undefined`) when the column
        // isn't known to exist yet — writing a key Postgres doesn't have
        // would fail the whole update, not just this field.
        ...(photoLimitKnown ? { photo_limit: photoLimit } : {}),
      })
      .eq("id", event.id);

    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }

    setStatus("saved");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col">
        <span className="field-label">Event name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
        />
      </label>

      <label className="flex flex-col">
        <span className="field-label">Event date</span>
        <input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className="input"
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col">
          <span className="field-label">Uploads open (optional)</span>
          <input
            type="datetime-local"
            value={uploadStartsAt}
            onChange={(e) => setUploadStartsAt(e.target.value)}
            className="input"
          />
        </label>
        <label className="flex flex-col">
          <span className="field-label">Uploads close (optional)</span>
          <input
            type="datetime-local"
            value={uploadEndsAt}
            onChange={(e) => setUploadEndsAt(e.target.value)}
            className="input"
          />
        </label>
      </div>

      <label className="flex flex-col">
        <span className="field-label">
          Slideshow advance interval (seconds)
        </span>
        <input
          type="number"
          min={2}
          max={60}
          value={slideshowInterval}
          onChange={(e) => setSlideshowInterval(Number(e.target.value))}
          className="input w-32"
        />
      </label>

      <label className="flex flex-col">
        <span className="field-label">Photo limit for this event</span>
        <input
          type="number"
          min={1}
          value={photoLimitKnown ? photoLimit : ""}
          disabled={!photoLimitKnown}
          onChange={(e) => setPhotoLimit(Number(e.target.value))}
          className="input w-32"
        />
        <span className="mt-1 text-[13px] text-ink-soft">
          {photoLimitKnown
            ? "Guests can't upload past this many photos. Raise it here if a real event legitimately hits the cap — it never has to be dead in the water mid-occasion."
            : "Not available on this event yet — a database update for this feature hasn't been applied. Everything else on this form still saves normally."}
        </span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={moderationEnabled}
          onChange={(e) => setModerationEnabled(e.target.checked)}
        />
        <span className="text-sm text-ink-soft">
          Require my approval before photos appear (moderation)
        </span>
      </label>
      {!moderationEnabled && (
        <p className="-mt-2 rounded-md bg-warn-tint px-3 py-2 text-[13px] text-warn">
          With moderation off, photos appear immediately and the
          slideshow&apos;s join QR won&apos;t be shown — nothing should
          invite a roomful of strangers to put something on screen
          unreviewed. You can still share the upload link yourself; guests
          who have it can keep uploading either way.
        </p>
      )}

      <button
        type="submit"
        disabled={status === "saving"}
        className="btn btn-outline btn-sm w-fit"
      >
        {status === "saving" ? "Saving…" : "Save settings"}
      </button>
      {status === "saved" && <p className="text-sm text-success">Saved.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
