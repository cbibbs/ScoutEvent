# Design: Photo Quality & Keeping Originals

Traces to `requirements.md` in this directory. Extends Feature 002's
compression decision (design §4 there) and Feature 001's storage/RLS
model (design §2-3 there).

## 1. The three modes, and what each actually stores

| Mode | Display copy (Supabase, 1GB) | Archive copy (R2, 10GB) | Capacity |
|---|---|---|---|
| **Fast** (default) | 1600px, ~0.6MB | — | ~1,500 photos |
| **Sharp** | 2560px, ~1.5MB | — | ~650 photos |
| **Archive** | 1600px, ~0.6MB | original, ~3-5MB | ~1,500 photos, archives capped by R2 (~2,500 originals) |

The two copies live in **different stores**, and §1a is where that
split is argued rather than assumed: display copies stay in Supabase
Storage because the rule deciding who may read them is live,
status-dependent SQL that only Supabase can evaluate; originals go to
Cloudflare R2 because their access rule is static and their bulk
download is the one transfer nothing can make affordable. R2's free tier
is 10GB and, critically, charges nothing for egress.

Why those pixel numbers, since the organizer-facing wording hides them:

- **1600px is sharp on a 1080p screen**, which is not obvious, because
  1600 < 1920. The slideshow uses `object-contain`, so height is
  normally the limiting dimension: a 4:3 landscape photo at 1600x1200
  renders at 1440x1080 on a 1080p panel — downscaled, so crisp. On a 4K
  panel the same photo is upscaled ~1.8x and goes soft.
- **2560px covers 4K** (upscaled ~1.1x, effectively native) and prints
  cleanly at 6x4 (2560px ≈ 8.5in at 300dpi).
- **Original** is whatever the phone produced — typically 3-5MB for a
  12MP JPEG, more for high-resolution modes.

**Archive mode keeps two files, not one.** This is the key structural
decision. If Archive simply stored the original and pointed everything
at it, the slideshow would stream 3-5MB per photo against a 2GB/month
egress allowance, and every thumbnail in a paginated grid of hundreds
would pull a full-resolution image — undoing Feature 004's entire
reason for existing. So the original is *additive*: display copies
continue to serve every screen, and the original is touched only by an
explicit download.

Fast and Sharp stay single-file: their display copy *is* the copy you'd
download.

Sizes are tuning constants, not protocol. Note that Sharp roughly
triples slideshow egress versus Fast, which matters more than storage
for a screen that runs all day; Fast is the bandwidth-safe choice.

## 1a. Where each copy lives, and why the two differ

The rule this section applies, stated once so both halves are decided by
the same test rather than by habit:

> **Image bytes live in the same store as the rule that decides who may
> read them — unless egress makes that impossible.**

Authorization is the default pull, because this app's access control is
RLS next to the rows (PROJECT.md, "Access control") and every copy of a
rule kept somewhere else is a copy that can drift. Egress is the one
force allowed to override it, because an allowance that runs out takes
the whole project down with it, not just one feature.

Applied to the two copies, that test gives different answers, and the
reasons are worth writing down because an earlier version of this
section asserted the same split without arguing it.

### Originals leave, because egress makes keeping them impossible

The entire point of keeping originals is getting them back out again,
and a bulk download is the largest single transfer this app will ever
do: 300 archived photos at ~4MB is ~1.2GB, most of Supabase's 2GB
monthly allowance spent in one click, on the one action the archive
exists for. An organizer who downloads two events in a month exhausts
it. **No caching softens that** — a bulk download is a one-shot transfer
of bytes the recipient by definition does not already have, so it costs
full price every time. R2 does not charge for egress at all, which turns
the feature from "technically possible, practically rationed" into
something an organizer can just use.

Capacity agrees but does not decide: 10GB against a 1GB Supabase bucket
already shared with every display copy.

