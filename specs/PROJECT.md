# ScoutEvent — Project-Wide Technical Decisions

Decisions that span features live here. A single feature's decisions
stay in that feature's `design.md`.

`CONSTITUTION.md` covers *how* we work and what the project won't trade
away. This file covers *what we chose* and what those choices constrain.
The README covers how to set the thing up and run it — this file is for
whoever is designing the next feature and needs to know what they're
building on.

Promoted here from `specs/001-photo-collection-slideshow/design.md` §1
and §3, which the constitution said to do "if a second feature is added
later" — by the time it happened there were six. That spec stays as the
historical record of Feature 001; where the two disagree, this file
wins.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| App framework | Next.js 16 (App Router, TypeScript) | See "Framework specifics" below — 16 differs from older App Router material in ways that have already caused bugs here |
| Hosting | Vercel (Hobby) | Free. Hobby forbids commercial use; fine for a unit running its own events, not fine if this is ever sold or run for others |
| Auth | Supabase Auth: email magic link for owners, **anonymous sign-in for co-approvers** | Owners sign in by email. A co-approver claiming an approver link gets a silent anonymous session, so RLS still keys on a real `auth.uid()` (Feature 009 design §1d). Guests never authenticate. **Anonymous sessions carry the `authenticated` role**, so any policy written `to authenticated` applies to them — the `events` write policy therefore carries an `is_anonymous` guard (Feature 009 §1e), without which anyone holding the public anon key could create events |
| Database | Supabase Postgres | RLS is the access control layer; the browser talks to it directly |
| Display photos | Supabase Storage | 1600px/2560px copies — every screen reads these. **Public-read today; decided to become a private bucket read through signed URLs** (Feature 006 design §6, `CONSTITUTION.md` decision 1). Not yet built |
| Original photos | Cloudflare R2, private bucket | Specced in Feature 006, not yet built, and gated on an unanswered billing question (T0.1). Chosen for free egress, not capacity, and only for originals — see that design's §1a for why display copies did not follow |
| Realtime | Supabase Realtime (postgres_changes) | Always paired with a polling fallback; see "Realtime" below |
| QR codes | `qrcode.react` | Renders locally, no API call, no rate limit |
| Image compression | `browser-image-compression` | Runs in the guest's browser before upload |

One vendor for auth/DB/storage/realtime was a deliberate choice: fewer
moving parts, fewer free tiers to watch, and RLS meaning no backend to
write. Feature 006 spends that deliberately for originals only — if R2
is misconfigured or abandoned, every screen still works, because only
the download path reads from it.

**The rule that keeps it that way** (Feature 006 design §1a, which
argues it): *image bytes live in the same store as the rule that decides
who may read them, unless egress makes that impossible.* Display copies
are read under a live, per-photo, status-dependent RLS predicate, so
they stay where that predicate is; an original's rule is static
("the owning organizer, on an explicit download"), cheap to restate in
one route handler, and its egress — ~1.2GB for one bulk download — is
the single case no caching behaviour can rescue — display copies, by
contrast, are already revalidated into near-zero repeat transfer
(Feature 006 §1b). Apply the same test before moving any other bytes,
and measure the traffic before citing it; the answer is not "R2 is free"
by default.

## Where the data lives

- **Postgres**: `events` and `photos` rows. Photo rows carry storage
  paths, never image bytes.
- **Postgres**, co-approvers (Feature 009): `event_approver_links` —
  one row per event holding the approver link's token and how many
  places it admits, readable by the owning organizer and nobody else;
  and `event_approvers` — one row per admitted person, holding an
  opaque user id and a claim time and **deliberately nothing else**.
  Nothing anywhere records which reviewer decided which photograph
  (Feature 009 §10). Two consequences worth keeping in mind: the
  approver token must never move onto `events`, whose SELECT policy is
  `using (true)` and therefore world-readable; and deleting a link row
  cascades every admission it granted, which is how revocation works.
- **Supabase Storage**, bucket `photos`: display copies at
  `{event_id}/{uuid}.jpg`. The bucket is **public-read today**, which
  means every display copy ever uploaded is fetchable by anyone holding
  its URL, permanently, including after the photo is rejected or pulled
  from the slideshow. That is no longer an accepted tradeoff: it has
  been decided against (Feature 006 design §6 — private bucket, reads
  signed under the same RLS predicate that already governs the `photos`
  rows) and is waiting on the feature that implements it. Treat it as a
  known live exposure, not a design choice.
