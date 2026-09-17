import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Event } from "@/lib/supabase/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", user!.id)
    .order("created_at", { ascending: false })
    .returns<Event[]>();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl">Your events</h1>
        <Link href="/dashboard/new" className="btn btn-primary btn-sm">
          New event
        </Link>
      </div>

      {!events || events.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-ink-soft">
            No events yet. Create your first one to get a guest upload link
            and a slideshow.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/dashboard/${event.slug}`}
                className="card flex items-center justify-between px-5 py-4 hover:border-ink-faint"
              >
                <div>
                  <p className="font-semibold">{event.name}</p>
                  <p className="text-sm text-ink-soft">
                    {event.event_date ?? "No date set"}
                  </p>
                </div>
                <span className="text-sm font-semibold text-primary">
                  Manage →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
