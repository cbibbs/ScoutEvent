# ScoutEvent — Engineering Constitution

This project follows **spec-driven development (SDD)**. Code is a
consequence of an approved spec, never the other way around.

> **Amended for production.** The original version of this document was
> written for a proof of concept, and several of its constraints were
> explicitly justified as "acceptable for a free, frictionless MVP".
> Real events with real participants change what those tradeoffs cost.
> The process rules below survived that review unchanged; the
> constraints were rewritten, and the decisions that aren't ours to make
> unilaterally are listed at the end as open.

## Process

Every feature lives in `specs/<NNN>-<slug>/` and moves through three
documents, in order:

1. **`requirements.md`** — What the feature must do and why, from the
   user's point of view. User stories with acceptance criteria in EARS
   syntax (`WHEN <trigger>, THE SYSTEM SHALL <response>`). No mention of
   frameworks, tables, or libraries.
2. **`design.md`** — How the requirements will be satisfied:
   architecture, data model, API/interface contracts, third-party
   services, and the tradeoffs behind each decision. Every design
   decision must trace back to at least one requirement.
3. **`tasks.md`** — An ordered, checkbox-able implementation plan. Each
   task is small, independently verifiable, and references the
   requirement(s)/design section it implements.

Rules:

- Do not write implementation code for a feature until its
  `requirements.md` and `design.md` exist and are internally consistent.
- If implementation reveals the spec was wrong or incomplete, stop and
  fix the spec first, then resume coding. The spec is the source of
  truth, not a historical artifact.
- **A feature that changes an earlier feature's behavior must amend that
  earlier spec.** This is the rule this project has broken most often:
  a requirements review found an original acceptance criterion still
  claiming that rejecting a photo deleted it, two features after that
  stopped being true. When you change behavior, search the other specs
  for what you just invalidated.
- Each task in `tasks.md` is checked off `[x]` only when it is actually
  done — code written, and where applicable verified. "It compiled" is
  not verification; say plainly what was and wasn't checked.
- Cross-cutting decisions live in `specs/PROJECT.md`. A single feature's
  decisions stay in its own `design.md`.
- Who does which phase — planning, implementation, review — is in
  `CLAUDE.md`.

## What this project will not trade away

### 1. Guests never need an account

Anyone contributing or viewing photos at an event must not have to sign
up or install anything beyond a mobile browser. This is the point of the
product and is not up for negotiation.

Its consequence has to be stated alongside it: because uploads are
anonymous, there is no accountability at the upload itself. **Moderation
carries the entire safety burden.** Any change that weakens moderation,
or that widens who can upload, is a safety change and should be designed
as one.

### 2. Photographs of identifiable young people are the most sensitive
thing this system holds

This is the constraint the proof-of-concept version of this document
didn't have, and most of the review's findings trace back to its
absence. Feature 001's security notes describe the exposure accurately
— unguessable URLs, no per-file access control — but judged it
acceptable by weighing convenience against a generic "don't use for
sensitive photos" caveat. That weighing was done about a demo.

Therefore: any change that widens who can reach these images, how long
they persist, or how easily they can be enumerated requires an explicit
decision recorded in that feature's `design.md`. It may not be inherited
silently from an earlier feature's defaults.

### 3. An event happens once

A failure between events is an inconvenience. A failure *during* one is
unrecoverable — the campfire, the ceremony, the moment is not coming
back, and the organizer is standing in a room full of people while it
happens.

So: anything on the live path — sign-in, guest upload, the screen —
needs either a fallback or a warning far enough ahead to act on. This is
why the Supabase idle-pause and the silent auth-email rate limit matter
out of proportion to their size, and why the archive copy in Feature 006
is explicitly forbidden from delaying the display copy.

### 4. No new recurring cost without a recorded decision

The original rule was "zero recurring cost". The honest version for
production:

- Free tiers remain the default, and every third-party service must have
  one sufficient for a unit running a handful of events.
- **Resources the maintainer already owns — notably domains — are
  available at no new cost** and should not be avoided out of
  misplaced purity.
- Anything that would create a *new* bill requires an explicit decision
  recorded here, weighed against what it buys. It is not automatically
  forbidden; it is automatically deliberate.

The original document also required that the app "degrade gracefully
(or clearly warn) rather than silently incur charges" as limits are
approached. **That clause is currently aspirational, not met**: nothing
in the app warns about storage, egress, or the email rate limit today.
Feature 006 is the first work to implement any of it. Until it ships,
treat the clause as a commitment being honored, not a description of
how things are.

### 5. Nothing to operate

Prefer managed services so there is nothing for a volunteer maintainer
to patch, scale, or pay for. Refined by experience: **serverless route
handlers inside the existing Next.js deployment are fine** — they are
nothing to run. A separate service with its own lifecycle is not. The
signing endpoint Feature 006 introduces sits on the right side of that
line, but it is the first thing to approach it, and the line should be
held.

## Open decisions

These came out of the production readiness review. Each is a judgment
call for the project owner, not something to settle by default. None
block a demo; several block real events with youth in frame.

| # | Decision | Why it's open |
|---|---|---|
| 1 | Do display copies stay public-read? | Feature 006 makes originals private via R2, but 1600px copies stay fetchable by URL forever, including after rejection. Fixing it means signing every slideshow frame and grid thumbnail — real cost on the hot path |
| 2 | Abuse protection on guest upload | No rate limit, no cap, no accountability. Feature 005 put the join QR permanently on a screen in a public room, so everyone present can post to it; with moderation off it reaches the screen unreviewed. Those two features interact in a way neither spec considered |
| 3 | Multiple organizers per event | Out of scope since Feature 001. A sole owner is an availability risk mid-event, and sole adult control over youth photos sits awkwardly against two-deep leadership norms |
| 4 | Retention, consent, deletion | Photos of minors kept indefinitely, no consent capture, no deletion path beyond clicking each photo |
| 5 | Supabase idle-pause | A paused project is a dead event link. A keep-alive ping is free; a paid tier is not |
| 6 | Custom SMTP | The *branding* case is largely closed — the template and sign-in copy now explain the email. What remains is the silent rate limit, which is an availability question (see principle 3), not a presentation one. Deprioritized accordingly |
