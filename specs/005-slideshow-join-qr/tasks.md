# Tasks: Always-Visible Join QR on the Slideshow

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

## Phase 1 — Plumbing

- [ ] T1.1 Pass `slug`, `upload_starts_at`, `upload_ends_at`, and a
      server-computed initial "uploads open" value from
      `/e/[slug]/slideshow/page.tsx` into `Slideshow` (design §1, §2).
- [ ] T1.2 Derive the guest URL client-side as `{origin}/e/{slug}`
      using the `ShareLinks` origin pattern; render no QR until origin
      is known (design §1).

## Phase 2 — Upload-window gating (US-17)

- [ ] T2.1 Re-evaluate "uploads open" inside the existing auto-advance
      interval callback — no second timer, no `Date.now()` in the render
      body, no `setState` in an effect body (design §2).
- [ ] T2.2 Hide the QR entirely when uploads are closed or not yet open;
      keep showing it in the empty/waiting state when uploads are open
      (design §2).

## Phase 3 — The overlay (US-17)

- [ ] T3.1 Bottom-right card: opaque light background, padding as the
      quiet zone, rounded, shadowed, held off the extreme corner
      (design §3).
- [ ] T3.2 Caption inside the card explaining what the code is
      (design §3).
- [ ] T3.3 Size it to scale with the display rather than a fixed pixel
      box, starting around 200px at 1080p (design §3).
- [ ] T3.4 Pad the uploader-name caption on the right so a long name
      can never run under the card (design §3).
- [ ] T3.5 Keep the QR's inputs stable so it isn't regenerated on every
      slide advance (design §4).

## Phase 4 — Verify

- [ ] T4.1 Build/lint clean.
- [ ] T4.2 Visual check at 1080p against a real event: QR renders
      bottom-right, over both a dark photo and a light one, and is
      actually scannable by a phone from a few steps back.
- [ ] T4.3 Check the gating both ways — an event with uploads open shows
      it (including with zero approved photos), an event past its
      `upload_ends_at` does not.
- [ ] T4.4 Confirm a long uploader name does not collide with the card.
- [ ] T4.5 Redeploy to production.
