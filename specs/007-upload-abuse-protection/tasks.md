# Tasks: Upload Abuse Protection

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

## Phase 1 — Server-side limits (US-22)

- [x] T1.1 Migration: `events.photo_limit int not null default 500`
      (design §2). Written as
      `supabase/migrations/20260921000000_upload_abuse_protection.sql`.
- [x] T1.2 Extend `submit_photo()` to reject once the event's photo
      count reaches its limit, counting rows of every status, and
      raising an error distinguishable from the upload-window one
      (design §2, §6). Same migration file; raises `'event photo limit
      reached'`, checked after the upload-window checks and before the
      insert.
- [ ] T1.3 Apply to the live Supabase project and verify, same method as
      Features 001/002. **Not done** — no Supabase access token in this
      session. Confirmed live that the column genuinely doesn't exist yet
      (`PGRST` `42703 column events.photo_limit does not exist` via a
      direct REST query against the project). Run
      `20260921000000_upload_abuse_protection.sql` in the SQL Editor,
      same way as the two prior migrations, then this and T5.2 become
      possible.
- [ ] T1.4 Set a `file_size_limit` on the `photos` bucket so oversized
      objects are refused by the storage layer, not only by the browser
      (design §3). **Not done** — this is a bucket-level dashboard/API
      setting, not a SQL migration, and out of reach without dashboard
      access in this session. Documented in README.md ("Setting up
      Supabase", step 3) with the exact dashboard path (**Storage →
      photos → Edit bucket → File size limit**) and a size rationale.

## Phase 2 — Gate the join QR on moderation (US-21)

- [x] T2.1 Pass `moderation_enabled` into `Slideshow` and include it in
      the values the existing 30s poll re-reads, so toggling moderation
      mid-show takes effect without a reload (design §4).
- [x] T2.2 QR shows only when uploads are open **and** moderation is
      enabled (design §4). Verified live against the running Supabase
      project (pre-existing `moderation_enabled` column, unaffected by
      the unapplied migration): `/e/wood-badge-8a1dcb/slideshow`
      (moderation off, uploads open) renders with no "Scan to add your
      photos" card in the initial HTML; `/e/live-review-test-e89d69/slideshow`
      (moderation on, uploads open) renders with it. This confirms the
      initial server-rendered gating only — see note on T5.4 for what's
      still unverified.
- [x] T2.3 Explain the coupling in `EventSettingsForm` where moderation
      is turned off (US-21, design §4). Implemented as inline copy that
      appears when the (local, pre-save) moderation checkbox is
      unchecked. Compiles and matches the settings-form pattern; not
      visually confirmed in a browser (organizer dashboard needs a
      signed-in session — see note below).

## Phase 3 — Stop uploads (US-23)

- [x] T3.1 "Stop uploads" / "Resume uploads" control near the event
      status at the top of the manage page — not in the settings form,
      and visually distinct from anything destructive (design §5).
      New `src/components/UploadStatusControl.tsx`, rendered above the
      Share/Settings grid on the manage page. Uses `btn-accent` /
      `btn-secondary`, never `btn-danger*`, and needs no confirm dialog
      since it isn't destructive.
- [x] T3.2 Implement as `upload_ends_at = now()` and its reverse, so
      `submit_photo()` and the slideshow QR react through machinery that
      already exists rather than a second source of truth (design §5).
      **Design decision made here, flagging for review**: "Resume"
      clears `upload_ends_at` to `null` (open-ended) rather than
      restoring whatever value it held before "Stop" was pressed. The
      design doc's "resuming clears it back (or pushes it out)" is
      genuinely ambiguous between "restore the prior value" and "null
      it out"; restoring the prior value would need a place to remember
      it, which isn't in the design and reads like exactly the kind of
      second-source-of-truth complexity §5 argues against for
      `uploads_paused`. If an organizer had set a specific close time,
      then hit Stop, then Resume, that original close time is lost and
      they'd need to re-set it in Settings. Worth the planner confirming
      this is the intended behavior.
- [x] T3.3 Show the organizer the event's current upload state and how
      close it is to its photo limit (US-22, US-23). Same component;
      shows "Uploads are open/stopped/haven't opened yet" and
      `{count} / {photo_limit} photos`, with warn/danger styling as it
      nears/reaches the limit.

  **Note on Phase 3 as a whole**: all three compile and pass lint/build,
  but none were exercised in a browser. The manage page requires a
  signed-in organizer session (magic-link email), and no credentials/
  inbox access were available in this session — see "What's genuinely
  verified" in the handback report.

## Phase 4 — Guest-facing messages (US-22, design §6)

