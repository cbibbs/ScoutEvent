# Feature 008: Event Readiness — the February Wood Badge Course

Builds on Features 001-007. This is the first feature whose subject is
an actual event rather than a capability.

## Problem

A Wood Badge course is committed for **February** — roughly four months
out. It is the first use of this app by people who are not its author,
and it is larger than anything the app has ever carried:

| Input (from the organizer) | Figure |
|---|---|
| People opening the live slideshow as viewers | 50-80 |
| Photos across the course | 1500+ |
| People able to review photos | 2-4, working concurrently from their own devices |
| Retention needed after the course | ~2 weeks, then the photos may be deleted |
| Audience | Adult leaders. Photographs of minors are not the primary concern here |

Everything this project has shipped so far has been exercised at single
digits of photos and one viewer. Every allowance figure in
`specs/PROJECT.md` was either carried forward unverified or reasoned
about rather than measured, and two separate attempts to reason about
egress reached the wrong answer in opposite directions
(Feature 006 design §1b).

The decision this feature exists to serve is: **does this event run on
the platform's free allowances, or does it need a paid plan for the
event months?** The organizer's position is "free, but decide once we
have test numbers." So the job here is to **produce the numbers that
decide it** — not to assume an answer in either direction, and not to
discover the answer during the course.

Two things make getting this wrong expensive rather than merely
annoying:

- An event happens once (`CONSTITUTION.md` principle 3). A screen that
  stops working at 8pm on a Saturday is unrecoverable.
- **What the platform does when a free allowance is exceeded is not
  documented and is not known.** The difference between "you get a
  bill" and "the project stops serving" is the difference between an
  irritation and a ruined course, and nothing in this project currently
  knows which it is.

### A date to confirm before anything else

The brief says "February 2026, four months out". Today is 2026-10-04,
so those two statements cannot both be true; four months out is
**February 2027**. This spec is written against February 2027 and uses
**E** for the first day of the course, anchored for planning at
**2027-02-05**. *Confirm the real dates before the schedule in
`tasks.md` is acted on* — every deadline in it is derived from E.

### A note on EARS subjects

Most criteria below are ordinary runtime behaviour and read
`THE SYSTEM SHALL`. Some are obligations on the project rather than on
the running software — a measurement that must be taken, a decision
that must be recorded. Those read `THE PROJECT SHALL`. Pretending a
measurement plan is a system behaviour would make the criteria
unfalsifiable, which is the opposite of the point.

## User Stories

### US-24: The plan decision is made from measured numbers, in time to act on

As the project owner, I want to choose between the free allowances and a
paid plan on the basis of measurements, early enough that either answer
is still actionable.

- THE PROJECT SHALL define, in advance, the specific measurements that
  decide this and the threshold at which each one changes the answer.
  A measurement with no threshold attached cannot decide anything.
- THE PROJECT SHALL record the decision, its reasoning, and the numbers
  it rests on, per `CONSTITUTION.md` principle 4. A paid plan is not
  forbidden; it is required to be deliberate.
- THE PROJECT SHALL make the decision by a date that leaves time to
  design, build, review and deploy whatever the "stay free" answer
  depends on. WHEN that date passes without the measurements being
  complete, THE PROJECT SHALL take the paid-plan path rather than
  extend the deadline — an unmeasured free tier is a gamble on the live
  path, which principle 3 does not permit.
- THE PROJECT SHALL arrange matters so that the decision can be
  reversed **upward during the course** within minutes, whichever way
  it goes. The cost of choosing wrong must not include being unable to
  change it on the night.
- IF the free path is chosen, THE PROJECT SHALL define a during-course
  monitoring step, the figure it reads, and the threshold at which the
  upgrade is taken without further discussion.

### US-25: What happens at each limit is known before the event, not discovered during it

As the project owner, I want to know what the platform actually does
when each allowance is exhausted, because the consequences differ
enormously and the mitigations differ with them.

- THE PROJECT SHALL establish, for each allowance the event could
  plausibly reach, whether exceeding it results in a charge, a
  throttle, a refusal of new work, or the service being stopped.
- THE PROJECT SHALL answer this from the provider's documentation or
  support where possible, and SHALL NOT answer it by driving the live
  project past a limit.
- WHERE a limit cannot be answered from documentation, THE PROJECT
  SHALL answer it against a disposable environment that no event
  depends on, and SHALL record the answer rather than re-deriving it
  later.
- WHEN the answer is "the service stops", THE PROJECT SHALL treat the
  corresponding allowance as a hard ceiling with a safety margin,
  rather than as a budget to be spent to the last byte.

### US-26: Capacity is measured against this event's real shape

As the project owner, I want the event's demand on storage, data
transfer, and live updates measured against 1500 photos and 50-80
viewers, rather than estimated.

- THE PROJECT SHALL measure the transfer cost of one viewer watching
  the slideshow for a realistic length of time, expressed as a cost per
  distinct photo displayed, and SHALL derive the aggregate for 50-80
  viewers from it.
