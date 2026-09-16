# Design: Live Review Queue & Unambiguous Slideshow Controls

Traces to `requirements.md` in this directory. No schema changes —
`photos.status`/`in_slideshow` from Feature 002 already carry everything
needed; this is a client-side data-freshness and UI-clarity fix.

## 1. Realtime in `PhotoManagementGrid` (US-10)

Mirrors the pattern already proven in `Slideshow.tsx`
(`specs/001-photo-collection-slideshow/design.md` §6), applied to the
*organizer's* view instead of the public one:

- Subscribe to `postgres_changes` on `public.photos` filtered by
  `event_id=eq.<id>`, for `INSERT`, `UPDATE`, and `DELETE`.
- `INSERT`/`UPDATE`: upsert the row into local state by id (new pending
  uploads appear in "Needs review"; a status/in_slideshow change moves a
  card between sections automatically since section membership is
  derived from `photos` state, not tracked separately).
- `DELETE`: remove by id from local state.
- 30s polling fallback re-fetches all of the event's photos and
  replaces state wholesale, same self-healing rationale as the
  slideshow (a dropped realtime connection on a long-open dashboard tab
  shouldn't go stale forever).
- No RLS changes needed: the organizer's existing SELECT policy
  (`specs/001-photo-collection-slideshow/design.md` §3) already lets
  them read every photo on their own events regardless of status.

## 2. Slideshow-removal control (US-11)

Feature 002 put "In slideshow" behind a small checkbox next to the
Reject/Delete buttons. Replace it with a button of equal visual weight,
first in the action row so it reads as the primary action for an
approved photo:

```
[ Remove from slideshow ]  [ Reject ]  [ Delete ]      -- when in_slideshow
[ Add back to slideshow ]  [ Reject ]  [ Delete ]      -- when not
```

- The toggle button flips `in_slideshow` only — same `updatePhoto` call
  as today's checkbox, just surfaced as a button (`neutral`/blue
  styling, distinct from Reject's gray and Delete's red).
- Reject's behavior is unchanged (`status: 'rejected', in_slideshow:
  false`) — it still pulls a photo from the slideshow as a side effect,
  because rejected content shouldn't be public, but it is not relabeled
  or repositioned as a slideshow control; an organizer reaching for
  "just take this one out of rotation" reaches for the toggle button,
  not Reject.
- Delete is unchanged (destructive, confirms, removes file + row).

## 3. Non-goals

Bulk download stays out of scope (Feature 001 design §7); this feature
only removes the ambiguity/staleness that would make gathering photos
for one later harder than it needs to be.
