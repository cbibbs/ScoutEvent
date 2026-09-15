# Design: Event Photo Collection & Slideshow

Traces to `requirements.md` in this directory. Every third-party
service choice must satisfy the "zero recurring cost" constraint in
`specs/CONSTITUTION.md`.

## 1. Stack choice

| Concern | Choice | Free-tier limits relied on | Satisfies |
|---|---|---|---|
| App framework | Next.js 14 (App Router, TypeScript) | n/a (open source) | all |
| Hosting | Vercel (Hobby plan) | 100GB bandwidth/mo, unlimited static requests | US-7 |
| Auth | Supabase Auth (magic-link email) | included in Supabase free project | US-1 |
| Database | Supabase Postgres | 500MB DB, project pauses after 1 week idle (free tier) | US-1, US-4, US-6 |
| File storage | Supabase Storage | 1GB storage, 2GB egress/mo | US-3, US-5 |
| Realtime updates | Supabase Realtime (Postgres changes) | included in Supabase free project | US-5 |
| QR codes | `qrcode.react` (client-side canvas/SVG render) | no network call at all | US-2 |
| Client image compression | `browser-image-compression` | n/a (runs in guest's browser) | US-3, US-7 |

**Rationale for one vendor (Supabase) covering auth/DB/storage/realtime:**
fewer moving parts to configure and keep within free limits, and RLS
(row-level security) lets the browser talk to Postgres/Storage directly
— no custom backend server to write, deploy, or pay for, per the
constitution's "no app-specific backend to operate" rule.

**Known free-tier risk:** a Supabase free project pauses after 7 days
with no API activity. Mitigation: document this in the README (organizer
should log in a day or two before the event to "wake" the project), and
optionally add a scheduled GitHub Actions ping (free, 2,000 min/mo) as a
future enhancement — out of scope for MVP but noted in `tasks.md`.

## 2. Data model (Postgres, via Supabase migrations)

```sql
-- events
id              uuid primary key default gen_random_uuid()
organizer_id    uuid not null references auth.users(id)
name            text not null
slug            text not null unique          -- URL-safe, e.g. "troop1610-fall-2026"
description     text
event_date      date
upload_starts_at timestamptz
upload_ends_at   timestamptz
moderation_enabled boolean not null default true
slideshow_interval_seconds int not null default 5
created_at      timestamptz not null default now()

-- photos
id              uuid primary key default gen_random_uuid()
event_id        uuid not null references events(id) on delete cascade
storage_path    text not null                 -- path within the "photos" bucket
uploader_name   text
status          text not null check (status in ('pending','approved','rejected'))
width           int
height          int
created_at      timestamptz not null default now()
```

Indexes: `events(slug)` unique (already implied), `photos(event_id, status, created_at)`
for the slideshow/gallery queries.

## 3. Access control (maps to US-1, US-3, US-4, US-6, security notes)

**Postgres RLS on `events`:**
- `select`: allowed to everyone (anon + authenticated) — the guest
  upload and slideshow pages need to read event name/settings by slug.
  Only non-sensitive columns are ever selected by the client for the
  anon case (enforced by only ever querying the specific columns needed,
  not `select *`, in guest-facing code paths).
- `insert`/`update`/`delete`: only where `organizer_id = auth.uid()`.

**Postgres RLS on `photos`:**
- `insert`: allowed to `anon` and `authenticated`, but only via a
  Postgres function `submit_photo(event_id, storage_path, uploader_name)`
  (`security definer`) rather than a raw table insert. The function:
  1. Looks up the event; rejects if `now()` is outside
     `[upload_starts_at, upload_ends_at]` when those are set (US-3).
  2. Sets `status = 'pending'` if `moderation_enabled`, else `'approved'`
     (US-4).
  This keeps the "is upload currently allowed" and "what's the initial
  status" logic in one trusted place instead of duplicating it in RLS
  policy expressions and in client code.
- `select`: `status = 'approved'` rows are selectable by everyone
  (slideshow/public gallery, US-5); all rows for an event are selectable
  by that event's organizer (US-6).
- `update`/`delete`: only the owning organizer (`exists (select 1 from
  events where events.id = photos.event_id and events.organizer_id =
  auth.uid())`) — US-4, US-6.

**Storage bucket `photos`:** public-read bucket (object paths are
`event_id/uuid.jpg` — unguessable, not listable by guests since bucket
listing is disabled by policy). Write access restricted to authenticated
+ anon `insert` only, mirroring the "guests never need an account"
requirement, with the actual DB row (and therefore visibility gating)
controlled by the RLS/function above. This is the accepted tradeoff
documented in `requirements.md`'s Security & privacy notes: a rejected
photo's *file* remains fetchable by direct URL even though the app never
links to it, until an organizer deletes it. Acceptable for MVP; a future
hardening pass could move to a private bucket + short-lived signed URLs
issued by an edge function.

## 4. Application structure (Next.js App Router)

```
/                         marketing/landing page, sign-in CTA
/login                    organizer sign-in (magic link)
/dashboard                organizer's event list
/dashboard/new            create-event form
/dashboard/[slug]         manage one event: settings, share link + QR,
                          moderation queue, full photo grid
/e/[slug]                 guest upload page (public, no auth)
/e/[slug]/slideshow       public slideshow display (public, no auth)
```

Supabase client:
- `lib/supabase/client.ts` — browser client (anon key) used by guest
  upload, slideshow, and organizer dashboard pages.
- `lib/supabase/server.ts` — server component / route handler client
  (reads the user's session cookie) for pages that need the signed-in
  user server-side (dashboard layout auth guard).

## 5. Guest upload flow (US-3)

1. Guest opens `/e/[slug]`. Page fetches the event by slug (name,
   upload window, moderation flag not needed client-side beyond display).
2. Guest picks/captures photo(s) via `<input type="file" accept="image/*"
   multiple>`. Deliberately **no** `capture` attribute: that forces the
   camera open directly and skips the OS picker's gallery option, which
   guests need just as much as the camera — they may already have the
   photo taken. Leaving `capture` off still offers the camera as one of
   the native picker's choices on mobile.
3. For each file: validate type (`image/*`) and size (≤ 15MB pre-compression,
   configurable constant); reject with inline error if invalid, continue
   with the rest.
4. Compress/resize client-side (`browser-image-compression`, max
   dimension 1920px, target ≈0.8 quality JPEG) — keeps typical uploads
   well under 1MB to stretch the 1GB storage / 2GB egress free tier.
5. Upload to Storage bucket `photos` at `{event_id}/{uuid}.jpg`.
6. Call `submit_photo()` RPC to create the DB row (sets status per
   moderation flag, enforces upload window).
7. Show per-file progress/success/failure in the UI; failures don't block
   other files.

## 6. Slideshow flow (US-5)

1. `/e/[slug]/slideshow` fetches the event (for `slideshow_interval_seconds`)
   and the current list of `approved` photos ordered by `created_at`.
2. Subscribes to Supabase Realtime Postgres changes on `photos` filtered
   to `event_id = <this event>`; on `INSERT`/`UPDATE` where the new row's
   status is `approved`, appends it to the in-memory rotation without a
   page reload.
3. A local timer advances the displayed index every
   `slideshow_interval_seconds`; wraps around; if the list is empty shows
   a "waiting for photos" empty state (US-5's IF clause).
4. Falls back to re-fetching the photo list every 30s if the realtime
   subscription drops, so a screen left running overnight self-heals.

## 7. Non-goals / deferred (tracked, not built in this feature)

- Bulk ZIP export of an event's photos.
- Private storage + signed URLs.
- Scheduled keep-alive ping for the Supabase free project.
- Automated content moderation.

These are listed so future specs can reference them instead of silently
reintroducing scope.