And the authorization half of the test is satisfied cheaply here.
An original's access rule is **static and coarse**: *the organizer who
owns the event, on an explicit download action.* One predicate, no
anonymous caller, evaluated a handful of times per event. Restating that
check inside a single route handler (§3a) is a small, auditable
duplication of RLS — the same shape as `submit_photo()`, which PROJECT.md
already blesses. So the override is bought at a price the rule permits.

### Display copies stay, and the same test is what keeps them

Three reasons, in the order they actually carry weight. The egress
argument is last, and deliberately so: it is the one that moved when it
was measured (§1b), and a conclusion that rests on a number which can
move is a conclusion waiting to be reopened.

**1. A display copy's access rule is per-photo, status-dependent, and
changes while the event is running.** Anonymous callers may read a photo
only while it is `approved` **and** `in_slideshow` (Feature 002 design
§3); the owning organizer sees all of their own at any status. Rejecting
a photo, or pulling it from the slideshow, flips that mid-event from a
phone at the back of the room. R2 knows nothing about `status`,
`in_slideshow`, or `organizer_id`, so every signed read would make our
route handler re-implement a predicate that already exists, correctly,
in RLS — and re-implement the *live* version of it, on every screen, for
anonymous callers. Feature 007 is this project's record of what a second
copy of a server-side rule costs: a client-side `photo_limit` pre-check
drifted from the server's and refused every guest at an event after the
organizer raised the limit. One static duplicated predicate for
originals is a rounding error. A constantly-changing one on the read
path of every screen is a defect with a date on it.

This is the load-bearing reason. It does not depend on any allowance,
any measurement, or any vendor's pricing page.

**2. Blast radius, against "an event happens once".** As scoped here, if
R2 is misconfigured, unreachable, or abandoned, every screen still
works, because only the download path reads from it — a failure between
events, which is an inconvenience. Move display copies and the same
failure is a black projector in a room full of people, with no fallback,
because the bytes would exist in exactly one place. Feature 001 §1 chose
one vendor deliberately; the right amount of that to spend is the
smallest thing that cannot be done any other way, and the projector is
not it.

**3. The egress case for moving them is weaker than it looks, and
weaker than an earlier draft of this section claimed.** That draft put
an all-day slideshow at ~3.4GB, above the whole monthly allowance, on
the assumption that display objects carry a one-hour cache header and
are therefore re-downloaded hourly. **That was assumed, not measured,
and the measurement says otherwise** (§1b): the objects are served
`cache-control: no-cache` with an `ETag`, and `no-cache` means
"revalidate before reuse", not "do not store". A warm client
revalidates and gets a **304 with a zero-byte body**, so an 8-hour
projector day transfers each photo roughly *once* — tens of megabytes,
not gigabytes — plus header-sized revalidation traffic. The grids behave
the same way for anything already seen.

So display-copy egress was never the pressure the originals' bulk
download is, and the gap between the two is wider than the earlier draft
made it: ~1.2GB in one irreducible click against a projector day of tens
of megabytes. **Correcting this number strengthens the conclusion rather
than threatening it** — the less pressing the ceiling, the weaker the
case for buying a second vendor to relieve it. Had the number gone the
other way, reasons 1 and 2 would still have decided it.

What the measurement *did* surface is a different cost, and not an
egress one: `no-cache` forces a round trip to origin on every slide
advance for bytes the client already holds. §1b deals with it, because
it is a reliability problem on exactly the network Feature 001 compressed
to 0.6MB to survive — and it is a problem that gets *worse*, not better,
if the bytes move further away.

**The presigned-expiry problem, not waved away.** It cuts both ways and
deserves its arithmetic:

- Cheaper than it looks: SigV4 presigning is a local HMAC, not a call to
  the storage provider. Signing 300 keys for a grid page is one
  round-trip to our own route handler and no R2 operations at all, and
  it consumes none of R2's 1M/10M monthly Class A/B allowances.
