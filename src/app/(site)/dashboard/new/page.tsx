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
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Create an event</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Event name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Troop 1610 Fall Campout"
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Event date (optional)</span>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={moderationEnabled}
            onChange={(e) => setModerationEnabled(e.target.checked)}
          />
          <span className="text-sm">
            Require my approval before photos appear (moderation)
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create event"}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
