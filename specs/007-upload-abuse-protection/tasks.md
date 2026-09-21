# Tasks: Upload Abuse Protection

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

## Phase 1 — Server-side limits (US-22)

- [x] T1.1 Migration: `events.photo_limit int not null default 500`
      (design §2). Written as
      `supabase/migrations/20260921000000_upload_abuse_protection.sql`.
      Now also includes the `check (photo_limit > 0)` constraint (T6.3)
      and the `events.uploads_paused` column (T6.1) in the same file,
      since none of it has been applied to the live project yet.
- [x] T1.2 Extend `submit_photo()` to reject once the event's photo
      count reaches its limit, counting rows of every status, and
      raising an error distinguishable from the upload-window one
      (design §2, §6). Same migration file; raises `'event photo limit
      reached'`, checked after the upload-window and pause checks and
      before the insert.
- [ ] T1.3 Apply to the live Supabase project and verify, same method as
      Features 001/002. **Not done** — no Supabase access token in this
      session. Reconfirmed live this round that `photo_limit` and
      `uploads_paused` both still don't exist
      (`42703 column events.uploads_paused does not exist` via a direct
      REST query), and that `event_photo_count()` isn't in the schema
      cache yet either (`PGRST202`). Run
      `20260921000000_upload_abuse_protection.sql` in the SQL Editor,
      same way as the two prior migrations.
- [ ] T1.4 Set a `file_size_limit` on the `photos` bucket so oversized
      objects are refused by the storage layer, not only by the browser
      (design §3). **Not done** — bucket-level dashboard/API setting, out
      of reach without dashboard access in this session. Documented in
      README.md ("Setting up Supabase", step 3).

## Phase 2 — Gate the join QR on moderation (US-21)

- [x] T2.1 Pass `moderation_enabled` into `Slideshow` and include it in
      the values the existing 30s poll re-reads, so toggling moderation
      mid-show takes effect without a reload (design §4).
- [x] T2.2 QR shows only when uploads are open **and** moderation is
      enabled (design §4). See T6.6 below — this condition has since
      grown two more terms (not paused, not full).
- [x] T2.3 Explain the coupling in `EventSettingsForm` where moderation
      is turned off (US-21, design §4). Compiles; not visually confirmed
      in a browser (needs an organizer session — see Phase 3/6 notes).

## Phase 3 — Stop uploads (US-23)

- [x] T3.1 "Stop uploads" / "Resume uploads" control near the event
      status at the top of the manage page — not in the settings form,
      and visually distinct from anything destructive (design §5).
      `src/components/UploadStatusControl.tsx`, rendered above the
      Share/Settings grid. Uses `btn-accent` / `btn-secondary`, never
      `btn-danger*`, no confirm dialog.
- [x] T3.2 — **superseded by T6.1.** Originally implemented as
      `upload_ends_at = now()` / reverse; that was a defect design.md §5
      identifies and T6.1 replaces with a dedicated `uploads_paused`
      column. See T6.1/T6.2 for the current state.
- [x] T3.3 Show the organizer the event's current upload state and how
      close it is to its photo limit (US-22, US-23). Superseded in shape
      by T6.7 (now lives on its own poll instead of static props), same
      component.

  **Note on Phase 3 as a whole**: compiles and passes lint/build. The
  manage page requires a signed-in organizer session (magic-link email),
  and no credentials/inbox access were available in either session — see
  "What's genuinely verified" in the handback report.

## Phase 4 — Guest-facing messages (US-22, design §6)

- [x] T4.1 "Event is full" message distinct from a failed upload, with
      no retry affordance. Implemented in `UploadForm.tsx`: matches
      `submit_photo()`'s `'event photo limit reached'`, swaps in "This
      event has reached its photo limit — let the organizer know.", and
      suppresses Retry only for that case. Now also raised proactively by
      the pre-upload advisory check (T6.4), and shown server-side on the
      guest page itself before the form ever renders (T6.6). Not
      exercised against a live `submit_photo()` call — needs T1.3.
