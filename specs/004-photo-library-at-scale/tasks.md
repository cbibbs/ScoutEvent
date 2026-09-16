# Tasks: Photo Library At Scale

Each task is checked off `[x]` only once actually implemented (and,
where applicable, verified) — per `specs/CONSTITUTION.md`.

## Phase 1 — Paginated queries (US-12)

- [ ] T1.1 Needs Review: paginated query (oldest-first, `range`,
      `count: "exact"`), "Load more" footer with accurate
      "Showing X of Y" (design §1).
- [ ] T1.2 Library: paginated query with status filter, in-slideshow
      filter, uploader-name search, sort, same "Load more" pattern
      (design §1).
- [ ] T1.3 Revise the realtime handler and 30s poll fallback per design
      §3 — patch/remove already-loaded rows live, don't auto-append new
      inserts into a loaded page, poll only refreshes counts.

## Phase 2 — Search, filter, sort UI (US-13)

- [ ] T2.1 Library toolbar: search input, status filter, in-slideshow
      filter, sort control — each change resets to page 1.
- [ ] T2.2 Lazy-load grid images (`loading="lazy"`) per design §5's
      free mitigation.

## Phase 3 — Bulk actions (US-13)

- [ ] T3.1 Selection state (per section) + checkbox affordance on each
      card — visible by default in Needs Review, behind a "Select"
      toggle in Library (design §2).
- [ ] T3.2 Bulk action bar: Approve/Reject selected (Needs Review);
      Add/Remove-from-slideshow selected, Delete selected (Library) —
      single batched request per action (design §2).

## Phase 4 — Review one at a time (US-14)

- [ ] T4.1 Focused single-photo review view: Approve/Reject, auto-advance,
      "N of TOTAL" progress, exit to grid (design §4).

## Phase 5 — Verify

- [ ] T5.1 Build/lint clean.
- [ ] T5.2 Live end-to-end check against the real Supabase project with
      a meaningfully sized synthetic photo set (dozens at minimum,
      enough to exercise pagination and "Load more" — hundreds if
      practical), covering: paginated load, search/filter/sort, a bulk
      action, and one-at-a-time review.
- [ ] T5.3 Redeploy to production.

## Deferred (see design §5 — not part of this feature)

- [ ] Real thumbnail generation and `photos.thumbnail_path`.
