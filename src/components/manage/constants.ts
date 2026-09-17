// Tuning constants, not protocol (design.md §1 of specs/004-photo-library-at-scale).
export const NEEDS_REVIEW_PAGE_SIZE = 8;
export const SLIDESHOW_PAGE_SIZE = 16;
export const LIBRARY_PAGE_SIZE = 24;

export const POLL_FALLBACK_MS = 30_000;

// After a change lands, re-ask the server for section counts rather than
// guessing them locally (design.md §3). Debounced so a burst of uploads
// or one bulk action collapses into a single refresh.
export const COUNT_REFRESH_DEBOUNCE_MS = 800;
