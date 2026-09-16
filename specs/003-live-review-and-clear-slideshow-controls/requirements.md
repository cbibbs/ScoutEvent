# Feature 003: Live Review Queue & Unambiguous Slideshow Controls

Builds on Features 001-002. Two fixes surfaced by actually using the
organizer dashboard: the review queue is stale without a manual reload,
and the "remove from the slideshow without deleting" action isn't
clearly separated from Reject/Delete.

## User Stories

### US-10: Live-updating review queue

As an organizer with the event management page open, I want newly
uploaded photos (and status changes from another tab/device) to show up
without me reloading the page — I may be triaging photos throughout the
event, not just once.

- WHEN a guest uploads a photo while an organizer has that event's
  management page open, THE SYSTEM SHALL add it to the "Needs review"
  list without a page reload.
- WHEN a photo's status or slideshow membership changes (from this
  organizer in another tab, or in principle another organizer), THE
  SYSTEM SHALL reflect that change on an open management page without a
  reload.
- THE SYSTEM SHALL use the same realtime-plus-polling-fallback approach
  already established for the slideshow (`specs/001-photo-collection-slideshow/design.md`
  §6), so the page self-heals if a realtime connection drops.

### US-11: Unambiguous, non-destructive slideshow removal

As an organizer, I want a single obvious action for "stop showing this
approved photo in the slideshow, but keep it" that I cannot mistake for
Reject or Delete — because approved photos, in or out of the slideshow,
are the pool I'll gather into a download after the event, and clicking
the wrong button would permanently lose one.

- WHEN an organizer views an approved photo in the library, THE SYSTEM
  SHALL present a single, clearly labeled toggle action — "Remove from
  slideshow" / "Add back to slideshow" — as its own control, distinct in
  label and position from Reject and Delete.
- THE SYSTEM SHALL NOT rely on a small/easy-to-miss checkbox for this
  action (Feature 002's implementation); it SHALL be a button with the
  same visual weight as the other photo actions.
- Reject SHALL remain a moderation decision only (this photo shouldn't
  be public) — not the tool for ordinary slideshow curation. It MAY
  still imply removal from the slideshow as a side effect (rejected
  content shouldn't be public regardless), but SHALL NOT be presented or
  labeled as a slideshow control.
- Delete SHALL remain the only action that removes a photo's file and
  row. It SHALL stay visually distinct (e.g., destructive styling) from
  the slideshow-removal toggle so the two are never confused at a
  glance.
- (Restates Feature 002, unchanged): every approved photo — whether
  currently in the slideshow or not — stays in storage until an
  organizer explicitly deletes it, so the full approved set is always
  available to gather for a later download. Building that bulk download
  itself remains out of scope (see `specs/001-photo-collection-slideshow/design.md` §7).

## Out of scope

- The bulk/group download feature itself — still deferred. This feature
  only ensures the data and UI don't get in its way later.
