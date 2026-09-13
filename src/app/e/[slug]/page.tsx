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
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center px-4 py-10">
      <h1 className="mb-1 text-center text-2xl font-semibold">
        {event.name}
      </h1>
      <p className="mb-8 text-center text-sm text-gray-500 dark:text-gray-400">
        Share your photos from the event
      </p>

      {notOpenYet ? (
        <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Uploads for this event haven&apos;t opened yet. Check back soon!
        </p>
      ) : closed ? (
        <p className="rounded-md bg-gray-100 p-4 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-300">
          Uploads for this event are closed. Thanks for sharing your photos!
        </p>
      ) : (
        <UploadForm eventId={event.id} />
      )}

      <Link
        href={`/e/${event.slug}/slideshow`}
        className="mt-10 text-xs text-gray-400 hover:underline"
      >
        View live slideshow
      </Link>
    </div>
  );
}
