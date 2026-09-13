# ScoutEvent

Collect photos from event participants via a link/QR code and show them
as a live slideshow — built entirely on free tiers of Supabase and
Vercel, inspired by [dropevent.com](https://dropevent.com/).

This project is developed spec-first: see [`specs/CONSTITUTION.md`](specs/CONSTITUTION.md)
for the process, and [`specs/001-photo-collection-slideshow/`](specs/001-photo-collection-slideshow/)
for the requirements/design/tasks behind everything currently built.

## How it works

- An **organizer** signs in (email magic link, no password) and creates
  an event.
- The event gets a **guest upload link** and a **slideshow link**, both
  shown with a QR code on the organizer's dashboard.
- **Guests** open the upload link on their phone — no account, no app —
  and add photos. Photos are compressed in the browser before upload.
- If the organizer turned on moderation, photos wait for approval before
  they're public; otherwise they appear immediately.
- The **slideshow link** is meant for a TV/screen at the event: it's a
  full-screen, auto-advancing, self-updating gallery of approved photos.

## Stack

Next.js (App Router) on Vercel's free Hobby plan, with Supabase's free
project tier providing auth, Postgres, storage, and realtime — see
[`specs/001-photo-collection-slideshow/design.md`](specs/001-photo-collection-slideshow/design.md)
for the reasoning and the full data model.

## Setting up Supabase (one-time)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, open **SQL Editor** and run the contents of
   [`supabase/migrations/20260913000000_init.sql`](supabase/migrations/20260913000000_init.sql).
   This creates the `events`/`photos` tables, their Row Level Security
   policies, the `submit_photo()` function guests use to upload, and the
   public `photos` storage bucket.
3. In **Project Settings → API**, copy the **Project URL** and the
   **anon public** key.
4. In **Authentication → URL Configuration**, add your app's URL (e.g.
   `http://localhost:3000` for local dev, plus your Vercel URL once
   deployed) to the redirect allow-list — the magic-link email links back
   to `/auth/callback` on whichever origin sent the sign-in request.

## Running locally

```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying (Vercel free tier)

1. Push this repo to GitHub.
2. In [Vercel](https://vercel.com), import the repo (Hobby/free plan).
3. Add the same two environment variables from `.env.local` under the
   project's **Settings → Environment Variables**.
4. Deploy. Every push to the main branch redeploys automatically.
5. Add the deployed URL to Supabase's auth redirect allow-list (see step
   4 above) so magic-link sign-in works in production too.

## Free-tier limits to be aware of

This app is designed to stay inside the free tiers of both providers at
the scale of a scout troop / small organization running a handful of
events at a time. Keep an eye on these as usage grows:

| Limit | Free tier | What happens as you approach it |
|---|---|---|
| Supabase database | 500MB | Event/photo metadata is tiny (a few hundred bytes per photo row); this is very unlikely to bind before storage does. |
| Supabase storage | 1GB | Guest photos are compressed client-side to ~1MB max before upload (see `UploadForm`), so this is roughly 1,000+ photos. Delete old events' photos from the dashboard to free space. |
| Supabase bandwidth | 2GB/mo | Each slideshow view re-downloads photos; a screen left running all day at a busy event is the main driver. Increasing the slideshow interval reduces re-renders (not re-downloads — the browser caches images already shown). |
| Supabase project pause | Auto-pauses after 7 days with no API activity | Sign in / open the dashboard a day or two before your event to make sure the project is awake. Restoring a paused project just takes one dashboard click. |
| Vercel bandwidth | 100GB/mo (Hobby) | Far above what a photo-collection app for one event needs; only a concern if the app gets wide public use. |

If any of these become a real constraint, the fix is almost always
"delete old events' photos" or "wake the Supabase project," not a code
change.

## Project structure

```
specs/                    Requirements/design/tasks (read this first)
supabase/migrations/      SQL to run once in your Supabase project
src/app/(site)/           Landing page, organizer login, dashboard
src/app/e/[slug]/         Public guest upload + slideshow pages
src/app/auth/callback/    Magic-link session exchange
src/proxy.ts              Auth guard for /dashboard (Next.js 16's
                           replacement for middleware.ts)
src/lib/supabase/         Browser/server Supabase clients + hand-written
                           Database types
src/components/           Client components (upload form, photo grid,
                           slideshow, share/QR panel, settings form)
```

## Known limitations (by design, for the MVP)

See "Out of scope" and "Security & privacy notes" in
[`specs/001-photo-collection-slideshow/requirements.md`](specs/001-photo-collection-slideshow/requirements.md) —
notably: no guest accounts (so abuse relies on unguessable file paths +
organizer moderation, not access control), no bulk ZIP download yet, and
the storage bucket is public-read rather than using signed URLs.
