# Feature 009: Multiple Approvers Per Event

Builds on Features 001-008. Resolves the "multiple organizers per
event" open decision (`CONSTITUTION.md`, open decisions table row 3 —
carried in review notes as open item #40), which has been out of scope
since Feature 001 and is now on the critical path for the February 2027
Wood Badge course.

Feature 008 sized the course at **1500+ photographs and 2-4 people
reviewing concurrently from their own devices**, and showed that with
one reviewer the volume is not tractable and with 2-4 it is
(design §5a). It also recorded, as its out-of-scope note, that *there
is no way today for a second person to review an event's photographs at
all* — this feature is that capability, and it inherits Feature 008's
concurrency test (§5c, T4.3) as a deliverable to run.

Every decision below came from an interview with the organizer of that
course. The reasoning and the rejected alternatives are recorded with
each one, at their request, in `design.md`; the criteria here state
only what the system must do.

## Problem

Moderation is the only thing standing between an anonymous upload and a
screen in a room full of people (`CONSTITUTION.md` principle 1), and
exactly one person can perform it: the account that created the event.
That is three problems at once.

1. **Throughput.** One person reviewing 1500 photographs over a
   three-day course is 3 h 20 m a day of deciding, on top of running
   the course (Feature 008 §5a). It will not happen, and when review
   falls behind, photographs do not reach the screen.
2. **Availability.** A sole owner is a single point of failure for the
   whole safety mechanism. If they are teaching a session, asleep, or
   out of signal, nothing is being reviewed.
3. **Norms.** Sole adult control over photographs taken at a youth
   organization's event sits awkwardly against two-deep leadership.
   This course is adult staff, which lowers the stakes without
   changing the shape.

Adding people to the review task also *creates* a problem that did not
exist with one reviewer: two people deciding the same photograph. Today
a decision is written with no check on what the photograph's current
state is, so the second write silently replaces the first, and the
queue each reviewer pages through silently omits photographs as the
other decides them. Feature 008 §5c identified both and could not test
either. Both are in scope here.

## Terms

- **Owner** — the person whose account created the event. Unchanged
  from every earlier feature; where older specs say "the organizer"
  and mean the account that owns the event, they mean the owner.
- **Co-approver** — a person admitted to help review one event's
  photographs, holding no account.
- **Reviewer** — either of the above, when acting on photographs.
- **Approver link** — the shareable link that admits co-approvers to
  one event.
- **Place** — one admission on that link. The link admits a bounded
  number of them.

## User Stories

### US-33: A second person can start reviewing from a link alone

As an organizer briefing staff at a meeting, I want to hand out one
link that lets each of them start reviewing my event's photographs
immediately, without an account, an email, or a sign-in step.

- WHEN an owner asks for an approver link for an event, THE SYSTEM
  SHALL produce one link that can be given to several people, and SHALL
  make it readable as text and scannable, as it already does for the
  guest and slideshow links.
- WHEN a person opens an approver link that is valid and has a place
  free, THE SYSTEM SHALL let them take a place and begin reviewing that
  event's photographs in the same visit, with no account, no email
  message, and no sign-in step of any kind.
- THE SYSTEM SHALL require one deliberate action on the opened link
  before a place is taken, so that merely previewing or prefetching the
  link consumes nothing.
- WHEN a person who already holds a place on an event opens that
  event's current approver link again, THE SYSTEM SHALL return them to
  reviewing without consuming a second place.
- WHEN a person who is signed in to an account of their own opens an
  approver link, THE SYSTEM SHALL NOT attach a place to that account
  and SHALL NOT sign them out. It SHALL explain why, name what to do
  instead, and — where the account owns the event in question — offer
  the way to manage it. Places are for people without accounts; an
  account holder silently losing sight of their own events is the
  failure this criterion exists to prevent.
- WHEN a person opens an approver link that is not recognized, THE
  SYSTEM SHALL tell them the link is no longer valid and to ask the
  organizer for a current one, and SHALL NOT distinguish a withdrawn
  link from one that never existed.
- WHEN a person opens a valid approver link whose places are all taken,
  THE SYSTEM SHALL say so plainly and name asking the organizer as the
  remedy, rather than reporting a failure.
