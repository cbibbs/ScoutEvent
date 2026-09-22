# Design: Photo Library At Scale

Traces to `requirements.md` in this directory. No new tables; adds
pagination, filtering, and bulk actions on top of Feature 002's
`status`/`in_slideshow` columns. Reflects the "Manage event" artboard in
the Claude Design canvas (see conversation) — this doc is the
implementation plan for what that screen now shows.

## 1. Paginated queries

Replace `PhotoManagementGrid`'s single unbounded
`select("*").eq("event_id", eventId)` with three independently-paginated
queries, one per section: **Needs Review**, **Slideshow**, **Library**.

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
  .range(offset, offset + NEEDS_REVIEW_PAGE_SIZE - 1);
```

**Slideshow** — approved photos currently live on the venue screen. Same
oldest-first order as the slideshow itself plays them (`Slideshow.tsx`'s
`order("created_at", { ascending: true })`), so the panel matches what's
coming up next on the TV:

```js
supabase
  .from("photos")
  .select("*", { count: "exact" })
  .eq("event_id", eventId)
  .eq("status", "approved")
  .eq("in_slideshow", true)
  .order("created_at", { ascending: true })
  .range(offset, offset + SLIDESHOW_PAGE_SIZE - 1);
```

This is the fast path for "look at what's live, pull stuff" (surfaced as
a gap: burying this behind Library's "in slideshow" filter wasn't enough
for that specific, common task). Library's existing filter stays for
full-archive search — the two views can show overlapping photos, same as
an inbox and a "starred" view over the same underlying mail.

**Library** (full archive — approved and rejected, in or out of the
slideshow; filterable/sortable, default newest first):

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

`NEEDS_REVIEW_PAGE_SIZE`/`SLIDESHOW_PAGE_SIZE`/`LIBRARY_PAGE_SIZE` (start
at 8/16/24 — matches the canvas mockup's "Showing 1-8 of 47" / "Showing
1-16 of 58" / "Showing 1-24 of 220") are tuning constants, not protocol.
"Load more" re-issues the same query with
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
once, not new semantics. Needs Review and Slideshow show selection
checkboxes by default — both are task-focused sections ("get through
this queue" / "get this off the screen"), not browsing views. Slideshow's
bulk action is "Remove from slideshow selected" (`in_slideshow: false`
patch) — the same action as its per-card button, batched. Library keeps
checkboxes behind an explicit "Select" toggle so ordinary browsing stays
uncluttered.

## 3. Realtime + polling at scale (revises Feature 003 §1)

Feature 003 added a realtime subscription plus a 30s poll that
re-fetched *every* photo for the event — exactly the unbounded query
this feature removes. Revised behavior:

- **UPDATE**: if the row's id is in a currently-loaded page (any
  section), patch it in place — unchanged from Feature 003. If a patch
  changes `status`/`in_slideshow` such that the row no longer matches
  that section's filter (e.g. a photo approved elsewhere while
  stale-loaded in Needs Review, or removed from the slideshow from
  another tab while loaded in Slideshow), remove it from that local
  list. If the row now matches a *different* section it wasn't loaded in
  (e.g. approved from Needs Review — now belongs in Slideshow; or added
  to the slideshow from Library), do **not** insert it into that other
  section's already-loaded page — same reasoning as INSERT below. The
  organizer reaches it by paging or reopening that section; its count is
  corrected by the count refresh below.
- **INSERT**: do **not** append to an already-loaded page — Needs
  Review's oldest-first order means a new upload belongs at the end of
  the full set, not the page currently in view, so silently inserting it
  would misrepresent pagination bounds. The organizer reaches new photos
  by paging forward, same as any other queue; the badge/header count
  updates via the count refresh below.
- **DELETE**: remove by id from any loaded page, as today.
- **Counts are read from the server, never derived from payloads.**
  Every handler above must be safe to apply twice for the same row,
  because the organizer's own change arrives twice: once as the local
  optimistic update, then again as Supabase's realtime echo of that same
  UPDATE. Patching or removing a *loaded* row is naturally idempotent
  (the second pass finds nothing to do), but incrementing a count for a
  row that isn't loaded is not — it would count the same photo twice and
  leave the header stat visibly wrong until the next poll. So any change
  instead schedules a short debounced (~800ms) authoritative count query
  per section — the same `select("id", { count: "exact", head: true })`
  the poll runs, just triggered by the change. Debounced so a burst of
  uploads or one bulk action collapses into a single refresh.
- **Poll fallback**: the same count queries on a 30s timer, replacing
  Feature 003's full re-fetch, so a dropped realtime connection still
  self-heals the *counts* without re-pulling every row; a stale loaded
  page resolves itself next time the organizer pages or refreshes.

## 4. "Review one at a time"

A focused view at its own route, `/dashboard/[slug]/review`, entered
from Needs Review's "Review one at a time" button and exited back to
the grid at any point. A route rather than a modal so the organizer can
deep-link/bookmark it and so a phone gets the whole screen for one
photo (§6) — this is the "revisit as a dedicated route if the combined
page gets unwieldy" escape hatch left open in Feature 002's out-of-scope
list, now taken. It reuses the management page's auth guard (Feature 001
US-6: only the owning organizer).

- Reuses the same oldest-first paginated query as the grid; shows one
  photo at a time, full-size, with Approve/Reject/Skip.
- **Snapshot, not live.** On open, `sessionTotal` is set once to the
  pending count at that moment (from §3's count, or the first page's
  `count`). The "N of TOTAL" progress uses this fixed `sessionTotal` for
  the session's lifetime — it does **not** grow if more photos are
  uploaded while the organizer is mid-session. This mirrors §3's
  INSERT rule for the grid: a new upload never silently reshapes a view
  already in progress. Practically: the organizer reaches new uploads by
  exiting and reopening "Review one at a time" (or via the grid), which
  starts a fresh session with a fresh snapshot.
- An action (Approve/Reject/Skip) advances to the next pending photo in
  the already-fetched batch, paging forward with the same query from §1
  as needed — but **only up to `sessionTotal` items**. Once that many
  photos have been stepped through, stop advancing even if the
  underlying query would return more rows (those rows are uploads that
  arrived after the snapshot, not part of this session).
- Approve/Reject behave as in Feature 002/003 (same patch, single
  photo). Skip leaves the photo `pending` and unmodified, and moves to
  the next photo without counting as decided.
- **Completion state**: once the organizer has stepped through
  `sessionTotal` photos, show a completion screen — "Reviewed N of
  TOTAL" broken down as approved/rejected vs. skipped (e.g. "45
  decided · 2 skipped — skipped photos are still in Needs Review"), with
  a single "Back to grid" action. No auto-redirect.

## 5. Thumbnails — deferred, two options for later

Pagination removes most of the cost of opening the page (bounded number
of images per load instead of hundreds), but each loaded grid cell still
requests the *full* compressed photo (design.md §4 of Feature 002: up to
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

**Two later decisions strengthen option 1 without overturning this
recommendation** (Feature 006 design §1a/§1b/§6):

- Feature 006 weighed moving display copies to a store with free egress
  and decided against it, partly on the grounds that this grid's egress
  is fixable locally — by cache headers and, if that is not enough, by
  these thumbnails. So option 1 is now the standing answer to "the grids
  cost too much bandwidth", not one of two candidates.
- Display copies are also decided to become private, read through signed
  URLs. A grid page then needs a signature per visible object. Supabase
  can sign a batch in one call, so this is one extra round-trip per page
  rather than one per cell — but thumbnails would halve nothing here and
  do reduce how many bytes each signature unlocks. Whoever builds the
  private-bucket feature should sign per page, not per cell, and should
  not let the signing work quietly reintroduce the unbounded query this
  feature removed.

The measure-first advice stands; what changed is which option wins if
the measurement says act.

## 6. Mobile breakpoint (US-16)

Manage Event is desktop-first — search, filters, sort, and bulk
multi-select are built for a mouse/keyboard and a wide grid, and stay
that way. But an organizer will open the same link on a phone (most
likely: standing in the room, during or right after the event), and
"basic functionality" there needs to include the two things a phone is
actually good for in the moment: catching up on Needs Review, and
pulling something off the live slideshow. It should **not** include
Library's search/filter/bulk tools, which don't work well on a touch
keyboard-less screen at this stage.

This is **one responsive component**, not a separate mobile route or
app — a single breakpoint swaps which controls render, using the same
data/queries from §1 and the same actions from Feature 002 §2. No
forked logic to keep in sync.

The breakpoint is Tailwind's `lg:` (1024px), not a phone-only boundary
like `sm:`: the desktop layout needs room for the Library toolbar
(search + three filter controls + Select) on one row *and* a 4-column
grid, and both get cramped well before phone width. So tablets and
narrow laptop windows get the simplified layout too. That's the
intended tradeoff — the simplified layout is a legitimate way to use
the page, not a degraded one.

Below the breakpoint:

- **Banner**: a persistent, dismissible note at the top — "Search,
  filters, and bulk tools work best on a bigger screen" — so the
  narrowed Library isn't mistaken for the whole feature missing.
- **Needs Review**: stays fully functional, but the primary path is the
  "Review one at a time" flow (§4) — it's already single-column,
  large-target, and exactly the right shape for a phone. The section
  shows a couple of pending photos with inline Approve/Reject plus a
  prominent button into that flow for the rest.
- **Slideshow**: stays fully functional — this is real-time, in-the-room
  control (an organizer spotting something on the TV and needing it gone
  from their phone right now), so it's not something to gate behind
  "use a bigger screen." Per-card single-tap "Remove from slideshow";
  bulk multi-select is skipped (a phone doing one photo at a time here is
  fine — the whole point is this section stays small).
- **Library**: read-only preview only — a handful of the most recent
  photos (no actions), total count, and the banner's nudge repeated
  inline ("Open on a computer to search, filter, or bulk-manage the
  library"). No search box, no filters, no bulk select on this
  breakpoint.