- Expensive where it counts: the slideshow runs **unattended for hours**.
  A signature that expires at 21:40 in an empty hall turns every frame
  into a broken image, and the only cure is re-minting — which makes the
  screen newly dependent on a serverless function staying reachable for
  the length of the show, on top of the two subscriptions it already
  self-heals. Robustness can be bought with a long expiry, but a
  long-lived signed URL is a public URL with extra steps: it hands back
  the privacy that was the reason for signing. That dial has no setting
  that is both safe and unattended-proof without re-minting logic.

That last point applies to *any* signing scheme, including the Supabase
one §6 now commits to — it is a problem the follow-on feature must
solve, not a reason to prefer one store. What it does rule out is taking
it on **for bytes that do not need to move, while also putting a second
vendor on the projector's critical path** — a path that §1b shows is
already sensitive to one network round trip per slide.

### Decision

- **Originals → Cloudflare R2**, private, presigned write (§3a) and
  presigned read — gated on the billing check ("what this costs", below;
  `tasks.md` T0.1). Unchanged from the previous
  version of this section, but now decided by a stated rule rather than
  by the egress number alone.
- **Display copies → stay in Supabase Storage**, because the rule
  deciding who may read them can only be evaluated there, because the
  projector should not gain a second vendor it can die on, and because
  the egress that looked like a reason to move them turned out, on
  measurement, not to be one (§1b).
- **Display copies stop being public-read** — private bucket, reads
  through signed URLs minted under the existing RLS predicate. This is
  the same "private bucket + signed URLs" mitigation deferred since
  Feature 001 §7, applied where it belongs. It is scoped as its own
  feature, not folded in here; §6 records what it changes and why it is
  separate.

The previous version of this section claimed the privacy mitigation for
originals only, and justified the split for display copies on the
grounds that they "stay in Supabase Storage where the rest of the app
already reads them". That was inertia, and it left the project's most
exposed asset — every photo of every child, fetchable by anyone holding
a URL, forever, including after rejection — resting on a sentence about
convenience.

### What this costs, stated honestly

- **A second vendor.** Feature 001 §1 chose one deliberately, for fewer
  moving parts and fewer free tiers to watch. This spends that on
  purpose and only for originals, so the failure mode stays "downloads
  are broken between events" rather than "the screen is dead during
  one."
- **A server-side signing endpoint** (§3a). Browsers cannot write to R2
  without a presigned URL, and R2 credentials must never reach the
  client. A serverless route handler is still nothing to patch or scale,
  so it bends rather than breaks the constitution's "no app-specific
  backend to operate" — but it is a real change in shape. Keeping
  display copies on Supabase is also what keeps that surface *narrow*:
  it stays a write-path endpoint, Archive mode only, a few calls per
  upload, and it is off the read path of every screen. Moving display
  copies would have promoted it to the busiest route in the app,
  anonymous-facing, signing hundreds of keys per page view, with a cold
  start standing between the projector and its next frame. That is the
  difference between bending the rule and relocating it.
- **T0.1, and what happens if it fails.** R2 is understood to require a
  payment method on file even within the free allowance, and the
  behaviour at the 10GB ceiling — refuse writes, or start billing — is
  **unverified**. The constitution forbids silently incurring charges
  (principle 4), so this is a hard gate on Phase 3 and nothing about R2
  should be built before it is answered.

  **If R2 bills silently past 10GB, the recommendation becomes: do not
  use R2, and cut Archive mode from this feature.** Ship Phases 1-2
  (Fast and Sharp), which touch neither store's arrangement. Do *not*
  fall back to putting originals in Supabase Storage: that reintroduces
  both problems this section spent its override on — 3-5MB files in the
  1GB bucket that §5 already calls the real constraint, and a 1.2GB
  download against a 2GB allowance — so it would be choosing the worse
  option because the better one was unavailable. Keeping originals then
  becomes its own decision, with its own vendor check (the same two
  questions asked of any candidate) recorded per principle 4. The
  display-copy half of this section does not depend on that answer and
  stands either way.

## 1b. What the display read path actually does, measured

