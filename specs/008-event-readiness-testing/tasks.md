# Tasks: Event Readiness — the February Wood Badge Course

Each task is checked off `[x]` only once actually done — and for this
feature, "done" almost always means **a number or an answer written
into this file**, not an action performed. A ticked box with no
recorded figure behind it is worth nothing here; per
`specs/CONSTITUTION.md`, say plainly what was and wasn't checked.

**No application code is written by this feature.** Several tasks
*conclude* that code should change; those conclusions become their own
specs (design §14).

## Schedule anchor

**E = the first day of the course.** Anchored for planning at
**2027-02-05**; the brief says "February 2026, four months out" and
those cannot both be true given today's date (2026-10-04).

- [x] **T-0 Confirm the actual course dates before anything below is
      scheduled.** Every date in this file is derived from E and moves
      with it. This is thirty seconds of work and invalidates the whole
      timeline if skipped.
      **Confirmed 2026-10-04 with the organizer (recorded in Feature
      009 design §13): the course is February 2027 and E = 2027-02-05,
      exactly as this file was anchored.** Every date in the table
      below therefore stands as written; nothing moves.

| Milestone | Date (E = 2027-02-05) | Phase |
|---|---|---|
| Documentation answers + functional verification | by 2026-10-30 | 0, 1 |
| Baseline measurement | by 2026-11-06 | 2 |
| Scale + moderation measurement | by 2026-11-13 | 3, 4 |
| **DECISION GATE — recorded** | **2026-11-20** | **5** |
| Mitigations + bulk download + multi-reviewer specced | by 2026-11-27 | — |
| Mitigations deployed | by 2026-12-18 (E−7w) | — |
| Re-measure against the mitigated build | by 2027-01-08 | 3 (repeat) |
| Dry run, real phones | 2027-01-08 (E−4w) | 6 |
| Change freeze | 2027-01-22 (E−2w) | 6 |
| Wake + sign-in + configuration | 2027-01-29 … 2027-02-04 | 6 |
| Course | from 2027-02-05 | 6 |
| Retrieve, verify, delete | by ~2027-02-22 | 7 |

## Phase 0 — Answer from documentation, not by experiment (US-25)

Gates Phase 5. T0.1 gates the *thresholds* in design §11b, so it is
first. None of these needs a running test.

- [ ] T0.1 **What does the platform do when free egress is exceeded —
      bill, throttle, refuse writes, or stop the project?** Answer from
      the provider's own documentation (billing / usage / spend-cap
      pages) or support. **Do not answer this by driving the live
      project past a limit** (design §10). Record the answer and its
      source in design §0, replacing the "not known" text — an
      unanswerable question should end as a recorded answer, not as an
      open task. Note that free-plan support may be community-only;
      budget for that.
- [ ] T0.2 *Only if T0.1 cannot be settled from documentation*: drive
      the **disposable** project (T1.5) past 5 GB of egress and record
      what happens — warning email, throttle, 402/403, project
      suspension — and how long after the threshold it happens.
      Timebox: if T0.1 is answered, skip this entirely.
- [ ] T0.3 **What does "200 concurrent peak connections" count** —
      WebSocket connections or channel subscriptions? The app opens two
      channels per slideshow client over one socket
      (`Slideshow.tsx:110`, `:160`), so the answer is 85/200 or 170/200
      at this event (design §4). Also record how a realtime *message*
      is counted (per broadcast, or per recipient), which decides
      whether the 2 M figure has 6× headroom or none.
- [ ] T0.4 Record whether a `304` revalidation is billed as egress, a
      request, or nothing, and whether CDN-cached bytes count against
      the separate cached-egress allowance. **This is the documentation
      half of Feature 006 T0.4**; T2.2 is the empirical half. Write the
      answers into `specs/PROJECT.md`'s free-tier table and tick the
      corresponding half of Feature 006 T0.4 there.
- [ ] T0.5 Confirm the paid tier's realtime caps and the free tier's
      database backup position (design §0, §11e). Both are currently
      assumed and neither is load-bearing yet; they become load-bearing
      at the gate.
