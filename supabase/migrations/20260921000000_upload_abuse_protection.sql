-- Bounds how much any one event can upload and lets the organizer stop
-- uploads in one action.
-- Implements specs/007-upload-abuse-protection/design.md §2, §3, §4 and
-- §5. Additive on top of 20260913000000_init.sql and
-- 20260914000000_slideshow_curation.sql (both already applied to the
-- live project) — run this once after those.

-- ---------------------------------------------------------------------
-- Per-event photo cap (design.md §2). A column, not a constant, so an
-- organizer can raise it mid-event (US-22) — principle 3 says an event
-- happens once, and "the app says we're full, come back never" is not
-- acceptable to discover at a campout. 500 is a starting figure, not
-- protocol: roughly a third of the 1GB free tier at Feature 002's
-- compression, so one event can't starve the next two.
--
-- The check constraint is not decoration: a number input cleared by the
-- organizer yields "", Number("") === 0, and a client-side `min` alone
-- does not stop a non-required empty field from submitting. Without this
-- constraint an organizer retyping the limit mid-thought could save 0 and
-- make their event permanently full — inside the recovery path US-22
-- exists to provide. The client refuses this too (EventSettingsForm); the
-- constraint is the backstop, not the whole answer.
-- ---------------------------------------------------------------------

alter table public.events
  add column if not exists photo_limit int not null default 500;

alter table public.events
  drop constraint if exists events_photo_limit_check;
alter table public.events
  add constraint events_photo_limit_check check (photo_limit > 0);

-- ---------------------------------------------------------------------
-- Stop uploads now (US-23, design.md §5 — corrected after review).
--
-- This is a dedicated flag, not a reuse of upload_ends_at. An earlier
-- version of this migration set upload_ends_at = now() for "Stop" on the
-- reasoning that a separate flag would be "two sources of truth". That
-- was wrong: "open = not paused AND within the window" is one rule over
-- two inputs, not two sources of truth. Conflating a schedule (what the
-- organizer configured in advance) with a pause (what they hit in the
-- moment) into upload_ends_at destroyed information in both directions —
-- Resume had nowhere to restore a configured close time from, and
-- EventSettingsForm's own save (which writes upload_ends_at back from
-- state captured at mount) could silently undo a Stop the next time the
-- organizer saved an unrelated setting. A dedicated column removes both
-- failure modes: the schedule is untouched by Stop/Resume, and
-- EventSettingsForm must never write this column — Stop/Resume is its
-- only writer.
-- ---------------------------------------------------------------------

alter table public.events
  add column if not exists uploads_paused boolean not null default false;

-- ---------------------------------------------------------------------
-- event_photo_count(): the accurate, RLS-independent photo count used by
-- the pre-upload advisory check (design.md §3) and by the public
-- slideshow/guest pages to gate on "is this event full" (design.md §4).
--
-- A plain anonymous `select count(*) from photos` cannot answer this: the
-- SELECT policy on photos only exposes approved-and-in-slideshow rows (or
-- an organizer's own), so it would undercount an event with anything
-- pending or rejected — exactly the events most likely to be near their
-- cap. security definer bypasses that the same way submit_photo() does,
-- exposing only the aggregate number, never the rows themselves.
-- ---------------------------------------------------------------------

create or replace function public.event_photo_count(p_event_id uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int from public.photos where event_id = p_event_id;
$$;

grant execute on function public.event_photo_count(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- submit_photo(): rejects once the event's photo count reaches its
-- limit, and once uploads are paused. Counts rows of every status — a
-- rejected photo still occupies storage until deleted, so it still
-- counts against the event, which makes the organizer's existing
-- bulk-delete the natural remedy for an event filled with junk
-- (design.md §2). Each new refusal raises a message distinguishable from
-- the others so UploadForm can tell "event is full" (no retry) apart
-- from "paused" (reads as closed to the guest, design.md §6) and from a
-- network failure.
-- ---------------------------------------------------------------------

create or replace function public.submit_photo(
  p_event_id uuid,
  p_storage_path text,
  p_uploader_name text default null,
  p_width int default null,
  p_height int default null
)
returns public.photos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_status text;
  v_photo public.photos;
begin
  select * into v_event from public.events where id = p_event_id;

  if v_event.id is null then
    raise exception 'event not found';
  end if;

  if v_event.upload_starts_at is not null and now() < v_event.upload_starts_at then
    raise exception 'uploads have not opened yet for this event';
  end if;

  if v_event.upload_ends_at is not null and now() > v_event.upload_ends_at then
    raise exception 'uploads are closed for this event';
  end if;

  if v_event.uploads_paused then
    raise exception 'uploads are paused for this event';
  end if;

  if (select count(*) from public.photos where event_id = p_event_id)
       >= v_event.photo_limit then
    raise exception 'event photo limit reached';
  end if;

  v_status := case when v_event.moderation_enabled then 'pending' else 'approved' end;

  insert into public.photos (event_id, storage_path, uploader_name, status, in_slideshow, width, height)
  values (
    p_event_id,
    p_storage_path,
    nullif(trim(p_uploader_name), ''),
    v_status,
    not v_event.moderation_enabled,
    p_width,
    p_height
  )
  returning * into v_photo;

  return v_photo;
end;
$$;

-- ---------------------------------------------------------------------
-- Storage cleanup (design.md §3). UploadForm PUTs the file to Storage
-- *before* calling submit_photo(), so a refusal (closed, paused, or
-- full) leaves the object behind. The only DELETE policy on
-- storage.objects was `to authenticated` and keyed to a matching
-- `photos` row — which an orphan, by definition, does not have — so
-- organizers could not remove these through the app at all. Widened to
-- match on the event folder itself (same pattern as the anon INSERT
-- policy below), so an organizer can delete any object under their own
-- event's folder whether or not a photos row points at it.
-- ---------------------------------------------------------------------

drop policy if exists "organizers delete their event photo files" on storage.objects;
create policy "organizers delete their event photo files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(storage.objects.name))[1]
        and e.organizer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Bucket file size limit (design.md §3 — corrected after review).
-- storage.buckets is an ordinary table (Feature 001's migration already
-- inserts into it), so this belongs in the SQL everything else is
-- applied with, not a dashboard click someone has to remember for a
-- named mitigation. 8MB is headroom above what the compression pipeline
-- produces (~0.6MB as of Feature 001; Feature 006's Sharp mode is still
-- comfortably under this). README.md documents this as what the
-- migration does, not as a separate action to take.
-- ---------------------------------------------------------------------

update storage.buckets
  set file_size_limit = 8 * 1024 * 1024
  where id = 'photos';

-- ---------------------------------------------------------------------
-- Realtime for events (design.md §5 — corrected after review). The 30s
-- poll alone is too slow for Stop: the window's effect is recomputed
-- against the clock every slide tick, but a pause can only be *learned*,
-- so on the poll alone the projector could keep inviting scans for up to
-- thirty seconds after the organizer hits Stop — while they stand there
-- watching it not work, which is the exact scenario US-23 exists for.
-- The slideshow subscribes to its own event row so a pause lands in
-- about as long as an approval does; the poll stays as the self-healing
-- fallback, same as it already is for photos. Anonymous clients can
-- already read all of `events` (the existing "events are viewable by
-- everyone" policy), so this exposes nothing new.
-- ---------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.events;
exception
  when duplicate_object then null;
end $$;
