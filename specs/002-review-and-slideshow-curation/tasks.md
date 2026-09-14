# Tasks: Low-Bandwidth Guest Upload & Slideshow Curation

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

## Phase 1 — Schema

- [x] T1.1 New migration: add `photos.in_slideshow`, update the public
      SELECT policy, update `submit_photo()` to set `in_slideshow`
      alongside `status` (design §1-3).
- [x] T1.2 Apply the migration to the live Supabase project via the
      Management API and verify column/policy/function (same method
      used for Feature 001).

## Phase 2 — Guest upload (US-8)

- [x] T2.1 Reorder `UploadForm`: drop-zone first, name field below
      (design §4).
- [x] T2.2 Lower compression target to `maxSizeMB: 0.6,
      maxWidthOrHeight: 1600` (design §4).
- [x] T2.3 Per-file Retry button on failed uploads, reusing the
      original `File` (design §4).

## Phase 3 — Organizer review & curation (US-9)

- [x] T3.1 Split `PhotoManagementGrid` into "Needs review" (pending) and
      "Library" (approved/rejected) sections (design §4).
- [x] T3.2 Approve action sets both `status: 'approved'` and
      `in_slideshow: true` in one update (design §2).
- [x] T3.3 Slideshow on/off toggle on approved library photos (design
      §2, §4).
- [x] T3.4 "Restore to approved" action on rejected photos.

## Phase 4 — Slideshow (US-9)

- [x] T4.1 Update initial fetch and realtime filter to
      `status = 'approved' && in_slideshow` (design §4).

## Phase 5 — Verify

- [x] T5.1 Re-ran the live end-to-end test against the real Supabase
      project: organizer login (reused session) → new event → guest
      upload with the new layout/compression → "Needs review" showed
      it → Approve moved it to "Library" as approved + in-slideshow →
      slideshow displayed it → toggling off and reloading the slideshow
      correctly showed the empty state → toggling back on and reloading
      showed it again. **Not verified**: the toggle taking effect on an
      *already-open* slideshow tab without a reload — this sandbox's
      network proxy blocks WebSocket upgrades entirely (see
      `specs/001-photo-collection-slideshow/design.md` §6 for the 30s
      polling fallback this relies on in the meantime), so Realtime
      can't be exercised here. The query-level behavior it depends on
      (§4's filter) is confirmed correct via the reload test above; the
      live-push path is unverified in this environment specifically and
      should be spot-checked once deployed to Vercel.