- [ ] T0.6 Confirm how many free projects the organization may have. If
      the answer is one, design §9c's whole environment split falls
      back to "measure on production once, early, and answer T0.1 from
      documentation only" — record which world we are in before Phase 2
      is planned.

## Phase 1 — Functional verification that has never been run (US-32)

**Blocks all load testing.** Measuring the performance of behaviour
that has never been confirmed to work produces numbers about nothing.
All of these need a signed-in organizer session, which no previous
session has had, and T1.1 blocks most of them.

- [ ] T1.1 Apply `20260921000000_upload_abuse_protection.sql` to the
      live project. **This is Feature 007 T1.3 and it has been blocked
      for two rounds.** Until it lands, `photo_limit`, `uploads_paused`,
      `event_photo_count()` and the bucket `file_size_limit` do not
      exist, and every Phase 1 task below is untestable. Tick Feature
      007 T1.3 and T1.4 when done, not this box alone.
- [ ] T1.2 **Feature 007 T6.2** — with uploads stopped, save an
      unrelated setting and confirm uploads stay stopped and the QR
      does not return. Confirmed structurally only; this is the
      behavioural check.
- [ ] T1.3 **Feature 007 T5.2 / T5.6** — set a low `photo_limit`,
      confirm a guest is refused server-side with the "event is full"
      message and **no Retry affordance**.
- [ ] T1.4 **Feature 007 T5.4 / T5.5 / T6.9** — with a slideshow
      running, (a) disable moderation, (b) press Stop uploads, (c) hit
      the limit, and confirm the QR disappears in each case without
      anyone reloading the screen. Record which arrive by realtime and
      which by the 30 s poll.
- [ ] T1.5 **Feature 007 T5.3** — confirm the bucket `file_size_limit`
      refuses an oversized object at the storage layer.
- [ ] T1.6 **Feature 004 T5.2** — the organizer screens live: paginated
      load, search/filter/sort, a bulk action, and one-at-a-time
      review, against real data with a signed-in organizer. Every
      moderation measurement in Phase 4 runs through these screens, so
      an unverified screen is an unmeasurable one.
- [ ] T1.7 Stand up the **disposable project** (design §9c): a second
      free project **in the same region as production**, a preview
      deployment pointed at it, the same migrations applied, and an
      organizer account on it. Record the region and confirm it
      matches — a different region invalidates every §2c measurement.
- [ ] T1.8 Seed the disposable project with **1500 realistic display
      copies** through the real upload path, so object sizes, metadata
      and `cache-control` behaviour match production. Record the actual
      size distribution; this is the input to T2.1. **Do not seed
      production** (design §9c) — 1500 photographs is 60% of its total
      storage.

## Phase 2 — Baseline, single client (US-26)

One scenario per day (design §9a — usage accounting lags). Record both
meters before and after every run.

- [ ] T2.1 **Average display-copy size** over the 1500 seeded objects:
      mean, median, p90, and the distribution. Every figure in design
      §2 and §3 is denominated in this. Replace the 0.4 MB placeholder
      in design §2b with the measured figure and re-derive the tables.
- [ ] T2.2 **The decision-dominant measurement (design §2c): when N
      clients fetch the same objects, which meter moves?** Fetch a
      known byte-count of known objects from, say, 10 independent
      browser contexts; wait for accounting to settle; read **both**
      egress and cached egress. Record the split, and the ratio of
      metered bytes to bytes the clients think they received. A result
      near 1× origin means the worst case in design §2c; a result near
      1/N means the best case and the free plan becomes very likely.
      **Report this one on its own, as soon as it exists** — design §6's
      link decision effectively follows from it.
- [ ] T2.3 **The background query** (design §2b-i): capture one
      slideshow client's 30 s poll against the 1500-photo library.
      Record the uncompressed payload, the bytes actually on the wire,
      whether the response is content-encoded, and the per-client-hour
      cost. Extrapolate to 24 projector-hours and 32 viewer-hours.
      A 6× unknown on a 0.24-1.5 GB term is not acceptable going into
      the gate.