- **R2**, private (Feature 006): originals at
  `originals/{event_id}/{uuid}.jpg`, reachable only via short-lived
  presigned URLs.

## Access control

RLS is the enforcement point, not client code. Two rules have held
across every feature and should keep holding:

1. **Anonymous writes go through `security definer` functions, never
   raw inserts.** `submit_photo()` owns "is this upload allowed" and
   "what status does it start in", so that logic exists once, server
   side, and cannot be argued with by a client. Feature 006's signing
   endpoint follows the same shape for the same reason.
2. **A photograph may be read and changed by the people who moderate
   its event.** Until Feature 009 that meant the owning organizer
   alone, and every policy spelled out `organizer_id = auth.uid()` in
   nine places. It is now one predicate — `can_moderate_event(event_id)`
   — meaning *the owner, or someone holding a place on that event's
   approver link*. It gates reading and **moderating** a photograph:
   the `photos` SELECT and UPDATE policies call it rather than
   restating the predicate. Organizer-facing queries still rely on the
   policy rather than filtering in the client. Two things did **not**
   move, and both are deliberate (Feature 009 §0a, §4):
   **deletion stays owner-only** — the `photos` DELETE and
   `storage.objects` DELETE policies are untouched and know nothing
   about membership, because deletion is the only irreversible action
   in the app — and `events` stays owner-only, which keeps settings,
   the photo limit, the moderation toggle and Stop uploads out of a
   co-approver's hands by construction rather than by hiding buttons.
3. **Image bytes should be governed by the same predicate as the rows
   that point at them.** Decided, not yet true: the `photos` bucket is
   public-read, so today rule 2 governs the row and nothing governs the
   file — rejecting a photo hides the row and leaves the JPEG fetchable.
   Feature 006 design §6 settles the direction (private bucket, signing
   gated by an RLS policy on `storage.objects` mirroring the one on
   `photos`). This is also the reason display copies did not follow
   originals to R2: a store that cannot see `status` cannot enforce the
   predicate, and re-implementing it elsewhere is the mistake Feature
   007's `photo_limit` pre-check already made once.

## Free-tier limits

