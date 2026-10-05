# Tasks: Multiple Approvers Per Event

Ordered. Each task references the requirement and design section it
implements. A box is ticked `[x]` only when the work is done **and
exercised** — per `specs/CONSTITUTION.md`, "it compiled" is not
verification, and a task that is implemented but unverified says so in
its own text rather than being ticked.

**Deploy order (`specs/PROJECT.md`).** Migrations are applied by hand
in the SQL Editor and code is deployed separately to Vercel, so there
is always a window where one has landed and the other has not.
Phase 2's migration **widens every predicate and narrows none**
(design §4), so applying it ahead of the code changes nothing
observable and is the preferred order. The code must nonetheless
tolerate its own migration not being applied: design §12 states, per
route, which way each new check fails, and the standing rule is that
**nothing added here may remove capability the owner has today** — the
manage page carries Stop uploads (Feature 007 US-23), and taking it
down with a missing-table error would be Feature 007's own bug
repeated.

Phases 1 and 2 are independently valuable and should be deployed on
their own, before anything in Phases 3-5 exists: the concurrency fixes
are correctness improvements for a *single* reviewer today.

**Schedule (design §13; E = 2027-02-05, confirmed).** Phases 1-2 by
2026-10-30, Phases 3-5 by 2026-11-27, Phase 6's four-reviewer test at
the dry run 2027-01-08. Feature 008's mitigation deadline is
2026-12-18 and its change freeze is 2027-01-22.

## Phase 0 — Prerequisites that are not code

- [ ] T0.1 **Enable anonymous sign-ins** in the Supabase dashboard
      (Authentication → providers). This cannot be done in a
      migration — unlike the bucket `file_size_limit`, which Feature
      007 §3 rightly put in SQL — so it is a manual step with a
      verification: confirm in a scratch browser tab that
      `signInAnonymously()` returns a session, and record the date it
      was turned on in this file. Design §12.
- [ ] T0.2 **Record the anonymous sign-in rate limit** from the
      provider's documentation (expected: 30/hour/IP, unverified) and
      note it here. The venue is one NAT (Feature 007 §1), so this is
      a limit 2-4 staff share. Design §1e(4). Do not test it by
      exhausting it on the live project.
- [ ] T0.3 Confirm the shape of the anonymous claim in the issued JWT
      (`is_anonymous`), since the `events` guard in T2.3 depends on
      the exact claim name. Design §1e(1).
- [ ] T0.4 Confirm anonymous users count toward MAU and record the
      current free allowance alongside the other figures in
      `specs/PROJECT.md`. Design §1e(2).

## Phase 1 — Concurrency correctness (no migration needed)

Deployable on its own. Nothing here depends on Phases 2-5.

- [ ] T1.1 **One module owns a photo decision.** Move the three write
      sites (`ReviewQueue.tsx:56-77`, `PhotoManager.tsx:332-335`,
      `PhotoManager.tsx:371-374`) behind a single helper that takes the
      expected current status and reports `applied` / `alreadyDecided`.
      Design §6 (US-36).
- [ ] T1.2 **Expected-status precondition on every status write**:
      `.eq("status", expected).select("id")`, with zero rows meaning
      somebody else decided first. Covers approve, reject, restore, and
      "add to slideshow" (which carries `status = 'approved'`). Delete
      carries no precondition, by design. Design §6.
- [ ] T1.3 **Bulk actions report partial application** — "approved 11;
      2 had already been decided by someone else" — from the row count
      returned by the filtered update, not from the size of the
      selection. Design §6 (US-36, third clause).
- [ ] T1.4 **Review queue tells the reviewer and moves on**: on a
      refused write, show "already decided by someone else" (with what
      it was decided as, read back from the row) before advancing, and
      do not count it in the reviewer's own tally. Design §6, §7c.
- [ ] T1.5 **Keyset paging in `ReviewQueue`** replacing
      `.range(items.length, …)`: order by `(created_at, id)`, fetch
      rows strictly after the last one held. Design §7a (US-37, first
      clause).
- [ ] T1.6 **Keyset paging for Needs Review's "Load more"**
      (`PhotoManager.tsx:272`) — same defect, same fix. Design §7a.
- [ ] T1.7 **Session horizon replaces `sessionTotal`**: capture the
      `(created_at, id)` of the newest pending photo when the session
      opens and bound the walk at or before it; drop the
      "stop after N steps" rule. Design §7b. **Amends Feature 004
      design §4** — make that amendment in the same change, not after.
