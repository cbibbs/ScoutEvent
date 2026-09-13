# Feature 001: Event Photo Collection & Slideshow

## Summary

A tool (inspired by dropevent.com) that lets an event organizer collect
photos from event participants via a simple link/QR code, and display
those photos as a live slideshow on a screen at the event — built
entirely on free tiers of third-party services.

## Roles

- **Organizer** — creates and manages events. Has an account.
- **Guest** — attends the event, uploads photos. No account, no app
  install; uses their phone's browser.
- **Viewer** — whoever operates the display screen at the event (often
  the organizer). Views the public slideshow URL. No account required.

## User Stories

### US-1: Create an event

As an organizer, I want to create an event with a name and date, so that
I have a dedicated place to collect photos for it.

- WHEN an organizer submits a new event with a name, THE SYSTEM SHALL
  create the event and assign it a unique, URL-safe slug.
- WHEN an event is created, THE SYSTEM SHALL generate a guest upload link
  and a slideshow link, both derived from the event slug.
- IF an organizer is not signed in, THE SYSTEM SHALL require sign-in
  before allowing event creation.
- THE SYSTEM SHALL allow an organizer to set an optional upload window
  (start/end date-time) and an optional moderation toggle
  (approve-before-showing).

### US-2: Share the event with guests

As an organizer, I want a link and QR code I can display or send, so
guests can find the upload page without typing a URL.

- WHEN an organizer views an event's management page, THE SYSTEM SHALL
  display the guest upload URL as both plain text and a scannable QR
  code.
- THE SYSTEM SHALL generate the QR code without depending on a
  rate-limited or paid third-party QR API.

### US-3: Guest uploads photos

As a guest, I want to open a link on my phone and upload photos in a few
taps, without creating an account.

- WHEN a guest opens the guest upload URL for an event, THE SYSTEM SHALL
  show the event name and an upload control that works on mobile
  browsers (including direct camera capture).
- WHEN a guest selects one or more photos, THE SYSTEM SHALL upload each
  photo and show per-photo upload progress and success/failure state.
- THE SYSTEM SHALL let a guest optionally attach a display name to their
  upload.
- IF the current time is outside the event's configured upload window,
  THE SYSTEM SHALL prevent new uploads and show a clear message instead.
- IF a guest selects a non-image file or a file over the configured size
  limit, THE SYSTEM SHALL reject that file with a clear message without
  blocking the other selected files.
- WHEN a photo is uploaded, THE SYSTEM SHALL compress/resize it in the
  guest's browser before transfer, to conserve storage and bandwidth.

### US-4: Moderation (optional per event)

As an organizer, I want to optionally review photos before they appear
publicly, so inappropriate content doesn't reach the slideshow.

- IF an event has moderation enabled, THEN WHEN a guest uploads a photo,
  THE SYSTEM SHALL mark it "pending" and exclude it from the slideshow
  and public gallery until approved.
- IF an event has moderation disabled, THEN WHEN a guest uploads a photo,
  THE SYSTEM SHALL mark it "approved" immediately.
- WHEN an organizer views the moderation queue, THE SYSTEM SHALL let them
  approve or reject each pending photo.
- WHEN an organizer rejects or deletes a photo, THE SYSTEM SHALL remove
  it from the slideshow/gallery and from storage.

### US-5: Live slideshow

As a viewer, I want a full-screen, self-advancing slideshow of approved
photos that updates automatically as new ones come in, so I can leave it
running on a screen at the event without touching it.

- WHEN a viewer opens an event's slideshow URL, THE SYSTEM SHALL display
  approved photos full-screen, automatically advancing on a timer.
- WHEN a new photo is approved while the slideshow is open, THE SYSTEM
  SHALL include it in the rotation without requiring a manual page
  refresh.
- IF an event has zero approved photos, THE SYSTEM SHALL show a
  waiting/empty state instead of a blank screen.
- THE SYSTEM SHALL let the organizer configure the slideshow's
  advance interval per event.
- THE SLIDESHOW SHALL be viewable without any account or sign-in.

### US-6: Organizer manages photos

As an organizer, I want to see and manage all photos for my event, so I
can curate the collection and remove anything unwanted.

- WHEN an organizer views an event, THE SYSTEM SHALL show all photos
  (pending, approved, rejected) in a grid with their status.
- WHEN an organizer deletes a photo, THE SYSTEM SHALL remove its file
  and metadata permanently.
- THE SYSTEM SHALL let an organizer see only their own events and photos
  for those events; organizers SHALL NOT see other organizers' events.

### US-7: Cost and operational safety

As the project owner, I want the app to run entirely on free-tier
services, so it costs nothing to operate at scout-troop scale.

- THE SYSTEM SHALL be deployable using only free tiers of its chosen
  hosting/database/storage providers.
- THE SYSTEM SHALL document, in the design, the specific free-tier limits
  relied upon and what happens as those limits are approached.

## Out of scope (MVP)

- Video collection (photos only).
- Guest accounts / guest login.
- Multiple organizers per event.
- Automated (AI) content moderation.
- Paid/premium tiers, billing.
- DSLR tethering, photo booth hardware integration.
- Bulk ZIP download of an event's photos (candidate for a later feature).
- Custom branding/themes per event.

## Security & privacy notes

- No guest account means no guest authentication; abuse mitigation relies
  on unguessable identifiers (UUIDs), upload-window enforcement, and
  organizer moderation/delete — not on access control of individual
  files. This is an accepted tradeoff for a free, frictionless MVP and
  must be stated to organizers (e.g., "don't use for sensitive photos").
- Only a photo's display name (optional, guest-supplied) is collected;
  no other guest PII is stored.
