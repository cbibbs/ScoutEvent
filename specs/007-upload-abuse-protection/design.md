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
  add column photo_limit int not null default 500
    check (photo_limit > 0);
```

The check constraint is not decoration. A number input cleared by the
organizer yields `""`, `Number("") === 0`, and `min={1}` does not stop a
non-required empty field from submitting — so without it, an organizer
selecting the "500" to type "1000" and saving mid-thought sets the limit
to zero and makes their event permanently full. That is inside the
recovery path US-22 exists to provide, which is the worst place for it.
The client must also refuse to submit a blank or non-positive value;
the constraint is the backstop, not the whole answer.

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

## 3. Bytes, not just rows

**Corrected after review.** §2's cap counts `photos` rows, but the
resource US-22 sets out to protect is bytes in the shared bucket, and
those are written on a different path entirely: `UploadForm` PUTs the
file to Storage *first*, then calls `submit_photo()`. The row cap does
not sit in front of the bytes.

Three consequences, in order of how much they matter:

**Refused uploads leak permanent orphans.** When `submit_photo()`
rejects, `UploadForm` tries to delete the object it just uploaded — and
that delete silently fails for every guest, because the only DELETE
policy on `storage.objects` is `to authenticated`. Worse, that policy
also requires a matching `photos` row (`p.storage_path =
storage.objects.name`), which an orphan by definition lacks, so the
organizer cannot remove it through the app either. Before this feature
that was a rare race against a closing window; the cap makes it a
routine path — a guest tapping "add photos" repeatedly at a full event
leaves ~0.6MB of unreachable garbage per attempt. Two fixes, both
needed:

- **Check the cap before uploading**, not only after. A cheap count
  query before the PUT keeps the common case from ever creating the
  object. This is advisory only — it is not the enforcement point, which
  stays in `submit_photo()` — but it removes the routine orphan path.

  **Advisory means it may be weaker than the enforcement point, never
  stricter.** A pre-check that refuses something the server would have
  accepted is a bug, and a worse one than the orphan it prevents. The
  first implementation compared a *live* count against a `photo_limit`
  captured at page load, so after an organizer raised the limit — the
  US-22 recovery path — every guest with the page already open was
  refused against the old number, told the event was full, and given no
  retry. At a campout that is most of the guests. So: compare live
  against live, or not at all, and **never let the pre-check set the
  non-retryable state.** Only the server's own refusal may do that.

  Extend the same pre-check to the window and pause states while it is
  there. Those refusals leak orphans by exactly the same path, and the
  event state it needs is already being fetched.
- **Let organizers clean up.** Widen the storage DELETE policy so an
  event's owner can delete any object under their own event's folder,
  whether or not a `photos` row points at it. Keying deletion to a row
  that may not exist is what makes orphans unreachable today.

  Be honest about what this does and doesn't buy. It removes the
  *permission* blocker; it does not give anyone a way to find an orphan,
  since nothing in the app enumerates objects without a matching row.
  Cleanup still means the Supabase dashboard. That is an accepted
  limitation, not a solved problem, and building an orphan browser is
  not worth it while the pre-check keeps the routine case from arising.

  Note also that the guest's own attempt to delete the object it just
  uploaded **cannot work and never could** — anon has no DELETE policy
  on `storage.objects`, the call's result is discarded, and it fails
  silently every time. Either drop it or keep it with a comment that
  says so; what it must not do is sit there claiming to clean up.

**Direct Storage writes ignore the cap entirely.** The anon key ships in
the client bundle and the bucket's INSERT policy only checks that the
event folder exists, so a script can write objects without ever calling
`submit_photo()`. The row cap cannot stop this by construction; nothing
short of removing the blanket anon INSERT policy can. That is a real
residual risk and is recorded as one in requirements.md rather than
papered over. The direction that actually closes it is routing guest
uploads through a gated signed URL, exactly as Feature 006 §3a does for
R2 — worth doing as its own change, and explicitly not smuggled into
this one.

**Per-object size.** The 15MB check in `UploadForm` is a client-side
courtesy anything calling Storage directly ignores. Set a
`file_size_limit` on the `photos` bucket itself so the storage layer
refuses oversized objects regardless of caller. Size it above what the
compression pipeline legitimately produces with headroom — a few MB
covers Feature 006's Sharp mode. Feature 006's originals go to R2, not
this bucket, and need their own limit pinned in the presigned request.

**Set it in the migration, not by hand.** `storage.buckets` is an
ordinary table — Feature 001's migration already inserts into it — so
`update storage.buckets set file_size_limit = … where id = 'photos';`
belongs in the same SQL that everything else is applied with. An
acceptance criterion that depends on someone remembering a dashboard
click is not enforced, it is hoped for, and this one is a named
mitigation for the residual byte-level risk. The README step stays as
documentation of what the migration does, not as the mechanism.

None of this makes the row cap useless: it is what stops a *well-behaved
client* from filling the bucket, which is the realistic case here. It
just is not a security boundary for bytes, and US-22 should not be read
as claiming it is.

## 4. Gating the join QR on moderation (US-21)

Feature 005 already passes the event's upload window into `Slideshow`
and re-evaluates it as the show runs, precisely so a long-running screen
reflects reality rather than page-load state. Moderation is the same
shape of problem and gets the same treatment: pass
`moderation_enabled` down, and include it in the values the 30s poll
already re-reads from `events`.

The QR's visibility condition becomes "uploads are open **and** not
paused (§5) **and** moderation is enabled **and** the event is not
full".

Fullness belongs in that list for the reason Feature 005 already gave
for the upload window: "sending a guest to a page that refuses their
upload is worse than showing them nothing". A full event is precisely
that case, and worse than the closed-window one — a guest scans the
projector, picks four photos, waits through compression and upload, and
is refused four times, leaking four orphans (§3) on the way. The
slideshow already re-reads the event on its 30s poll; the photo count
joins it.

For the same reason the guest upload page should show a "this event is
full" state instead of the upload form, rather than letting someone
select photos and only then discover it. That is the same shape as the
existing closed-window state.

**Feature 005's spec must be amended to match** — its US-17 currently
says the QR is visible "the whole time uploads are open" and names the
window as the only gate, which this feature makes false. The
constitution calls amending superseded specs the rule this project
breaks most often; this is that rule.

Where moderation is turned off in `EventSettingsForm`, say what it
costs — something to the effect that the slideshow's join QR only
appears while review is on, so nothing reaches the screen unseen. The
organizer keeps the shareable link either way; what they lose is the
broadcast invitation to a roomful of strangers.

## 5. Stop uploads now (US-23)

**Corrected after review.** This section originally said to implement
Stop as `upload_ends_at = now()`, reusing the existing field on the
grounds that a separate flag would create "two sources of truth for can
anyone upload right now". That reasoning was wrong, and the
implementation built from it had a defect that destroyed the feature in
the exact situation it exists for. Both are recorded here so the
argument isn't made again.

The reasoning was wrong because `open = not paused AND within the
window` is a single rule over two inputs, which is ordinary, not two
sources of truth. What the original actually did was conflate two
different concepts — *a schedule* the organizer configured in advance,
and *a pause* they hit in the moment — into one column. That is
destructive in both directions:

- Resume had nowhere to restore a schedule from, so an organizer who had
  set "uploads close at 22:00", stopped at 20:30 and resumed at 20:35
  ended up with an event that never closes, silently.
- Worse, it created a second *writer* of the field. `EventSettingsForm`
  holds `upload_ends_at` in state captured at mount and writes it back
  on every save, and `router.refresh()` re-renders Server Components
  without resetting client state. So: organizer hits Stop, then does the
  obvious next thing — turns moderation on, presses Save — and the
  stale form silently re-opens uploads *and* puts the join QR back on
  the projector. Nothing tells them. That is the one sequence US-23
  exists for.

So use a dedicated flag:

```sql
alter table public.events
  add column uploads_paused boolean not null default false;
