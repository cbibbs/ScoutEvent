# Tasks: Always-Visible Join QR on the Slideshow

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

## Phase 1 — Plumbing

- [x] T1.1 Pass `slug`, `upload_starts_at`, `upload_ends_at`, and a
      server-computed initial "uploads open" value from
      `/e/[slug]/slideshow/page.tsx` into `Slideshow` (design §1, §2).
      Verified `initialUploadsOpen: true` and `slug` present in the RSC
      payload when hitting the live `wood-badge-8a1dcb` slideshow route
      against the real Supabase project.
- [x] T1.2 Derive the guest URL client-side as `{origin}/e/{slug}`
      using the `ShareLinks` origin pattern; render no QR until origin
      is known (design §1).

## Phase 2 — Upload-window gating (US-17)

- [x] T2.1 Re-evaluate "uploads open" inside the existing auto-advance
      interval callback — no second timer, no `Date.now()` in the render
      body, no `setState` in an effect body (design §2). Confirmed by
      `npm run lint` passing clean under the React Compiler purity rule
      (this rule is what caught an earlier version of this diff putting
      `Date.now()` directly in the two Server Component bodies).
- [x] T2.2 Hide the QR entirely when uploads are closed or not yet open;
      keep showing it in the empty/waiting state when uploads are open
      (design §2) — the QR block is a sibling of the `current`-photo
      ternary, gated only on `uploadsOpen`/`origin`, not on `current`.

## Phase 3 — The overlay (US-17)

- [x] T3.1 Bottom-right card: opaque light background, padding as the
      quiet zone, rounded, shadowed, held off the extreme corner
      (design §3).
- [x] T3.2 Caption inside the card explaining what the code is
      (design §3).
- [x] T3.3 Size it to scale with the display rather than a fixed pixel
      box, starting around 200px at 1080p (design §3).
- [x] T3.4 Pad the uploader-name caption on the right so a long name
      can never run under the card (design §3).
- [x] T3.5 Keep the QR's inputs stable so it isn't regenerated on every
      slide advance (design §4).

## Phase 4 — Verify

- [x] T4.1 Build/lint clean.
- [ ] T4.2 Visual check at 1080p against a real event: QR renders
      bottom-right, over both a dark photo and a light one, and is
      actually scannable by a phone from a few steps back. **Not
      verified** — this sandbox has no browser or display to render the
      page in, and no phone to scan with. Only confirmed via code review
      and that the client component compiles/lints clean.
- [ ] T4.3 Check the gating both ways — an event with uploads open shows
      it (including with zero approved photos), an event past its
      `upload_ends_at` does not. Partially verified: confirmed
      `computeUploadsOpen` against a truth table (open window, not-open-
      yet, closed, both bounds) and confirmed the live `wood-badge-8a1dcb`
      event (currently mid-window) resolves `initialUploadsOpen: true`
      server-side. **Not verified**: no event in this Supabase project
      currently has a past `upload_ends_at` to check the closed case
      end-to-end, and I deliberately did not mutate the live event's
      dates to fabricate one.
- [ ] T4.4 Confirm a long uploader name does not collide with the card.
      **Not verified** — no browser available to render it, and the
      real event's uploader names (e.g. "Christopher Bibbs") aren't long
      enough to be a meaningful test; didn't want to write a fake long
      name into the live event's data to check this.
- [ ] T4.5 Redeploy to production. Deliberately skipped — instructed not
      to deploy.
