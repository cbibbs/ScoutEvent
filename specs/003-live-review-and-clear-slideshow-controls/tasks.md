# Tasks: Live Review Queue & Unambiguous Slideshow Controls

- [x] T1 Add realtime subscription + 30s polling fallback to
      `PhotoManagementGrid` (design §1). Verified locally: opened the
      dashboard, uploaded a second photo as a guest from a separate
      session without touching the dashboard tab, and it appeared in
      "Needs review" on its own (via the poll fallback — this sandbox's
      network policy blocks WebSockets, so realtime itself couldn't be
      exercised here; same caveat as Feature 002's T5.1).
- [x] T2 Replace the "In slideshow" checkbox with a
      "Remove from slideshow" / "Add back to slideshow" button, styled
      and positioned distinctly from Reject/Delete (design §2). Verified
      the label flips correctly on click.
- [x] T3 Build/lint clean; redeployed to production
      (https://scoutevent.vercel.app). Real-device spot-check of the
      realtime push (vs. the poll fallback verified locally) is up to
      the organizer at the next event, since it needs two devices and
      isn't practical to script here.