An earlier draft of §1a asserted that display objects carry supabase-js's
one-hour default cache header and are therefore re-downloaded hourly by
a running slideshow. **That was an assumption from reading
`UploadForm`'s upload call, and it was wrong.** Measured against the
live project, on three separate in-slideshow objects:

```
cache-control: no-cache
etag: "7f41fe928772b56126480e92eb995727"
cf-cache-status: MISS / REVALIDATED
content-length: 463360
```

and, on a conditional request:

```
If-None-Match: "7f41…"   ->  304, 0 bytes of body
unconditional            ->  200, 463360 bytes
```

Two consequences, pulling in opposite directions. Both matter, and they
are not the same problem.

**Egress is already close to the floor.** `no-cache` does not mean "do
not store"; it means "revalidate before reuse". With an `ETag` present,
a warm client revalidates and is answered `304` with an empty body. A
slideshow therefore transfers each photo about **once** over a session,
not once per pass and not once an hour — an 8-hour projector day on ~100
photos is tens of megabytes plus header-sized revalidation traffic, not
the ~3.4GB the earlier draft claimed. There is no large egress saving
available here, because the 304 behaviour is already delivering it. Any
spec text promising one is wrong and has been removed.

**Latency and reliability are not.** `no-cache` with
`cf-cache-status: MISS`/`REVALIDATED` means **every slide advance makes
a network round trip to origin**, even when the client already holds the
bytes and the answer will be "unchanged, download nothing". That round
trip is free in bandwidth and expensive in the one currency the
slideshow cannot spare: on a congested venue network — the network
Feature 001 compressed to 1600px/0.6MB specifically to survive — an
in-flight revalidation is a projector that stalls between slides, or
shows nothing, in a room full of people. Against constitution principle
3, that is a worse failure than an allowance overage, which arrives
later as a number rather than immediately as a dead screen.

### What to do about it (T2.3)

Set `cacheControl` to `max-age=31536000, immutable` on the display-copy
upload. The objects are content-addressed by UUID and are never
rewritten, so there is nothing to invalidate; deleting a photo removes
the row and the object together. A one-argument change to `UploadForm`,
applying to all three quality modes, not just Archive.

**Its justification is reliability, not bytes.** `immutable` tells the
client it may reuse what it holds *without asking*, which removes the
per-slide origin round trip entirely. The byte saving is small, because
the 304s already had it. Keep the task's priority — an unattended
projector that does not touch the network between slides is a better
answer to principle 3 than any egress arithmetic — but do not let it be
sold internally as a storage-bill fix, because that claim will not
survive the next person who measures it.

Two caveats the implementer owns:

- **Existing objects are unaffected.** Every photo already uploaded
  keeps `no-cache` — not a one-hour header, as an earlier draft of this
  section said — until it is re-uploaded, which the app never does. So
  the round trips persist for the existing library and stop only for
  photos uploaded after this ships. Nothing is broken by that; it simply
  means an event running on old photos sees no improvement. A backfill
  (re-setting metadata on existing objects) is possible and is not in
  scope here.
- **Signed URLs can undo it.** See §6: a signature that differs per
  request produces a URL the client has never seen, which defeats
  `immutable` completely and turns every slide into a full 200. This is
  the one way the privacy change could make the projector worse, and §6
  says how to avoid it.

**Thumbnails (not in scope, Feature 004 §5 option 1).** Grid cells
fetching 0.6MB to draw a square remains real waste — now understood as
mostly *first-view* waste and per-cell round trips rather than repeated
transfer. §1a's decision does not depend on thumbnails. Feature 004's
advice — measure against a real event first — still holds, and this
section is the argument for taking that advice literally.

**Still worth confirming (T0.4)**, though no longer load-bearing for
§1a's conclusion: the **current** Supabase free egress allowance (these
specs have carried 2GB since Feature 001 and the published figure has
moved), and how revalidation is accounted — whether a `304` is billed as
a request, and whether CDN-cached bytes count as egress. These size the
headroom; they no longer decide where display copies live.

## 2. Data model

Additive migration, same approach as Feature 002's:

