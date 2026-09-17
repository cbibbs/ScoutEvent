# Tasks: Always-Visible Join QR on the Slideshow

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

## Phase 1 — Plumbing

- [x] T1.1 Pass `slug`, `upload_starts_at`, `upload_ends_at`, and a
      server-computed initial "uploads open" value from
      `/e/[slug]/slideshow/page.tsx` into `Slideshow` (design §1, §2).
      **Updated per the design §1 correction:** the page now also
      resolves the request's origin server-side (`src/lib/requestOrigin.ts`,
      using `headers()`) and passes a finished `guestUploadUrl` prop
      instead of a raw `slug`, plus `initialUploadStartsAt`/
      `initialUploadEndsAt` (seeds for the ref described under T2.1) and
      `initialUploadsOpen`. Verified `guestUploadUrl` and
      `initialUploadsOpen: true` present in the RSC payload when hitting
      the live `wood-badge-8a1dcb` slideshow route against the real
      Supabase project, both with no forwarding headers (falls back to
      `host`, giving `http://localhost:3000/e/wood-badge-8a1dcb`) and
      with spoofed `x-forwarded-proto`/`x-forwarded-host` (correctly
      takes precedence).
- [ ] T1.2 Derive the guest URL client-side as `{origin}/e/{slug}`
      using the `ShareLinks` origin pattern; render no QR until origin
      is known (design §1). **Superseded, not done** — this is the
      pattern design §1 was rewritten to explicitly forbid (it's the
      cause of the hydration mismatch review found). The origin is now
      resolved server-side instead; see Phase 5 fix 1.

## Phase 2 — Upload-window gating (US-17)

- [x] T2.1 Re-evaluate "uploads open" inside the existing auto-advance
      interval callback — no second timer, no `Date.now()` in the render
      body, no `setState` in an effect body (design §2). Confirmed by
      `npm run lint` passing clean under the React Compiler purity rule
      (this rule is what caught an earlier version of this diff putting
      `Date.now()` directly in the two Server Component bodies). Extended
      per design §2's addition: the interval now reads the window from a
      ref kept fresh by the 30s poll rather than closing over props
      frozen at page load — see Phase 5 fix 2.
- [x] T2.2 Hide the QR entirely when uploads are closed or not yet open;
      keep showing it in the empty/waiting state when uploads are open
      (design §2) — the QR block is a sibling of the `current`-photo
      ternary, gated only on `uploadsOpen`, not on `current`.

## Phase 3 — The overlay (US-17)

- [x] T3.1 Bottom-right card: opaque light background, padding as the
      quiet zone, rounded, shadowed, held off the extreme corner
      (design §3). Padding amount corrected in Phase 5 fix 4.
- [x] T3.2 Caption inside the card explaining what the code is
      (design §3). Font size corrected to scale in Phase 5 fix 4.
- [x] T3.3 Size it to scale with the display rather than a fixed pixel
      box, starting around 200px at 1080p (design §3). The original
      `clamp()` computed a fixed 256px box for every display ≥1080p —
      exactly the failure this task describes avoiding; corrected in
      Phase 5 fix 3.
- [x] T3.4 Pad the uploader-name caption on the right so a long name
      can never run under the card (design §3). Confirmed live in a
      browser by the coordinator at 1080p — no collision (T4.4).