- [ ] T2.4 **Moderation's own transfer cost**: load the Needs Review
      grid and the one-at-a-time flow over ~100 photographs and record
      bytes transferred, first view and repeat view. Extrapolate to
      1500 and to the number of reviewers. This is the number that
      sizes the thumbnail question (design §5b, Feature 004 design §5).
- [ ] T2.5 **One viewer's transfer** for a realistic session: 10 and 30
      minutes at the 5 s interval, cold cache. Record distinct
      photographs displayed, bytes on the wire, and the ratio to
      (distinct × T2.1). If that ratio is not close to 1, the model in
      design §2a is wrong **again** and everything downstream of it is
      void — say so loudly rather than adjusting the model to fit.

## Phase 3 — Scale (US-26)

Runs on the disposable project. Headless browser contexts with
independent caches, not `curl` loops (design §9b).

- [ ] T3.1 **65 concurrent viewers**, each a real browser context, each
      watching ~20 minutes. Record both meters, per-client distinct
      photographs, and the aggregate. Compare against T2.5 × 65 — the
      divergence *is* the §2c effect, measured a second way.
- [ ] T3.2 **80 concurrent viewers plus a projector plus 4 organizer
      sessions**, the stated worst case. Same recording. Project the
      event-month total by combining with T2.3, T2.4 and §8b's
      retrieval figure, and write the projection into design §2d.
- [ ] T3.3 **Throttled, at scale.** Re-run T3.2's observation with a
      throttled profile and record (a) origin round trips per slide for
      already-seen photographs, (b) bytes each, (c) whether any slide
      stalls or blanks. **This extends Feature 006 T5.5 rather than
      duplicating it** — run T5.5's single-client version first if it
      has not been run; it is the baseline this is compared against.
- [ ] T3.4 **The realtime cap.** Raise concurrent clients until
      subscriptions are refused. Record (a) at what number, in the unit
      T0.3 identified, (b) what a refused client does — retry
      behaviour, backoff, any tight loop, (c) **what a viewer actually
      sees**: does the slideshow keep advancing, how stale does it get,
      is anything visibly broken, (d) whether egress rises as clients
      fall back to the 30 s poll. (c) is the requirement (US-26); (a)
      is just the number.
- [ ] T3.5 Record the fidelity caveats that applied to these runs —
      single source IP, single CDN point of presence, datacenter
      connection (design §9b) — alongside the numbers, not in a
      footnote. The §2c conclusion is most sensitive to exactly these.

## Phase 4 — Moderation throughput (US-29)

- [ ] T4.1 **Time a real review session.** One person, ~100
      photographs, in the one-at-a-time flow, fast network and
      throttled. Record median seconds per photograph, **split into
      decision time and image wait time**, and the extrapolation to
      1500 with the extrapolation stated. Only image wait time is
      fixable by us.
- [ ] T4.2 **Time the grid path**, and record the mechanical cost
      honestly: `NEEDS_REVIEW_PAGE_SIZE = 8` means 188 "Load more"
      clicks for 1500, and there is no select-all
      (design §5b). State whether this path is usable at this volume at
      all. Then derive the **required review rate per person per day**
      at 2, 3 and 4 reviewers (design §5a) and compare it to T4.1's
      measured rate. The output of this task is one sentence: *"N
      reviewers can / cannot keep pace, at R photographs per person per
      day."*
- [x] T4.3 **Write the concurrent-review test, to be run later.**
      Cannot be executed now — nothing lets a second person review an
      event's photographs (design §5c). Record the four-step procedure
      from design §5c and its pass condition as a deliverable to the
      multi-reviewer feature. **This task is complete when the test is
      written and handed over, and it must say so rather than being
      ticked as though the risk were cleared.**
      **Written (design §5c) and handed over: the multi-reviewer
      feature is `specs/009-multiple-approvers/`, which absorbs the
      four steps and the pass condition verbatim as its T6.3, to be
      run with four real devices at the dry run (2027-01-08).**
      Ticked for the hand-over only. **The risk is not cleared** — no
      step of the test has been run, and it cannot be until Feature
      009's Phases 1-5 are deployed. Feature 009 Phase 1 addresses the
      two defects design §5c predicted (the unconditional write and
      the `.range()` paging); whether that is sufficient is what T6.3
      measures.