- WHEN taking a place cannot be completed for any other reason, THE
  SYSTEM SHALL say that it did not work and SHALL NOT present the
  person as admitted. A silent failure here is the failure mode this
  feature exists to avoid (see US-34's note on email).
- WHEN a person has taken a place, THE SYSTEM SHALL NOT leave the
  approver link visible in their browser's address bar or history after
  it has been used.

### US-34: Co-approvers can act on photographs, and on nothing else

As an organizer, I want the people I admit to be able to do the whole
of the photograph job and none of the event job, so that handing out a
link cannot cost me the event.

- THE SYSTEM SHALL let a co-approver, on an event they hold a place on:
  approve a pending photograph; reject one; restore a rejected one; add
  an approved photograph to the slideshow; and remove one from the
  slideshow.
- THE SYSTEM SHALL NOT let a co-approver delete a photograph or its
  stored image. Deletion is the only irreversible action in the system
  and remains the owner's alone — see `design.md` §0 for the reasoning
  and what it costs.
- THE SYSTEM SHALL NOT let a co-approver change any event setting,
  including the event's name, dates, upload schedule, photograph limit,
  slideshow interval, or whether moderation is on.
- THE SYSTEM SHALL NOT let a co-approver stop or resume uploads
  (Feature 007 US-23).
- THE SYSTEM SHALL NOT let a co-approver delete the event, produce or
  withdraw an approver link, or change how many places it admits.
- THE SYSTEM SHALL refuse each of the above at the point the change is
  attempted, not only by omitting the control. Hiding a button is a
  courtesy; the refusal is the requirement.
- THE SYSTEM SHALL show a co-approver the event's current upload state
  and how full it is, as information they cannot change, so they can
  tell the owner when something needs the owner.

  *Two accepted consequences, recorded deliberately:*
  (1) if the owner is off-site and uploads must be stopped, nobody else
  can stop them — the emergency brake stays with the owner;
  (2) rejected and unwanted photographs accumulate until the owner
  clears them, because rejecting a photograph hides it but does not
  free the space it occupies. Co-approvers cannot help with that, and
  it is the owner's job before and after the event. See `design.md`
  §0, and Feature 008 §3 for what it means for a 1500-photograph
  course.

### US-35: A co-approver sees the event they were given, and nothing else

As an owner, I want admitting someone to one event to tell them nothing
about my other events.

- WHEN a co-approver opens the organizer area, THE SYSTEM SHALL list
  **only** the events they hold a place on, and SHALL NOT disclose the
  existence, name, or count of any other event belonging to the owner
  or to anyone else.
- THE SYSTEM SHALL NOT place a reviewing session and an account's own
  events in the same list, and SHALL arrange matters so that a session
  cannot hold both at once — see `design.md` §5, which shows the
  combination is unreachable rather than merely avoided.
- WHEN a co-approver opens an event they do not hold a place on, THE
  SYSTEM SHALL respond exactly as it does for an event that does not
  exist.

### US-36: Two reviewers never silently overwrite each other

As a reviewer, I want to know that a decision I make is the decision
that stands, and to be told when someone else got to a photograph
first.

- WHEN a reviewer decides a photograph that another reviewer has
  already decided since it was shown to them, THE SYSTEM SHALL refuse
  the second decision, leave the first in force, and tell the second
  reviewer that the photograph was already decided by someone else
  before moving them on.
- THE SYSTEM SHALL carry out that check as part of making the change,
  so that two decisions arriving at the same instant cannot both
  succeed.
- WHEN a reviewer applies one decision to several selected photographs
  and some of them have already been decided by someone else, THE
  SYSTEM SHALL apply the decision to the rest, and SHALL report how
  many were applied and how many were already decided.
- WHEN a photograph loaded on a reviewer's screen is decided by someone
  else, THE SYSTEM SHALL reflect that on their screen without a reload,
  to the same standard Feature 003 US-10 already requires.

### US-37: The queue is honest about shared work

As one of several reviewers working through a backlog, I want the queue
to show me work nobody has done, and a progress figure that means
something when four of us are working.

- THE SYSTEM SHALL NOT omit an undecided photograph from a reviewer's
  queue because other photographs were decided while that reviewer was
  working. A queue that silently skips photographs is worse than one
  that occasionally repeats them.
- WHEN a reviewer begins a focused review session, THE SYSTEM SHALL fix
  the session to the photographs that were awaiting review at that
  moment, and SHALL NOT add photographs uploaded after it to that
  session. **This restates Feature 004 US-14 and keeps its intent.**
- THE SYSTEM SHALL show the reviewer how many of that fixed set are
  still awaiting review, SHALL keep that figure current as other
  reviewers decide photographs, and SHALL NOT present it as a fixed
  total of work for one person. **This amends Feature 004 US-14**,
  whose "of TOTAL" was written for a single reviewer and becomes a
  false promise with four.
- THE SYSTEM SHALL separately show the reviewer what they themselves
  have decided in this session, labelled as theirs, so the two figures
  cannot be mistaken for each other.
- WHEN nothing in the session's set is still awaiting review — whether
  this reviewer decided it or another did — THE SYSTEM SHALL show the
  completion state, SHALL state the reviewer's own tally, and SHALL say
  whether photographs have arrived since the session began.

### US-38: The owner bounds who gets in, and can shut it

As an owner, I want the number of people a link can admit to be my
choice, and I want one action that ends everyone's access when a link
goes somewhere it shouldn't.

- THE SYSTEM SHALL let the owner set how many places an approver link
  admits, SHALL apply a sensible default, and SHALL NOT allow a value
  that admits nobody or an unbounded number.
- THE SYSTEM SHALL never admit more people on a link than there are
  places, including when several people open the link at the same
  moment.
- THE SYSTEM SHALL show the owner how many places are taken and how
  many remain.
- WHEN the owner withdraws an approver link, THE SYSTEM SHALL in one
  action invalidate that link and end the access of everyone admitted
  by it, and SHALL make clear before the action that it affects
  everybody, not one person.
- WHEN the owner raises the number of places, THE SYSTEM SHALL admit
  further people on the existing link without disturbing those already
  admitted.
- THE SYSTEM SHALL let the owner retrieve the current link again later
  without withdrawing it, since re-issuing it would eject the people
  already working.

### US-39: No record of who decided what

As an organizer responsible for volunteers, I do not want the system to
collect or display a record of which person approved or rejected which
photograph.

- THE SYSTEM SHALL NOT store, alongside a photograph, any indication of
  which reviewer decided it.
- THE SYSTEM SHALL NOT display such an indication anywhere.
- THE SYSTEM SHALL NOT present a co-approver's admission as an identity
  — no name, no email address, and nothing asked of them at the point
  they are admitted.

  *Stated plainly rather than buried:* admitting someone necessarily
  creates an opaque marker for them, because the system has to know
  that this visitor holds a place. That marker is deliberately never
  written against a photograph and never surfaced. The consequence is
  that **a photograph that should not have reached the screen cannot be
  traced to who let it through.** That is an accepted cost here and a
  decision that should be revisited before this app is used at events
  where youth are present — see "Accepted risks" below and
  `design.md` §10.

## Accepted risks, stated deliberately

**A forwarded link admits a stranger.** The link alone is the
credential; anyone holding it can take a place until the places run
out. The organizer's reasoning: a Wood Badge course is adult staff in a
closed cohort, moderation exists to keep bad photographs off a screen
rather than to defeat a determined insider, and the two alternatives
cost more than they buy — the owner approving each admission fails when
the owner is unreachable at a campsite, which is exactly when help is
needed, and a short-lived link fails the staff member who joins on day
two.

**What bounds it, and the part that changed:** the number of places,
the owner's ability to withdraw the link in one action, and — now that
deletion is owner-only — the fact that **a leaked link grants nothing
irreversible**. The worst a stranger holding one can do is approve
something that should not have been approved, or reject things that
should not have been rejected; both are visible on the screens the
owner already watches, and both are undoable. Nothing they can do
destroys a photograph. That is a materially different risk from the
one first weighed, and it is the strongest single argument for the
link-only design surviving contact with a real course.

**Boundary, not a closed decision.** This is accepted for adult-staff
events. It should be revisited before the app is used for a troop event
with youth present, where "who put that on the screen" is a question a
youth-serving organization may be required to answer and where an
unidentified stranger holding review powers is a different kind of
problem. It is recorded in `CONSTITUTION.md`'s open decisions as a
bounded, revisit-on-condition item rather than as settled.

**Losing a place costs a place.** Admission is held by the browser that
took it. A co-approver who clears their browser data, switches device,
uses a private window, or **signs in to an account of their own in that
browser** is a new person as far as the system is concerned and must
take another place; the place they left behind stays taken until the
link is withdrawn. The remedy is the owner raising
the number of places, which US-38 requires to be possible at any time.

**Nothing here changes who can read a photograph's bytes.** Display
copies remain publicly fetchable by URL (`CONSTITUTION.md` open
decision 1) throughout the February course. This feature neither
worsens nor closes that.

## Out of scope (this feature)

- Per-approver revocation, and anything that identifies one admitted
  person to withdraw them individually. Withdrawal is all-or-nothing by
  design (US-38); at 2-4 people, re-admitting everybody costs a minute.
- Inviting co-approvers by email. See `design.md` §1: not merely
  unreliable — **on the service this project uses, a message to anyone
  who is not already part of the project's team is refused outright,
  and the app reports success anyway.** Inviting staff by email could
  not have worked at all, so this is the option being ruled out for
  being impossible, not for being awkward.
- Any further role between co-approver and owner. One extra power set,
  not a permissions system.
- Transferring ownership of an event.
- Reopening Feature 007 US-21 (the join QR gated on moderation being
  enabled). More reviewers makes that coupling more survivable, not
  resolved — Feature 008 US-29 says so explicitly and this feature does
  not touch it.
- Thumbnails, select-all, and the rest of Feature 008 §5b's grid work.
  That is the other half of moderation throughput and is its own
  change; nothing here depends on it.
