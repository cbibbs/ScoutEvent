-- ScoutEvent initial schema, RLS, and storage setup.
-- Implements specs/001-photo-collection-slideshow/design.md §§2-3.
-- Run once in the Supabase SQL Editor for a fresh free-tier project
-- (see README.md "Setting up Supabase").

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  event_date date,
  upload_starts_at timestamptz,
  upload_ends_at timestamptz,
  moderation_enabled boolean not null default true,
  slideshow_interval_seconds int not null default 5,
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  storage_path text not null,
  uploader_name text,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index if not exists photos_event_status_created_idx
  on public.photos (event_id, status, created_at);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.photos enable row level security;

drop policy if exists "events are viewable by everyone" on public.events;
create policy "events are viewable by everyone"
  on public.events for select
  using (true);

drop policy if exists "organizers manage their own events" on public.events;
create policy "organizers manage their own events"
  on public.events for all
  to authenticated
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

drop policy if exists "approved photos are viewable by everyone" on public.photos;
create policy "approved photos are viewable by everyone"
  on public.photos for select
  using (
    status = 'approved'
    or exists (
      select 1 from public.events e
      where e.id = photos.event_id and e.organizer_id = auth.uid()
    )
  );

-- Guests never get a direct INSERT policy on photos: all inserts go
-- through submit_photo() below, which enforces the upload window and
-- sets the initial status (design.md §3).

drop policy if exists "organizers update photos on their events" on public.photos;
create policy "organizers update photos on their events"
  on public.photos for update
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = photos.event_id and e.organizer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = photos.event_id and e.organizer_id = auth.uid()
    )
  );

drop policy if exists "organizers delete photos on their events" on public.photos;
create policy "organizers delete photos on their events"
  on public.photos for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = photos.event_id and e.organizer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- submit_photo(): the only way a photo row gets created. Runs as the
-- table owner (security definer) so anonymous guests can call it
-- without an INSERT grant on public.photos directly.
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

  v_status := case when v_event.moderation_enabled then 'pending' else 'approved' end;

  insert into public.photos (event_id, storage_path, uploader_name, status, width, height)
  values (
    p_event_id,
    p_storage_path,
    nullif(trim(p_uploader_name), ''),
    v_status,
    p_width,
    p_height
  )
  returning * into v_photo;

  return v_photo;
end;
$$;

grant execute on function public.submit_photo(uuid, text, text, int, int)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- Realtime: let the slideshow subscribe to photo status changes
-- (design.md §6).
-- ---------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.photos;
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- Storage: a public-read "photos" bucket. Object paths are
-- {event_id}/{uuid}.jpg (unguessable, listing disabled) — see the
-- Security & privacy notes in
-- specs/001-photo-collection-slideshow/requirements.md.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "anyone can upload photos for a real event" on storage.objects;
create policy "anyone can upload photos for a real event"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

drop policy if exists "organizers delete their event photo files" on storage.objects;
create policy "organizers delete their event photo files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.photos p
      join public.events e on e.id = p.event_id
      where p.storage_path = storage.objects.name
        and e.organizer_id = auth.uid()
    )
  );
