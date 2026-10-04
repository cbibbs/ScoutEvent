# Design: Event Readiness — the February Wood Badge Course

Satisfies `requirements.md` US-24 … US-32. Every section names the
requirement it serves.

Throughout, **E** is the first day of the course, anchored for planning
at **2027-02-05** (requirements.md, "A date to confirm"). All dates are
derived from E and move with it.

## 0. Verified platform figures, replacing the ones carried in the specs

Checked against the provider's published pricing on **2026-10-04**.
These supersede the figures `specs/PROJECT.md` has carried since
Feature 001, and partially close Feature 006 T0.4.

| Allowance (free plan) | Figure | Previously recorded here |
|---|---|---|
| File storage | 1 GB | 1 GB (unchanged) |
| Egress | 5 GB / month | **2 GB/mo — wrong, carried since Feature 001** |
| Cached egress | 5 GB / month, metered separately | not recorded at all |
| Database | 500 MB | 500 MB (unchanged) |
| Realtime concurrent peak connections | 200 | not recorded |
| Realtime messages | 2 M / month | not recorded |
| Idle pause | after 1 week of inactivity | after 7 idle days (unchanged) |

Paid tier for comparison: **$25/month**, 250 GB egress, 100 GB storage,
no idle pause.

**What is still not known, and it is the important one:** what the
platform does when free egress is exceeded — throttle, refuse, stop the
project, or bill. It is not on the pricing page. The difference between
a bill and a stopped project is the difference between an irritation
and a ruined course (US-25), so this is the first thing to settle and
it gates the thresholds in §11.

Two further figures are *not* verified and are deliberately not used as
load-bearing in this design: the paid tier's realtime caps, and whether
the free plan has any database backup at all. Both are confirmed at the
gate (tasks T0.5), not assumed here.

## 1. What is actually being decided (US-24)

One question — free plan or paid plan for January and February — and it
decomposes into five independent ones, each of which can force the
answer on its own:

1. Does the event's data transfer fit in 5 GB? (§2)
2. Does 1500+ photos fit in 1 GB *at peak*? (§3)
3. Do 50-80 concurrent viewers fit under the live-update ceiling, and
   what do they see if they don't? (§4)
4. Can 2-4 people review 1500 photographs during the course? (§5)
5. Can the photographs be retrieved afterwards without the retrieval
   itself blowing the transfer allowance? (§8)

Only (1), (3) and (5) are affected by money. **(2) is affected by money
and by a retention step, (4) is not affected by money at all** — that
is worth stating early, because "upgrade and stop worrying" is the
tempting conclusion and it would leave the most likely failure mode
untouched.

## 2. The transfer model (US-26)

### 2a. Per-client transfer is distinct photographs, not watch time

Display objects are served `cache-control: no-cache` **with an
`ETag`** — measured, not assumed, in Feature 006 design §1b. `no-cache`
means "revalidate before reuse", not "do not store", so a client that
has already seen a photograph re-requests it and is answered **304 with
a zero-byte body**. Therefore:

> **per-client image transfer ≈ (distinct photographs that client
> displays) × (average display-copy size)**

Not watch-time × bitrate, and not the whole library per viewer. A
viewer who watches the loop twice costs the same as one who watches it
once. A projector running all day costs roughly one pass and then
almost nothing.

