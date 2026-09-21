import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Slideshow } from "@/components/Slideshow";
import { computeUploadsOpen } from "@/lib/uploadWindow";
import { resolveOrigin } from "@/lib/requestOrigin";
import type { Event, Photo } from "@/lib/supabase/types";

export default async function SlideshowPage({
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

  const [{ data: photos }, { data: photoCount }] = await Promise.all([
    supabase
      .from("photos")
      .select("*")
      .eq("event_id", event.id)
      .eq("status", "approved")
      .eq("in_slideshow", true)
      .order("created_at", { ascending: true })
      .returns<Photo[]>(),
    // security definer — see event_photo_count() in
    // 20260921000000_upload_abuse_protection.sql (design.md §3): a plain
    // anonymous count would undercount past the photos SELECT policy.
    supabase.rpc("event_photo_count", { p_event_id: event.id }),
  ]);

  const origin = await resolveOrigin();

  return (
    <Slideshow
      eventId={event.id}
      eventName={event.name}
      intervalSeconds={event.slideshow_interval_seconds}
      initialPhotos={photos ?? []}
      guestUploadUrl={`${origin}/e/${event.slug}`}
      initialUploadStartsAt={event.upload_starts_at}
      initialUploadEndsAt={event.upload_ends_at}
      initialUploadsOpen={computeUploadsOpen(
        event.upload_starts_at,
        event.upload_ends_at,
      )}
      initialModerationEnabled={event.moderation_enabled}
      initialUploadsPaused={event.uploads_paused}
      initialPhotoLimit={event.photo_limit}
      initialPhotoCount={photoCount ?? 0}
    />
  );
}