- [ ] T1.8 **Two figures in the progress indicator**: the reviewer's
      own session tally (local) and the number of the batch still
      waiting (server count, refreshed on the existing poll/realtime,
      never incremented from payloads — `specs/PROJECT.md`, Realtime).
      Progress bar tracks the second. Design §7c (US-37).
- [ ] T1.9 **Completion state** when the batch holds nothing pending:
      own tally, a plain statement that others may have decided some of
      it, the count of photos that have arrived since the horizon, and
      a path back through the ones this reviewer skipped. Design §7c.
- [ ] T1.10 **`ReviewQueue` subscribes to realtime** on
      `event_id=eq.<id>`, dropping decided rows from the batch and
      handling the displayed photo being decided elsewhere. The
      subscription is the fast path; T1.2's precondition remains the
      guarantee. Design §8 (US-36, fourth clause).
- [ ] T1.11 Verify Phase 1 with **two browser sessions as the same
      owner** (which is possible today, and is the only concurrency
      test runnable before Phase 3): decide the same photo from both,
      confirm first-wins and the second is told; decide ~15 photos in
      one while the other pages, and confirm no pending photo is
      skipped. Record what was and was not covered.
- [ ] T1.12 Build, lint, deploy. Confirm single-reviewer review is
      unchanged in feel: approve/reject/skip, keyboard shortcuts,
      exit-to-grid, and the empty-queue state.

## Phase 2 — The migration (the ten predicates)

One file, `supabase/migrations/<ts>_multiple_approvers.sql`. It is the
authoritative definition of every policy it recreates; the earlier
migrations' copies become history and must not be edited or re-run
after it (design §4).

- [ ] T2.1 Create `event_approver_links` and `event_approvers` with
      their constraints and the `event_approvers (approver_id)` index.
      Design §2.
- [ ] T2.2 Policies on the two new tables: owner-only on the link row;
      SELECT on memberships for the owner and for an approver's own
      row; **no write policies** on `event_approvers`. Written against
      `events.organizer_id` directly, never through
      `can_moderate_event`, to avoid recursion. **Grant `select` on
      both tables to `anon` and `authenticated` explicitly** — a
      missing grant makes the predicate raise instead of returning
      false, which would error the public slideshow's own query.
      Design §2b.
- [ ] T2.3 **`is_anonymous` guard on `events`.** Recreate "organizers
      manage their own events" with
      `coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false`
      in `with check`. Without this, enabling T0.1 lets anyone with the
      public anon key create events. Design §1e(1) — this ships in the
      same migration as everything else, not after.
- [ ] T2.4 `can_moderate_event(uuid)` — `stable`, **security invoker**,
      **no `SET` clause**, every name schema-qualified, so the planner
      can inline it into policy predicates. Design §2a.
- [ ] T2.5 `rotate_approver_link`, `approver_link_preview`,
      `claim_approver_place` — the last with
      `select … for update` on the link row, which is what actually
      enforces the place cap against simultaneous claims (US-38), and
      with a refusal for any caller whose session is **not** anonymous,
      which is what makes "an approver sees only shared events" a total
      rule rather than a filter (design §5a, guard 2).
      Grants: preview to `anon, authenticated`; claim and rotate to
      `authenticated`. Design §2a.
- [ ] T2.6 Recreate the **three** live predicates that change, as
      membership-based: `photos` SELECT (supersedes
      `20260914000000:19`) and `photos` UPDATE using + with check
      (`20260913000000:79,85`). Design §4.
      **Leave both DELETE policies exactly as they are** — `photos`
      DELETE (`20260913000000:96`) and `storage.objects` DELETE
      (`20260921000000:171`) stay owner-only, because deletion is not a
      co-approver power (design §0a). Do not thread
      `can_moderate_event` through them "for consistency"; their being
      untouched *is* the enforcement.
- [ ] T2.7 Apply to the live project and verify **as the owner, before
      any approver exists**, that nothing changed: review, approve,
      reject, slideshow toggle, delete, bulk actions, and a storage
      delete of an orphan (Feature 007 §3) all behave as before. This
      is the "widens, never narrows" claim being checked rather than
      asserted.
- [ ] T2.8 Add the two tables and the three functions to
      `src/lib/supabase/types.ts`, which is hand-maintained.

## Phase 3 — Claiming a place

