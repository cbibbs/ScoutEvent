# Feature 002: Low-Bandwidth Guest Upload & Slideshow Curation

Builds on Feature 001. Two related changes requested together: (1) make
the guest upload path as fast/light as possible for a venue with poor
connectivity, and (2) give the organizer a review step that is separate
from "is this photo currently in the slideshow," so they can pull a
photo out of rotation (and put it back) without losing it.

## User Stories

### US-8: Fast, low-bandwidth guest upload

As a guest on a slow or crowded venue network, I want to get from
scanning the QR code to a photo uploading in as few taps and as little
data as possible.

- WHEN a guest opens the guest upload URL, THE SYSTEM SHALL present the
  photo-picker control as the first interactive element on the page,
  above any optional fields.
- THE SYSTEM SHALL compress photos client-side to a smaller target than
  Feature 001's default before upload, favoring upload speed over
  maximum image fidelity, while remaining sharp enough for full-screen
  display.
- IF a photo upload fails (e.g., a dropped connection), THE SYSTEM SHALL
  let the guest retry that specific photo without re-selecting it or
  losing other in-progress uploads.
- THE SYSTEM SHALL continue to require zero account/login for guests
  (carried over from US-3).

### US-9: Slideshow curation separate from moderation

As an organizer, I want to review new photos for appropriateness, and
then independently control which approved photos are currently showing
in the slideshow, without ever deleting anything I might want later.

- WHEN an organizer views an event's management page, THE SYSTEM SHALL
  show a distinct "needs review" list of pending photos, separate from
  the rest of the library.
- WHEN an organizer approves a pending photo, THE SYSTEM SHALL mark it
  approved AND include it in the slideshow in one action (the common
  case: a good photo should just start showing).
- WHEN an organizer views an approved photo elsewhere in the library,
  THE SYSTEM SHALL let them remove it from the slideshow without
  deleting it, and later add it back, at any time and in any order.
- IF a photo has been removed from the slideshow, THE SYSTEM SHALL keep
  its file in storage and its row in the library, unaffected — only an
  explicit delete (existing US-4/US-6 behavior) removes it.
  - **Clarified by Feature 006 design §6.** "Unaffected" means nothing
    is destroyed and the action is reversible; it does **not** promise
    the file stays reachable to the public. Once display copies move to
    a private bucket signed under this feature's own RLS predicate
    (`approved` and `in_slideshow`), pulling a photo from the slideshow
    will also stop anyone outside the organizer fetching its file — the
    reversible removal this story describes, applied to the bytes as
    well as the row. Today it does not: the file remains publicly
    fetchable by URL, which is the exposure `CONSTITUTION.md` decision 1
    has been decided against.
- THE SLIDESHOW (public, US-5) SHALL only ever display photos that are
  both approved and currently marked as in the slideshow; removing a
  photo from the slideshow SHALL take effect there without a page
  reload, consistent with US-5's realtime behavior.

## Out of scope (this feature)

- Bulk ZIP download of a photo library (still deferred from Feature
  001's design §7; "retained for later download" here means the
  organizer can still open/save each photo individually from the
  library grid, not a new export feature).
- A separate route/page just for review; the review list and the
  slideshow-curation library are both reachable from the existing event
  management page (`/dashboard/[slug]`) as distinct sections. Revisit as
  a dedicated route if the combined page gets unwieldy.
  **Revisited in Feature 004 US-14**: at hundreds of photos the combined
  page did get unwieldy, so a dedicated `/dashboard/[slug]/review` route
  was added for fast one-at-a-time triage. The sections described here
  remain on the management page; the route is an additional entry point,
  not a replacement.
