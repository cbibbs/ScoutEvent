# Tasks: Low-Bandwidth Guest Upload & Slideshow Curation

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

## Phase 1 — Schema

- [ ] T1.1 New migration: add `photos.in_slideshow`, update the public
      SELECT policy, update `submit_photo()` to set `in_slideshow`
      alongside `status` (design §1-3).
- [ ] T1.2 Apply the migration to the live Supabase project via the
      Management API and verify column/policy/function (same method
      used for Feature 001).

## Phase 2 — Guest upload (US-8)

- [ ] T2.1 Reorder `UploadForm`: drop-zone first, name field below
      (design §4).
- [ ] T2.2 Lower compression target to `maxSizeMB: 0.6,
      maxWidthOrHeight: 1600` (design §4).
- [ ] T2.3 Per-file Retry button on failed uploads, reusing the
      original `File` (design §4).

## Phase 3 — Organizer review & curation (US-9)

- [ ] T3.1 Split `PhotoManagementGrid` into "Needs review" (pending) and
      "Library" (approved/rejected) sections (design §4).
- [ ] T3.2 Approve action sets both `status: 'approved'` and
      `in_slideshow: true` in one update (design §2).
- [ ] T3.3 Slideshow on/off toggle on approved library photos (design
      §2, §4).
- [ ] T3.4 "Restore to approved" action on rejected photos.

## Phase 4 — Slideshow (US-9)

- [ ] T4.1 Update initial fetch and realtime filter to
      `status = 'approved' && in_slideshow` (design §4).

## Phase 5 — Verify

- [ ] T5.1 Re-run the live end-to-end test (organizer login → approve →
      confirm slideshow shows it → toggle out → confirm slideshow drops
      it without reload → toggle back in) against the real Supabase
      project used for Feature 001's test.
