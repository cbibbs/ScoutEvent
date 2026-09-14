-- Adds slideshow curation, decoupled from moderation status.
-- Implements specs/002-review-and-slideshow-curation/design.md.
-- Additive on top of 20260913000000_init.sql (already applied to the
-- live project) — run this once after that migration.

alter table public.photos
  add column if not exists in_slideshow boolean not null default false;

-- Public/anon visibility now requires both an approved status AND the
-- organizer having the photo currently toggled into the slideshow.
drop policy if exists "approved photos are viewable by everyone" on public.photos;
drop policy if exists "approved and in-slideshow photos are viewable by everyone" on public.photos;
create policy "approved and in-slideshow photos are viewable by everyone"
  on public.photos for select
  using (
    (status = 'approved' and in_slideshow)
    or exists (
      select 1 from public.events e
      where e.id = photos.event_id and e.organizer_id = auth.uid()
    )
  );

-- submit_photo(): auto-approved uploads (moderation off) also start in
-- the slideshow; moderated uploads wait for organizer review.
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
