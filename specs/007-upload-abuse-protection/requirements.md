# Feature 007: Upload Abuse Protection

Builds on Features 001-006. Comes out of the production readiness
review (`specs/CONSTITUTION.md`, open decision 2).

## Problem

Guest upload is anonymous by design and always will be — that is
principle 1, and it is the product. The consequence, which the
constitution now states explicitly, is that **moderation carries the
entire safety burden.** Today it carries it alone and incompletely:

1. **A scan can reach the screen with no human in between.**
   `submit_photo()` enforces the upload window and nothing else. When
   an event has moderation disabled it inserts photos as
   `status = 'approved', in_slideshow = true` — directly onto the
   projector. Feature 005 then put a join QR permanently on that
   projector. Neither feature is wrong alone; together they mean anyone
   in the room is one scan away from putting anything on a screen in
   front of children.

2. **Nothing bounds how much anyone uploads.** No cap per event, no
   limit on file size that the client cannot simply ignore. A few
   hundred photos exhausts the shared 1GB, which breaks uploads for
   *every* event on the project, not just the one being abused.

3. **There is no fast way to stop it.** If something does go wrong
   mid-event, the organizer's only recourse is editing an upload-window
   date in a settings form while standing in a room full of people.

The realistic adversary here is not a sophisticated attacker. It is
someone present with a phone and poor judgment. The design should be
proportionate to that, and should not make honest guests prove
themselves.

## User Stories

### US-21: Nothing reaches the screen unreviewed

As an organizer showing a slideshow to a room that includes children, I
want an invitation to upload to appear on that screen only when someone
is reviewing what comes in.

- THE SYSTEM SHALL display the slideshow's join QR (Feature 005) only
  while the event has moderation enabled.
- WHEN an organizer disables moderation while a slideshow is running,
  THE SYSTEM SHALL stop displaying the QR without anyone reloading that
  screen — the same liveness Feature 005 already requires of the upload
  window.
- THE SYSTEM SHALL explain this coupling where moderation is turned off,
  so the organizer understands what they are giving up rather than
  finding the QR mysteriously absent.
- The guest upload link SHALL keep working when moderation is off. This
  requirement governs the *broadcast invitation on a public screen*, not
  the organizer's ability to share a link with people they choose.

### US-22: An event's uploads are bounded

As the project owner, I want one event's uploads to be unable to consume
the storage every other event depends on.

- THE SYSTEM SHALL enforce a maximum number of photos per event, on the
  server, where a client cannot bypass it.
- THE SYSTEM SHALL let the organizer raise that limit for their event.
  A real event that legitimately reaches the cap must not be dead in the
  water mid-occasion — an event happens once (principle 3).
- THE SYSTEM SHALL enforce a maximum file size at the storage layer,
  not only in the browser.
- THE SYSTEM SHALL reject a limit that would disable uploads outright.
  An organizer clearing the field to retype it must not be able to save
  a value that makes their event permanently full — that failure would
  sit inside the very recovery path this story exists to provide.
- WHEN an event reaches its limit, THE SYSTEM SHALL tell the guest
  plainly that the event is full and to speak to the organizer, rather
  than showing a generic failure — and SHALL do so before they choose
  photos and wait for an upload, not only after.
- WHEN an event is full, THE SYSTEM SHALL stop advertising the join QR
  on the slideshow, for the reason Feature 005 already gives about the
  closed upload window: inviting a scan that can only end in refusal is
  worse than showing nothing.
- THE SYSTEM SHALL show the organizer how close the event is to its
  limit before it is reached, and that figure SHALL stay current on a
  page left open — a count frozen at page load cannot warn anyone, and
  reassures while uploads are being refused.

### US-23: The organizer can stop uploads in one action

As an organizer watching something inappropriate appear, I want to stop
uploads immediately, without navigating a settings form.

- THE SYSTEM SHALL offer a single, obvious control on the event
  management page that closes uploads immediately.
- WHEN uploads are stopped this way, THE SYSTEM SHALL stop accepting new
  photos server-side and stop advertising the join QR on any running
  slideshow, without anyone reloading it.
- THE SYSTEM SHALL let the organizer resume uploads just as directly,
  since the common use is a pause, not an ending.
- Stopping and resuming SHALL leave any upload schedule the organizer
  configured exactly as it was. A pause is not a rescheduling, and an
  organizer must not lose a close time by using this control.
- Nothing else in the app SHALL be able to silently undo a stop. In
  particular, saving unrelated settings while uploads are stopped must
  not re-open them.
- THE SYSTEM SHALL keep this control distinct from anything destructive.
  Stopping uploads must never be confusable with deleting photos —
  the same reasoning that separated "remove from slideshow" from
  "delete" in Feature 003.

## Residual risk, stated deliberately

**A single person can still fill an event's allowance**, because this
feature caps the event as a whole and does not limit any individual.
That was chosen knowingly: the alternatives each cost more than they are
worth here (design.md §1), and one of them would mean storing a
tracking identifier on a guest's device.

**The cap bounds photo rows, not bytes in the bucket.** Guests upload
to Storage directly under a blanket anonymous INSERT policy, so a script
holding the public anon key can write objects without ever calling
`submit_photo()`, and no row cap can stop that by construction. What
closes it is routing guest uploads through a gated signed URL, the way
Feature 006 does for R2 — deliberately left as its own change rather
than smuggled into this one. Within this feature the mitigations are a
per-object size limit at the storage layer, not creating objects for
uploads that will be refused anyway, and making orphaned objects
something the organizer can actually delete (design.md §3).

What that leaves is a recovery story rather than a prevention story, and
it has to actually work: moderation keeps it off the screen (US-21),
bulk select and delete (Feature 004) clears it quickly, and stopping
uploads (US-23) ends it. Those three are the mitigation. They should be
treated as such rather than as conveniences.

## Out of scope (this feature)

- CAPTCHA, guest accounts, or any other proof-of-humanity. Violates
  principle 1 and punishes the ordinary guest for the rare bad one.
- Per-device or per-IP rate limiting — see design.md §1 for why each is
  either harmful or ineffective in a venue.
- Automated content classification. Deferred since Feature 001 and still
  out of reach at zero cost.
- Reporting or blocking individual uploaders. There is no identity to
  block.