- THE PROJECT SHALL take the platform's own usage accounting as the
  ground truth for transfer, and SHALL treat any figure computed from
  what the client thinks it fetched as a cross-check only.
- THE PROJECT SHALL account for every contributor to data transfer, not
  only photographs: the repeated background queries a slideshow left
  open performs, the images a reviewer loads while moderating, and the
  retrieval of the whole collection afterwards. A model that counts
  only the photos on screen has already been wrong here twice.
- THE PROJECT SHALL state plainly whether 1500+ photos fit in the
  available storage at all, with the arithmetic shown, and SHALL NOT
  design a test to discover something arithmetic already settles.
- THE PROJECT SHALL measure peak concurrent live-update subscribers and
  the volume of live-update messages the course generates against their
  respective ceilings.
- WHEN the live-update ceiling is reached and further subscriptions are
  refused, THE SYSTEM SHALL continue to display and advance the
  slideshow on every affected screen, and THE PROJECT SHALL record what
  a viewer actually experiences in that state — how stale their view
  becomes and whether anything visibly fails.
- THE PROJECT SHALL measure on a throttled, congested network as well
  as a fast one. The venue network is the stated reason the app
  compresses photos at all; a measurement taken on a good connection
  describes a different event.

### US-27: Inviting viewers is a deliberate choice, not a side effect

As the project owner, I want the number of people who become slideshow
viewers to be something we chose, because it is the single largest
multiplier on what the event costs.

- THE PROJECT SHALL decide, explicitly and with the measured per-viewer
  cost in hand, whether the guest upload page should continue to offer
  a path to the live slideshow at an event of this size.
- WHEN that decision is made, THE SYSTEM SHALL behave according to it
  by a stated date, and the behaviour SHALL be covered by a written
  requirement either way. Today this path exists in the product with no
  requirement behind it, which means it has never been decided at all.
- IF the path is kept, THE SYSTEM SHALL make the consequence visible to
  whoever is responsible for the event's cost, rather than leaving the
  multiplier implicit.
- THE PROJECT SHALL state the per-viewer figure in terms an organizer
  can apply to a future event of a different size, not only as a total
  for this one.

### US-28: The slideshow stays representative at this photo count

As a viewer at the course, I want the screen to show me the event I am
attending, not only its opening hours.

- WHEN a viewer opens the slideshow at an event holding 1500 photos,
  THE SYSTEM SHALL show them photographs representative of the event's
  recent activity within a few minutes, rather than beginning from the
  oldest photograph every time.
- WHEN a photograph is approved while a slideshow is running, THE
  SYSTEM SHALL display it within a bounded and stated time. Feature 001
  US-5 requires it to enter the rotation without a refresh; at 1500
  photographs "in the rotation" and "shown this century" have come
  apart, and the requirement no longer means what it was written to
  mean. **This amends Feature 001 US-5.**
- THE PROJECT SHALL state the bound it is choosing and the trade it
  implies, since showing recent photographs more often necessarily
  means showing older ones less.
- WHERE the set of photographs the screen actually plays differs from
  the set an organizer has placed in the slideshow, THE SYSTEM SHALL
  not present the two as identical to the organizer. **This touches
  Feature 004 US-15**, which requires the organizer's slideshow section
  to list photographs "in the same order the slideshow itself plays
  them."

### US-29: Moderation at this volume is achievable by the people who will do it

As an organizer running a course that will produce 1500+ photographs, I
want reviewing them to be work that 2-4 people can actually complete
alongside running the course.

- THE PROJECT SHALL measure how long reviewing a photograph actually
  takes, separately in the one-at-a-time flow and in the grid flow, on
  both a fast and a throttled network, and SHALL extrapolate to 1500
  with the extrapolation stated rather than hidden.
- THE PROJECT SHALL express the result as the **review rate per person
  per session** the course requires, given the number of reviewers
  expected to be working and the hours available to them, so that the
  requirement can be compared against what a person can sustain.
- WHEN several people review at once, THE SYSTEM SHALL NOT present the
  same photograph to two of them as undecided work, and SHALL NOT allow
  one reviewer's decision to be silently replaced by another's.
  Today's review flow takes a snapshot of the pending queue when it is
  entered, so two reviewers entering it together are handed the same
  photographs; what happens when they each decide one is untested and
  unspecified.
- THE PROJECT SHALL treat concurrent review as **new risk introduced by
  having more reviewers**, not as capacity that arrives for free, and
  SHALL state what must be tested once the capability to have several
  reviewers exists. This feature cannot verify it: there is no way
  today for a second person to review an event's photographs at all.
- WHEN the measured throughput shows that review at this volume cannot
  keep pace with uploads, THE PROJECT SHALL say so and name the change
  that follows, rather than recording a workaround. IF that change is
  to the rule tying the on-screen upload invitation to moderation being
  enabled, THE PROJECT SHALL amend Feature 007 US-21 rather than
  circumventing it, and SHALL treat the amendment as a safety change
  per `CONSTITUTION.md` principle 1.