```

- Stop sets it true, Resume sets it false. Neither touches
  `upload_ends_at`, so a configured schedule survives untouched and
  there is nothing to restore.
- `submit_photo()` refuses when `uploads_paused` is true, with its own
  error distinct from the window's.
- Feature 005's QR gating and the slideshow's 30s poll treat it exactly
  as they treat the window — it joins the same polled `select`.
- **But the poll alone is too slow for this one.** The window's effect
  is recomputed on every slide tick against the clock, so it lands
  within a slide. A pause can only be *learned*, so on the poll alone
  the projector can keep inviting scans for up to thirty seconds after
  the organizer hits Stop — while they stand there watching it not
  work, which is the entire scenario US-23 exists for. Add `events` to
  the realtime publication and have the slideshow subscribe to its own
  event row, so a pause lands in about as long as an approval does. The
  poll stays as the self-healing fallback, exactly as it does for
  photos; this is the established pattern in this codebase, not a new
  one. Anonymous clients can already read `events`, so this exposes
  nothing new.
- `EventSettingsForm` must not write this column at all. The settings
  form owns the schedule; the Stop control owns the pause. One writer
  each.

The general lesson, worth applying beyond this feature: two components
writing the same column, where one caches its value in client state, is
a bug waiting for a coincidence. `router.refresh()` does not reset
client state.

Placement and styling matter more than the logic here. This is reached
while flustered, in front of people, so it belongs at the top of the
manage page near the event's status, not buried in the settings form.
It must be unmistakably **not** destructive — Feature 003 US-11 is the
precedent: an organizer reaching for "make it stop" must not be able to
land on "delete everything". Label it for what it does ("Stop uploads"
/ "Resume uploads"), show current state plainly, and keep it visually
distinct from Delete.

The control must render whatever state the event is in, including before
its window has opened — an organizer setting up early still needs to be
able to pause.

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

## 7. The organizer's counts must be live

US-22 requires warning the organizer *before* the limit is reached, and
a count captured at page load cannot do that. The manage page is meant
to be left open all day — that is the whole premise of Feature 003's
live review queue — so a control reading "12 / 500 photos" in neutral
grey while uploads are actually being refused is worse than showing
nothing: it actively reassures. The first signal would be a guest
mentioning uploads are broken.

`PhotoManager` on the same screen already does this correctly, and
`specs/PROJECT.md` states the rule: counts come from the server, on the
existing poll, never from arithmetic on payloads. The upload-status
control follows the same rule rather than inventing a different one.
Two components on one screen disagreeing about the same number is its
own bug, independent of which is stale.

The event's upload state (open / paused / closed) is on the same footing
and refreshes the same way.

**One number, one source.** The manage page header already renders a
photo total from the server render, and it does not refresh. Adding a
second, live count beside it produces two figures for the same thing
that disagree from the first upload onward — which is the bug this
section names, regardless of which one is right. Render it once and
share it, or make the header live too; do not ship both.

For the same reason, the poll interval belongs in
`components/manage/constants` where `PhotoManager` and `Slideshow`
already read it from, not redeclared per component. Three copies of
"30 seconds" is three things to forget to change.

Finally, the at-limit message should say what actually frees capacity.
The cap counts rows of every status, so *rejecting* junk photos does
not help — only deleting them does. Telling an organizer to raise the
limit while omitting that is steering them away from the remedy that
costs nothing.