- [ ] T3.1 Route `/approve/[token]`, outside the `/dashboard` proxy
      matcher, server-rendering `approver_link_preview`: event name,
      places remaining, one button. Nothing is consumed by loading the
      page — a messaging app's link preview must cost nothing.
      Design §3 (US-33).
- [ ] T3.2 The claim action: use the existing session if there is one
      (never sign an owner out), otherwise anonymous sign-in, then
      `claim_approver_place`. Then `router.replace('/dashboard/<slug>')`
      so the token leaves the address bar and history. `no-referrer`
      and `noindex` on the page. Design §3 (US-33, last clause).
- [ ] T3.3 Every failure state, each distinguishable and none of which
      may look like success: unrecognized link (one message for
      rotated / deleted / never existed), places full, **anonymous
      sign-in disabled** (says it is a site configuration problem),
      rate-limited (retryable, says to wait). Design §3.
- [ ] T3.3a **An account session is refused without being disturbed**
      (design §5b): no sign-out, no place taken, and one of two
      messages — "this is your event, here is how to manage it" if the
      account owns it, otherwise an explanation naming the private
      window as the way to help. Verify by opening an approver link
      while signed in as the owner **and** as a different organizer,
      and confirm the signed-in dashboard is intact afterwards in both
      cases. This is the one path that could sign someone out of their
      own events at a campsite.
- [ ] T3.4 Re-opening a current link while already holding a place
      returns to the event and consumes nothing (US-33).
- [ ] T3.5 Confirm the proxy (`src/proxy.ts`) treats an anonymous
      session as signed in for `/dashboard`, so a fresh co-approver is
      not bounced to `/login`.

## Phase 4 — The owner's approver panel

