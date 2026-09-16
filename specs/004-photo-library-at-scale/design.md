# Design: Photo Library At Scale

Traces to `requirements.md` in this directory. No new tables; adds
pagination, filtering, and bulk actions on top of Feature 002's
`status`/`in_slideshow` columns. Reflects the "Manage event" artboard in
the Claude Design canvas (see conversation) — this doc is the
implementation plan for what that screen now shows.

## 1. Paginated queries

Replace `PhotoManagementGrid`'s single unbounded
`select("*").eq("event_id", eventId)` with two independently-paginated
queries, one per section.

**Needs Review** (oldest first — it's a queue; a newly-arrived photo
lands at the end, not on the page the organizer is currently looking
at):

```js
supabase
  .from("photos")
  .select("*", { count: "exact" })
  .eq("event_id", eventId)
  .eq("status", "pending")
  .order("created_at", { ascending: true })
  .range(offset, offset + REVIEW_PAGE_SIZE - 1);
```

**Library** (filterable/sortable, default newest first):

```js
let q = supabase
  .from("photos")
  .select("*", { count: "exact" })
  .eq("event_id", eventId)
  .neq("status", "pending")
  .order("created_at", { ascending: sort === "oldest" })
  .range(offset, offset + LIBRARY_PAGE_SIZE - 1);

if (statusFilter !== "all") q = q.eq("status", statusFilter);
if (slideshowFilter !== "any") q = q.eq("in_slideshow", slideshowFilter === "yes");
if (search.trim()) q = q.ilike("uploader_name", `%${search.trim()}%`);
```

`REVIEW_PAGE_SIZE`/`LIBRARY_PAGE_SIZE` (start at 8/24 — matches the
canvas mockup's "Showing 1-8 of 47" / "Showing 1-24 of 220") are tuning
constants, not protocol. "Load more" re-issues the same query with
`offset += PAGE_SIZE` and appends to the locally held array; the
`count`-with-`range` response gives the total for the "Showing X of Y"
label. Changing any Library filter/sort/search resets `offset` to 0 and
replaces (not appends to) the local array.

No RLS changes — the organizer's existing SELECT policy already scopes
this correctly; `range`/filters are just narrowing what that policy
already allows them to see.

## 2. Bulk actions

Local `Set<string>` of selected photo ids per section, cleared on a
successful bulk action or a filter/sort/search change. One request
instead of one-per-photo:

```js
// Approve/Reject selected, Add/Remove-from-slideshow selected:
supabase.from("photos").update(patch).in("id", Array.from(selectedIds));

// Delete selected:
supabase.storage.from("photos").remove(selectedPaths); // paths from local state
supabase.from("photos").delete().in("id", Array.from(selectedIds));
```

Same patch shapes as the existing single-photo actions (design.md §2 of
Feature 002) — a bulk action is that same patch applied to many rows at
once, not new semantics. Needs Review shows selection checkboxes by
default (it's inherently a work queue); Library keeps them behind an
explicit "Select" toggle so ordinary browsing stays uncluttered.

## 3. Realtime + polling at scale (revises Feature 003 §1)

Feature 003 added a realtime subscription plus a 30s poll that
re-fetched *every* photo for the event — exactly the unbounded query
this feature removes. Revised behavior:

- **UPDATE**: if the row's id is in a currently-loaded page (either
  section), patch it in place — unchanged from Feature 003. If a patch
  changes `status` such that the row no longer matches its section's
  filter (e.g. a photo approved elsewhere while stale-loaded in Needs
  Review), remove it from that local list.
- **INSERT**: do **not** append to an already-loaded page — Needs
  Review's oldest-first order means a new upload belongs at the end of
  the full set, not the page currently in view, so silently inserting it
  would misrepresent pagination bounds. Instead, bump the live pending
  count (badge, header stat) from the payload alone, no extra query. The
  organizer reaches new photos by paging forward, same as any other
  queue.
- **DELETE**: remove by id from any loaded page, as today.
- **Poll fallback**: replace the full re-fetch with a lightweight
  `count`-only query (`select("id", { count: "exact", head: true })`)
  per section, so a dropped realtime connection still self-heals the
  *counts* without re-pulling every row; a stale loaded page resolves
  itself next time the organizer pages or refreshes.

## 4. "Review one at a time"

A focused view, entered from Needs Review's "Review one at a time"
button, exited back to the grid at any point:

- Reuses the same oldest-first paginated query as the grid; shows one
  photo at a time, full-size, with Approve/Reject.
- An action advances to the next pending photo in the already-fetched
  batch; running past the end of a loaded batch transparently fetches
  the next page with the same query from §1.
- Shows "N of TOTAL" using the live pending count from §3.

## 5. Thumbnails — deferred, two options for later

Pagination removes most of the cost of opening the page (bounded number
of images per load instead of hundreds), but each loaded grid cell still
requests the *full* compressed photo (design.md §5 of Feature 001: up to
0.6MB) just to render a small square. Two ways to actually fix that,
neither built in this feature:

1. **Real thumbnails**: generate a second, small image (e.g. 320px)
   client-side at upload time alongside the existing compressed image,
   store its path (`photos.thumbnail_path`), and have grid cells load
   that instead. More storage per photo, a schema change, and more
   upload-path complexity.
2. **Lazy-loading only**: `loading="lazy"` on grid `<img>` tags, no
   schema change — cells outside the viewport don't fetch until
   scrolled into view. Doesn't shrink the per-image payload, but
   combined with pagination (bounded photos per page in the first
   place) may be enough in practice.

Recommendation: ship pagination + lazy-loading first (free); revisit
real thumbnails only if that's still not enough once there's a real
event to measure against.
