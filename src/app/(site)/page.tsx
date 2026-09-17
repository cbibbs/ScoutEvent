import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-7 px-6 py-24 text-center">
      <h1 className="font-display text-4xl leading-tight sm:text-5xl">
        Collect photos from your event.
        <br />
        Show them live.
      </h1>
      <p className="max-w-md text-lg text-ink-soft">
        Create an event, share a link or QR code, and watch photos from
        everyone there fill up a live slideshow — no app to install, no
        account needed for your guests.
      </p>
      <Link href="/login" className="btn btn-primary btn-lg">
        Get started as an organizer
      </Link>
    </div>
  );
}
