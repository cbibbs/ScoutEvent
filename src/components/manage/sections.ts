import type { Photo } from "@/lib/supabase/types";

export type LibraryFilters = {
  status: "all" | "approved" | "rejected";
  slideshow: "any" | "yes" | "no";
  search: string;
  sort: "newest" | "oldest";
};

export const defaultLibraryFilters: LibraryFilters = {
  status: "all",
  slideshow: "any",
  search: "",
  sort: "newest",
};

export type SectionState = {
  items: Photo[];
  count: number;
};

export function matchesNeedsReview(p: Photo): boolean {
  return p.status === "pending";
}

export function matchesSlideshow(p: Photo): boolean {
  return p.status === "approved" && p.in_slideshow;
}

export function matchesLibrary(p: Photo, filters: LibraryFilters): boolean {
  if (p.status === "pending") return false;
  if (filters.status !== "all" && p.status !== filters.status) return false;
  if (
    filters.slideshow !== "any" &&
    p.in_slideshow !== (filters.slideshow === "yes")
  ) {
    return false;
  }
  const search = filters.search.trim().toLowerCase();
  if (search && !(p.uploader_name ?? "").toLowerCase().includes(search)) {
    return false;
  }
  return true;
}

// Patch/remove already-loaded rows live; never silently insert a row that
// newly matches a section it wasn't loaded in (design.md §3 of
// specs/004-photo-library-at-scale). Used for realtime INSERT/UPDATE
// payloads and for this organizer's own optimistic updates.
//
// Every branch here must be safe to run twice for the same row: the
// organizer's own write is applied once optimistically and then again
// when Supabase echoes that same UPDATE back over the realtime channel.
// That is why a row newly matching an unloaded section does not adjust
// the count here — incrementing would count the same photo twice. An
// authoritative count query handles that case instead (refreshCounts in
// PhotoManager).
export function reconcileSection(
  prev: SectionState,
  updatedRows: Photo[],
  matches: (p: Photo) => boolean,
): SectionState {
  let items = prev.items;
  let count = prev.count;

  for (const row of updatedRows) {
    const idx = items.findIndex((p) => p.id === row.id);
    const isMatch = matches(row);
    if (idx < 0) continue;

    if (isMatch) {
      items = items.map((p) => (p.id === row.id ? row : p));
    } else {
      items = items.filter((p) => p.id !== row.id);
      count = Math.max(0, count - 1);
    }
  }

  return { items, count };
}

export function removeIdsFromSection(
  prev: SectionState,
  ids: Set<string>,
): SectionState {
  const items = prev.items.filter((p) => !ids.has(p.id));
  const removed = prev.items.length - items.length;
  return { items, count: Math.max(0, prev.count - removed) };
}
