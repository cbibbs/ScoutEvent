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
  with Approve/Reject actions that advance to the next pending photo.
- THE SYSTEM SHALL show progress (e.g., "12 of 47") and let the
  organizer exit back to the grid view at any point.

## Out of scope (this feature)

- Real thumbnails (a second, smaller generated image per photo). Kept
  out for now — pagination alone removes most of the cost of opening the
  page; a dedicated thumbnail pipeline is a larger, separate change (see
  design.md §4) and should only be built if pagination isn't enough.
- Bulk ZIP download — still deferred from Feature 001 design §7. This
  feature's multi-select mechanism is deliberately the same shape a
  future "download selected" action would reuse, but building that
  action itself is not part of this feature.
