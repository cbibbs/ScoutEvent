# Design: Photo Quality & Keeping Originals

Traces to `requirements.md` in this directory. Extends Feature 002's
compression decision (design §4 there) and Feature 001's storage/RLS
model (design §2-3 there).

## 1. The three modes, and what each actually stores

| Mode | Display copy | Archive copy | Per photo | Photos per free GB |
|---|---|---|---|---|
| **Fast** (default) | 1600px, ~0.6MB | — | ~0.6MB | ~1,500 |
| **Sharp** | 2560px, ~1.5MB | — | ~1.5MB | ~650 |
| **Archive** | 1600px, ~0.6MB | original, ~3-5MB | ~4-6MB | ~250 |

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
usage honestly without knowing the size of every object, and Storage
does not make that cheap to aggregate after the fact.

## 3. Upload sequencing (US-19)

The ordering is the requirement, not an optimization: **the photo must
become real before the archive copy is attempted.**

1. Compress to the display size for the event's mode.
2. Upload the display copy to `{event_id}/{uuid}.jpg`.
3. Call `submit_photo()` — the photo now exists, is visible to the
   organizer, and enters the slideshow exactly as fast as it does today.
4. Only in Archive mode, and only now: upload the untouched original to
   `originals/{event_id}/{uuid}.jpg`.
5. Call a new `attach_photo_original()` RPC to record `original_path`
   and `original_bytes`.

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

## 4. Where originals must never be used

State this as a rule because it is easy to violate by accident later:
the slideshow, the review queue, the one-at-a-time view, and all library
grids load `storage_path`. Only an explicit download action loads
`original_path`. A future thumbnail (Feature 004 design §5, deferred)
would sit below the display copy, giving a ladder of thumb → display →
original, with each screen using the smallest that will do.

## 5. Storage accounting and graceful degradation (US-20)

Summing object sizes from Storage on demand is slow and unbounded, which
is why §2 records the bytes at upload time. Usage per event is then
`sum(display_bytes) + sum(original_bytes)`, cheap enough to show on the
manage page beside the existing counts.

- Show usage against the free allowance (1GB — a documented constant,
  not a value the app can discover).
- Warn the organizer visibly as usage approaches it (~85%).
- At the ceiling, `attach_photo_original()` stops recording and the
  client stops attempting step 4 — display copies keep uploading, so the
  event keeps working and only the archive stops growing. The organizer
  sees why; the guest sees nothing unusual, because this is not their
  problem to solve.

The check belongs server-side in the RPC as well as client-side, since
the client's view of usage is necessarily stale.

## 6. Privacy: this raises the stakes on an accepted tradeoff

Feature 001 accepted a public-read bucket with unguessable UUID paths,
noting that a rejected photo's file stays fetchable by direct URL until
deleted, and that organizers should be told not to use it for sensitive
photos. That tradeoff was made about 1600px display copies.

Archive mode stores **full-resolution photographs of children** under
the same policy. The exposure is the same in kind — an unguessable URL,
never linked — but the consequence of a leaked URL is meaningfully
worse, and the audience for this app is scouting units.

This feature does not change the policy, but it should not inherit it
silently either. Two honest options, and this deserves an explicit
decision rather than a default:

1. Ship Archive mode on the current public bucket, and say plainly in
   the organizer-facing copy what is being stored and under what
   protection.
2. Take the deferred "private bucket + signed URLs" item (Feature 001
   design §7) as a prerequisite for Archive mode specifically, leaving
   Fast and Sharp on the current arrangement.

Recommendation: option 2 if Archive mode is going to be used for real
events with youth in frame. The work is bounded — originals are already
being written to their own path prefix, so making *that* prefix private
and issuing signed URLs for download is a smaller change than converting
the whole bucket, and it does not touch the slideshow's hot path at all.

## 7. Interaction with bulk ZIP download

Originals are only worth storing if they can be retrieved. The bulk
download deferred since Feature 001 §7 is what makes this feature pay
off, and it is the natural consumer of `original_path`. Not in scope
here, but these two should be scheduled as a pair.