Supabase figures **re-checked against the published pricing on
2026-10-04** (Feature 008 design §0), which closes half of Feature 006
T0.4. The egress figure these specs had carried since Feature 001 was
wrong by 2.5×, and a second egress meter nobody had recorded exists.
Where an older spec reasons against "2GB/mo", the premise is wrong;
check whether its conclusion depended on it before reusing it (Feature
006 §1a's did not — see Feature 008 §13).

| Limit | Allowance | What happens at the edge |
|---|---|---|
| Supabase database | 500MB | Metadata only; storage binds long before this. 1,500 photo rows is under 1MB — not a constraint at any scale this project has |
| Supabase storage | 1GB | ~1,500-1,800 display copies at the measured 0.3-0.46MB, **shared across every event ever created**. The real capacity constraint. Rejection does not free it, and deleting an event row does not either — rows cascade, storage objects do not (Feature 008 §3) |
| Supabase egress | **5GB/mo** (verified 2026-10-04) | Display objects are served `cache-control: no-cache` with an `ETag` (**measured**, Feature 006 §1b), so a warm client revalidates and gets zero-byte `304`s. Per-client cost is therefore **(distinct photos displayed) × (display-copy size)**, not watch-time × rate — an all-day projector costs about one pass. What that model does *not* make cheap is many *different* clients: 65 viewers × 100-300 distinct photos is 2.6-7.8GB, which is why Feature 008 exists. Three further contributors no spec had costed: the slideshow's unbounded 30s poll, moderation loading full-size copies, and bulk retrieval (Feature 008 §2b). The `no-cache` round trip per slide remains a latency problem (Feature 006 T2.3/T2.4) |
| Supabase cached egress | **5GB/mo, metered separately** (verified 2026-10-04) | Newly recorded. **Which of the two meters a CDN-served display copy lands on is unknown and is the single most decision-relevant unmeasured fact in the project** — a ~60× swing on the largest egress term, because every slideshow client starts at the same photo and requests the same objects. Feature 008 T2.2 measures it |
| Supabase realtime | 200 concurrent peak connections; 2M messages/mo | Messages have ~6× headroom at this project's scale (Feature 008 §4). Concurrency is unclear: each slideshow client opens **two** channels over one socket, so 80 viewers is either 85/200 or 170/200 depending on what the meter counts (Feature 008 T0.3). On refusal, clients fall back to the 30s poll — which is the most expensive query in the app, so the failure mode is an egress rise, not an outage |
| **Exceeding any of the above** | **unknown** | Not documented on the pricing page. Bill, throttle, refuse, or stop the project — the difference between an irritation and a ruined event. Feature 008 T0.1 settles it from documentation; T0.2 only on a disposable project, never on the live one |
| Supabase auth email | a few per hour | Fails *silently*: the app says "link sent" and nothing arrives. **A paid plan does not fix this** (Feature 008 §12b). Feature 008 sized this at "2-4 reviewers plus the organizer signing in on event morning"; **Feature 009 shrinks it to the owner alone**, since co-approvers are admitted by a link and never receive an email. That is a reduction in exposure, not a fix |
| Supabase project pause | after 7 idle days | Wake it before an event |
| Supabase Pro, for comparison | $25/mo: 250GB egress, 100GB storage, no pause | Not taken. **Pending decision for the February 2027 course** — see the open-decisions table in `CONSTITUTION.md` (row 7) and Feature 008 §11, which sets the criteria, the thresholds and the 2026-11-20 deadline. Money resolves egress, storage and the idle pause; it does **not** resolve moderation throughput, slideshow recency at 1500 photos, the absence of bulk download, or the auth-email rate limit |
| R2 storage | 10GB | ~2,500 originals. **Unverified and gating**: whether a payment method is required inside the free allowance, and whether the ceiling refuses writes or bills silently (Feature 006 T0.1). If it bills silently, Archive mode is cut rather than moved to Supabase |
| R2 egress | unmetered | The reason it was chosen |
| Vercel bandwidth | 100GB/mo (Hobby) | Far above need |

## Migrations and deploy order

Migrations are applied by hand in the Supabase SQL Editor, and the code
is deployed separately to Vercel. There is therefore always a window
where one has landed and the other hasn't, and it is usually the code
that goes first because deploying is the easier action.

**Code must tolerate its own migration not being applied yet, and must
never remove capability that existed before it.** Degrading a new
feature to "not working yet" is acceptable. Taking away something that
worked yesterday is not — and it is easy to do by accident, because a
missing column reads as `undefined` and flows into validation and
boolean logic as though it were a value.

This is not hypothetical. Feature 007 added a guard rejecting a
non-numeric `photo_limit`; with the column absent, `undefined` failed
that guard and the event settings form refused *every* save, including
the upload-window edit that was the only way to stop uploads before that
feature existed. Shipping it ahead of its migration would have left an
organizer with no way to stop an upload mid-event — strictly worse than
not deploying at all.

So, concretely:

- Validate a field only when it has a value to validate. Absent is not
  invalid.
- A boolean gate over a possibly-absent column has to state which way it
  fails, and should fail toward the pre-existing behavior. `count <
  undefined` is `false`, which silently disables whatever it guards.
- Prefer migrating first. But do not rely on remembering to.

## Framework specifics (Next.js 16)

These have each already caused a real bug in this codebase:

- Route middleware is `src/proxy.ts` exporting `proxy(request)`, not
  `middleware.ts`.
- A route's `params` is a `Promise` and must be awaited.
- React Compiler lint rules are enforced: no impure calls (`Date.now()`)
  in a render body, no ref mutation during render, no synchronous
  `setState` in an effect body. Use derived state, a ref, or a real
  subscription callback.
- A handler a `useEffect` depends on needs a stable identity, or the
  effect tears down every render.
- Don't get the origin from `window.location` in a client component to
  render something server-side too — it hydrates differently than it
  renders and React throws out the tree. Resolve it on the server from
  request headers and pass it down.

Read `node_modules/next/dist/docs/` before writing code against any of
this, per the repo's `AGENTS.md`.

## Realtime

Every realtime subscription is paired with a polling fallback, because a
screen or dashboard may be open for hours and a dropped socket must
self-heal. Two rules learned the hard way:

- **Counts come from the server, never from arithmetic on payloads.** A
  change arrives twice — once as the local optimistic update, once as
  the realtime echo — so anything that increments will double-count.
- **Never silently insert a new row into an already-loaded, paginated
  page**; it misrepresents the pagination bounds. Update what's loaded,
  refresh the count, let the user page to the rest.