```sql
alter table public.events
  add column photo_quality text not null default 'fast'
    check (photo_quality in ('fast', 'sharp', 'archive'));

alter table public.photos
  add column original_path text,
  add column original_bytes bigint,
  add column display_bytes bigint;
```

`display_bytes` is added alongside because §5 cannot report storage
usage honestly without knowing the size of every object, and neither
store makes that cheap to aggregate after the fact.

`original_path` now holds an **R2 object key**, not a Supabase Storage
path — the two are never interchangeable, and nothing should construct a
Supabase public URL from it. Name it for what it is if that ambiguity
seems likely to bite (`original_r2_key`); the cost of being wrong here
is a broken download rather than anything dangerous, but the column is
cheap to name well now and awkward to rename later.

## 3. Upload sequencing (US-19)

The ordering is the requirement, not an optimization: **the photo must
become real before the archive copy is attempted.**

1. Compress to the display size for the event's mode.
2. Upload the display copy to `{event_id}/{uuid}.jpg`.
3. Call `submit_photo()` — the photo now exists, is visible to the
   organizer, and enters the slideshow exactly as fast as it does today.
4. Only in Archive mode, and only now: ask the app's own signing
   endpoint (§3a) for a presigned R2 upload URL, and PUT the untouched
   original to it.
5. Call a new `attach_photo_original()` RPC to record the R2 key and
   `original_bytes`.

If steps 4 or 5 fail — dropped connection, guest closes the tab, storage
full — the photo from step 3 is untouched. The UI should show the
archive copy's progress as secondary, and its failure as a quiet note
rather than an error on the photo itself.

**Why a second RPC.** Guests are anonymous, and the existing RLS lets
`anon` insert photos only through the `security definer` `submit_photo()`
function, never update them (Feature 001 design §3). Recording
`original_path` is an update, so it needs the same trusted-function
treatment:

```sql
create function public.attach_photo_original(
  p_photo_id uuid, p_storage_path text, p_bytes bigint
) returns void language plpgsql security definer as $$
begin
  update public.photos
     set original_path = p_storage_path, original_bytes = p_bytes
   where id = p_photo_id
     and original_path is null                    -- write once
     and created_at > now() - interval '1 hour'   -- only the uploader's own recent photo
     and p_storage_path = 'originals/' || event_id::text || '/' || ...;
end $$;
```

The three guards matter: write-once stops a caller re-pointing an
existing photo's original, the time window stops anyone attaching to
arbitrary historical photos, and the path check stops a row pointing at
an object belonging to another event. Anonymous callers can reach this
function, so it must not trust its arguments — the same reasoning that
put upload-window enforcement inside `submit_photo()` rather than in
client code.

## 3a. The signing endpoint

R2 credentials must never reach the browser, so uploads go through a
presigned URL minted by a Next.js route handler (e.g.
`POST /api/originals/sign`). **Guests are anonymous, which makes this
the most exposed surface in the app** — an ungated presigner is an open
write endpoint into your bucket, and it must be treated with the same
suspicion `submit_photo()` already applies to its arguments.

It must, server-side:

- Verify the event exists, that its `photo_quality` is `archive`, and
  that the upload window is currently open — the same gate
  `submit_photo()` enforces, not a client claim.
- **Choose the object key itself** (`originals/{event_id}/{uuid}.jpg`)
  rather than signing a key the caller supplied. A caller-chosen key is
  a request to overwrite anything in the bucket.
- Constrain the signed request: cap `Content-Length` to a sane maximum
  photo size, pin the content type, and give the URL a short expiry
  (minutes, not hours).
- Refuse when the archive is at its ceiling (§5), so the client's stale
  view of usage is never what decides.

Credentials live in Vercel environment variables (account id, bucket,
access key id, secret) and are read only inside the route handler.
R2 also needs a CORS rule permitting `PUT` from the app's origin, which
is easy to forget and produces a browser-only failure that never appears
in server logs.

## 4. Where originals must never be used

