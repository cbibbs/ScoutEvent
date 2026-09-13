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
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your events</h1>
        <Link
          href="/dashboard/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New event
        </Link>
      </div>

      {!events || events.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No events yet. Create your first one to get a guest upload link and
          a slideshow.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/dashboard/${event.slug}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {event.event_date ?? "No date set"}
                  </p>
                </div>
                <span className="text-sm text-gray-400">Manage →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
