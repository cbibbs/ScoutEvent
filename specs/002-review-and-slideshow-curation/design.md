# Design: Low-Bandwidth Guest Upload & Slideshow Curation

Traces to `requirements.md` in this directory and extends
`specs/001-photo-collection-slideshow/design.md`.

## 1. Data model change

Add one column to `public.photos` (migration
`supabase/migrations/20260914000000_slideshow_curation.sql`, additive —
Feature 001's migration is left untouched since it's already applied to
the live project):

```sql
alter table public.photos
  add column in_slideshow boolean not null default false;
```

`status` still answers "is this appropriate" (pending/approved/rejected,
US-4). `in_slideshow` now separately answers "is this currently in the
rotation" (US-9). A photo can be `approved` with `in_slideshow = false`
(curated out, still downloadable from the library) — that state was not
representable in Feature 001.

## 2. Who sets `in_slideshow`, and when

- `submit_photo()` (Feature 001 §3): when moderation is disabled, a
  guest upload is auto-approved *and* auto-added to the slideshow
  (`in_slideshow = true`) — matches the pre-existing zero-review
  behavior. When moderation is enabled, a new photo is `pending` /
  `in_slideshow = false` until reviewed.
- Organizer "Approve" action (dashboard, US-9): sets `status =
  'approved', in_slideshow = true` in a single update — approving a
  photo and having it appear are the same click, matching "the common
  case: a good photo should just start showing."
- Organizer slideshow toggle (new, US-9): flips `in_slideshow` on an
  already-approved photo, independent of `status`. Uses the existing
  "organizers update photos on their events" RLS policy from Feature
  001 §3 — no new policy needed, since that policy already permits the
  owning organizer to update any column on their event's photos.
- Reject / Delete: unchanged from Feature 001. Rejecting forces the
  photo out of the slideshow implicitly (see §3's updated public SELECT
  policy — it requires `status = 'approved'` regardless of the
  `in_slideshow` bit), so no extra write is needed when rejecting.

## 3. RLS change: public visibility now requires both bits

Feature 001's public/anon SELECT policy on `photos` allowed anyone to
see `status = 'approved'` rows. Update it to also require
`in_slideshow`:

```sql
drop policy if exists "approved photos are viewable by everyone" on public.photos;
create policy "approved and in-slideshow photos are viewable by everyone"
  on public.photos for select
  using (
    (status = 'approved' and in_slideshow)
    or exists (
      select 1 from public.events e
      where e.id = photos.event_id and e.organizer_id = auth.uid()
    )
  );
```

The organizer branch is unchanged: an organizer still sees every photo
on their own events regardless of status/in_slideshow, which is what
the management page's "needs review" and "library" sections both read
from.

## 4. Application changes

**Guest upload (`UploadForm`, US-8):**
- Reorder the page: the drop-zone/file-picker renders first; the
  optional display-name field moves below it. Fewer things to read or
  interact with before a guest can start an upload.
- Lower the client compression target from Feature 001's `maxSizeMB: 1,
  maxWidthOrHeight: 1920` to `maxSizeMB: 0.6, maxWidthOrHeight: 1600`.
  1600px is still comfortably sharp filling a TV/projector in the
  slideshow; the smaller cap meaningfully cuts upload time on a
  congested venue Wi-Fi/cellular connection.
- Per-file retry: a failed file keeps its original `File` object in
  state and shows a "Retry" button that re-runs the same
  compress→upload→submit_photo pipeline for just that file, so a guest
  doesn't need to re-pick a photo (or lose others already uploading)
  after a transient drop.

**Organizer management page (`/dashboard/[slug]`), US-9:**
- Split the single photo grid into two sections:
  1. **Needs review** — `status = 'pending'` only. Approve (→ approved +
     in_slideshow) / Reject actions, as today.
  2. **Library** — everything else (`approved`, `rejected`), each card
     showing a slideshow on/off toggle (enabled only when
     `status = 'approved'`) plus the existing Delete action. Rejected
     photos keep a "Restore to approved" affordance (sets `status =
     'approved'`) so a misclick isn't permanent short of Delete.
- Both sections read from the same initial `photos` fetch already done
  server-side; no new query shape, just client-side partitioning by
  `status`.

**Slideshow (`Slideshow` component), US-9:**
- Initial fetch and the realtime handler both filter/react to
  `status = 'approved' && in_slideshow` instead of Feature 001's
  `status = 'approved'` alone, so toggling a photo out removes it from
  a screen that's currently running, and toggling it back in re-adds it
  — without a page reload, per US-9's realtime requirement.

## 5. Non-goals (see requirements.md "Out of scope")

Bulk ZIP export and a dedicated `/review` route are both explicitly
deferred; this feature keeps the single management page but curates it
into two sections.
