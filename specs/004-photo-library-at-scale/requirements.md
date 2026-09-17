# Feature 004: Photo Library At Scale

Builds on Features 001-003. Surfaced while designing the event
management screens in Claude Design: the current review queue and
library assume a handful of photos. A real troop event can produce
hundreds, and the page needs to hold up at that volume — both visually
and technically.

## Problem

`PhotoManagementGrid` (Feature 001/002/003) fetches every photo for an
event in one query and renders all of them in one unpaginated grid, with
no search, filter, or way to act on more than one photo at a time. At
hundreds of photos this breaks down three ways:

1. **The page itself** — hundreds of grid cells in the DOM, no way to
   find a specific photo, no way to act on more than one at a time.
2. **The query** — one unbounded `select("*")` per load, repeated in
   full every 30s by the polling fallback.
3. **Bandwidth** — each grid cell loads the *same full-resolution
   compressed photo* (up to 0.6MB, per Feature 002's compression target)
   used for the slideshow, just to render a small thumbnail. Hundreds of
   cells could mean 100+ MB transferred just to open the page.

## User Stories

### US-12: Paginated review and library

As an organizer with a large event, I want the review queue and library
to load in manageable pages instead of fetching everything at once, so
the page stays fast and the query stays bounded regardless of event
size.

- WHEN an organizer opens an event with more photos than fit on one
  page, THE SYSTEM SHALL load an initial page (Needs Review and Library
  each independently) and offer a way to load more, rather than fetching
  every photo for the event in one query.
- THE SYSTEM SHALL show an accurate total count (e.g., "Showing 1-24 of
  220") so the organizer knows how much is left.
- Consistent with Feature 003's realtime requirement (US-10): an update
  to a photo already loaded on the current page(s) SHALL still update
  live. A brand-new upload SHALL NOT be silently inserted into an
  already-loaded, position-sensitive page — see design.md §3 for why and
  how the count still updates live.

### US-13: Find and act on photos in bulk

As an organizer curating a large library, I want to search/filter/sort
it and act on many photos at once, so I'm not clicking one button per
photo hundreds of times.

- WHEN an organizer views the Library, THE SYSTEM SHALL let them filter
  by status (approved/rejected) and by slideshow membership, search by
  uploader name, and sort by upload time.
- WHEN an organizer selects multiple photos (Needs Review or Library),
  THE SYSTEM SHALL let them apply one action to the whole selection:
  Approve/Reject selected in Needs Review; Add to slideshow/Remove from
  slideshow/Delete selected in Library.
- A bulk action SHALL have the same effect as applying it to each
  selected photo individually (same RLS, same side effects — e.g. bulk
  Delete still removes each file from storage), just in fewer requests.

### US-14: Fast one-at-a-time triage

As an organizer facing a large backlog of pending photos, I want an
optional focused mode that shows one photo at a time with Approve/Reject
and automatically advances, so I can get through a big queue quickly
without hunting for tiny buttons in a grid.

- WHEN an organizer opens "Review one at a time" from the Needs Review
  section, THE SYSTEM SHALL show pending photos one at a time, full-size,
  with Approve/Reject actions that advance to the next pending photo, and
  a Skip action that leaves the photo pending and moves on without it.
- THE SYSTEM SHALL show progress (e.g., "12 of 47") and let the
  organizer exit back to the grid view at any point.
- THE SYSTEM SHALL fix the "of TOTAL" count to the pending count at the
  moment the organizer opened "Review one at a time." WHEN additional
  photos are uploaded while a review session is in progress, THE SYSTEM
  SHALL NOT add them to that session's count or queue — the organizer
  reaches them by starting a new session.
- WHEN an organizer reaches the end of the session's photos, THE SYSTEM
  SHALL show a completion state summarizing how many were
  approved/rejected vs. skipped, rather than silently returning to the
  grid.

### US-15: Dedicated slideshow section

As an organizer, I want a section that shows exactly what's currently
playing in the slideshow, separate from the full library, so I can
quickly scan what's live and pull things without hunting through every
photo ever approved.

- WHEN an organizer opens Manage Event, THE SYSTEM SHALL show a
  "Slideshow" section — separate from Needs Review and Library —
  listing only approved photos currently in the slideshow, in the same
  order the slideshow itself plays them.
- THE SYSTEM SHALL let the organizer select photos in this section and
  remove them from the slideshow in bulk, using the same selection
  mechanism as US-13.
- Removing a photo from the slideshow here SHALL NOT delete it or change
  its approved status — it still appears in Library (Feature 002 design
  §2). Library's existing "in slideshow" filter is retained for
  full-archive search; this section is the fast path for the common
  "what's live right now" task.

### US-16: Usable on a phone, without pretending to be desktop

As an organizer who may open this link on a phone — most likely standing
in the room during or right after the event — I want Manage Event to
still let me review photos and manage what's live on the slideshow, so
I'm not stuck waiting for a computer, while the heavier tools (search,
filters, bulk actions) stay desktop-first.

- WHEN Manage Event is opened on a phone-width viewport, THE SYSTEM
  SHALL keep Needs Review and Slideshow fully usable — inline
  Approve/Reject and a prominent path into "Review one at a time" for
  Needs Review; per-photo Remove from slideshow for Slideshow.
- THE SYSTEM SHALL show Library as a read-only summary on a phone-width
  viewport (recent photos, total count) rather than its full
  search/filter/sort/bulk toolset.
- THE SYSTEM SHALL show a persistent, dismissible note on a phone-width
  viewport that the full toolset is available on a larger screen.
- THE SYSTEM SHALL NOT require a separate app, route, or link for this —
  the same Manage Event page adapts to viewport width.

## Out of scope (this feature)

- Real thumbnails (a second, smaller generated image per photo). Kept
  out for now — pagination alone removes most of the cost of opening the
  page; a dedicated thumbnail pipeline is a larger, separate change (see
  design.md §4) and should only be built if pagination isn't enough.
- Bulk ZIP download — still deferred from Feature 001 design §7. This
  feature's multi-select mechanism is deliberately the same shape a
  future "download selected" action would reuse, but building that
  action itself is not part of this feature.
