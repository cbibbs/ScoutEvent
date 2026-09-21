# Design: Upload Abuse Protection

Traces to `requirements.md` in this directory. Extends `submit_photo()`
(Feature 001 design §3) and the slideshow gating built in Feature 005
design §2.

## 1. Why not rate limiting

The obvious control is "limit uploads per person", and it is worth
recording why neither available version of that is used, so it isn't
reintroduced later as an oversight.

**Per IP address is actively harmful here.** Everyone at an event is on
the same venue wifi behind one NAT, so the whole troop shares a single
address. A per-IP limit would throttle forty honest guests as one, while
an abuser steps off wifi onto cellular and gets a fresh address. It has
the failure mode backwards: maximum friction for the people it should
not touch, near-zero for the one it should.

**Per device requires marking the device.** With no accounts there is no
identity, so this means issuing a token into `localStorage` and storing
it against uploads. It is defeated by a private window, and it means
this app — which currently stores no guest identifier at all beyond an
optional self-declared name — would start storing a per-device tracking
identifier for children's phones. That is a meaningful change to what
the system holds, in exchange for stopping only the laziest abuse.

So the cap is on **the event as a whole**, which protects the thing that
actually needs protecting (shared storage, and therefore every other
event) and requires knowing nothing about who anyone is. The cost is
stated in requirements.md: one person can still fill one event.

## 2. Per-event cap

```sql
alter table public.events
  add column photo_limit int not null default 500;
```

Enforced inside `submit_photo()`, which is already the single trusted
gate for anonymous inserts:

```sql
if (select count(*) from public.photos where event_id = p_event_id)
     >= v_event.photo_limit then
  raise exception 'event photo limit reached';
end if;
```

Counting all rows regardless of status is deliberate: a rejected photo
still occupies storage until it is deleted, so it should still count
against the event. Deleting photos frees capacity, which makes the
organizer's existing bulk-delete the natural remedy when an event fills
up with junk.

500 is a starting figure, not protocol — roughly a third of what the
1GB free tier holds at Feature 002's compression, so a single event
cannot starve the next two. It is a column rather than a constant
precisely so an organizer can raise it mid-event (US-22): principle 3
says an event happens once, and "the app says we're full, come back
never" is not an acceptable thing to discover at a campout.

Feature 006's storage warnings cover the complementary case — several
well-behaved events collectively approaching the quota. This cap bounds
any *one* event; that warning watches the *total*. Both are needed and
neither substitutes for the other.

## 3. File size, enforced where the client can't argue

The 15MB check in `UploadForm` is a client-side courtesy; anything
calling Storage directly ignores it. Set a `file_size_limit` on the
`photos` bucket itself (Supabase supports this per bucket) so the
storage layer refuses oversized objects regardless of caller.

Size it above what the compression pipeline legitimately produces with
headroom — a few MB covers Feature 006's Sharp mode comfortably. Note
that Feature 006's originals go to R2, not this bucket, and need their
own limit pinned in the signing endpoint's presigned request.

## 4. Gating the join QR on moderation (US-21)

Feature 005 already passes the event's upload window into `Slideshow`
and re-evaluates it as the show runs, precisely so a long-running screen
reflects reality rather than page-load state. Moderation is the same
shape of problem and gets the same treatment: pass
`moderation_enabled` down, and include it in the values the 30s poll
already re-reads from `events`.

The QR's visibility condition becomes "uploads are open **and**
moderation is enabled". Nothing else about Feature 005 changes.

Where moderation is turned off in `EventSettingsForm`, say what it
costs — something to the effect that the slideshow's join QR only
appears while review is on, so nothing reaches the screen unseen. The
organizer keeps the shareable link either way; what they lose is the
broadcast invitation to a roomful of strangers.

## 5. Stop uploads now (US-23)

The mechanism already exists: `upload_ends_at` in the past closes
uploads, and both `submit_photo()` and Feature 005's QR gating already
honour it live. So the control is one update —
`upload_ends_at = now()` — and the rest of the system reacts on its own
within a poll. Resuming clears it back (or pushes it out), which is why
this is a pause rather than an ending.

Building it on the existing field rather than a new `uploads_paused`
column avoids two sources of truth for "can anyone upload right now",
which would inevitably disagree.

Placement and styling matter more than the logic here. This is reached
while flustered, in front of people, so it belongs at the top of the
manage page near the event's status, not buried in the settings form.
It must be unmistakably **not** destructive — Feature 003 US-11 is the
precedent: an organizer reaching for "make it stop" must not be able to
land on "delete everything". Label it for what it does ("Stop uploads"
/ "Resume uploads"), show current state plainly, and keep it visually
distinct from Delete.

## 6. What the guest sees

Two new refusals, both of which must read as a state of the event rather
than a fault of the guest or an app error:

- **Event full**: "This event has reached its photo limit — let the
  organizer know." Not "upload failed".
- **Uploads stopped**: reuse the existing closed-window message; from
  the guest's side a paused event and a finished one are the same thing.

`submit_photo()` raises distinguishable errors for these so `UploadForm`
can tell them apart from a network failure, which it already retries.
A retry button on "the event is full" would be actively unhelpful.
