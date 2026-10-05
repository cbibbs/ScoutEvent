-- Lets an event's owner actually delete that event's photo files.
-- Fixes the bug where deleting a photo from Manage Event removed the
-- `photos` row and silently left the image in Storage forever.
-- Additive on top of 20260913000000_init.sql and
-- 20260921000000_upload_abuse_protection.sql (both already applied to the
-- live project) — run this once after those.
--
-- Why this is needed
-- ------------------
-- storage.objects has an INSERT policy and a DELETE policy but, until
-- now, no SELECT policy at all. What is established:
--   * The supabase-js documentation for `remove()` lists the permissions it
--     needs on the objects table as both `delete` and `select`.
--   * Before this migration there was no SELECT policy, so the owner had
--     only `delete`.
--   * Guest uploads are unaffected: `upload()` of a new file documents only
--     `insert`, and this migration touches nothing about that.
-- What is believed, not proven: that Storage's delete reads the rows it
-- removes (it reports back what it deleted), that reading them is subject
-- to the SELECT policies, and that with none the owner's DELETE policy
-- therefore matches zero rows. Zero rows is not an error: `remove()`
-- resolves with `{ data: [], error: null }`, the application sees
-- "success", and the file stays. That is the best-supported explanation for
-- the symptom (photo rows deleted, files left behind), not a demonstrated
-- mechanism; it has not been reproduced against a live Storage service.
-- Images kept displaying because the bucket is public and public reads
-- bypass RLS, which is why nobody saw it.
--
-- What this adds, and what it deliberately does not
-- -------------------------------------------------
-- SELECT on storage.objects for the owner of the event whose id is the
-- first path segment — the exact predicate of the DELETE policy in
-- 20260921000000_upload_abuse_protection.sql, and nothing wider:
--   * `to authenticated` only. anon gets nothing. (Anonymous co-approver
--     sessions also carry the `authenticated` role, but the predicate
--     compares the event's organizer_id to auth.uid(), which an anonymous
--     session never equals, so they see and delete nothing — deletion
--     stays owner-only, specs/PROJECT.md "Access control" rule 2.)
--   * It widens who can *enumerate* files through the Storage API from
--     nobody to the owner of that event, for that event's folder. It does
--     not widen who can *fetch* a file: the bucket is public-read and the
--     public endpoint never consulted RLS. CONSTITUTION.md principle 2
--     asks for a recorded decision when reach widens; this is it — owner
--     of the event, own folder, enumeration only.
--   * Feature 006's planned private bucket needs its own SELECT policy
--     (organizer branch = can_moderate_event, Feature 009 §11). Policies
--     are OR-ed, so this one can stay beside it or be folded into it;
--     it must not be assumed to be that policy.
--
-- After applying, verify as the owner (signed in, browser console or a
-- throwaway script): `supabase.storage.from('photos').remove([path])`
-- should resolve with `data` containing one entry for that path, not `[]`.
-- That check is what confirms the explanation above; if `data` is still
-- `[]` for a file that exists, the cause is something else. The app only
-- deletes the photo row after it has seen the file go (or confirmed it is
-- already gone).

drop policy if exists "organizers read their event photo files" on storage.objects;
create policy "organizers read their event photo files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(storage.objects.name))[1]
        and e.organizer_id = auth.uid()
    )
  );
