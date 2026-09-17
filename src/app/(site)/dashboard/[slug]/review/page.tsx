import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewQueue } from "@/components/manage/ReviewQueue";
import { NEEDS_REVIEW_PAGE_SIZE } from "@/components/manage/constants";
import type { Event, Photo } from "@/lib/supabase/types";

export default async function ReviewOneAtATimePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Event>();

  if (!event || !user || event.organizer_id !== user.id) {
    notFound();
  }

  // The count taken here becomes the session's fixed "of TOTAL" snapshot —
  // it does not grow if more photos are uploaded mid-session (design.md
  // §4 of specs/004-photo-library-at-scale).
  const { data: photos, count } = await supabase
    .from("photos")
    .select("*", { count: "exact" })
    .eq("event_id", event.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .range(0, NEEDS_REVIEW_PAGE_SIZE - 1)
    .returns<Photo[]>();

  return (
    <ReviewQueue
      eventId={event.id}
      eventSlug={event.slug}
      initialPhotos={photos ?? []}
      sessionTotal={count ?? 0}
    />
  );
}
