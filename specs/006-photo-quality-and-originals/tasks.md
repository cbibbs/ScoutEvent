# Tasks: Photo Quality & Keeping Originals

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

**Decision made (design §1a):** originals go to Cloudflare R2; display
copies stay in Supabase Storage. Both halves follow one rule — image
bytes live with the rule that decides who may read them, unless egress
makes that impossible. Originals are the only case where it does: a bulk
download is ~1.2GB against a 2GB monthly allowance and no cache can
help. Display copies stay because their access rule is live RLS that R2
cannot see, and because the projector must not gain a second vendor it
can die on. Their egress, once measured, was never the pressure it
looked like (design §1b) — which is why the decision does not rest on
it.

**Also decided (design §6):** display copies stop being public-read —
private Supabase bucket, reads through RLS-gated signed URLs. **Not
built here.** It touches the read path of every screen and has its own
hard problem (an unattended slideshow re-minting signatures), so it is
its own feature; `CONSTITUTION.md` open decision 1 tracks it. Nothing in
this feature may be read as re-endorsing public-read display copies.

Phases 1-2 (Fast and Sharp) touch neither store's arrangement and can
ship independently of the R2 work.

**One fact to confirm before Phase 0:** whether R2 requires a payment
method on file within the free allowance, and whether exceeding 10GB
refuses writes or silently bills. The constitution forbids silently
incurring charges. **If it bills silently: do not use R2, and cut
Archive mode from this feature** — ship Phases 1-2 only, and do not fall
back to putting originals in Supabase Storage, which reintroduces both
problems R2 was chosen to solve (design §1a, "what this costs").

## Phase 0 — R2 setup (design §1a)

Only blocks Phase 3. Phases 1-2 can proceed in parallel.

- [ ] T0.1 Confirm the billing question above before doing anything
      else. **Hard gate**: no bucket, no credentials, no endpoint code
      until it is answered, and the answer is recorded in design §1a
      rather than remembered. A "silently bills" answer cuts Phase 3 and
      Archive mode rather than being worked around.
- [ ] T0.2 Create the R2 bucket (private, no public access), an API
      token scoped to just that bucket, and a CORS rule permitting `PUT`
      from the app's origins. The CORS rule is easy to forget and fails
      only in the browser, never in server logs.
- [ ] T0.3 Add the credentials to Vercel environment variables and
      `.env.example`, and document the setup in the README beside the
      existing Supabase steps.
- [ ] T0.4 Confirm the Supabase egress accounting, for headroom rather
      than for the §1a decision, which no longer rests on it (design
      §1b): the **current** free allowance (the specs have carried 2GB
      since Feature 001 and the published figure has moved), whether a
      `304` revalidation is billed as a request, and whether CDN-cached
      bytes count as egress. Record the answers in `specs/PROJECT.md`'s
      free-tier table. Gates nothing.

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
- [ ] T2.3 Set `cacheControl: "31536000, immutable"` on the display-copy
      upload in `UploadForm` (design §1b, US-20). **This is a
      reliability fix, not an egress one.** Production currently serves
      these objects `cache-control: no-cache` with an `ETag`, so a warm
      client already gets a zero-byte `304` and there is little
      bandwidth to save — but `no-cache` forces a network round trip to
      origin on *every slide advance*, and on a congested venue network
      that is a projector stalling between slides. `immutable` lets the
      client reuse what it holds without asking. Applies to all three
      modes, not just Archive. Verify by reading the `cache-control`
      response header actually served on a newly uploaded photo, not by
      confirming the argument was passed. Existing objects keep
      `no-cache` until re-uploaded, so the improvement starts with new
      photos; that is accepted.

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
      `storage_path` (design §4). Check `PhotoManager.tsx`,
      `ReviewQueue.tsx` and `Slideshow.tsx` specifically — all three
      build image URLs from `storage_path` today and are where a
      well-meaning "show the full-quality one" change would land.

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
- [ ] T5.5 Measure the slideshow's read path rather than assuming it —
      the last assumption here was wrong in both directions (design
      §1b). With a slideshow running over several full passes, on a
      **throttled** connection (devtools "Slow 3G" or similar), record
      for photos already shown: (a) how many requests reach origin per
      slide, (b) how many bytes each transfers, and (c) whether any
      slide visibly stalls or blanks while a request is in flight. The
      pass condition is **(a) going to zero for already-seen photos
      after T2.3**, not a byte count — bytes were already near the floor
      because of `304`s. Write the numbers into this file rather than
      ticking the box bare.
- [ ] T5.6 Redeploy to production.

## Depends on / pairs with

- [ ] Bulk ZIP download (deferred since Feature 001 §7) — originals are
      only worth keeping if there's a way to get them out; schedule with
      this (design §7).
- [x] Private storage + signed URLs **for originals** — resolved by
      choosing R2 (design §1a, §6). Originals are private by
      construction: no public URL exists for one.
- [ ] Private storage + signed URLs **for display copies** — the
      direction is decided (design §6: private Supabase bucket, reads
      signed under the existing RLS predicate), the work is not done and
      is not in this feature. Its own feature; `CONSTITUTION.md` open
      decision 1 holds the entry. Until it ships, every display copy
      ever uploaded stays permanently fetchable by URL, including after
      rejection — which is the state Feature 001 §3 accepted and this
      project has now decided against.