- [ ] T4.1 Owner-only card on the manage page: create link, show it as
      selectable text **and** a QR (reusing `ShareLinks`' shape),
      "N of M places taken", places selector 1-20. Design §9 (US-38).
      Note the existing `ShareLinks` origin handling —
      `specs/PROJECT.md`'s framework note about `window.location` and
      hydration applies to any new link rendered here.
- [ ] T4.2 Replace link: confirmation naming the consequence
      ("all N people using it will need the new one"), then
      `rotate_approver_link`. Stop sharing: delete the link row,
      memberships cascade. Design §9.
- [ ] T4.3 With the migration **not** applied, the panel renders
      "reviewer links aren't available yet" and the rest of the manage
      page — including Stop uploads — works normally. Verify by
      pointing a local build at a project without the migration, not
      by reasoning about it. Design §12, `specs/PROJECT.md`.

## Phase 5 — What a co-approver sees

- [ ] T5.1 `/dashboard`: **one list, chosen by session type** — an
      account session lists the events it owns (today's query,
      unchanged); an anonymous approver session lists only the events
      it holds places on. Do not run both and merge. A failed
      membership query degrades to an empty shared list and must never
      suppress or alter the owned list. Design §5, §5a, §12 (US-35).
- [ ] T5.1a The site header (`src/components/Header.tsx`) must not
      offer "Organizer sign in" to an approver session, and signing out
      must read as leaving review. A co-approver who signs in with an
      email in the same browser **loses their place and cannot
      re-claim it** (design §5b); the cheapest defence is not putting
      the trapdoor in front of them.
- [ ] T5.2 Manage and review page guards become owner-or-approver, with
      the approver check failing *false* on error so the owner path is
      untouched when the migration is absent. A visitor who is neither
      gets `notFound()`, the same response as a missing event (US-35).
- [ ] T5.3 Role-aware rendering per design §5's table: settings form,
      Stop/Resume, **every delete control** (per-card Delete, "Delete
      selected" in the Library bulk toolbar, delete event) and the
      approver panel are **omitted** (not disabled) for co-approvers;
      upload state and the photo count render read-only; guest and
      slideshow links stay visible. Design §5, §0a (US-34).
- [ ] T5.4 Confirm the refusals are real, not cosmetic: as a
      co-approver, attempt from the browser console an `events` update,
      an approver-link read, a `photos` **delete**, and a
      `storage.objects` **delete** of one of that event's objects.
      Confirm Postgres refuses all four, and in particular that the
      photo row and the object both still exist afterwards. US-34's
      last clause. Design §4, §0a.

## Phase 6 — Verification

- [ ] T6.1 **Negative RLS pass.** As a co-approver on event A: can read
      and decide A's photos of every status; **cannot delete any of
      them, nor any object in A's storage folder**; cannot see event
      B's photos or rows; cannot read A's approver link token; cannot
      update A's event row; cannot delete A. As an anonymous visitor
      who never claimed: unchanged from today. Record each result.
- [ ] T6.2 **Rotation.** Two places taken; rotate; confirm both
      sessions lose access on their next request (not merely on
      reload), the old link is refused, and the new link admits them
      again. Then raise the places from 4 to 6 and confirm the two
      existing approvers are undisturbed. US-38.
- [ ] T6.3 **The concurrent-review test, inherited from Feature 008
      §5c / T4.3.** This is Feature 008's deliverable to this feature;
      it is run here. On an event with ≥50 pending photographs:
      1. Two reviewers enter one-at-a-time review within seconds of
         each other. Record whether they are handed overlapping work.
      2. Both decide the same photograph, differently, within a
         second. Record the final state and whether either reviewer is
         told.
      3. One reviewer bulk-approves a page while the other is
         mid-session. Record whether the second reviewer's paging skips
         rows.
      4. Repeat with **four** reviewers, the stated number.

      **Pass condition (Feature 008 §5c, unchanged):** no photograph is
      presented as undecided work to two reviewers at once, and no
      decision is replaced without the reviewer who made it being told.

      Note honestly what this design does and does not promise against
      step 1: two reviewers entering together **will** be handed
      overlapping photographs — the design prevents duplicate *work*
      from being silently lost or silently skipped (§6, §7a), it does
      not partition the queue, because partitioning was rejected
      (§6). Record the observed overlap rate; if it is high enough to
      waste real time at four reviewers, that is a finding for a
      follow-up, not a failure of the pass condition.

      Run at the **dry run, 2027-01-08**, which is the first time four
      people and four devices are in a room (Feature 008 T6.2).
- [ ] T6.4 **Throttled device pass.** One claim and one review session
      on a real phone over a venue-like connection (Feature 008 §9d's
      throttling). The claim flow involves a sign-in round trip that no
      other guest path has; confirm it is not the slowest thing on the
      morning.
- [ ] T6.5 **Deploy-order rehearsal**, both directions: code without
      migration (T4.3, T5.1, T5.2) and migration without code (T2.7).
      Confirm the owner never loses a capability in either state.
- [ ] T6.6 Update `README.md`: the anonymous sign-ins toggle as a setup
      step, what the migration does, and what an approver link is.

## Phase 7 — Follow-through

- [ ] T7.1 Record the cleanup query for anonymous users holding no
      membership, to be run after the course rather than on a schedule.
      Design §1e(3).
- [ ] T7.2 Feed three lines into Feature 008's run book (T6.4): set
      places to **staff count + 2** before the course (design §9); "if
      a reviewer loses their place, send them the link again — if
      places are full, raise the number; do not rotate"; and "**only
      the owner can delete photographs or stop uploads** — if the event
      fills up, raising the limit and clearing junk are both owner
      actions" (design §0a).
- [ ] T7.3 After the course, record in `CONSTITUTION.md`'s open
      decisions whether the leaked-link risk and the no-attribution
      decision survived contact with a real event, and re-examine both
      before any youth-present event. Requirements "Accepted risks",
      design §10.

## Amendments to other specs

These are **already made** as part of authoring this feature — listed
so the next reader can check them rather than as work outstanding.
Design §14 holds the full table with reasons.

- [x] `specs/CONSTITUTION.md` — open decision 3 struck through as
      decided; new bounded row for the leaked approver link.
- [x] `specs/PROJECT.md` — Auth row, "Where the data lives", and
      access-control rule 2.
- [x] `specs/001-photo-collection-slideshow/requirements.md` — US-6 and
      the out-of-scope line.
- [x] `specs/003-live-review-and-clear-slideshow-controls/` —
      US-10 and design §1.
- [x] `specs/004-photo-library-at-scale/` — US-14, design §1 and §4.
- [x] `specs/006-photo-quality-and-originals/design.md` §6 — the
      mirrored storage predicate.
- [x] `specs/007-upload-abuse-protection/requirements.md` — US-22 and
      US-23 name the owner explicitly.
- [x] `specs/008-event-readiness-testing/` — T-0 closed (E =
      2027-02-05), T4.3 handed over to T6.3 above, §12b/T6.1
      re-scoped, and §3 / §8c / T6.4 / T7.2 corrected for deletion
      being owner-only (no extra hands for the retention step; the
      pre-downgrade deletion is the owner's alone).
