# ScoutEvent — Engineering Constitution

This project follows **spec-driven development (SDD)**. Code is a
consequence of an approved spec, never the other way around.

## Process

Every feature lives in `specs/<NNN>-<slug>/` and moves through three
documents, in order:

1. **`requirements.md`** — What the feature must do and why, from the
   user's point of view. Written as user stories with acceptance
   criteria in EARS syntax (`WHEN <trigger>, THE SYSTEM SHALL <response>`).
   No mention of frameworks, tables, or libraries.
2. **`design.md`** — How the requirements will be satisfied: architecture,
   data model, API/interface contracts, third-party services, and the
   tradeoffs behind each decision. Every design decision must trace back
   to at least one requirement.
3. **`tasks.md`** — An ordered, checkbox-able implementation plan. Each
   task is small, independently verifiable, and references the
   requirement(s)/design section it implements.

Rules:

- Do not write implementation code for a feature until its
  `requirements.md` and `design.md` exist and are internally consistent.
- If implementation reveals the spec was wrong or incomplete, stop and
  fix the spec first, then resume coding. The spec is the source of
  truth, not a historical artifact.
- Each task in `tasks.md` is checked off `[x]` only when it is actually
  done (code written, and where applicable tested/verified) — not when
  merely started.
- Cross-cutting/project-wide decisions (tech stack, hosting, cost
  constraints) live in `specs/001-photo-collection-slideshow/design.md`
  since this is currently the only feature; if a second feature is added
  later, promote shared decisions to a `specs/PROJECT.md`.

## Project-wide constraints

These constrain every feature's design and are not to be re-litigated
per-feature:

- **Zero recurring cost.** Every third-party service used must have a
  free tier sufficient for the expected usage (a scout troop / small
  organization running a handful of events), and the app must degrade
  gracefully (or clearly warn) rather than silently incur charges if a
  free-tier limit is approached.
- **No app-specific backend server to operate.** Prefer managed
  BaaS/serverless/static hosting so there is nothing for a volunteer
  maintainer to patch, scale, or pay for.
- **Guests never need an account.** Anyone collecting or viewing photos
  at an event must not be forced to sign up or install anything beyond a
  mobile browser.
