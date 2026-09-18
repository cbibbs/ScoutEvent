# Tasks: Photo Quality & Keeping Originals

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

**Blocked on a decision before Phase 3:** design §6 asks whether Archive
mode ships on the current public-read bucket or waits for a private
prefix with signed URLs. Fast and Sharp (Phases 1-2) are unaffected and
can proceed either way.

## Phase 1 — Schema & settings (US-18)

- [ ] T1.1 Migration: `events.photo_quality` (`fast`/`sharp`/`archive`,
      default `fast`), `photos.original_path`, `photos.original_bytes`,
      `photos.display_bytes` (design §2).
- [ ] T1.2 Apply to the live Supabase project and verify, same method as
      Features 001/002.
- [ ] T1.3 Quality control in `EventSettingsForm`, worded by outcome
      ("sharp on a normal screen" / "sharp on a 4K screen" / "keeps the
      original") with the rough photos-per-GB figure beside each
      (US-18, design §1).

## Phase 2 — Display sizing (US-18)

- [ ] T2.1 `UploadForm` reads the event's mode and compresses to 1600px
      or 2560px accordingly; record `display_bytes` (design §1, §2).
- [ ] T2.2 Confirm the mode change applies only to new uploads and
      nothing retroactively rewrites existing photos (US-18).

## Phase 3 — Originals (US-19)

- [ ] T3.1 `attach_photo_original()` RPC with the write-once, time-window
      and path guards, plus the server-side storage ceiling check
      (design §3, §5).
- [ ] T3.2 Upload sequencing: display copy → `submit_photo()` → original
      → `attach_photo_original()`, so the photo is live before the
      archive copy is attempted (design §3).
- [ ] T3.3 Archive-copy failure is non-fatal and non-alarming — the
      photo stays, the guest is not shown an error for it (US-19).
- [ ] T3.4 Audit that no screen loads `original_path`: slideshow, review
      queue, one-at-a-time, and all library grids stay on
      `storage_path` (design §4).

## Phase 4 — Storage visibility (US-20)

- [ ] T4.1 Per-event usage from `display_bytes` + `original_bytes`, shown
      on the manage page beside the existing counts (design §5).
- [ ] T4.2 Warn visibly as usage approaches the free allowance, while
      uploads still work (US-20).
- [ ] T4.3 At the ceiling, stop saving originals while display copies
      keep uploading — enforced in the RPC, not only in the client
      (US-20, design §5).

## Phase 5 — Verify

- [ ] T5.1 Build/lint clean.
- [ ] T5.2 Live check of each mode end to end: upload in Fast, Sharp and
      Archive; confirm the stored object sizes match expectations, the
      slideshow and grids still load the display copy in every mode, and
      an original lands only in Archive.
- [ ] T5.3 Deliberately fail the original's upload (offline mid-upload)
      and confirm the photo survives, appears in review, and shows no
      error to the guest.
- [ ] T5.4 Confirm the 4K claim rather than trusting the arithmetic:
      view a Sharp photo and a Fast photo on a 4K display and check the
      difference is real and worth the storage.
- [ ] T5.5 Redeploy to production.

## Depends on / pairs with

- [ ] Bulk ZIP download (deferred since Feature 001 §7) — originals are
      only worth keeping if there's a way to get them out; schedule with
      this (design §7).
- [ ] Private prefix + signed URLs for originals, if design §6's
      recommendation is accepted.
