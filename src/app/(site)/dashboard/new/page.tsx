"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/slug";

export default function NewEventPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [moderationEnabled, setModerationEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be signed in.");
      setSubmitting(false);
      return;
    }

    const slug = slugify(name);

    const { error } = await supabase.from("events").insert({
      organizer_id: user.id,
      name,
      slug,
      event_date: eventDate || null,
      moderation_enabled: moderationEnabled,
    });

    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }

    router.push(`/dashboard/${slug}`);
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="mb-6 font-display text-2xl">Create an event</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col">
          <span className="field-label">Event name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Troop 1610 Fall Campout"
            className="input"
          />
        </label>

        <label className="flex flex-col">
          <span className="field-label">Event date (optional)</span>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="input"
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
          disabled={submitting}
          className="btn btn-primary mt-2 w-fit"
        >
          {submitting ? "Creating…" : "Create event"}
        </button>

        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </div>
  );
}