- [x] T3.5 Keep the QR's inputs stable so it isn't regenerated on every
      slide advance (design §4). The QR's `value` is now a prop
      (`guestUploadUrl`, stable for the page's lifetime) rather than
      client-derived state, still wrapped in `useMemo`.

## Phase 4 — Verify

- [x] T4.1 Build/lint clean. Re-verified after the Phase 5 fixes.
- [ ] T4.2 Visual check at 1080p against a real event: QR renders
      bottom-right, over both a dark photo and a light one, and is
      actually scannable by a phone from a few steps back. **Rendering
      verified; scannability not.** The coordinator rendered the live
      event in a real browser and measured it at two viewports: card
      248px wide at 1080p and 497px at 4K (so it genuinely scales), 29
      modules, quiet zone 4.89 modules on both the card padding and the
      code-to-caption gap at both sizes (against a 4-module minimum),
      caption 18px → 37px, background `rgb(255,255,255)`, positioned
      bottom-right. **Still unverified**: whether a phone actually
      decodes it from a few steps back, which needs a physical screen
      and a phone. Also not seen over a real photo — the sandbox's proxy
      rejects the Supabase storage certificate, so the image area was
      blank in every capture.
- [ ] T4.3 Check the gating both ways — an event with uploads open shows
      it (including with zero approved photos), an event past its
      `upload_ends_at` does not. Partially verified: confirmed
      `computeUploadsOpen` against a truth table (open window,
      not-open-yet, closed, both bounds) and confirmed the live
      `wood-badge-8a1dcb` event (currently mid-window) resolves
      `initialUploadsOpen: true` server-side. **Still not verified**: no
      event in this Supabase project has a past `upload_ends_at`, and a
      live check of the new mid-show-edit behavior (fix 2) would need
      editing a real event's window while watching a running slideshow
      in a browser — neither of which this sandbox can do. Did not
      mutate the live event's dates to fabricate either case.
- [x] T4.4 Confirm a long uploader name does not collide with the card.
      Verified live in a browser by the coordinator at 1080p: card renders
      bottom-right, white/opaque, no collision with a long name.
- [ ] T4.5 Redeploy to production. Deliberately skipped — instructed not
      to deploy.

## Phase 5 — Review fixes (2026-09-17)

Four defects found in review of `c70eea0`; three were in `design.md`
itself (corrected in `124f693`) and this implementation followed the
correction. See the coordinator's review message for the full defect
descriptions this phase addresses.

- [x] Fix 1 — Hydration mismatch (design §1, rewritten). Origin is now
      resolved server-side in `/e/[slug]/slideshow/page.tsx` via
      `headers()` (`src/lib/requestOrigin.ts`, preferring
      `x-forwarded-proto`/`x-forwarded-host` and falling back to `host`),
      and passed down as a finished `guestUploadUrl` prop. The
      client-side `useState`/`window.location.origin` pattern and the
      "origin unknown yet" gate are both removed from `Slideshow`.
      Verified: SSR HTML for the live event now contains the QR `<svg>`
      directly (it previously didn't, since origin was empty at SSR
      time); `x-forwarded-*` headers take precedence over `host` when
      both are present (checked via curl against the local dev server
      with spoofed headers). **Confirmed in a browser** by the
      coordinator afterwards: the slideshow route now hydrates clean at
      both 1920x1080 and 3840x2160, with no "Hydration failed" error in
      the console and the dev overlay's issue badge gone. Before this
      fix the same check reported the mismatch while the unchanged guest
      upload page hydrated clean, so the defect and its resolution were
      both observed, not just argued.
- [x] Fix 2 — Upload window can change mid-show (design §2, extended).
      The existing 30s poll (`Slideshow.tsx`) now also re-reads
      `upload_starts_at`/`upload_ends_at` from `events` alongside the
      photos query, updates a ref the auto-advance interval reads on
      every tick, and immediately recomputes `uploadsOpen` itself so a
      shortened `upload_ends_at` takes effect within one poll rather than
      waiting on the interval to notice a fixed cutoff that never
      actually arrives. Verified by code review, lint/build passing.
      **Not verified live**: would need to edit a real event's
      `upload_ends_at` while a slideshow is open in a browser and watch
      for the QR to disappear within ~30s.
- [x] Fix 3 — Card stops scaling at a fixed ceiling (design §3,
      extended). Replaced `clamp(140px, 14vw, 256px)` (which reached its
      256px ceiling at a 1829px viewport, so 1080p/1440p/4K all rendered
      identically) with `max(140px, 23vmin)` — a floor with no ceiling.
      Verified by computing the resulting width at three reference
      viewports: 1080p → 248px, 1440p → 331px, 4K → 497px — strictly
      increasing, and the 4K figure lands almost exactly on the ~500px
      the design calls out, instead of all three landing on 256px.
- [x] Fix 4 — Quiet zone under spec (design §3, extended). Card padding
      and the code-to-caption gap now both use a shared
      `QR_QUIET_ZONE = max(18px, 2.9vmin)` (previously a flat `p-4`
      padding / `gap-2`, which computed to 24px and 8px respectively at
      1080p — under the ~26px four-module requirement, worst on the
      caption side). Caption font-size is now `max(13px, 1.7vmin)`
      instead of a fixed `text-xs` (12px), so it scales with the card.
      Verified by computing the actual quiet-zone requirement against the
      real rendered module count — read off the live SSR SVG's
      `viewBox="0 0 29 29"`, i.e. 29 modules, slightly better than the
      ~31 assumed in design.md's own estimate — at three reference
      viewports: the new padding/gap clears the 4-module requirement
      with 20–25% headroom at 1080p, 1440p, and 4K, and the caption scales
      from ~18px (1080p) to ~37px (4K).
