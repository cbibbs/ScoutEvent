import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/UploadForm";
import { uploadWindowState } from "@/lib/uploadWindow";
import type { Event } from "@/lib/supabase/types";

export default async function GuestUploadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Event>();

  if (!event) notFound();

  const { notOpenYet, closed } = uploadWindowState(
    event.upload_starts_at,
    event.upload_ends_at,
  );

  // security definer — see event_photo_count() in
  // 20260921000000_upload_abuse_protection.sql (design.md §3): a plain
  // anonymous count would undercount past the photos SELECT policy, which
  // would make this page show the upload form for an event that's
  // actually full.
  const { data: photoCount } = await supabase.rpc("event_photo_count", {
    p_event_id: event.id,
  });
  const full = (photoCount ?? 0) >= event.photo_limit;
  // Stopped (US-23) and closed-by-schedule read identically to a guest —
  // "from the guest's side a paused event and a finished one are the
  // same thing" (design.md §6) — so they share the same copy below.
  const stopped = closed || event.uploads_paused;

  return (
    <div className="min-h-screen bg-ground">
      <div className="tartan-rule" />
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-10">
        <div className="mb-3 flex items-center gap-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3 L21 20 H3 Z" />
            <path d="M12 3 L12 20" />
            <path d="M7.5 12 H16.5" />
          </svg>
          <span className="font-display text-[13.5px] tracking-wide text-ink-faint uppercase">
            ScoutEvent
          </span>
        </div>
        <h1 className="text-center font-display text-2xl leading-tight">
          {event.name}
        </h1>
        <p className="mt-2 mb-8 text-center text-sm text-ink-soft">
          Share your photos from the event
        </p>

        {notOpenYet ? (
          <p className="card w-full p-4 text-center text-sm text-warn">
            Uploads for this event haven&apos;t opened yet. Check back soon!
          </p>
        ) : stopped ? (
          <p className="card w-full p-4 text-center text-sm text-ink-soft">
            Uploads for this event are closed. Thanks for sharing your
            photos!
          </p>
        ) : full ? (
          // Told before they pick photos and wait through compression and
          // upload only to be refused, not after (US-22, design.md §4).
          <p className="card w-full p-4 text-center text-sm text-ink-soft">
            This event has reached its photo limit — let the organizer
            know.
          </p>
        ) : (
          <UploadForm eventId={event.id} />
        )}

        <Link
          href={`/e/${event.slug}/slideshow`}
          className="mt-10 text-xs text-ink-faint hover:text-ink-soft hover:underline"
        >
          View live slideshow →
        </Link>
      </div>
    </div>
  );
}