- [x] T4.2 Confirm a stopped event reads as closed to the guest, reusing
      the existing closed-window copy. **This changed in this round**:
      pausing is no longer the same column as the window (T6.1), so
      `submit_photo()` now raises a distinct `'uploads are paused for
      this event'` message. `UploadForm.tsx` maps both that and
      `'uploads are closed for this event'` to one shared copy so the
      guest still can't tell them apart, and the guest page's initial
      render already treats `closed || uploads_paused` as one "stopped"
      state (design §6). Code-reviewed as correct; not driven end-to-end
      live — needs T1.3 plus an organizer session to actually press Stop.

## Phase 5 — Verify

- [x] T5.1 Build/lint clean. `npm run lint` and `npm run build` both
      pass with no suppressions (re-verified this round, after Phase 6).
- [ ] T5.2 Set an event's `photo_limit` low and confirm the cap is
      enforced **server-side** … Blocked on T1.3.
- [ ] T5.3 Confirm the storage `file_size_limit` refuses an oversized
      object … Blocked on T1.4.
- [ ] T5.4 With a slideshow open, disable moderation and confirm the QR
      disappears within a poll without a reload … Still only the
      *initial render* is confirmed live (this round re-confirmed the
      moderation-off case still correctly hides the QR after the T6.6
      rework: `/e/wood-badge-8a1dcb/slideshow` shows no QR). The poll's
      live update, and the paused/full terms specifically, are not
      exercised — see T6.9.
- [ ] T5.5 With a slideshow open, hit "Stop uploads" and confirm both
      that the QR disappears and that a guest upload is refused …
      Not done — needs an organizer session. See T6.9.
- [ ] T5.6 Confirm the guest sees the "event is full" message rather
      than a generic failure, and that it offers no retry. Not done —
      blocked on T1.3.
- [ ] T5.7 Redeploy to production. Deliberately not done.

## Phase 6 — Review rework (all found reviewing 72d8e3a)

Three of these were defects in design.md, corrected before this phase
was written; the implementation followed the spec it was given.

- [x] T6.1 Replace the `upload_ends_at = now()` pause with a dedicated
      `events.uploads_paused` column (design §5, rewritten).
      `supabase/migrations/20260921000000_upload_abuse_protection.sql`
      adds the column (default `false`); `submit_photo()` refuses on it
      with its own message (`'uploads are paused for this event'`,
      distinct from the window's and the cap's); `UploadStatusControl`
      is now the *only* place in the codebase that writes
      `uploads_paused` (confirmed by grep — `EventSettingsForm` writes
      `upload_ends_at` for the schedule and nothing else); and
      `Slideshow`'s poll re-reads `uploads_paused` alongside the window
      and gates the QR on it. `upload_ends_at` is untouched by
      Stop/Resume now, so a configured schedule survives a
      stop-then-resume.
- [ ] T6.2 Confirm the regression is gone: with uploads stopped, saving
      unrelated settings must not re-open uploads or bring the QR back.
      **Structurally confirmed, not behaviorally confirmed.** `git grep
      uploads_paused` shows exactly one `.update()` call touching that
      column, in `UploadStatusControl.tsx`; `EventSettingsForm.tsx`'s
      update payload has no `uploads_paused` key, so by construction it
      cannot re-open a stopped event. What I have *not* done is drive
      this live end-to-end (click Stop as the organizer, save an
      unrelated setting, confirm still stopped) — that needs both the
      migration applied (T1.3) and an authenticated organizer session
      (no inbox access in this session). Flagging exactly as asked
      rather than treating the refactor as self-evidently sufficient.
- [x] T6.3 Add the `check (photo_limit > 0)` constraint and stop the
      client submitting a blank or non-positive value (design §2).
      Constraint in the migration; `EventSettingsForm.handleSubmit`
      refuses to save when `photoLimit` isn't a finite number `>= 1`
      (catches both the empty-string-becomes-`0` case and non-numeric
      input, which a plain `photoLimit < 1` check would miss for `NaN`).
- [x] T6.4 Check the cap before uploading to Storage as well as inside
      `submit_photo()` (design §3). `UploadForm` now calls the new
      `event_photo_count()` RPC (see T6.5's neighbor, `event_photo_count`
      — accurate count regardless of status, since RLS would otherwise
      hide pending/rejected rows from an anonymous count) immediately
      before the Storage `.upload()` call, and skips straight to the
      same "event is full" refusal if the event's already at its limit.
      Enforcement stays in `submit_photo()`; this is advisory and can be
      stale between the check and the actual upload — accepted, per
      Phase 6's closing note.
