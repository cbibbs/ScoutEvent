import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/UploadForm";
import type { Event } from "@/lib/supabase/types";

function uploadWindowState(event: Event) {
  const now = Date.now();
  return {
    notOpenYet: Boolean(
      event.upload_starts_at && now < new Date(event.upload_starts_at).getTime(),
    ),
    closed: Boolean(
      event.upload_ends_at && now > new Date(event.upload_ends_at).getTime(),
    ),
  };
}

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

  const { notOpenYet, closed } = uploadWindowState(event);

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
        ) : closed ? (
          <p className="card w-full p-4 text-center text-sm text-ink-soft">
            Uploads for this event are closed. Thanks for sharing your
            photos!
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
