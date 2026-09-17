# Feature 005: Always-Visible Join QR on the Slideshow

Builds on Features 001-004.

## Problem

Guests find out they can contribute photos through emails, texts, and
announcements — all of which plenty of people ignore. Meanwhile the one
thing everybody at the event is already looking at is the slideshow on
the screen. Today that screen shows photos and nothing else, so a guest
watching it has no way to discover they could be adding to it.

## User Stories

### US-17: Join from the slideshow itself

As a guest at the event watching the slideshow, I want to see how to add
my own photos without having been told in advance, so I can join in even
though I ignored the notifications.

- WHEN a viewer opens an event's slideshow and that event is currently
  accepting uploads, THE SYSTEM SHALL display the guest upload link as a
  scannable QR code in the lower-right corner of the screen, drawn on
  top of the photo where they overlap.
- THE SYSTEM SHALL keep the QR code visible the whole time uploads are
  open. It SHALL NOT fade out after a delay, appear only between
  photos, or cycle in and out.
- THE SYSTEM SHALL keep the QR code scannable whatever is behind it —
  any photo may be dark, light, or visually busy.
- THE SYSTEM SHALL label the QR code so a guest understands what it is
  without anyone explaining it.
- THE SYSTEM SHALL size the QR code so a guest standing a few steps from
  the screen can scan it, traded off against how much of the photo it
  covers.
- WHEN the slideshow is showing its waiting/empty state because no
  photos have been approved yet, THE SYSTEM SHALL still display the QR
  code. (This is the moment it matters most — somebody has to upload
  first.)
- IF the event's upload window has closed or has not yet opened, THE
  SYSTEM SHALL NOT display the QR code. Sending a guest to a page that
  refuses their upload is worse than showing them nothing.
- WHEN an event's upload window closes while a slideshow is already
  running, THE SYSTEM SHALL stop displaying the QR code without anyone
  reloading that screen. A slideshow runs unattended for hours; it must
  not keep advertising uploads after the cutoff.
- THE SYSTEM SHALL generate the QR code without depending on a
  rate-limited or paid third-party QR API (carried over from US-2).
- THE QR code SHALL NOT obscure the uploader-name caption established in
  US-5.

## Out of scope (this feature)

- **A per-event on/off setting.** Deliberately decided against: it needs
  a schema change and a settings control, and an organizer who doesn't
  want uploads during a slideshow can close the upload window instead —
  which this feature already respects. Revisit if a real event turns up
  that wants a clean display while uploads stay open.
- Any other on-screen chrome (event name, photo counts, sponsor logos,
  "now showing" captions beyond the existing uploader name).
- Changing how the guest upload page itself works once somebody scans
  through to it.
