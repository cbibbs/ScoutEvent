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

The two copies live in **different stores** — see §1a. Display copies
stay in Supabase Storage where the rest of the app already reads them;
originals go to Cloudflare R2, whose free tier is 10GB and, critically,
charges nothing for egress.

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

## 1a. Why originals go to R2, not Supabase

Storage is the obvious reason — 10GB against Supabase's 1GB, which is
already shared with display copies — but it is not the deciding one.

**Egress is.** The entire point of keeping originals is getting them
back out again, and a bulk download is the largest single transfer this
app will ever do: 300 archived photos at ~4MB is ~1.2GB, most of
Supabase's 2GB monthly allowance spent in one click, on the one action
the archive exists for. An organizer who downloads two events in a month
would exhaust it. R2 does not charge for egress at all, which turns the
feature from "technically possible, practically rationed" into something
an organizer can just use.

**It also settles the privacy question** that §6 would otherwise leave
open. R2 buckets are private by default and are read through presigned,
expiring URLs — which is exactly the "private bucket + signed URLs"
mitigation deferred since Feature 001 §7. Full-resolution photographs of
children therefore never sit behind nothing but an unguessable URL.

What it costs, stated honestly:

- **A second vendor.** Feature 001 §1 chose one vendor deliberately, for
  fewer moving parts and fewer free tiers to watch. This spends that on
  purpose, and only for originals: if R2 is misconfigured, unreachable,
  or abandoned later, every screen in the app keeps working, because
  nothing but the download path reads from it.
- **A server-side signing endpoint** (§3a) — browsers cannot write to R2
  without a presigned URL, and R2 credentials must never reach the
  client. This is new surface for an app that has had no backend of its
  own. A serverless route handler is still nothing to patch or scale, so
  it bends rather than breaks the constitution's "no app-specific
  backend to operate", but it is a real change in shape and should be
  recognized as one.
- **Verify before committing:** R2 is understood to require a payment
  method on file even within the free allowance. The constitution
  forbids *silently* incurring charges, so confirm both that fact and
  what happens at the 10GB boundary — whether it refuses writes or
  starts billing — before this ships. If it bills silently, that changes
  the recommendation.

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

**Display copies remain public-read on Supabase**, unchanged. That is a
deliberate, narrower version of the original tradeoff: the 1600px copy
of a photo already being shown on a screen in a public room is a
materially smaller exposure than the 12MP original, and moving it would
mean signing every image in the slideshow and every grid thumbnail —
touching the hot path this feature has otherwise been careful to leave
alone. Worth revisiting on its own merits (see the production readiness
review), but not as a side effect of this feature.

## 7. Interaction with bulk ZIP download

Originals are only worth storing if they can be retrieved. The bulk
download deferred since Feature 001 §7 is what makes this feature pay
off, and it is the natural consumer of `original_path`. Not in scope
here, but these two should be scheduled as a pair.
