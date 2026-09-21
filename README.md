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
2. In the Supabase dashboard, open **SQL Editor** and run each file in
   [`supabase/migrations/`](supabase/migrations/) in filename order (each
   is a one-time migration, applied once and never edited after — see
   that folder for the current list). The first,
   [`20260913000000_init.sql`](supabase/migrations/20260913000000_init.sql),
   creates the `events`/`photos` tables, their Row Level Security
   policies, the `submit_photo()` function guests use to upload, and the
   public `photos` storage bucket. Later ones are additive on top of it.
3. The `photos` storage bucket gets an 8MB **file size limit**, set by
   `20260921000000_upload_abuse_protection.sql` via `update
   storage.buckets set file_size_limit = ...` — so an oversized object is
   refused by Supabase Storage itself, not only by the browser upload
   form (`UploadForm` already rejects anything over 15MB client-side,
   which anything calling Storage directly can ignore —
   specs/007-upload-abuse-protection/design.md §3). `storage.buckets` is
   an ordinary table, so this is set by the migration you already ran in
   step 2, not a separate dashboard click to remember; this step is just
   documenting what that migration does. (To change the limit later,
   either edit and re-run that `update` statement or use **Storage →
   photos → Edit bucket → File size limit** in the dashboard — both write
   the same column.)
4. In **Project Settings → API**, copy the **Project URL** and the
   **anon public** key.
5. In **Authentication → URL Configuration**, add your app's URL (e.g.
   `http://localhost:3000` for local dev, plus your Vercel URL once
   deployed) to the redirect allow-list — the magic-link email links back
   to `/auth/callback` on whichever origin sent the sign-in request.
6. In **Authentication → Email Templates → Magic Link**, set the subject
   to `Your ScoutEvent sign-in link` and paste in
   [`supabase/templates/magic-link.html`](supabase/templates/magic-link.html).
   Out of the box the email arrives with the subject "Magic Link" and no
   sign of what it's for, which organizers understandably ignore. Note
   the sender address stays Supabase's until you configure custom SMTP
   (see below) — the app's sign-in page tells people to expect that.
   If you change the subject here, change it on `/login` too; the page
   quotes it so people know what to look for.

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
| Supabase storage | 1GB | Guest photos are compressed client-side to ~0.6MB max before upload (see `UploadForm`), so this is roughly 1,500+ photos. Delete old events' photos from the dashboard to free space. Each event also has its own `photo_limit` (default 500, raisable per event from its Settings) so one event can't consume what every other event depends on — see `specs/007-upload-abuse-protection/`. |
| Supabase bandwidth | 2GB/mo | Each slideshow view re-downloads photos; a screen left running all day at a busy event is the main driver. Increasing the slideshow interval reduces re-renders (not re-downloads — the browser caches images already shown). |
| Supabase auth emails | A few per hour on the built-in mail service | This is the one most likely to bite you, because it fails *silently* — the app says "link sent" and the email simply never arrives, which looks like a broken app rather than a throttle. Only organizers ever receive email (guests never sign in), so it's rarely hit, but if several people sign in at once, configure custom SMTP under **Authentication → Settings → SMTP** with any provider's free tier. That also replaces Supabase's sender address with your own, which is the part the Magic Link template can't fix. |
| Supabase project pause | Auto-pauses after 7 days with no API activity | Sign in / open the dashboard a day or two before your event to make sure the project is awake. Restoring a paused project just takes one dashboard click. |
| Vercel bandwidth | 100GB/mo (Hobby) | Far above what a photo-collection app for one event needs; only a concern if the app gets wide public use. |

If any of these become a real constraint, the fix is almost always
"delete old events' photos" or "wake the Supabase project," not a code
change.

## Project structure

```
specs/                    Requirements/design/tasks (read this first)
supabase/migrations/      SQL to run once in your Supabase project
supabase/templates/       Auth email templates to paste into the dashboard
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
