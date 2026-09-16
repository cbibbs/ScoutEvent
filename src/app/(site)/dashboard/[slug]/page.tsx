import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventSettingsForm } from "@/components/EventSettingsForm";
import { ShareLinks } from "@/components/ShareLinks";
import { PhotoManagementGrid } from "@/components/PhotoManagementGrid";
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

  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .returns<Photo[]>();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">{event.name}</h1>

      <section className="mb-10 rounded-md border border-gray-200 p-6 dark:border-gray-800">
        <h2 className="mb-4 text-lg font-medium">Share with guests</h2>
        <ShareLinks slug={event.slug} />
      </section>

      <section className="mb-10 rounded-md border border-gray-200 p-6 dark:border-gray-800">
        <h2 className="mb-4 text-lg font-medium">Settings</h2>
        <EventSettingsForm event={event} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">Photos</h2>
        <PhotoManagementGrid eventId={event.id} initialPhotos={photos ?? []} />
      </section>
    </div>
  );
}
