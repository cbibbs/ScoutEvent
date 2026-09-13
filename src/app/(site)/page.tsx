import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-20 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
        Collect photos from your event.
        <br />
        Show them live.
      </h1>
      <p className="max-w-md text-lg text-gray-600 dark:text-gray-400">
        Create an event, share a link or QR code, and watch photos from
        everyone there fill up a live slideshow — no app to install, no
        account needed for your guests.
      </p>
      <Link
        href="/login"
        className="rounded-full bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
      >
        Get started as an organizer
      </Link>
    </div>
  );
}
