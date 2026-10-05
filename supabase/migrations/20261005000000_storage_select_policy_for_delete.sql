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
-- now, no SELECT policy at all. Storage's `remove()` is not a bare
-- `DELETE FROM storage.objects WHERE id = ...`: it filters on bucket and
-- name and returns what it deleted. Postgres applies the SELECT
-- policies to any DELETE that reads existing rows through a WHERE on
-- columns or a RETURNING clause (reproduced against a local Postgres 16
-- with this project's exact DELETE policy: `DELETE 0`, no error), so with
-- no SELECT policy the owner's DELETE policy matches zero rows. Zero
-- rows is not an error: `remove()`
-- resolves with `{ data: [], error: null }`, the application sees
-- "success", and the file stays. Images kept displaying because the
-- bucket is public and public reads bypass RLS, which is why nobody saw
-- it. The supabase-js `remove()` documentation says as much:
-- "objects table permissions: delete and select".
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
-- The app now refuses to delete the photo row unless it sees that.

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
