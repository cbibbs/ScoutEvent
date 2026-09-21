-- Bounds how much any one event can upload and lets the organizer stop
-- uploads in one action, without adding a second source of truth for
-- "can anyone upload right now".
-- Implements specs/007-upload-abuse-protection/design.md §2 and §5.
-- Additive on top of 20260913000000_init.sql and
-- 20260914000000_slideshow_curation.sql (both already applied to the
-- live project) — run this once after those.

-- ---------------------------------------------------------------------
-- Per-event photo cap (design.md §2). A column, not a constant, so an
-- organizer can raise it mid-event (US-22) — principle 3 says an event
-- happens once, and "the app says we're full, come back never" is not
-- acceptable to discover at a campout. 500 is a starting figure, not
-- protocol: roughly a third of the 1GB free tier at Feature 002's
-- compression, so one event can't starve the next two.
-- ---------------------------------------------------------------------

alter table public.events
  add column if not exists photo_limit int not null default 500;

-- ---------------------------------------------------------------------
-- submit_photo(): now also rejects once the event's photo count reaches
-- its limit. Counts rows of every status — a rejected photo still
-- occupies storage until deleted, so it still counts against the event,
-- which makes the organizer's existing bulk-delete the natural remedy
-- for an event filled with junk (design.md §2). Raises a message
-- distinguishable from the upload-window errors so UploadForm can tell
-- "event is full" (no retry) apart from a network failure (design.md §6).
--
-- Stop-uploads (US-23) needs no change here: it reuses the existing
-- upload_ends_at column, so the window checks below already cover it.
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