State this as a rule because it is easy to violate by accident later:
the slideshow, the review queue, the one-at-a-time view, and all library
grids load `storage_path`. Only an explicit download action loads
`original_path`. A future thumbnail (Feature 004 design §5, deferred)
would sit below the display copy, giving a ladder of thumb → display →
original, with each screen using the smallest that will do.

(Once display reads are signed, §6, "loads `storage_path`" becomes
"signs `storage_path`" — the rule is unaffected: a screen signs the
display copy, only a download signs the original.)

## 5. Storage accounting and graceful degradation (US-20)

Splitting the stores splits the budget, and the two behave differently
enough that collapsing them into one "storage used" number would
mislead:

| | Budget | Filled by | Pressure |
|---|---|---|---|
| Supabase Storage | 1GB | display copies, every mode | The real constraint — ~1,500 photos across all events |
| Cloudflare R2 | 10GB | originals, Archive mode only | Roomy — ~2,500 originals, and egress is free |

Summing object sizes on demand is slow and unbounded in both stores,
which is why §2 records bytes at upload time. `sum(display_bytes)` and
`sum(original_bytes)` are then cheap enough to show on the manage page
beside the existing counts.

- Show both, labelled by what they mean to the organizer ("photos" vs
  "archived originals") rather than by vendor.
- Warn visibly as either approaches its ceiling (~85%).
- At the Supabase ceiling, uploads genuinely cannot continue — this is
  the one that breaks an event, and it is why the display side still
  needs the warning even though the archive side is now roomy.
- At the R2 ceiling, the signing endpoint (§3a) refuses and the client
  stops attempting step 4. Display copies keep uploading, so the event
  carries on and only the archive stops growing. The organizer sees why;
  the guest sees nothing unusual, because this is not their problem to
  solve.

Both ceilings are enforced server-side — in the RPC and in the signing
endpoint — because the client's view of usage is necessarily stale.

## 6. Privacy

Feature 001 accepted a public-read bucket with unguessable UUID paths,
noting that a photo's file stays fetchable by direct URL until deleted,
and that organizers should be told not to use it for sensitive photos.
That tradeoff was made about 1600px display copies for a proof of
concept.

Archive mode stores **full-resolution photographs of children**. The
exposure would have been the same in kind — an unguessable URL, never
linked — but the consequence of one leaking is meaningfully worse, and
the audience for this app is scouting units.

Choosing R2 resolves this rather than deferring it. R2 buckets are
private by default; originals are written through a presigned PUT (§3a)
and read through a presigned GET that expires. There is no public URL
for an original, so there is nothing to leak that stays valid. Download
links must therefore be minted per request and kept short-lived, and
must never be embedded in a page that gets cached or shared.

### Display copies: decided, and it is not "unchanged"

The previous version of this section said display copies "remain
public-read on Supabase, unchanged", on the grounds that a 1600px copy
of a photo already on a screen in a public room is a smaller exposure
than the 12MP original. That defence does not survive contact with what
public-read actually means here:

- The URL is **permanent**. It outlives the slide, the event, and the
  organizer's attention.
- It survives **rejection**. Feature 001 §3 wrote this down as an
  accepted MVP tradeoff — a rejected photo's file stays fetchable by
  direct URL until someone deletes the photo. The one moderation action
  whose entire purpose is "this should not be visible" does not make it
  un-fetchable.
- It survives **removal from the slideshow**, which Feature 002 US-9
  promises is non-destructive and reversible — true of the row, not of
  the file's reachability.
- It is **not revocable**: once a URL has been seen, copied, put in a
  browser history, or pasted into a group chat, there is no action in
  the app that invalidates it short of deleting the photo.

Against constitution principle 2 — these photographs are the most
sensitive thing the system holds — "smaller than the original" is not a
standard. **Decision: display copies stop being public-read.**

**How: a private Supabase bucket read through signed URLs, not a move to
R2.** §1a argues the store; this is the access-control half of the same
decision, and Supabase wins it for a reason R2 cannot match — the
predicate that decides who may read a display copy is already written,
in SQL, next to the rows it reads:

- Make the `photos` bucket private. Reads go through
  `createSignedUrl(s)`, which is batchable, so a grid page costs one
  call and not one per cell.
- Gate signing with an RLS policy on `storage.objects` that mirrors the
  policy already on `photos` (Feature 002 design §3): the object is
  signable by an anonymous caller only while a `photos` row with that
  `storage_path` is `approved` **and** `in_slideshow`, and by the owning
  organizer at any status. The enforcement point stays RLS, per
  PROJECT.md; no new endpoint, no second copy of the rule, and no
  credentials anywhere near the client.

What that buys is not secrecy from someone standing in the room — the
slideshow is public by design and anyone who can see the screen can see
the photos. It is **revocability and status-gating**: a rejected photo
becomes unfetchable, a photo pulled from the slideshow becomes
unfetchable, a leaked URL dies on its own, and nothing is enumerable or
permanent. That is the exposure the constitution actually objects to.

**Why it is not built in this feature.** It touches the read path of
every screen in the app — slideshow, review queue, one-at-a-time, three
paginated grids — which is the hot path this feature has deliberately
left alone, and it has one genuinely hard problem of its own: a
slideshow runs unattended for hours, so signatures must be re-minted
without anyone present (§1a). Folding that into a feature about quality
modes would put Phases 1-2, which touch neither store's arrangement,
behind it. So it is scheduled as its own feature.

**What happens to the photos already there.** Nothing moves: the objects
stay at `{event_id}/{uuid}.jpg` in the same bucket, and no `photos` row
changes, which is most of why this direction was chosen over relocating
bytes to another vendor. The migration is a bucket flag plus a policy,
not a copy job. But it is not a no-op either, and the follow-on feature
owns these:

- **Every existing public URL stops working at the moment of the flip.**
  That is the point — it is the revocation this decision is for — but it
  means any link previously copied out of the app, pasted into a chat,
  or bookmarked dies. That is acceptable and should be stated to
  organizers rather than discovered by them.
- **Every screen must be converted in the same deploy as the flip**, or
  it shows broken images. This is the one change in this project where
  the code cannot go first and degrade gracefully (PROJECT.md,
  "Migrations and deploy order") — the safe order is code that signs but
  tolerates a still-public bucket, deployed first, then the flip.
- **Signed URLs must not destroy client caching.** A browser caches by
  full URL including query string, so a signature that differs per
  request produces a URL it has never seen: no `ETag` to revalidate
  against, no `immutable` entry to reuse, and therefore a **full 200
  download per slide** — worse than today's `no-cache` + 304 behaviour
  (§1b), and it would undo T2.3 entirely. Mint URLs with an expiry
  rounded to a fixed boundary, so every client in a window gets a
  byte-identical URL, and re-sign on a schedule rather than per render.
  Getting this wrong is the one way this privacy change could make the
  projector *less* reliable than leaving it public-read — a bad trade
  however good the privacy is.

Two things that must not be lost in the handoff:

- **The deferral is now bounded.** Feature 001 §7 listed "private
  storage + signed URLs" as an open non-goal and it stayed open for five
  features. It is no longer a "worth revisiting"; it is decided, and
  what remains is scheduling. `CONSTITUTION.md`'s open decision 1
  records it as such.
- **This does not close Feature 007's byte-level risk.** A private
  bucket changes who may *read*; guests still write directly to Storage
  under a blanket anonymous INSERT policy, so the residual risk 007
  records stays exactly as it recorded it. The fix for that is routing
  guest *writes* through a gated signed URL, the shape §3a uses for R2 —
  still its own change, and not to be mistaken for this one.

## 7. Interaction with bulk ZIP download

Originals are only worth storing if they can be retrieved. The bulk
download deferred since Feature 001 §7 is what makes this feature pay
off, and it is the natural consumer of `original_path`. Not in scope
here, but these two should be scheduled as a pair.
