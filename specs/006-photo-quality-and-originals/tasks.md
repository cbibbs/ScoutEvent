# Tasks: Photo Quality & Keeping Originals

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

**Decision made:** originals go to Cloudflare R2, not Supabase Storage
(design §1a). That was driven by egress rather than capacity — a bulk
download of one archived event would consume most of Supabase's monthly
allowance — and it resolves the privacy question §6 previously left
open, since R2 is private by default and read through expiring signed
URLs. Phases 1-2 (Fast and Sharp) touch neither store's arrangement and
can ship independently of the R2 work.

**One fact to confirm before Phase 0:** whether R2 requires a payment
method on file within the free allowance, and whether exceeding 10GB
refuses writes or silently bills. The constitution forbids silently
incurring charges; if R2 bills silently past the ceiling, revisit
design §1a rather than proceeding.

## Phase 0 — R2 setup (design §1a)

Only blocks Phase 3. Phases 1-2 can proceed in parallel.

- [ ] T0.1 Confirm the billing question above before doing anything
      else.
- [ ] T0.2 Create the R2 bucket (private, no public access), an API
      token scoped to just that bucket, and a CORS rule permitting `PUT`
      from the app's origins. The CORS rule is easy to forget and fails
      only in the browser, never in server logs.
- [ ] T0.3 Add the credentials to Vercel environment variables and
      `.env.example`, and document the setup in the README beside the
      existing Supabase steps.

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
      and path guards, plus the server-side ceiling check (design §3, §5).
- [ ] T3.2 Signing endpoint (`POST /api/originals/sign`): gate on event
      exists + mode is `archive` + upload window open, choose the object
      key server-side, cap content length, pin content type, short
      expiry, refuse at the ceiling (design §3a). This is the app's most
      exposed surface — anonymous callers can reach it — so it gets its
      own review pass.
- [ ] T3.3 Upload sequencing: display copy → `submit_photo()` →
      presigned PUT to R2 → `attach_photo_original()`, so the photo is
      live before the archive copy is attempted (design §3).
- [ ] T3.4 Archive-copy failure is non-fatal and non-alarming — the
      photo stays, the guest is not shown an error for it (US-19).
- [ ] T3.5 Audit that no screen loads `original_path`: slideshow, review
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
- [x] Private storage + signed URLs for originals — resolved by choosing
      R2 (design §1a, §6). Originals are private by construction; only
      the public-read display copies remain on the Feature 001 tradeoff.