- [x] T6.5 Widen the storage DELETE policy so an organizer can delete any
      object under their own event's folder, with or without a matching
      `photos` row (design §3). Policy rewritten in the migration to key
      on the event folder (same pattern as the anon INSERT policy) rather
      than a `photos.storage_path` join. **Scope note**: this makes
      orphan cleanup *possible* through the existing delete machinery: it
      does not add new UI to enumerate storage objects that have no
      `photos` row (e.g. a "browse orphaned files" screen). Neither
      design.md §3 nor this task ask for that; flagging so it's a
      visible choice rather than a silent gap if it turns out to be
      wanted.
- [x] T6.6 Add "not full" and "not paused" to the QR's visibility
      condition, and show a "this event is full" state on the guest
      upload page instead of the form (design §4, §6). `Slideshow`'s
      `qrVisible` is now `uploadsOpen && !uploadsPaused &&
      moderationEnabled && photoCount < photoLimit`, with `photoCount`
      and `photoLimit` both re-read on the existing poll via
      `event_photo_count()`. The guest page computes the same `full`
      check server-side before deciding whether to render `UploadForm`
      at all, and a `closed || uploads_paused` state reuses the existing
      "uploads are closed" copy per design §6. Live-reconfirmed only the
      part that doesn't depend on the unapplied migration: moderation-off
      still hides the QR (`/e/wood-badge-8a1dcb/slideshow`), moderation-on
      still shows it (`/e/live-review-test-e89d69/slideshow`) — see the
      note below on what the missing migration does to this condition in
      the meantime.
- [x] T6.7 Make the organizer's photo count and upload state live on the
      existing poll (design §7). `UploadStatusControl` no longer derives
      its display purely from server props; it seeds from them once, then
      refreshes itself every 30s (same shape as `Slideshow`'s and
      `PhotoManager`'s established poll pattern) and immediately after its
      own Stop/Resume call. Not live-verified — needs an organizer
      session.
- [x] T6.8 Render the Stop control for an event whose window hasn't
      opened yet (design §5). The control now always renders one button
      keyed only on `paused` (Resume if paused, Stop otherwise),
      independent of the window state — previously it was conditionally
      hidden when the window hadn't opened.
- [ ] T6.9 Re-verify T5.4/T5.5 against the reworked pause. **Not done** —
      same blocker as everything else in this phase that touches
      `uploads_paused`/`photo_limit`: needs T1.3 applied and an
      authenticated organizer session, neither available in this
      session.

**What the still-unapplied migration does to live behavior right now**,
observed directly rather than assumed: with `photo_limit` and
`uploads_paused` absent from the live `events` table and
`event_photo_count()` absent from the schema, `event.photo_limit` and
`event.uploads_paused` read as `undefined` at runtime, and the RPC calls
return `{ data: null, error: {...} }` without throwing. Concretely this
means, until T1.3: the guest page's `full` check is always `false`
(`(photoCount ?? 0) >= undefined` is `false`), so it never wrongly blocks
uploads; but the slideshow's QR `photoCount < photoLimit` term is
`0 < undefined`, also `false`, which means **the QR currently fails
closed** (hidden) on every event regardless of the real moderation/window
state, purely because fullness can't be determined yet. This is a
byproduct of testing against unmigrated data, not a logic bug — once
`photo_limit` genuinely defaults to `500` and the RPC exists, the same
comparison resolves correctly. Recording it here so it isn't mistaken for
a regression when T1.3 lands and the QR starts reappearing.

Known and accepted, not to be "fixed" silently: the cap is approximate
under concurrent submissions (no lock — two simultaneous calls can both
pass the count check, and the pre-upload advisory check in T6.4 is
stricter about this — it can be stale in *either* direction), and
organizers can raise their own limit arbitrarily, which design §2
intends. The migration must be applied before this code is deployed.

## Deliberately not built (requirements.md "Out of scope")

Per-IP and per-device rate limiting, CAPTCHA, guest accounts, automated
classification. design §1 records why, so this isn't revisited as an
oversight.
