# Tasks: Photo Quality & Keeping Originals

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

**Decision made (design §1a):** originals go to Cloudflare R2; display
copies stay in Supabase Storage. Both halves follow one rule — image
bytes live with the rule that decides who may read them, unless egress
makes that impossible. Originals are the only case where it does: a bulk
download is ~1.2GB against a 2GB monthly allowance and no cache can
help. Display copies stay because their access rule is live RLS that R2
cannot see, their egress is cacheable (T2.3), and the projector must not
gain a second vendor it can die on.

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
- [ ] T0.4 Confirm the two Supabase numbers design §1b's reasoning is
      sized against: the **current** free egress allowance (the specs
      have carried 2GB since Feature 001 and the published figure has
      moved), and whether CDN-cached bytes are billed as egress. Record
      both in `specs/PROJECT.md`'s free-tier table. Not a gate on
      anything — but if cached bytes are billed at full price, say so in
      design §1b, because the display-copy half of §1a is sized against
      the assumption that they are not. This does not block Phase 3; it
      blocks trusting T2.3's saving.

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
- [ ] T2.3 Set a one-year immutable `cacheControl` on the display-copy
      upload in `UploadForm` (design §1b, US-20). Today the call passes
      only `contentType`, so supabase-js's one-hour default applies and
      an all-day slideshow re-downloads every photo hourly for objects
      that can never change. Applies to all three modes, not just
      Archive. Verify by reading the `cache-control` response header on
      a newly uploaded photo in the browser's network panel — the point
      is the header that is actually served, not the argument that was
      passed. Existing objects keep their old header; that is accepted.

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
- [ ] T5.5 Confirm the egress claim the same way: leave a slideshow
      running over several full passes and check in the network panel
      that photos already shown are served from cache rather than
      re-fetched (US-20, design §1b). This is the measurement §1a's
      display-copy decision rests on; if it fails, §1a says to re-argue
      that half rather than assume it.
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
