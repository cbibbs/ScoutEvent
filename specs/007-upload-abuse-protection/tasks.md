# Tasks: Upload Abuse Protection

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

## Phase 1 — Server-side limits (US-22)

- [ ] T1.1 Migration: `events.photo_limit int not null default 500`
      (design §2).
- [ ] T1.2 Extend `submit_photo()` to reject once the event's photo
      count reaches its limit, counting rows of every status, and
      raising an error distinguishable from the upload-window one
      (design §2, §6).
- [ ] T1.3 Apply to the live Supabase project and verify, same method as
      Features 001/002.
- [ ] T1.4 Set a `file_size_limit` on the `photos` bucket so oversized
      objects are refused by the storage layer, not only by the browser
      (design §3). Document it alongside the bucket setup in the README.

## Phase 2 — Gate the join QR on moderation (US-21)

- [ ] T2.1 Pass `moderation_enabled` into `Slideshow` and include it in
      the values the existing 30s poll re-reads, so toggling moderation
      mid-show takes effect without a reload (design §4).
- [ ] T2.2 QR shows only when uploads are open **and** moderation is
      enabled (design §4).
- [ ] T2.3 Explain the coupling in `EventSettingsForm` where moderation
      is turned off (US-21, design §4).

## Phase 3 — Stop uploads (US-23)

- [ ] T3.1 "Stop uploads" / "Resume uploads" control near the event
      status at the top of the manage page — not in the settings form,
      and visually distinct from anything destructive (design §5).
- [ ] T3.2 Implement as `upload_ends_at = now()` and its reverse, so
      `submit_photo()` and the slideshow QR react through machinery that
      already exists rather than a second source of truth (design §5).
- [ ] T3.3 Show the organizer the event's current upload state and how
      close it is to its photo limit (US-22, US-23).

## Phase 4 — Guest-facing messages (US-22, design §6)

- [ ] T4.1 "Event is full" message distinct from a failed upload, with
      no retry affordance — retrying cannot help.
- [ ] T4.2 Confirm a stopped event reads as closed to the guest, reusing
      the existing closed-window copy.

## Phase 5 — Verify

- [ ] T5.1 Build/lint clean.
- [ ] T5.2 Set an event's `photo_limit` low and confirm the cap is
      enforced **server-side**: calling `submit_photo()` directly, not
      through the UI, must be refused once the count is reached. A
      client-side-only check is the failure this task exists to catch.
- [ ] T5.3 Confirm the storage `file_size_limit` refuses an oversized
      object uploaded directly to Storage, bypassing `UploadForm`.
- [ ] T5.4 With a slideshow open, disable moderation and confirm the QR
      disappears within a poll without a reload; re-enable and confirm
      it returns.
- [ ] T5.5 With a slideshow open, hit "Stop uploads" and confirm both
      that the QR disappears and that a guest upload is refused; then
      resume and confirm both recover.
- [ ] T5.6 Confirm the guest sees the "event is full" message rather
      than a generic failure, and that it offers no retry.
- [ ] T5.7 Redeploy to production.

## Deliberately not built (requirements.md "Out of scope")

Per-IP and per-device rate limiting, CAPTCHA, guest accounts, automated
classification. design §1 records why, so this isn't revisited as an
oversight.
