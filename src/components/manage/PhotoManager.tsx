"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Photo } from "@/lib/supabase/types";
import {
  LIBRARY_PAGE_SIZE,
  NEEDS_REVIEW_PAGE_SIZE,
  POLL_FALLBACK_MS,
  SLIDESHOW_PAGE_SIZE,
} from "./constants";
import {
  defaultLibraryFilters,
  matchesLibrary,
  matchesNeedsReview,
  matchesSlideshow,
  reconcileSection,
  removeIdsFromSection,
  type LibraryFilters,
  type SectionState,
} from "./sections";

export function PhotoManager({
  eventId,
  eventSlug,
  needsReview: initialNeedsReview,
  slideshow: initialSlideshow,
  library: initialLibrary,
}: {
  eventId: string;
  eventSlug: string;
  needsReview: SectionState;
  slideshow: SectionState;
  library: SectionState;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [needsReview, setNeedsReview] = useState(initialNeedsReview);
  const [slideshow, setSlideshow] = useState(initialSlideshow);
  const [library, setLibrary] = useState(initialLibrary);

  const [filters, setFilters] = useState<LibraryFilters>(defaultLibraryFilters);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const [searchInput, setSearchInput] = useState("");

  const [needsReviewSelectedRaw, setNeedsReviewSelected] = useState<
    Set<string>
  >(new Set());
  const [slideshowSelectedRaw, setSlideshowSelected] = useState<Set<string>>(
    new Set(),
  );
  const [librarySelectMode, setLibrarySelectMode] = useState(false);
  const [librarySelectedRaw, setLibrarySelected] = useState<Set<string>>(
    new Set(),
  );

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState<Set<string>>(new Set());

  // Mobile-only nudge banner; dismiss lasts for this page view (no
  // localStorage read on mount — that would either desync from SSR or
  // need a setState-in-effect, and this is decorative, not load-bearing).
  const [bannerDismissed, setBannerDismissed] = useState(false);

  function dismissBanner() {
    setBannerDismissed(true);
    try {
      localStorage.setItem(`scoutevent:hideDesktopBanner:${eventId}`, "1");
    } catch {
      // Nothing to persist; the banner still hides for this render.
    }
  }

  function publicUrlFor(path: string): string {
    return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
  }

  // Selection sets may hold ids of photos that scrolled out of a loaded
  // page (an action, realtime update, or pagination). Rather than syncing
  // that away with an effect, derive the *visible* selection at render
  // time and use these everywhere instead of the raw sets.
  const needsReviewSelected = useMemo(() => {
    const ids = new Set(needsReview.items.map((p) => p.id));
    return new Set([...needsReviewSelectedRaw].filter((id) => ids.has(id)));
  }, [needsReviewSelectedRaw, needsReview.items]);
  const slideshowSelected = useMemo(() => {
    const ids = new Set(slideshow.items.map((p) => p.id));
    return new Set([...slideshowSelectedRaw].filter((id) => ids.has(id)));
  }, [slideshowSelectedRaw, slideshow.items]);
  const librarySelected = useMemo(() => {
    const ids = new Set(library.items.map((p) => p.id));
    return new Set([...librarySelectedRaw].filter((id) => ids.has(id)));
  }, [librarySelectedRaw, library.items]);

  function reconcileAfterPatch(rows: Photo[]) {
    setNeedsReview((prev) => reconcileSection(prev, rows, matchesNeedsReview));
    setSlideshow((prev) => reconcileSection(prev, rows, matchesSlideshow));
    setLibrary((prev) =>
      reconcileSection(prev, rows, (p) => matchesLibrary(p, filtersRef.current)),
    );
  }

  function reconcileAfterDelete(ids: Set<string>) {
    setNeedsReview((prev) => removeIdsFromSection(prev, ids));
    setSlideshow((prev) => removeIdsFromSection(prev, ids));
    setLibrary((prev) => removeIdsFromSection(prev, ids));
  }

  // Realtime: patch/remove already-loaded rows live across all three
  // sections; never silently insert a row into a loaded page — bump that
  // section's count instead (design.md §3 of specs/004-photo-library-at-scale).
  useEffect(() => {
    const channel = supabase
      .channel(`manage-photos-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "photos",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as Partial<Photo>)?.id;
            if (deletedId) reconcileAfterDelete(new Set([deletedId]));
            return;
          }
          const row = payload.new as Photo;
          reconcileAfterPatch([row]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };

  }, [eventId, supabase]);

  // Poll fallback: lightweight count-only queries per section, so a
  // dropped realtime connection still self-heals the counts without
  // re-pulling every row.
  useEffect(() => {
    const id = setInterval(async () => {
      const [nr, sl] = await Promise.all([
        supabase
          .from("photos")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("status", "pending"),
        supabase
          .from("photos")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("status", "approved")
          .eq("in_slideshow", true),
      ]);
      if (typeof nr.count === "number") {
        setNeedsReview((prev) => ({ ...prev, count: nr.count! }));
      }
      if (typeof sl.count === "number") {
        setSlideshow((prev) => ({ ...prev, count: sl.count! }));
      }

      let libQuery = supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .neq("status", "pending");
      const f = filtersRef.current;
      if (f.status !== "all") libQuery = libQuery.eq("status", f.status);
      if (f.slideshow !== "any")
        libQuery = libQuery.eq("in_slideshow", f.slideshow === "yes");
      if (f.search.trim())
        libQuery = libQuery.ilike("uploader_name", `%${f.search.trim()}%`);
      const lib = await libQuery;
      if (typeof lib.count === "number") {
        setLibrary((prev) => ({ ...prev, count: lib.count! }));
      }
    }, POLL_FALLBACK_MS);
    return () => clearInterval(id);

  }, [eventId, supabase]);

  // Debounced search commit.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) =>
        prev.search === searchInput ? prev : { ...prev, search: searchInput },
      );
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Refetch Library from page 1 whenever a filter changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let q = supabase
        .from("photos")
        .select("*", { count: "exact" })
        .eq("event_id", eventId)
        .neq("status", "pending")
        .order("created_at", { ascending: filters.sort === "oldest" })
        .range(0, LIBRARY_PAGE_SIZE - 1);
      if (filters.status !== "all") q = q.eq("status", filters.status);
      if (filters.slideshow !== "any")
        q = q.eq("in_slideshow", filters.slideshow === "yes");
      if (filters.search.trim())
        q = q.ilike("uploader_name", `%${filters.search.trim()}%`);
      const { data, count } = await q.returns<Photo[]>();
      if (!cancelled) {
        setLibrary({ items: data ?? [], count: count ?? 0 });
        setLibrarySelected(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };

  }, [eventId, filters, supabase]);

  async function loadMoreNeedsReview() {
    setLoadingMore((prev) => new Set(prev).add("needsReview"));
    const { data } = await supabase
      .from("photos")
      .select("*")
      .eq("event_id", eventId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .range(needsReview.items.length, needsReview.items.length + NEEDS_REVIEW_PAGE_SIZE - 1)
      .returns<Photo[]>();
    if (data) {
      setNeedsReview((prev) => ({ ...prev, items: [...prev.items, ...data] }));
    }
    setLoadingMore((prev) => {
      const next = new Set(prev);
      next.delete("needsReview");
      return next;
    });
  }

  async function loadMoreSlideshow() {
    setLoadingMore((prev) => new Set(prev).add("slideshow"));
    const { data } = await supabase
      .from("photos")
      .select("*")
      .eq("event_id", eventId)
      .eq("status", "approved")
      .eq("in_slideshow", true)
      .order("created_at", { ascending: true })
      .range(slideshow.items.length, slideshow.items.length + SLIDESHOW_PAGE_SIZE - 1)
      .returns<Photo[]>();
    if (data) {
      setSlideshow((prev) => ({ ...prev, items: [...prev.items, ...data] }));
    }
    setLoadingMore((prev) => {
      const next = new Set(prev);
      next.delete("slideshow");
      return next;
    });
  }

  async function loadMoreLibrary() {
    setLoadingMore((prev) => new Set(prev).add("library"));
    let q = supabase
      .from("photos")
      .select("*")
      .eq("event_id", eventId)
      .neq("status", "pending")
      .order("created_at", { ascending: filters.sort === "oldest" })
      .range(library.items.length, library.items.length + LIBRARY_PAGE_SIZE - 1);
    if (filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.slideshow !== "any")
      q = q.eq("in_slideshow", filters.slideshow === "yes");
    if (filters.search.trim())
      q = q.ilike("uploader_name", `%${filters.search.trim()}%`);
    const { data } = await q.returns<Photo[]>();
    if (data) {
      setLibrary((prev) => ({ ...prev, items: [...prev.items, ...data] }));
    }
    setLoadingMore((prev) => {
      const next = new Set(prev);
      next.delete("library");
      return next;
    });
  }

  async function updateOne(photo: Photo, patch: Partial<Photo>) {
    setBusyIds((prev) => new Set(prev).add(photo.id));
    const { data, error } = await supabase
      .from("photos")
      .update(patch)
      .eq("id", photo.id)
      .select()
      .returns<Photo[]>();
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(photo.id);
      return next;
    });
    if (!error && data) reconcileAfterPatch(data);
  }

  const approve = (p: Photo) =>
    updateOne(p, { status: "approved", in_slideshow: true });
  const reject = (p: Photo) =>
    updateOne(p, { status: "rejected", in_slideshow: false });
  const restore = (p: Photo) => updateOne(p, { status: "approved" });
  const removeFromSlideshow = (p: Photo) =>
    updateOne(p, { in_slideshow: false });
  const addToSlideshow = (p: Photo) => updateOne(p, { in_slideshow: true });

  async function deleteOne(photo: Photo) {
    if (!confirm("Delete this photo permanently?")) return;
    setBusyIds((prev) => new Set(prev).add(photo.id));
    await supabase.storage.from("photos").remove([photo.storage_path]);
    const { error } = await supabase.from("photos").delete().eq("id", photo.id);
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(photo.id);
      return next;
    });
    if (!error) reconcileAfterDelete(new Set([photo.id]));
  }

  async function bulkPatch(ids: Set<string>, patch: Partial<Photo>) {
    if (ids.size === 0) return;
    const idList = Array.from(ids);
    const { data, error } = await supabase
      .from("photos")
      .update(patch)
      .in("id", idList)
      .select()
      .returns<Photo[]>();
    if (!error && data) reconcileAfterPatch(data);
  }

  async function bulkDelete(ids: Set<string>, items: Photo[]) {
    if (ids.size === 0) return;
    if (!confirm(`Delete ${ids.size} photo(s) permanently?`)) return;
    const paths = items.filter((p) => ids.has(p.id)).map((p) => p.storage_path);
    await supabase.storage.from("photos").remove(paths);
    const { error } = await supabase.from("photos").delete().in("id", Array.from(ids));
    if (!error) reconcileAfterDelete(ids);
  }

  return (
    <div className="flex flex-col gap-10">
      {!bannerDismissed && (
        <div className="flex items-start gap-3 rounded-md border border-accent bg-accent-tint p-3 lg:hidden">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-accent-dark)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0"
          >
            <rect x="2" y="4" width="20" height="13" rx="2" />
            <path d="M8 21 H16" />
            <path d="M12 17 V21" />
          </svg>
          <p className="flex-1 text-[12.5px] text-ink">
            Search, filters, and bulk tools work best on a bigger screen.
            This view covers the essentials.
          </p>
          <button
            type="button"
            onClick={dismissBanner}
            className="shrink-0 px-1 text-lg leading-none text-ink-faint"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* ---------------- Needs review ---------------- */}
      <section>
        <div className="mb-3.5 flex items-center justify-between">
          <div className="section-label text-warn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7 V13 L16 15" /></svg>
            Needs review · {needsReview.count}
          </div>
          <Link
            href={`/dashboard/${eventSlug}/review`}
            className="select-chip hidden lg:inline-flex"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12 L11 15 L16 9" /></svg>
            Review one at a time
          </Link>
        </div>

        {needsReview.items.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing waiting on you.</p>
        ) : (
          <>
            {/* Desktop grid */}
            <div className="hidden lg:block">
              {needsReviewSelected.size > 0 && (
                <div className="bulkbar mb-4">
                  <span className="text-[13.5px] font-bold">
                    {needsReviewSelected.size} selected
                  </span>
                  <div className="flex-grow" />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      await bulkPatch(needsReviewSelected, {
                        status: "approved",
                        in_slideshow: true,
                      });
                      setNeedsReviewSelected(new Set());
                    }}
                  >
                    Approve selected
                  </button>
                  <button
                    className="btn btn-sm border border-white/35 bg-transparent text-white"
                    onClick={async () => {
                      await bulkPatch(needsReviewSelected, {
                        status: "rejected",
                        in_slideshow: false,
                      });
                      setNeedsReviewSelected(new Set());
                    }}
                  >
                    Reject selected
                  </button>
                  <button
                    className="btn btn-ghost btn-sm text-white/60"
                    onClick={() => setNeedsReviewSelected(new Set())}
                  >
                    Clear
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {needsReview.items.map((photo) => (
                  <div key={photo.id} className="card flex flex-col overflow-hidden">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={publicUrlFor(photo.storage_path)}
                        alt={photo.uploader_name ?? "Uploaded photo"}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setNeedsReviewSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(photo.id)) next.delete(photo.id);
                            else next.add(photo.id);
                            return next;
                          })
                        }
                        className={`pick absolute top-2 left-2 ${needsReviewSelected.has(photo.id) ? "on" : ""}`}
                        aria-label="Select photo"
                      >
                        {needsReviewSelected.has(photo.id) && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12 L9 17 L20 6" /></svg>
                        )}
                      </button>
                    </div>
                    <div className="flex flex-col gap-2.5 p-3">
                      {photo.uploader_name && (
                        <span className="truncate text-xs text-ink-soft">
                          {photo.uploader_name}
                        </span>
                      )}
                      <div className="flex gap-2">
                        <button
                          disabled={busyIds.has(photo.id)}
                          onClick={() => approve(photo)}
                          className="btn btn-secondary btn-sm flex-1"
                        >
                          Approve
                        </button>
                        <button
                          disabled={busyIds.has(photo.id)}
                          onClick={() => reject(photo)}
                          className="btn btn-outline btn-sm flex-1"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {needsReview.items.length < needsReview.count && (
                <div className="mt-4 flex items-center justify-between border-t border-border-soft pt-4 text-[13px] text-ink-soft">
                  <span>
                    Showing 1–{needsReview.items.length} of {needsReview.count} pending
                  </span>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={loadingMore.has("needsReview")}
                    onClick={loadMoreNeedsReview}
                  >
                    {loadingMore.has("needsReview") ? "Loading…" : `Load ${NEEDS_REVIEW_PAGE_SIZE} more`}
                  </button>
                </div>
              )}
            </div>

            {/* Mobile: preview cards + primary CTA into one-at-a-time */}
            <div className="flex flex-col gap-3 lg:hidden">
              <div className="flex flex-col gap-2">
                {needsReview.items.slice(0, 2).map((photo) => (
                  <div key={photo.id} className="card flex items-center gap-3 p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={publicUrlFor(photo.storage_path)}
                      alt={photo.uploader_name ?? "Uploaded photo"}
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-sm object-cover"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {photo.uploader_name && (
                        <span className="text-[12.5px] text-ink-soft">
                          {photo.uploader_name}
                        </span>
                      )}
                      <div className="flex gap-1.5">
                        <button
                          disabled={busyIds.has(photo.id)}
                          onClick={() => approve(photo)}
                          className="btn btn-secondary btn-sm flex-1 px-2.5 py-1.5 text-xs"
                        >
                          Approve
                        </button>
                        <button
                          disabled={busyIds.has(photo.id)}
                          onClick={() => reject(photo)}
                          className="btn btn-outline btn-sm flex-1 px-2.5 py-1.5 text-xs"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href={`/dashboard/${eventSlug}/review`}
                className="btn btn-secondary btn-lg w-full"
              >
                Review one at a time
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12 H19" /><path d="M13 6 L19 12 L13 18" /></svg>
              </Link>
              {needsReview.count > 2 && (
                <p className="text-center text-xs text-ink-faint">
                  Fastest way through the other {needsReview.count - 2}
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {/* ---------------- Slideshow ---------------- */}
      <section>
        <div className="mb-1 flex items-center justify-between">
          <div className="section-label text-secondary-dark">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21 H16" /><path d="M12 17 V21" /></svg>
            In the slideshow · {slideshow.count}
          </div>
          <Link
            href={`/e/${eventSlug}/slideshow`}
            target="_blank"
            className="chip no-underline"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4 L19 12 L6 20 Z" /></svg>
            Open TV view
          </Link>
        </div>
        <p className="mb-3.5 text-[12.5px] text-ink-faint">
          Ordered the same way it plays on the TV — oldest approved photo first.
        </p>

        {slideshow.items.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing is live yet.</p>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden lg:block">
              {slideshowSelected.size > 0 && (
                <div className="bulkbar mb-4">
                  <span className="text-[13.5px] font-bold">
                    {slideshowSelected.size} selected
                  </span>
                  <div className="flex-grow" />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={async () => {
                      await bulkPatch(slideshowSelected, { in_slideshow: false });
                      setSlideshowSelected(new Set());
                    }}
                  >
                    Remove from slideshow
                  </button>
                  <button
                    className="btn btn-ghost btn-sm text-white/60"
                    onClick={() => setSlideshowSelected(new Set())}
                  >
                    Clear
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {slideshow.items.map((photo) => (
                  <div key={photo.id} className="card flex flex-col overflow-hidden">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={publicUrlFor(photo.storage_path)}
                        alt={photo.uploader_name ?? "Uploaded photo"}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSlideshowSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(photo.id)) next.delete(photo.id);
                            else next.add(photo.id);
                            return next;
                          })
                        }
                        className={`pick absolute top-2 left-2 ${slideshowSelected.has(photo.id) ? "on" : ""}`}
                        aria-label="Select photo"
                      >
                        {slideshowSelected.has(photo.id) && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12 L9 17 L20 6" /></svg>
                        )}
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 p-3">
                      {photo.uploader_name && (
                        <span className="truncate text-xs text-ink-soft">
                          {photo.uploader_name}
                        </span>
                      )}
                      <button
                        disabled={busyIds.has(photo.id)}
                        onClick={() => removeFromSlideshow(photo)}
                        className="btn btn-primary btn-sm w-full"
                      >
                        Remove from slideshow
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {slideshow.items.length < slideshow.count && (
                <div className="mt-4 flex items-center justify-between border-t border-border-soft pt-4 text-[13px] text-ink-soft">
                  <span>
                    Showing 1–{slideshow.items.length} of {slideshow.count} in slideshow
                  </span>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={loadingMore.has("slideshow")}
                    onClick={loadMoreSlideshow}
                  >
                    {loadingMore.has("slideshow") ? "Loading…" : `Load ${SLIDESHOW_PAGE_SIZE} more`}
                  </button>
                </div>
              )}
            </div>

            {/* Mobile: compact grid, tap to remove */}
            <div className="lg:hidden">
              <div className="mb-2.5 grid grid-cols-3 gap-2">
                {slideshow.items.slice(0, 6).map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    disabled={busyIds.has(photo.id)}
                    onClick={() => removeFromSlideshow(photo)}
                    className="relative overflow-hidden rounded-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={publicUrlFor(photo.storage_path)}
                      alt={photo.uploader_name ?? "Uploaded photo"}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-[11px] font-bold text-white">
                      Remove
                    </span>
                  </button>
                ))}
              </div>
              {slideshow.count > 6 && (
                <p className="text-xs text-ink-faint">
                  +{slideshow.count - 6} more — see the full list on desktop
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {/* ---------------- Library ---------------- */}
      <section>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="section-label">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 15 L8 10 L12 14 L16 10 L21 15" /><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" /></svg>
            Library · {library.count}
          </div>

          <div className="hidden flex-wrap items-center gap-2.5 lg:flex">
            <div className="relative">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"><circle cx="11" cy="11" r="7" /><path d="M21 21 L16.5 16.5" /></svg>
              <input
                className="input w-[220px] py-2 pl-8 text-[13.5px]"
                placeholder="Search by name…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <select
              className="select-chip appearance-none"
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value as LibraryFilters["status"] }))
              }
            >
              <option value="all">Status: All</option>
              <option value="approved">Status: Approved</option>
              <option value="rejected">Status: Rejected</option>
            </select>
            <select
              className="select-chip appearance-none"
              value={filters.slideshow}
              onChange={(e) =>
                setFilters((f) => ({ ...f, slideshow: e.target.value as LibraryFilters["slideshow"] }))
              }
            >
              <option value="any">In slideshow: Any</option>
              <option value="yes">In slideshow: Yes</option>
              <option value="no">In slideshow: No</option>
            </select>
            <select
              className="select-chip appearance-none"
              value={filters.sort}
              onChange={(e) =>
                setFilters((f) => ({ ...f, sort: e.target.value as LibraryFilters["sort"] }))
              }
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setLibrarySelectMode((v) => !v);
                setLibrarySelected(new Set());
              }}
              className={`select-chip ${librarySelectMode ? "bg-ink text-white" : ""}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12 L11 15 L16 9" /></svg>
              {librarySelectMode ? "Done" : "Select"}
            </button>
          </div>
        </div>

        {library.items.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Approved and rejected photos will show up here.
          </p>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden lg:block">
              {librarySelectMode && librarySelected.size > 0 && (
                <div className="bulkbar mb-4">
                  <span className="text-[13.5px] font-bold">
                    {librarySelected.size} selected
                  </span>
                  <div className="flex-grow" />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={async () => {
                      await bulkPatch(librarySelected, { in_slideshow: false });
                      setLibrarySelected(new Set());
                    }}
                  >
                    Remove from slideshow
                  </button>
                  <button
                    className="btn btn-sm border border-white/35 bg-transparent text-white"
                    onClick={async () => {
                      await bulkPatch(librarySelected, { in_slideshow: true });
                      setLibrarySelected(new Set());
                    }}
                  >
                    Add to slideshow
                  </button>
                  <button
                    className="btn btn-sm bg-danger text-white"
                    onClick={() => bulkDelete(librarySelected, library.items)}
                  >
                    Delete
                  </button>
                  <button
                    className="btn btn-ghost btn-sm text-white/60"
                    onClick={() => setLibrarySelected(new Set())}
                  >
                    Clear
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {library.items.map((photo) => (
                  <div
                    key={photo.id}
                    className={`card flex flex-col overflow-hidden ${photo.status === "rejected" ? "opacity-70" : ""}`}
                  >
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={publicUrlFor(photo.storage_path)}
                        alt={photo.uploader_name ?? "Uploaded photo"}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                      {librarySelectMode && (
                        <button
                          type="button"
                          onClick={() =>
                            setLibrarySelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(photo.id)) next.delete(photo.id);
                              else next.add(photo.id);
                              return next;
                            })
                          }
                          className={`pick absolute top-2 left-2 ${librarySelected.has(photo.id) ? "on" : ""}`}
                          aria-label="Select photo"
                        >
                          {librarySelected.has(photo.id) && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12 L9 17 L20 6" /></svg>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 p-3">
                      <span className={`badge ${photo.status === "approved" ? "badge-approved" : "badge-rejected"}`}>
                        {photo.status}
                      </span>
                      {photo.uploader_name && (
                        <span className="truncate text-xs text-ink-soft">
                          {photo.uploader_name}
                        </span>
                      )}
                      {photo.status === "approved" ? (
                        <>
                          <button
                            disabled={busyIds.has(photo.id)}
                            onClick={() =>
                              photo.in_slideshow ? removeFromSlideshow(photo) : addToSlideshow(photo)
                            }
                            className={`btn btn-sm w-full ${photo.in_slideshow ? "btn-primary" : "btn-outline"}`}
                          >
                            {photo.in_slideshow ? "Remove from slideshow" : "Add back to slideshow"}
                          </button>
                          <div className="flex gap-2">
                            <button
                              disabled={busyIds.has(photo.id)}
                              onClick={() => reject(photo)}
                              className="btn btn-outline btn-sm flex-1"
                            >
                              Reject
                            </button>
                            <button
                              disabled={busyIds.has(photo.id)}
                              onClick={() => deleteOne(photo)}
                              className="btn btn-danger-outline btn-sm flex-1"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <button
                            disabled={busyIds.has(photo.id)}
                            onClick={() => restore(photo)}
                            className="btn btn-secondary btn-sm w-full"
                          >
                            Restore
                          </button>
                          <button
                            disabled={busyIds.has(photo.id)}
                            onClick={() => deleteOne(photo)}
                            className="btn btn-danger-outline btn-sm w-full"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {library.items.length < library.count && (
                <div className="mt-4 flex items-center justify-between border-t border-border-soft pt-4 text-[13px] text-ink-soft">
                  <span>
                    Showing 1–{library.items.length} of {library.count}
                  </span>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={loadingMore.has("library")}
                    onClick={loadMoreLibrary}
                  >
                    {loadingMore.has("library") ? "Loading…" : `Load ${LIBRARY_PAGE_SIZE} more`}
                  </button>
                </div>
              )}
            </div>

            {/* Mobile: read-only preview, nudge to desktop */}
            <div className="lg:hidden">
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                {library.items.slice(0, 4).map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.id}
                    src={publicUrlFor(photo.storage_path)}
                    alt=""
                    loading="lazy"
                    className={`aspect-square w-full rounded-sm object-cover ${photo.status === "rejected" ? "opacity-60 grayscale" : ""}`}
                  />
                ))}
              </div>
              <div className="card flex flex-col gap-1 p-3.5">
                <span className="text-[13px] font-semibold">
                  Open on a computer for the full library
                </span>
                <span className="text-xs text-ink-soft">
                  Search by name, filter by status or slideshow, sort, and bulk actions.
                </span>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
