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
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

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