This is the third time this project has written down an egress model.
The first two were both wrong — once by a factor of fifty in one
direction (Feature 006 §1a's original "3.4 GB projector day"), once by
assuming the stored `cache-control` was the served one. The reusable
lesson from §1b is that **reading the upload call tells you what was
requested, not what a client receives.** Everything in this section is
therefore written to be *measured* (§9), and the arithmetic below is
sizing, not a finding.

### 2b. The five contributors

Measured input: display copies in the live bucket are **0.3-0.46 MB**
(Feature 006 §1b recorded one at 463,360 bytes); the client compresses
to a 0.6 MB / 1600px target (`UploadForm`). **0.4 MB is used below as a
placeholder until T2.1 measures it over a realistic sample.** The
slideshow advance interval defaults to **5 s**, so a full pass of 1500
photographs takes **2 h 05 m**.

| # | Contributor | Arithmetic | Range |
|---|---|---|---|
| 1 | **Viewer phones** | 65 viewers × 100-300 distinct photos × 0.4 MB | **2.6 - 7.8 GB** |
| 2 | **The projector** | one pass of the library: 1500 × 0.4 MB, then 304s for the rest of the course | **~0.6 GB** |
| 3 | **Background queries** | the slideshow re-reads *every* approved row every 30 s (§2b-i) | **0.24 - 1.5 GB** |
| 4 | **Moderation** | 1500 full-size display copies loaded to be looked at, no thumbnails exist (§5) | **0.6 - 1.0 GB** |
| 5 | **Getting the photos out** | 1500 display copies in one retrieval (§8) | **~0.6 GB** |

**(1) is the dominant term and the one §6 is about.** (2) is small and
fixed. (3), (4) and (5) are each individually larger than anyone has
previously supposed this app's whole egress to be, and none of them has
ever appeared in a spec.

#### 2b-i. The background query, which no spec has costed

`src/components/Slideshow.tsx:196-234` polls every 30 s with
`.select("*")` over **all** approved, in-slideshow rows for the event —
no `range()`, no bound. `src/app/e/[slug]/slideshow/page.tsx:23-33`
does the same on every page load. Feature 004 paginated the organizer's
three grids (T1.1-T1.3) and left the projector's own query unbounded;
that was invisible at a few dozen photographs and is not at 1500.

A photo row serializes to roughly 290 bytes of JSON, so 1500 rows is
~435 KB uncompressed. Whether the wire carries 435 KB or ~70 KB depends
entirely on whether the response is content-encoded, which **nobody has
checked** — a 6× swing on a term that could be anywhere from 0.24 GB
to 1.5 GB over the course. At 120 polls per client-hour, one projector
left running for 24 hours of course time is 100 MB to 630 MB **on its
own**, before a single photograph is displayed.

Note the shape of this: the poll is described in Feature 004 design §3
and Feature 006 §1b as a *fallback* for a dropped live-update
subscription. It is not conditional on anything — it runs every 30 s
whether or not live updates are healthy. So the mitigation in §4 (what
happens when subscriptions are refused) *increases* reliance on the
most expensive query in the app.

This is the cheapest thing on the list to fix and the measurement
should be taken before deciding whether to (T2.3).

### 2c. The pivotal unknown: which meter moves

The free plan meters **egress** and **cached egress** separately, at
5 GB each. Display copies are public objects served through a CDN. So
for contributor (1), the dominant term, there are two possible worlds:

- **Worst case.** Every viewer's fetch is billed as origin egress.
  65 viewers × 150 distinct × 0.4 MB = **3.9 GB against 5 GB**, and
  contributors (2)-(5) put the total over.
- **Best case.** Every slideshow client starts at `tick = 0` and plays
  the same oldest-first order (`Slideshow.tsx:261`), so **all 65
  viewers request the same first ~150 objects**. If the edge serves
  those from cache, origin egress for contributor (1) collapses to
  roughly *one* viewer's worth — ~60 MB — and the other ~3.8 GB lands
  on the separately-allowanced cached-egress meter.

**That is a 60× swing on the single largest term, and it decides the
whole question.** The observed `cf-cache-status: REVALIDATED` on a
public fetch (Feature 006 §1b) says the edge is revalidating with
origin, but says nothing about which meter the body is billed to, or
whether a 304 is billed as a request at all.

So the highest-value measurement in this entire plan is not "how much
does a viewer cost" — it is **"when N clients fetch the same objects,
which meter moves?"** (T2.2). It is also one of the cheapest: fetch a
known byte-count of known objects from a known number of distinct
clients, wait for the usage accounting to settle, read both meters.
Everything else in §2 is sizing around that answer.

### 2d. The first cut, and what it already tells us

Only contributor (1) is CDN-cacheable — contributor (3) is an API
response, and (2), (4) and (5) are each a single client fetching mostly
distinct objects, so they land on the origin meter under either reading
of §2c. Summing §2b at both ends:

| | Egress (5 GB) | Cached egress (5 GB) |
|---|---|---|
| **§2c worst case** — all image bytes billed as origin | **5.2 - 11.6 GB** | ~0 |
| **§2c best case** — viewer image bytes served from edge | **2.1 - 4.3 GB** | **2.5 - 7.7 GB** |

Three honest conclusions follow, and only three:

1. **Under the worst-case reading, the free allowance is insufficient
   at both ends of the range.**
2. **Under the best-case reading it is still not comfortable, and the
   risk simply moves to the other meter.** The favourable answer to
   §2c does not produce a free lunch; it produces 2.1-4.3 GB against
   5 GB on one meter and up to 7.7 GB against 5 GB on another. This is
   worth stating plainly because "the CDN will absorb it" is the
   conclusion everyone will want to reach from §2c and it does not
   survive the arithmetic.
3. **The decision is nonetheless dominated by one unmeasured fact and
   four unmeasured multipliers**, all measurable in about three weeks
   of elapsed time (§9a's one-scenario-per-day constraint, not effort).
   This is exactly the position in which measuring beats arguing.

What this specifically does *not* support is a verdict in either
direction today. What it does support is that **the free path cannot be
assumed**, and that the mitigations in §14 are more likely to be needed
than not — which is why the gate date in §11c is set by their build
time rather than by the measurement's.

## 3. Storage, settled by arithmetic rather than by a test (US-26)

The retention input changes the question. Previously the bucket
accumulated every event forever with no retention policy
(`CONSTITUTION.md` open decision 4), so the binding figure was lifetime
accumulation. With a ~2-week post-event retention window (US-30) the
binding figure is **peak concurrent storage**:

| | Objects | At 0.40 MB | At 0.46 MB |
|---|---|---|---|
| 1500 approved | 1500 | 600 MB | 690 MB |
| + 20% rejected (rejection does **not** delete the file) | 1800 | 720 MB | 828 MB |
| + everything else currently in the bucket | +15 objects | negligible | negligible |

**1500+ photographs fit in 1 GB. 1800 uploads at the high end of the
measured size range leave under 180 MB of headroom, and 2200 uploads do
not fit at all.** No test is needed for this; it is arithmetic, and
designing an experiment to rediscover it would be theatre. What *is*
needed is a measurement of the one input (average display-copy size
over a realistic sample, T2.1) and three operational consequences:

1. **`events.photo_limit` defaults to 500** (Feature 007 T1.1). A
   1500-photo course hits that cap at photograph 501 and the join QR
   disappears (Feature 007 US-22). The limit must be raised
   deliberately before the course — and *not* to a number the bucket
   cannot hold. **1800 is the right cap**: it accommodates the stated
   1500 plus rejections, and it is under the 1 GB ceiling at the
   measured high end. Setting it to "a big number" would convert a
   clean refusal into a storage exhaustion that breaks uploads for
   every event on the project.
2. **Rejection does not free storage**, and neither does deleting the
   event row. `photos` rows cascade on event delete
   (`20260913000000_init.sql:26`); storage objects do not. Deleting the
   event at the end of the retention window would orphan ~1800 JPEGs in
   the bucket with no row left to find them by, permanently consuming
   most of the 1 GB. The deletion step in §8 has to delete objects,
   in this order: retrieve → delete photographs (objects + rows) →
   delete the event.
3. **Do not enable Sharp or Archive quality for this course** if
   Feature 006 ships before February. Sharp is 2560px / ~1.5 MB
   (Feature 006 §1): 1800 × 1.5 MB = 2.7 GB, which does not fit in 1 GB
   on any plan the project is on, and it roughly triples contributor
   (1) in §2b as well. Archive's display copy stays at 1600px and is
   safe on that axis, but see §8.

Database: 1500 rows at a few hundred bytes is under 1 MB against
500 MB. Not a constraint, no test, no further discussion.

## 4. Live updates: connections, channels, messages (US-26)

**Message volume is arithmetically clear.** Row changes over the
course: ~1500 inserts + ~1500 approve/reject updates + bulk operations
≈ 3,500. Each is broadcast to every subscribed client. At a peak of 85
subscribers that is ~300,000 messages against 2 M/month — comfortable
by roughly 6×, even allowing that the projector subscribes to
`event: "*"` on all `photos` rows for the event
(`Slideshow.tsx:110-118`) and therefore receives and discards every
pending insert and every rejection. No test; confirm only *how the
provider counts a message* (T0.3) and move on.

**Concurrency is not clear, and the ambiguity matters.** Each slideshow
client opens **two** channels — `photos-${eventId}` and
`event-${eventId}` (`Slideshow.tsx:110` and `:160`) — multiplexed over
one WebSocket. At 80 viewers + projector + 4 reviewers that is **85
connections or 170 channels**, against a cap published as "200
concurrent peak connections". 85/200 is comfortable; 170/200 is not,
and the difference is entirely in what the meter counts (T0.3).

If the meter counts channels, there is a cheap and obvious mitigation:
**merge the two subscriptions into one channel.** They are subscribed
in the same component with the same lifetime; nothing requires them to
be separate. That halves the figure. It is named here so that it is
available as a mitigation if T0.3 comes back badly, and it is not built
in this feature.

**What refusal looks like is the part that actually needs establishing**
(US-26). The app pairs every subscription with a 30 s poll
(`specs/PROJECT.md`, "Realtime"), so the predicted viewer experience
when connections are refused is: the slideshow keeps playing, new
photographs appear up to 30 s late instead of immediately, and nothing
visible fails. That prediction has never been tested and has two
plausible failure modes behind it — a client that retries a refused
subscription in a tight loop, and the fact that the fallback poll is
the most expensive query in the app (§2b-i), so **the failure mode of
the realtime cap is an egress increase, not an outage.** T3.4 tests it
by driving a disposable project past the cap and watching a real
client.

## 5. Moderation throughput, with 2-4 reviewers (US-29)

### 5a. What the course requires, per person

Assume 1500 photographs, a 3-day course, and reviewers working in the
dead time during presentations — the organizer's stated and rather
good use case. Review must keep pace with uploads rather than happen
afterwards, because the QR is gated on moderation being enabled
(Feature 007 US-21) and because unreviewed photographs do not reach the
screen.

| Reviewers | Photographs each | Over 3 days | Per person per day |
|---|---|---|---|
| 1 | 1500 | — | 500 |
| 2 | 750 | — | 250 |
| 4 | 375 | — | 125 |

At a sustained **3 s per photograph** (an optimistic rate that assumes
the image is already on screen when the reviewer looks up), one person
needs 25 minutes a day at four reviewers, or 1 h 40 m a day alone. At a
more realistic **8 s** — which is what it becomes when each step waits
on a 0.4 MB image over venue wifi, because **nothing preloads the next
photograph** (`ReviewQueue.tsx` fetches rows in batches of 10 but the
`<img>` at line 187 loads on demand) — four reviewers need ~17 minutes
each per day and one person needs 3 h 20 m.

**So with 2-4 reviewers the volume is tractable and with one it is
not.** The required rate per person (125-250 photographs/day at four
to two reviewers) is a plausible thing to do during presentations. The
measurement (T4.1) exists to replace "3 s or 8 s" with a number, and
specifically to separate *decision time* from *image wait time*,
because only the second is fixable by us.

### 5b. The grid path does not scale, and it is the same blocker three times

The alternative to one-at-a-time is selecting photographs in the Needs
Review grid and approving them in bulk (Feature 004 US-13, design §2).
At this volume that path does not exist in practice:

- `NEEDS_REVIEW_PAGE_SIZE = 8` (`src/components/manage/constants.ts:2`).
  1500 pending photographs is **188 "Load more" clicks**.
- There is **no "select all"** affordance anywhere in `PhotoManager`
  (confirmed by search). Selection is one checkbox per photograph into
  a local `Set`. Bulk-approving 1500 photographs is 1500 clicks plus
  188 more.

The same two facts block the retention deletion in §8 (1500 photographs
to delete, 24 per Library page, no select-all) and inflate contributor
(4) in §2b (every grid cell fetches the full display copy; Feature 004
design §5 deferred thumbnails explicitly "until there's a real event to
measure against" — this is that event).

So **one small change — "select all matching the current filter", a
larger review page size, and optionally real thumbnails — is the
answer to three separate problems**: moderation throughput, retention
deletion, and ~560 MB of moderation egress (1500 × 0.4 MB full copies
versus 1500 × ~25 KB thumbnails). That is an unusually good ratio and
it is the first mitigation to reach for if §11's gate goes against the
free plan. It is not designed here.

Crucially, a grid of 48 thumbnails that a human scans, deselects the
bad ones from, and approves the rest **preserves the safety property**
that a person looked at every photograph. It is not "moderation off
with extra steps". That distinction is what makes it an acceptable
answer and the options in §5d largely not.

### 5c. Concurrent review is new risk, not free capacity

> **Update (Feature 009).** The feature this section anticipates now
> exists as a spec: `specs/009-multiple-approvers/`. It takes the three
> consequences below as design input — the unconditional
> `update … eq("id", …)` becomes a write carrying the status the
> reviewer was shown (009 §6), and the `.range()` paging becomes keyset
> paging so no undecided photograph is skipped (009 §7a) — and it
> absorbs the four-step test below as its own T6.3, to be run at the
> dry run. The *first* consequence is deliberately **not** removed:
> two reviewers entering together are still handed overlapping
> photographs, because partitioning the queue was considered and
> rejected (009 §6). What is removed is losing a decision silently and
> skipping photographs silently.

Several reviewers is a capability that **does not exist yet** — it is
its own feature, specced separately, and nothing here designs it. But
it introduces a failure mode this plan must name, because the plan
cannot test it:

Feature 004 design §4 pins the one-at-a-time review session to a
**snapshot** of the pending queue taken when the session is entered —
`ReviewQueue` is handed `sessionTotal` and pages forward through the
same oldest-first query with `.range(items.length, …)`. Two reviewers
entering at the same moment are therefore handed **the same
photographs**, and each decides them independently with a plain
`update … eq("id", …)`. Nothing in that path checks the row's current
status before writing it.

Consequences, all unverified:

- Two people spend their time deciding the same photographs while
  others go unreviewed — the throughput division in §5a silently fails.
- The second write wins. A reviewer who rejected a photograph can have
  it approved out from under them by someone who was handed the same
  photograph thirty seconds earlier, with no indication to either.
- The `.range()`-based paging shifts under concurrent decisions
  (rows leave the `status = 'pending'` filter as they are decided), so
  the two sessions skip photographs as well as duplicating them.

**This feature cannot verify any of it**, because there is no way today
for a second person to review an event's photographs. What it does is
state the test the multi-reviewer feature must pass (T4.3, written now,
runnable later):

1. Two reviewers enter one-at-a-time review within seconds of each
   other on an event with ≥50 pending photographs. Record whether they
   are handed overlapping work.
2. Both decide the same photograph, differently, within a second.
   Record the final state, and whether either reviewer is told.
3. One reviewer bulk-approves a page while the other is mid-session.
   Record whether the second reviewer's session paging skips rows.
4. Repeat with four reviewers, which is the stated number.

Pass condition: no photograph is presented as undecided work to two
reviewers at once, and no decision is replaced without the reviewer who
made it being told. That is US-29's acceptance criterion, restated as
a procedure.

### 5d. If the measurement says review cannot keep pace

Then the coupling in Feature 007 US-21 — join QR visible only while
moderation is enabled — does not survive this scale, and that is an
**amendment to Feature 007**, not a workaround to be noted in a run
book. The options, with the position this design takes on each:

| Option | What it costs | Position |
|---|---|---|
| **A.** Keep the coupling; review in batches; accept upload-to-screen latency | Nothing to build. Photographs reach the screen minutes-to-hours late | **Default.** The honest fallback if nothing is built |
| **B.** Make the grid path work at scale (§5b): select-all, larger page, thumbnails | One modest feature. Preserves "a human saw it" | **Recommended first.** Fixes three problems at once |
| **C.** Decouple the QR from moderation for events explicitly marked low-risk | A safety change under `CONSTITUTION.md` principle 1, requiring a recorded decision, on an event where anyone in the room can scan | Only with the owner's explicit recorded decision. Not a default, and not something this course should need |
| **D.** Show photographs immediately and pull bad ones afterwards | Moderation off with extra steps | **No.** This is the thing principle 1 exists to prevent |

Having 2-4 reviewers makes A survivable where it was not with one. It
does not make the question moot, and must not be recorded as having
resolved it (US-29).

## 6. The viewer multiplier: the link from the upload page (US-27)

`src/app/e/[slug]/page.tsx:93` renders "View live slideshow →" on the
guest upload page. The join QR (Feature 005) leads to that page, so the
path from *scan the QR to post a photo* to *become a continuously
fetching viewer* is **one further tap**. Every uploader is a
prospective viewer, and contributor (1) in §2b is the dominant term.

This link has **no requirement behind it anywhere in `specs/`** — a
search of all seven features finds only Feature 001 US-1's "generate a
guest upload link and a slideshow link". It was never decided, so
"leave it as it is" is not the conservative option; it is an
undocumented default.

Options, to be decided at the gate with the measured per-viewer figure
in hand:

| | Behaviour | Effect on §2b (1) | Cost |
|---|---|---|---|
| **Keep** | Unchanged | Full multiplier | None, but the multiplier stays unowned |
| **Remove** | Guests upload; the screen is the screen | Viewers reduce to people deliberately sent the slideshow URL | Loses a genuinely nice thing: people watching on their own phones |
| **Organizer setting** | Per-event toggle, default off at large events | Organizer owns the multiplier | A schema change and a settings control, for a decision most organizers cannot evaluate |
| **Warn** | Keep the link, show the organizer what viewers are costing | Nothing directly | Honest, and does nothing on its own |

**This design's recommendation is to decide between Keep and Remove at
the gate on the measured number, and not to build a setting.** A
per-event toggle is the answer that looks balanced and is worst: it
adds schema, a control, and a decision an organizer has no basis to
make, to manage a cost they cannot see. Feature 005 already declined a
per-event QR toggle for the same reason and that reasoning holds.

Note the interaction with §2c: if cached egress absorbs the viewer
term, Keep is nearly free and the question evaporates. If it does not,
Remove is worth 2-7 GB and is a one-line change. **The link decision
should be taken immediately after T2.2, because T2.2 effectively makes
it for us.**

Whichever way it goes, US-27 requires a written requirement for the
resulting behaviour, because at present there is none.

## 7. Recency at 1500 photographs, and its tension with §2 (US-28)

`Slideshow.tsx` holds every approved photograph in `photos`, ordered
oldest-first, and renders `photos[tick % photos.length]` with `tick`
starting at **0 on every page load** (`:261`). Newly approved
photographs are appended to the end (`:133-137`). At 1500 photographs
and a 5 s interval:

- **Every viewer begins at the oldest photograph in the event**, and a
  phone opened for ten minutes shows only the first 120.
- **A full pass takes 2 h 05 m.** A photograph approved during the
  closing ceremony is ~2 hours of screen time away from being shown.
- The projector restarted on day 3 spends its first two hours showing
  day 1.

Feature 001 US-5 says a newly approved photograph enters the rotation
without a refresh. That is still literally true and has stopped meaning
what it was written to mean — the gap between "in the rotation" and
"shown" was seconds at a dozen photographs and is hours at 1500. This
is precisely the failure mode `CONSTITUTION.md` warns about: an early
requirement that a later scale quietly invalidated. US-28 amends it.

**The tension that makes this a design decision rather than a bug
fix:** every client starting at index 0 is accidentally the best
possible case for the edge cache in §2c, because all 65 viewers request
the same objects in the same order. Randomizing each viewer's starting
point would fix recency and could multiply origin egress by up to the
number of distinct starting points. **Fixing US-28 naively makes US-26
worse.**

The shape that serves both, named here so the measurement can be aimed
at it and *not designed in this feature*:

> Bound the projector's working set to the most recent N approved
> photographs (N ≈ 300, a 25-minute loop), and derive every client's
> starting index from wall-clock time rather than from page load, so
> all clients stay in phase with each other.

That bounds the poll payload (§2b-i), caps distinct photographs per
client, keeps cache overlap maximal, makes recent photographs appear
within minutes, and has the pleasant side effect that a viewer's phone
shows roughly what the projector shows.

Its cost is a real cross-feature consequence that must not be smuggled
in: **Feature 004 US-15 requires the organizer's Slideshow section to
list photographs "in the same order the slideshow itself plays them".**
If the screen plays only the most recent 300 of 800, that section is
lying, and the amendment has to cover it. US-28's last criterion exists
for exactly this.

## 8. Getting the photographs out, and the retention window (US-30)

### 8a. Bulk retrieval is now a prerequisite, not a noted gap

No bulk download exists; it has been deferred since Feature 001 §7 and
is listed in Feature 006 tasks under "Depends on / pairs with". The
retention input promotes it: **a two-week retention window is only safe
if the photographs can actually be got out first.** Deleting them
otherwise is not retention, it is loss.

Date: specced by **E−10 weeks (2026-11-27)**, deployed by **E−7 weeks
(2026-12-18)**, and **exercised with real data during the dry run at
E−4 weeks (2027-01-08)**. A retrieval path first used on 1500 real
photographs two weeks after the only copy's owner went home is not a
path, it is a hope.

### 8b. Bytes, not duration — the correction that matters

The organizer is "not worried about the duration of the download."
Duration is not the constraint. **Bytes are.**

| What is retrieved | Per item | 1500 items | Against 5 GB/month |
|---|---|---|---|
| Display copies (what exists today) | ~0.4 MB | **~0.6 GB** | 12% — affordable, but it lands in the event month and §2b counts it |
| Originals (if Feature 006 Archive mode ships) | ~3-5 MB | **~6 GB** | **Exceeds the entire monthly allowance on its own**, however slowly it is taken |

The 6 GB figure is exactly what Feature 006 design §1a's move of
originals to Cloudflare R2 (unmetered egress) was for. So **the
bulk-download egress problem is already solved in spec and not in
code.** Today, with Feature 006 unbuilt, there are no originals at all
and any retrieval comes out of metered storage.

Two consequences for the timeline:

1. A bulk download built before Feature 006 retrieves **display
   copies** — 1600px, ~0.4 MB, not what most people mean by "the
   photos". If the course expects full-resolution photographs, Feature
   006 Phase 0 and Phase 3 must ship **before the course starts**,
   because originals that were never captured cannot be recovered
   afterwards (US-30). That is a decision to take at the gate, not in
   February, and it is gated in turn on Feature 006 T0.1 — the
   unanswered R2 billing question, which is a hard gate in that spec.
2. If Archive mode does ship, 1500 originals at ~4 MB is **~6 GB
   against R2's 10 GB free tier** — one course consuming 60% of it —
   and the §3 note about not enabling Sharp still stands independently.

### 8c. Deletion has to be possible

Per §3(2) and §5b: deleting 1500 photographs today means 63 Library
pages at 24 each with no select-all, and deleting the event row frees
no storage at all. The run book's deletion step is therefore, in order:
retrieve and verify → delete the photographs (objects *and* rows) →
delete the event. Feature 007 T6.5 widened the storage DELETE policy to
key on the event folder, which makes in-app deletion of orphans
possible; the Storage dashboard's folder delete is the operational
fallback and should be written into the run book as such.

### 8d. The window is an input, not a policy

Two weeks is recorded as **what one organizer wants for one course**.
It is evidence for `CONSTITUTION.md` open decision 4 (retention,
consent, deletion), not that decision being taken. Deleting
photographs of identifiable people is a policy question with consent
and expectation attached to it, and one organizer's convenience does
not settle it for the project. This feature records the input and the
operational steps; it does not write a retention policy and must not be
cited as having done so.

## 9. How to measure honestly (US-26)

### 9a. Ground truth is the provider's accounting

Client-side arithmetic is a **cross-check**, never the answer. The
reasons are specific, not pedantic: the browser's reported transfer
sizes do not include request headers or TLS overhead; a 304 may or may
not be billed as a request; and the entire §2c question — which of two
meters a byte lands on — is invisible from the client by construction.

Procedure for every transfer measurement:

1. Read both meters (egress, cached egress) and the timestamp.
2. Run exactly **one** scenario, with nothing else touching the
   project.
3. Wait for the accounting to settle before reading again. Usage
   reporting lags by hours and may aggregate daily — **plan one
   scenario per day**, which is the main reason the measurement phase
   needs three weeks rather than an afternoon.
4. Record both meter deltas, the client-side figure, and the ratio
   between them. A large divergence is itself a finding.

### 9b. Load generation must behave like browsers, not like `curl`

The §2a model stands or falls on revalidation behaviour. A script that
`GET`s image URLs in a loop has no cache and will **overstate** egress
by the number of passes; a script that fetches each URL once will
**understate** it by ignoring revalidation requests. Neither measures
the thing.

So: N headless browser contexts, each with **its own cache/profile**,
each loading the real slideshow URL and left to advance on its own.
This reproduces the actual request pattern — conditional requests,
304s, the 30 s poll, both WebSocket channels — because it *is* the
application.

Fidelity caveats, stated so they are not discovered later:

- All contexts share one source IP and one CDN point of presence. For
  this event that is arguably *realistic* — 65 phones on one venue
  wifi behind one NAT also share an IP and a POP — but it must be
  recorded as an assumption, because it is the assumption §2c's answer
  is most sensitive to.
- The test machine's connection is not venue wifi. §2's figures are
  about bytes, which do not change; §5's and US-31's are about
  latency, which does. Those run throttled (§9d).
- 65-80 headless contexts need roughly 8-16 GB of RAM. Batching is
  acceptable for transfer measurement (bytes add) and **not** for the
  concurrency measurement in §4, which needs them simultaneous.

### 9c. Where each measurement runs

| Environment | Used for | Why |
|---|---|---|
| **Disposable project** (second free project, **same region** as production) | 1500-photo seeding, 80-client load runs, the §2c meter experiment, deliberately exceeding a limit, realtime cap probing, moderation timing | Burning *this* project's allowance teaches us the answer at no risk; burning production's does not |
| **Production** | US-32 functional verification at small scale, the sign-in email rate test, the wake-from-pause rehearsal, the dry run | These are properties *of the production project* and cannot be learned elsewhere |

Two things make this non-optional rather than tidy:

- **A full-scale load run costs 3-8 GB of egress.** Run on production,
  the measurement would consume most or all of the very allowance it is
  measuring, and two runs in one month could trip the limit whose
  behaviour we do not yet know — i.e. the test could cause the outage.
- **Seeding 1500 photographs costs ~600 MB of the 1 GB bucket.** On
  production that is 60% of the project's total storage, plus orphaned
  objects afterwards. **Do not seed production.**

Check before relying on this: the free plan's limit on projects per
organization (T0.6). If a second free project is not available, the
fallback is to run the load measurements against production *once*,
early in a month with no event, accepting the allowance cost — and to
answer §11's overrun-behaviour question from documentation only, never
by experiment.

### 9d. Throttling

The venue network is the stated reason the app compresses to
1600px/0.6MB at all (`CONSTITUTION.md` principle 3; `specs/001-photo-collection-slideshow/design.md:180`). Every latency-sensitive measurement — per-slide round trips,
review step time, upload time — runs under a throttled profile as well
as an unthrottled one.

**Feature 006 T5.5 already specifies exactly this for the slideshow's
read path** (requests reaching origin per slide, bytes each, and
whether any slide visibly stalls, over several passes on a throttled
connection). This feature **references that task rather than
duplicating it**, and adds only the scale dimension: the same
observation with 80 clients in flight instead of one (T3.3). If T5.5
has not been run by the time T3.3 is reached, run T5.5 first — its
single-client baseline is what T3.3's numbers are compared against.

## 10. What cannot be tested, and the substitutes (US-25, US-29)

| Cannot be tested | Why | Substitute |
|---|---|---|
| What production does when its egress is exceeded | Doing it to production risks the outage we are preventing | Documentation or support first (T0.1); failing that, drive the **disposable** project past 5 GB and observe (T0.2) |
| Concurrent review collisions | The capability does not exist | Write the test now, run it when the multi-reviewer feature lands (§5c, T4.3) |
| The actual venue network | Not ours, and not until February | Throttled profiles (§9d) plus a dry run on real phones at or near the venue (T6.2) |
| 65 real phones, twice | Nobody has 65 phones | Headless contexts for bytes and concurrency; a handful of real phones in the dry run for everything that is about a phone |
| The sign-in email rate limit at full staff count, repeatedly | Testing it consumes the same limit it is testing | Test once, ≥2 weeks before the course, at the real staff count (T6.1); never on course week |

## 11. The decision gate (US-24)

### 11a. What must be complete before the call can be made

| Must be done | Task | Why it is load-bearing |
|---|---|---|
| Overrun behaviour known (bill / throttle / stop) | T0.1, fallback T0.2 | Sets the safety margin. "Stop" and "bill" imply different thresholds |
| Realtime meter semantics known (connections or channels) | T0.3 | 85/200 versus 170/200 |
| Average display-copy size measured | T2.1 | Every figure in §2 and §3 is denominated in it |
| **Which meter moves for shared objects** | **T2.2** | **Decision-dominant. A 60× swing on the largest term** |
| Per-viewer transfer measured, aggregate derived | T3.1, T3.2 | The actual quantity being decided |
| Background-query cost measured | T2.3 | 0.24-1.5 GB, currently unknown within 6× |
| Peak concurrency observed, and refusal behaviour observed | T3.4 | Decides whether the cap binds |
| Moderation rate measured, per-person requirement derived | T4.1, T4.2 | Not money-sensitive, but it is a go/no-go for the event itself |
| Peak storage computed from the measured size | T2.1 → §3 | Arithmetic, but needs the input |

Explicitly **not** required before the call: the concurrent-review test
(§5c — blocked on a feature that does not exist), and the dry run
(which comes after, and tests the chosen configuration).

### 11b. The criteria

Let **E₀** = projected origin egress for the event month, **E_c** =
projected cached egress, **S** = projected peak storage, **C** =
projected peak realtime units as a fraction of the cap.

**Take the paid plan if any of these holds:**

1. Overrun behaviour is *throttle / refuse / stop* **and** E₀ > 2.5 GB
   (50%). A hard ceiling gets a 2× margin, because the consequence is
   an event-ending failure and the projection is an extrapolation.
2. Overrun behaviour is *billing* **and** E₀ > 4.0 GB (80%). A bill is
   recoverable; the margin can be thinner.
3. E_c > 4.0 GB (80% of its own separate allowance).
4. S > 800 MB at peak (80% of 1 GB).
5. C > 70% of whatever the meter actually counts.
6. The mitigations needed to bring any of 1-5 under threshold cannot be
   specced, built, reviewed and **deployed** by E−7 weeks
   (2026-12-18), per the pipeline in `CLAUDE.md`.

**Otherwise stay free**, with the monitoring regime in §11d.

Criterion 6 is the one most likely to decide this. The measurements may
well show that the free plan is reachable *with* the §5b grid work, the
§7 bounded working set and the §6 link decision — three changes, each
needing a spec, an implementation and a cold review, through a
December. **Twenty-five dollars buys all three deadlines.** That is a
legitimate thing to weigh and it is exactly the weighing principle 4
asks for.

### 11c. The date, and why it is that date

**Decision recorded by E−11 weeks = 2026-11-20.**

Working backwards:

- E−4 weeks (2027-01-08): the dry run, which must exercise the
  configuration that will actually run in February.
- E−7 weeks (2026-12-18): mitigations deployed. Later than this and
  they land in the mid-December-to-early-January window, which on a
  volunteer project is not working time, and they would arrive
  untested at the dry run.
- E−11 to E−7: spec → implement → review → deploy, for up to three
  changes, with the model split in `CLAUDE.md` meaning each crosses two
  contexts.
- Therefore the decision — which determines *whether those changes are
  needed at all* — must be recorded by **E−11 = 2026-11-20**.

Per US-24, **if the measurements are not complete by then, the answer
is the paid plan.** Not an extension. An unmeasured free tier on the
live path is the gamble principle 3 forbids, and the cost of being
wrong in that direction is $50.

### 11d. If the free path is chosen

The decision must be reversible upward *during* the course, because the
projections are extrapolations from a synthetic load:

- **Payment details on file before the course regardless of the
  decision.** An upgrade is a few minutes; entering card details for
  the first time at 9pm on a Saturday while the screen is dark is not.
  This costs nothing and removes the only thing that makes a mid-course
  upgrade slow.
- **Read the usage meters every morning and evening of the course.**
  This is a named line in the run book with a named owner, not a good
  intention.
- **Pre-agreed trigger: if consumption passes 60% of any allowance by
  the midpoint of the course, upgrade immediately**, without further
  discussion. The trigger exists so that the judgement is made now,
  calmly, rather than then.
- Residual risk, stated: usage accounting lags by hours (§9a). A
  monitoring regime built on a lagging meter can be overtaken by a
  sharp spike. This is an argument for the 60% trigger being early
  rather than for monitoring more often.

### 11e. What the paid plan buys, and what it does not

**Buys:** 250 GB egress (~30-50× headroom, ending §2 as a concern);
100 GB storage (ending §3, and removing the dependency of the storage
answer on the retention step actually happening); no idle pause (closing
`CONSTITUTION.md` open decision 5 for the event months); higher realtime
caps and database backups (**both unverified — confirm at the gate,
T0.5**; the free plan's backup position in particular is unknown and a
real event's metadata sitting unbacked is its own small risk).

**Does not buy:** moderation throughput (§5 — the grid path is equally
broken on both plans); recency at 1500 photographs (§7); the existence
of bulk download (§8); the sign-in email rate limit (§13b — the
built-in email service is rate-limited on every plan; the fix is custom
SMTP, `CONSTITUTION.md` open decision 6); or the unbounded background
query (§2b-i), which merely stops mattering financially while
continuing to cost a round trip per slide.

Money fixes exactly one of the five questions in §1 outright, and that
is worth saying out loud before anyone treats the upgrade as the end of
the work.

**Cost and shape, if taken:** $25/month, upgrade **2027-01-25** (before
the dry-run follow-ups and final checks, so the project also cannot
pause through late January), downgrade once the retention window closes
and the photographs are deleted. **~$50 total.** One trap: a downgrade
is refused while usage exceeds free limits, so the §8c deletion must
happen *before* the downgrade or the $25/month continues. Also decide
and record the spend-cap setting — left on, the paid plan restricts
rather than bills at its own ceiling, which at 250 GB is academic but
should be a choice rather than a default.

## 12. Event-day operations (US-31)

### 12a. Waking from idle

The project pauses after 1 week of inactivity and February is four
months out, so it will be asleep. Restoring is a dashboard action, but
it is not instantaneous and it is not something to discover on the
morning. Checklist, with timing:

- **E−7 days**: wake, confirm the guest page, the slideshow and
  sign-in all serve. Any API activity resets the idle clock, so a woken
  project stays awake as long as it is being used — but "is being used"
  must not be assumed.
- **E−1 day**: confirm still awake; full end-to-end pass (upload →
  approve → appears on screen) on the real event.
- **E−1 day**: event configured as it will run — `photo_limit` raised
  to 1800 (§3), moderation enabled, upload window open, slideshow
  interval set, uploads not paused.
- **Morning of E**: confirm serving before anyone arrives.

### 12b. The sign-in email, which fails silently

`specs/PROJECT.md` records that the magic-link email is rate-limited to
"a few per hour" and **fails silently** — the app reports "link sent"
and nothing arrives (`src/app/(site)/login/page.tsx:54`). With 2-4
reviewers plus the organizer signing in on the morning of the course,
this is a live failure on the critical path with no visible cause, and
it is the one risk on this list that **the plan decision does not
touch** (§11e).

> **Re-scoped by Feature 009 (design §13).** Co-approvers are admitted
> by a shareable link and never receive an email at all — that is one
> of the reasons the link design was chosen over invitations (009 §1).
> The number of people signing in on course morning therefore falls
> from "2-4 reviewers plus the organizer" to **the owner alone**, which
> is comfortably inside "a few per hour". The risk shrinks to a single
> sign-in, and the day-before mitigation below has one person to cover.
> It is not *gone*: one silently-undelivered link to the one person who
> owns the event is still an event-morning failure.

Test (T6.1): have the real number of people who will sign in do so
within a few minutes, at least two weeks before the course, and record
how many links arrive and how long they take. Testing it consumes the
same limit, so **once, and never on course week**.

If the test shows the limit binds at 3-5 people, that reopens
`CONSTITUTION.md` open decision 6 (custom SMTP) with a date on it:
specced and deployed by E−7 weeks, or mitigated operationally by having
every reviewer sign in **the day before** and verifying their session
persists. The operational mitigation is free, available immediately,
and should be in the run book regardless of what the test shows.

### 12c. The dry run

At **E−4 weeks (2027-01-08)**: real phones, real people, a network
resembling the venue's, against the production project and the exact
build that will run in February. Minimum coverage: several guests
upload simultaneously; reviewers approve from their own devices;
the projector runs for a sustained period and is watched for stalls
between slides (Feature 006 T5.5's observation, at scale); the join QR
is scanned from the back of a room; and the bulk download is run
against real data (§8a).

E−4 is chosen so that findings have four weeks to turn into changes
before the E−2 freeze. A dry run that leaves no time to act on it is a
ceremony.

## 13. Amendments and dependencies this feature creates

Per `CONSTITUTION.md`: a feature that changes an earlier feature's
behaviour must amend that earlier spec. The following are **identified
here and must be carried out by whichever feature implements the
change** — this feature writes no code and therefore does not yet
invalidate anything by itself.

| Earlier spec | What this feature puts in question | Trigger |
|---|---|---|
| **Feature 001 US-5** ("enters the rotation without a refresh") | True in letter, false in effect at 1500 photographs (§7) | Amended by US-28 here; must be amended again by whatever implements the bounded working set |
| **Feature 004 US-15** ("in the same order the slideshow itself plays them") | False if the screen plays a bounded recent subset (§7) | The §7 change |
| **Feature 004 design §5** (thumbnails deferred "until there's a real event to measure against") | This is that event; §2b(4) and §5b are the measurement | T4.1, T2.4 |
| **Feature 004 design §4** (review session snapshot) | Unsafe with concurrent reviewers (§5c) | **Done:** amended by Feature 009 design §7 (fixed batch, live remaining count, keyset paging); test handed to Feature 009 T6.3 |
| **Feature 005 US-17 / Feature 007 US-21** (QR gated on moderation) | May not survive 1500 photographs (§5d) | Only if T4.1/T4.2 show review cannot keep pace |
| **Feature 006 T0.4** (confirm the egress allowance) | Partially answered: the allowance is 5 GB, not 2 GB; cached egress exists and is metered separately (§0) | Done here; the 304-billing and cached-egress-accounting halves remain, and T2.2 answers them |
| **Feature 006 §1a / tasks preamble** (reasoning quoted against "a 2 GB monthly allowance") | The premise figure is wrong; the conclusion (originals to R2) is **unchanged and strengthened** — 6 GB against 5 GB is still an impossible download (§8b) | Noted in §0; the reasoning does not need redoing |
| **`specs/PROJECT.md` free-tier table** | Superseded figures | Updated by this feature |
| **`CONSTITUTION.md` open decision 4** (retention) | Receives an input, is not resolved (§8d) | — |
| **`CONSTITUTION.md` open decision 5** (idle pause) | Resolved for the event months *if* the paid plan is taken (§11e) | The gate |
| **`CONSTITUTION.md` open decision 6** (custom SMTP) | May be reopened with a date by T6.1 (§12b) | T6.1's result |

New dependencies with dates, none of them built here:

- **Bulk download** (deferred since Feature 001 §7): specced E−10,
  deployed E−7, exercised E−4 (§8a).
- **Multi-reviewer**: **specced as Feature 009** (2026-10-04).
  Scheduled Phases 1-2 by 2026-10-30 and the rest by 2026-11-27 —
  ahead of the E−7 deadline and deliberately clear of the post-gate
  mitigation window (Feature 009 §13). Must pass T4.3, run as Feature
  009 T6.3 at the dry run.
- **Feature 006 Phases 0 and 3** (originals to R2): required *only* if
  the course expects full-resolution photographs. Decide at the gate;
  gated in turn on Feature 006 T0.1 (§8b).

## 14. Deliberately not designed here

The bounded slideshow working set (§7), the grid-scale moderation work
(§5b), the link decision's implementation (§6), bulk download (§8),
multi-reviewer (§5c), and the realtime channel merge (§4). Each is
named with enough precision to be specced quickly if the gate calls for
it, and none is designed now — designing mitigations before the
measurement would be assuming the answer this feature exists to find,
which is the specific failure the brief asks to avoid.