- [x] T4.1 "Event is full" message distinct from a failed upload, with
      no retry affordance — retrying cannot help. Implemented in
      `UploadForm.tsx`: matches `submit_photo()`'s `'event photo limit
      reached'` message, swaps in "This event has reached its photo
      limit — let the organizer know.", and suppresses the Retry
      button for that case only. Not exercised against a live
      `submit_photo()` call yet — needs T1.3.
- [ ] T4.2 Confirm a stopped event reads as closed to the guest, reusing
      the existing closed-window copy. No code change needed — this
      falls out of Stop uploads reusing `upload_ends_at`, which
      `submit_photo()` and the guest upload page already handle (same
      code path as any other closed window). Left unchecked because
      "confirm" implies actually driving it end-to-end (stop uploads as
      the organizer, then attempt a guest upload), which needs the
      dashboard session noted under Phase 3.

## Phase 5 — Verify

- [x] T5.1 Build/lint clean. `npm run lint` and `npm run build` both
      pass with no suppressions (verified this session).
- [ ] T5.2 Set an event's `photo_limit` low and confirm the cap is
      enforced **server-side** … Blocked on T1.3 (column doesn't exist
      on the live project yet).
- [ ] T5.3 Confirm the storage `file_size_limit` refuses an oversized
      object … Blocked on T1.4 (bucket setting not applied).
- [ ] T5.4 With a slideshow open, disable moderation and confirm the QR
      disappears within a poll without a reload … Partially covered:
      T2.2 confirms the *initial render* gates correctly against live
      data. The 30-second poll's live update was not exercised in a
      running browser (no browser-automation tool available in this
      session, and toggling `moderation_enabled` on a live event needs
      an authenticated organizer session this session doesn't have).
- [ ] T5.5 With a slideshow open, hit "Stop uploads" and confirm both
      that the QR disappears and that a guest upload is refused … Not
      done — needs the dashboard session noted above.
- [ ] T5.6 Confirm the guest sees the "event is full" message rather
      than a generic failure, and that it offers no retry. Not done —
      blocked on T1.3 (can't actually reach the limit without the
      column).
- [ ] T5.7 Redeploy to production. Deliberately not done — out of scope
      for this task (instructed not to deploy).

## Phase 6 — Review rework (all found reviewing 72d8e3a)

Three of these were defects in design.md, corrected before this phase
was written; the implementation followed the spec it was given.

- [ ] T6.1 Replace the `upload_ends_at = now()` pause with a dedicated
      `events.uploads_paused` column (design §5, rewritten). Stop/Resume
      writes only that column; `EventSettingsForm` must not write it;
      `submit_photo()` refuses on it with its own error; the slideshow
      poll treats it like the window. This removes both the lost-schedule
      problem and the stale-settings-form regression below.
- [ ] T6.2 Confirm the regression is gone: with uploads stopped, saving
      unrelated settings must not re-open uploads or bring the QR back
      (requirements US-23). This is the defect the rework exists for —
      test it, don't assume the refactor covered it.
- [ ] T6.3 `photo_limit`: add the `check (photo_limit > 0)` constraint
      and stop the client submitting a blank or non-positive value
      (design §2).
- [ ] T6.4 Check the cap before uploading to Storage as well as inside
      `submit_photo()`, so refused uploads stop creating orphaned
      objects. The enforcement point stays in the function; this is
      advisory (design §3).
- [ ] T6.5 Widen the storage DELETE policy so an organizer can delete
      any object under their own event's folder, with or without a
      matching `photos` row — orphans are currently unreachable from the
      app entirely (design §3).
- [ ] T6.6 Add "not full" and "not paused" to the QR's visibility
      condition, and show a "this event is full" state on the guest
      upload page instead of the form (design §4, §6).
- [ ] T6.7 Make the organizer's photo count and upload state live on the
      existing poll, per `specs/PROJECT.md`'s counts-from-the-server
      rule — a frozen count cannot warn anyone and actively reassures
      while uploads are being refused (design §7).
- [ ] T6.8 Render the Stop control for an event whose window hasn't
      opened yet (design §5).
- [ ] T6.9 Re-verify T5.4/T5.5 against the reworked pause.

Known and accepted, not to be "fixed" silently: the cap is approximate
under concurrent submissions (no lock — two simultaneous calls can both
pass the count check), and organizers can raise their own limit
arbitrarily, which design §2 intends. The migration must be applied
before this code is deployed, or `photo_limit` reads as undefined.

## Deliberately not built (requirements.md "Out of scope")

Per-IP and per-device rate limiting, CAPTCHA, guest accounts, automated
classification. design §1 records why, so this isn't revisited as an
oversight.
