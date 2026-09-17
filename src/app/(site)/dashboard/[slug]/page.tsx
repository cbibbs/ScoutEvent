import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventSettingsForm } from "@/components/EventSettingsForm";
import { ShareLinks } from "@/components/ShareLinks";
import { PhotoManager } from "@/components/manage/PhotoManager";
import {
  LIBRARY_PAGE_SIZE,
  NEEDS_REVIEW_PAGE_SIZE,
  SLIDESHOW_PAGE_SIZE,
} from "@/components/manage/constants";
import type { Event, Photo } from "@/lib/supabase/types";

export default async function ManageEventPage({
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

  // Only the owning organizer may manage an event (requirements.md US-6);
  // events are otherwise publicly readable for the guest/slideshow pages.
  if (!event || !user || event.organizer_id !== user.id) {
    notFound();
  }

  // Three independently-paginated first pages, one per Manage Event
  // section (specs/004-photo-library-at-scale design.md §1), plus a
  // total-photos count for the header stat line.
  const [needsReviewRes, slideshowRes, libraryRes, totalRes] = await Promise.all([
    supabase
      .from("photos")
      .select("*", { count: "exact" })
      .eq("event_id", event.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .range(0, NEEDS_REVIEW_PAGE_SIZE - 1)
      .returns<Photo[]>(),
    supabase
      .from("photos")
      .select("*", { count: "exact" })
      .eq("event_id", event.id)
      .eq("status", "approved")
      .eq("in_slideshow", true)
      .order("created_at", { ascending: true })
      .range(0, SLIDESHOW_PAGE_SIZE - 1)
      .returns<Photo[]>(),
    supabase
      .from("photos")
      .select("*", { count: "exact" })
      .eq("event_id", event.id)
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .range(0, LIBRARY_PAGE_SIZE - 1)
      .returns<Photo[]>(),
    supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-2xl">{event.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[13.5px] text-ink-soft">
          {event.event_date && <span>{event.event_date}</span>}
          <span>{totalRes.count ?? 0} photos total</span>
          <span className="font-semibold text-secondary-dark">
            {slideshowRes.count ?? 0} in slideshow
          </span>
          {(needsReviewRes.count ?? 0) > 0 && (
            <span className="font-semibold text-warn">
              {needsReviewRes.count} waiting on you
            </span>
          )}
        </div>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="card p-6">
          <h2 className="section-label mb-4">Share with guests</h2>
          <ShareLinks slug={event.slug} />
        </section>
        <section className="card p-6">
          <h2 className="section-label mb-4">Settings</h2>
          <EventSettingsForm event={event} />
        </section>
      </div>

      <PhotoManager
        eventId={event.id}
        eventSlug={event.slug}
        needsReview={{ items: needsReviewRes.data ?? [], count: needsReviewRes.count ?? 0 }}
        slideshow={{ items: slideshowRes.data ?? [], count: slideshowRes.count ?? 0 }}
        library={{ items: libraryRes.data ?? [], count: libraryRes.count ?? 0 }}
      />
    </div>
  );
}