- Having more reviewers SHALL NOT be recorded as resolving the coupling
  question. It makes it more survivable; whether it survives is what
  the measurement is for.

### US-30: The photos leave the system before they are deleted from it

As the organizer, I want the course's photographs on my own storage,
and I accept that they need only remain in the system for about two
weeks afterwards.

- THE PROJECT SHALL provide a way to retrieve the whole of an event's
  photographs in one operation before any retention window is relied
  upon. A retention window without a way out is deletion, not
  retention.
- THE SYSTEM SHALL make the retrieval affordable in data transfer, not
  only tolerable in time. Duration is not the constraint; **bytes
  are**, and a retrieval of full-resolution originals is large enough
  to exhaust a month's entire free transfer allowance by itself.
- WHEN an event's photographs are deleted at the end of the retention
  window, THE SYSTEM SHALL free the storage they occupied, and the
  deletion SHALL be achievable for 1500 photographs as an ordinary
  operation rather than 1500 individual actions.
- THE PROJECT SHALL record the two-week window as **an input from one
  organizer about one course**, not as the project's retention policy.
  Deleting photographs of identifiable people is a policy question
  (`CONSTITUTION.md` open decision 4), and what one organizer finds
  convenient is evidence for that decision, not the decision.
- IF the course expects full-resolution photographs rather than
  display-sized ones, THE PROJECT SHALL establish that before the
  course begins. Originals that were never kept cannot be recovered
  afterwards.

### US-31: Event-day operations are rehearsed, not assumed

As the organizer standing in the room, I want everything on the live
path to have been exercised on real devices and a real network before
the day.

- THE PROJECT SHALL hold a dry run on real phones over the venue's kind
  of network, far enough before the course that its findings can still
  be acted on.
- WHEN the system has been idle long enough to be suspended, THE
  PROJECT SHALL have a written, timed pre-event checklist that brings
  it back and confirms it is serving, performed before anybody depends
  on it.
- WHEN several staff attempt to sign in within a short period, THE
  SYSTEM SHALL either deliver every sign-in link or tell the person it
  did not. Today the app reports a link as sent when the provider has
  silently refused it, which on the morning of the course is a live
  failure with no visible cause. THE PROJECT SHALL test this at the
  number of people who will actually sign in.
- THE PROJECT SHALL produce a run book covering the pre-event wake,
  the settings that must be set for an event of this size, the
  during-course monitoring step, and what to do when each foreseeable
  thing goes wrong.
- THE SYSTEM SHALL be left, at the end of the rehearsal, in the exact
  configuration it will run in on the day, with no step deferred to the
  morning that could have been done in advance.

### US-32: The outstanding functional verification is completed before any load testing

As the project owner, I want the features this event depends on to be
known to work at all before anyone measures how they work at scale.

- THE PROJECT SHALL complete the verification steps left open in
  Features 004 and 007 that have never been exercised against a
  signed-in organizer, before load testing begins. Load-testing
  behaviour that has never been confirmed to work produces numbers
  about nothing.
- WHEN uploads have been stopped and an unrelated setting is then
  saved, THE SYSTEM SHALL leave uploads stopped.
- WHEN an event has reached its photograph limit, THE SYSTEM SHALL
  refuse a guest's upload with an explanation and no retry affordance.
- WHEN uploads stop being possible while a slideshow is running, THE
  SYSTEM SHALL stop displaying the join invitation on that screen
  without anybody reloading it.
- THE PROJECT SHALL complete the organizer-facing verification left
  open in Feature 004 (T5.2) against real data, since every moderation
  measurement in US-29 runs through those screens.

## Out of scope (this feature)

- **Building the capability for several people to review one event's
  photographs.** It is its own feature, specced separately. This
  feature states the throughput it must deliver and the concurrency
  risk it introduces, and nothing more.
- **Building bulk retrieval.** US-30 establishes it as a prerequisite
  with a date; the design of it is not here.
- **Building whatever mitigations the measurements turn out to
  require.** Those are specced once there are numbers; designing them
  now would be assuming the answer this feature exists to find.
- Automated content classification, per-guest limits, and everything
  else Feature 007 ruled out. Nothing here reopens them.
- Any change to who may read a photograph's bytes
  (`CONSTITUTION.md` open decision 1). That exposure is live throughout
  this course and this feature does not close it.

## Residual risk, stated deliberately

**This feature makes the event's cost and capacity known. It does not
make the event safe.** Three exposures are live through February
regardless of how every measurement here comes out:

1. Every display copy ever uploaded remains permanently fetchable by
   anyone holding its URL, including after rejection
   (`CONSTITUTION.md` open decision 1). Adult leaders rather than
   minors lowers the stakes; it does not remove them.
2. A single person can still fill the event's allowance, and uploads
   remain anonymous (Feature 007, residual risk).
3. The retention window in US-30 is an operational intention, not an
   enforced behaviour. Nothing in the system deletes anything on a
   schedule, and nothing will by February.
