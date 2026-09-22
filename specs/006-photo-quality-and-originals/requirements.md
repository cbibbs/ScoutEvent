# Feature 006: Photo Quality & Keeping Originals

Builds on Features 001-005.

## Problem

Every photo a guest uploads is compressed in their browser to 1600px /
0.6MB and the original is discarded, never leaving the phone (Feature
002 design §4 lowered it from 1920px/1MB to make uploads survive a
congested venue network). That was the right call for getting photos
onto the screen, but it quietly decided something bigger: **the event's
permanent archive is 1600px too.**

Features 002 and 003 both justify keeping approved photos forever on the
grounds that the organizer will "gather them into a download after the
event" — but what they'd be gathering is the compressed display copy.
Nobody can print a 1600px photo larger than a snapshot, crop into it, or
show it sharp on a 4K screen. The photos of the event exist at full
resolution for exactly as long as the guest keeps them on their phone.

Different events also want different things. A troop meeting slideshow
needs speed on bad wifi. A court of honor or a once-a-year campout is
worth keeping properly.

## User Stories

### US-18: Choose how much quality to keep, per event

As an organizer, I want to choose how much photo quality this event
keeps, so a routine meeting stays fast and light while an important
event is archived properly.

- THE SYSTEM SHALL offer the organizer three choices per event, worded
  by what they get rather than by pixel counts:
  - **Fast** — sharp on a normal (1080p) screen, smallest and quickest
    to upload. The current behavior, and the default.
  - **Sharp** — sharp on a 4K screen, and large enough to print at
    snapshot size.
  - **Archive** — keeps each guest's original photo exactly as their
    phone took it, for printing, cropping, or editing later.
- THE SYSTEM SHALL tell the organizer, at the point of choosing, roughly
  how many photos each choice fits in the available free storage, since
  that is the real trade being made.
- WHEN an organizer changes this setting, THE SYSTEM SHALL apply it to
  photos uploaded from then on. It SHALL NOT retroactively change photos
  already uploaded — the quality that was discarded in the guest's
  browser cannot be recovered.
- THE SYSTEM SHALL default new events to Fast, so an organizer who never
  opens the setting gets today's behavior.

### US-19: The archive never gets in the way of the event

As a guest on a slow venue network, I want my photo to reach the
slideshow as quickly as it does today, however much the organizer has
chosen to keep.

- WHEN an event keeps originals, THE SYSTEM SHALL upload the display
  copy first and make the photo available to review and to the slideshow
  as soon as that copy lands — not waiting for the original.
- IF uploading the original fails, times out, or the guest closes the
  page before it finishes, THE SYSTEM SHALL keep the photo. Losing the
  archive copy SHALL NOT lose the photo or block it from the slideshow.
- THE SYSTEM SHALL never use an original where a display copy would do —
  the slideshow, the review queue, and the library grids all continue to
  load the small copy (carried over from US-8's bandwidth concern and
  Feature 004's reasons for paginating).

### US-20: Storage stays visible, and degrades gracefully

As an organizer, I want to know how much of my free storage the archive
is using before it runs out, so uploads don't start failing during an
event.

- THE SYSTEM SHALL show the organizer how much storage this event's
  photos are using, and how much of the free allowance remains, for
  photos and for archived originals separately — they are held under
  different allowances and fill at very different rates (design.md §5).
- WHEN stored photos approach the free-tier limit, THE SYSTEM SHALL warn
  the organizer plainly, while uploads still work.
- IF the limit is reached, THE SYSTEM SHALL stop saving new originals
  but SHALL keep accepting display copies, so the event carries on
  working and only the archive stops growing. Guests SHALL NOT see an
  error for something the organizer controls.
- WHEN a screen shows a photo it has already shown, THE SYSTEM SHALL
  reuse the copy the browser already holds rather than fetching it
  again. A slideshow left running all day must not spend the month's
  data allowance re-downloading photos that cannot have changed
  (design.md §1b). This is the same allowance US-19's "never use an
  original where a display copy would do" protects, spent a different
  way.
- This satisfies `CONSTITUTION.md`'s requirement to degrade gracefully
  or warn clearly rather than silently fail or incur charges.

## Out of scope (this feature)

- **Bulk ZIP download.** Still deferred from Feature 001 design §7.
  Worth stating plainly: originals are only worth keeping if there is
  eventually a way to get them out, so that feature becomes materially
  more valuable once this one ships, and the two should probably be
  scheduled together.
- **Recovering quality for photos already uploaded.** Impossible — the
  original never left the phone.
- **Making display copies private — scheduled, not deferred.**
  Originals are private by construction under this design (design.md §6
  — they live in R2 and are only ever reachable through short-lived
  signed URLs). Display copies are a separate question, and design.md §6
  now **decides** it: they stop being public-read, via a private
  Supabase bucket read through RLS-gated signed URLs. That is not built
  here, because it touches the read path of every screen and would put
  this feature's Fast/Sharp work behind it; it is its own feature, and
  `CONSTITUTION.md`'s open decision 1 records the direction and what it
  waits on. What changed from the earlier wording is that this is no
  longer "worth revisiting" — the tradeoff Feature 001 accepted has been
  re-decided and this feature must not be read as re-endorsing it.
- Per-guest or per-photo quality choices. One setting per event.