- [ ] T4.4 From T4.2's sentence, take the position design §5d requires:
      option A (batch review), B (grid at scale), C (decouple the QR —
      a safety change needing the owner's recorded decision) or D (no).
      **If B or C, that is an amendment to Feature 007 US-21 and
      Feature 005 US-17**, to be written as one, not noted as a
      workaround.

## Phase 5 — The decision gate (US-24)

**Due 2026-11-20 (E−11 weeks).** Blocked on T0.1, T0.3, T2.1, T2.2,
T2.3, T3.1, T3.2, T3.4, T4.1, T4.2.

- [ ] T5.1 Assemble the projections: E₀ (origin egress), E_c (cached
      egress), S (peak storage), C (peak realtime units), and the
      moderation sentence from T4.2. Show the arithmetic from the
      measured inputs, not from design §2b's placeholders.
- [ ] T5.2 Apply design §11b's six criteria and record which, if any,
      fire. A criterion that fires decides the answer; none firing
      means the free path.
- [ ] T5.3 **Record the decision** — in `specs/PROJECT.md` and in
      `CONSTITUTION.md`'s open-decision table (row 7, added by this
      feature), with the numbers it rests on and the date.
      `CONSTITUTION.md` principle 4 requires a *recorded* decision for
      new recurring cost; a decision taken in conversation does not
      satisfy it.
- [ ] T5.4 **Decide the slideshow link** (design §6, US-27): Keep or
      Remove. Not a per-event setting. Write the resulting behaviour as
      a requirement in whichever spec implements it — today it exists
      in the product with no requirement behind it at all
      (`src/app/e/[slug]/page.tsx:93`).
- [ ] T5.5 Decide whether the course needs full-resolution originals
      (design §8b). If yes, Feature 006 Phases 0 and 3 must ship before
      the course and that is gated on Feature 006 T0.1 — escalate it
      now, not in January. Originals never captured cannot be
      recovered.
- [ ] T5.6 Put payment details on file **whichever way T5.2 goes**
      (design §11d). This costs nothing and is the difference between a
      five-minute and a one-hour recovery at 9pm on a Saturday.
- [ ] T5.7 If the free path is chosen: write the monitoring regime into
      the run book — which meters, read morning and evening by a named
      person, and the pre-agreed 60%-by-midpoint upgrade trigger
      (design §11d).
- [ ] T5.8 If the free path is chosen: confirm the mitigations it
      depends on can be specced, built, cold-reviewed and **deployed**
      by 2026-12-18, per the pipeline in `CLAUDE.md`. If they cannot,
      criterion 6 fires and the answer is the paid plan after all —
      this is the criterion most likely to decide it, and the easiest
      to wave through.

## Phase 6 — Event-day readiness (US-31)

- [ ] T6.1 **Sign-in email — re-scoped twice, and the second one
      changes what is being tested** (design §12b, corrected
      2026-10-05 against the provider's SMTP documentation).
      The original task — "have the real staff count sign in within a
      few minutes and count how many links arrive" — **measures
      nothing**, because without custom SMTP the service refuses to
      deliver to any address that is not on the project's team. A
      staff member's link does not arrive slowly; it never arrives,
      and the app says it did. The limit is also 2/hour, not "a few".
      Feature 009 removes the need for staff accounts entirely
      (co-approvers hold a link, not an account), so what remains to
      test is:
      1. **The owner's own sign-in**, timed, at least two weeks before
         the course and never on course week. This is the one account
         the free tier can serve, and it is now a single point of
         failure for all authenticated access — record how long the
         link takes to arrive.
      2. **One sign-in attempt from a non-team address**, to confirm
         the refusal and to record exactly what the app displays while
         nothing is delivered. Run this on the disposable project if
         it exists (T1.7); it consumes the same 2/hour budget either
         way.
      3. The run book line regardless of results: **the owner signs in
         the day before** and verifies the session persists on the
         device they will use (T6.4, design §12a).

      If anyone other than the owner turns out to need an account,
      that is `CONSTITUTION.md` open decision 6 (custom SMTP) and it
      has dates: decided by 2026-11-20, deployed and tested by
      2026-12-18. No vendor is chosen; Resend has been mentioned.
- [ ] T6.2 **Dry run, 2027-01-08 (E−4w)**: real phones, real people, a
      venue-like network, production, the build that will run in
      February. Cover simultaneous guest uploads; reviewers approving
      from their own devices; a sustained projector run watched for
      inter-slide stalls; the QR scanned from the back of a room; and
      **the bulk download exercised against real data** (design §8a).
      E−4 is chosen so findings have four weeks to become changes.
- [ ] T6.3 Act on T6.2's findings; **change freeze 2027-01-22 (E−2w)**.
- [ ] T6.4 **Write the run book.** Pre-event wake checklist with
      timings (design §12a); the settings an event of this size needs
      (`photo_limit` 1800 — not "a big number", design §3; moderation
      on; window open; interval); the during-course monitoring line;
      the sign-in-the-day-before step; the upgrade trigger and who
      pulls it; and what to do when the screen goes dark, uploads are
      refused, or a reviewer cannot sign in.
      **Correction, per design §12b:** "a reviewer cannot sign in" is
      not a troubleshooting entry, it is the expected state — reviewers
      have no accounts and never sign in. Replace it with "a reviewer
      cannot get in" (re-send the approver link; if places are full,
      raise the number) and keep a separate entry for **the owner**
      not receiving their link, which has no second account to fall
      back to and is why the owner signs in the day before.
      **Add, per Feature 009:** reviewer places set to staff count + 2
      before the course; how to hand out and (if needed) replace the
      approver link; and the fact that **only the owner can delete
      photographs or stop uploads** — if the event fills up mid-course,
      raising `photo_limit` and clearing junk are both owner actions
      and no reviewer can do either (Feature 009 §0a).
- [ ] T6.5 **E−7 days (2027-01-29)**: wake the project; confirm the
      guest page, slideshow and sign-in all serve.
- [ ] T6.6 **E−1 day (2027-02-04)**: confirm still awake; full
      end-to-end pass on the real event (upload → approve → on screen);
      event configured exactly as it will run; every reviewer signed in
      and their session confirmed to persist.
- [ ] T6.7 Morning of E: confirm serving before anyone arrives.
      Thirty seconds, and it is the last moment anything is fixable.

## Phase 7 — After the course (US-30)

- [ ] T7.1 Bulk download of the whole event, verified against the
      photograph count, onto the organizer's own storage. **Before any
      deletion.** Record the bytes it actually cost and against which
      meter — this is the first real measurement of design §8b and
      belongs back in `specs/PROJECT.md`.
- [ ] T7.2 At the end of the retention window: delete photographs
      (**objects and rows**), then the event — in that order.
      **Owner-only work** (Feature 009 §0a): co-approvers cannot delete,
      so this cannot be shared out and should be scheduled as one
      person's task rather than assumed to be covered by "the reviewers
      are still around". T7.3's downgrade depends on it completing. Deleting
      the event first orphans ~1800 JPEGs in the bucket forever with no
      row left to find them by (design §3, §8c). If select-all still
      does not exist, the Storage dashboard's folder delete is the
      documented fallback.
- [ ] T7.3 Confirm storage is back under the free ceiling, **then**
      downgrade if the paid plan was taken. A downgrade is refused
      while usage exceeds free limits, so this order is load-bearing on
      the bill (design §11e).
- [ ] T7.4 **Write up what the event actually cost**, against every
      projection in Phase 5, and update `specs/PROJECT.md`. This is the
      first real data this project has ever had, and the next event's
      planning is only as good as this write-up.
- [ ] T7.5 Feed the retention experience into `CONSTITUTION.md` open
      decision 4 as **input**, not as a policy (design §8d). Two weeks
      is what one organizer found convenient for one course.
