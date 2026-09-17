"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Photo } from "@/lib/supabase/types";

const FETCH_BATCH = 10;

export function ReviewQueue({
  eventId,
  eventSlug,
  initialPhotos,
  sessionTotal,
}: {
  eventId: string;
  eventSlug: string;
  initialPhotos: Photo[];
  sessionTotal: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState(initialPhotos);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState({ approved: 0, rejected: 0, skipped: 0 });
  // Internal dedupe guard only — never read for rendering, so a ref (not
  // state) keeps this effect from needing a synchronous setState.
  const fetchingRef = useRef(false);

  const done = index >= sessionTotal;
  const current = !done ? items[index] : undefined;

  // Page forward through the same oldest-first query, but never past the
  // session's fixed snapshot total (design.md §4).
  useEffect(() => {
    if (done || current || fetchingRef.current) return;
    fetchingRef.current = true;
    (async () => {
      const { data } = await supabase
        .from("photos")
        .select("*")
        .eq("event_id", eventId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .range(items.length, items.length + FETCH_BATCH - 1)
        .returns<Photo[]>();
      if (data) setItems((prev) => [...prev, ...data]);
      fetchingRef.current = false;
    })();
  }, [done, current, items.length, eventId, supabase]);

  function publicUrlFor(path: string): string {
    return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
  }

  const approve = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    await supabase
      .from("photos")
      .update({ status: "approved", in_slideshow: true })
      .eq("id", current.id);
    setBusy(false);
    setCounts((c) => ({ ...c, approved: c.approved + 1 }));
    setIndex((i) => i + 1);
  }, [current, busy, supabase]);

  const reject = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    await supabase
      .from("photos")
      .update({ status: "rejected", in_slideshow: false })
      .eq("id", current.id);
    setBusy(false);
    setCounts((c) => ({ ...c, rejected: c.rejected + 1 }));
    setIndex((i) => i + 1);
  }, [current, busy, supabase]);

  const skip = useCallback(() => {
    if (!current || busy) return;
    setCounts((c) => ({ ...c, skipped: c.skipped + 1 }));
    setIndex((i) => i + 1);
  }, [current, busy]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (done || !current) return;
      if (e.key === "r" || e.key === "R") reject();
      else if (e.key === "a" || e.key === "A") approve();
      else if (e.key === "ArrowRight") skip();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [done, current, approve, reject, skip]);

  if (sessionTotal === 0) {
    return (
      <div className="min-h-screen bg-ground">
        <div className="tartan-rule" />
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
          <h1 className="font-display text-2xl">Nothing to review</h1>
          <p className="text-sm text-ink-soft">
            There were no pending photos when you opened this.
          </p>
          <Link href={`/dashboard/${eventSlug}`} className="btn btn-outline">
            Back to grid
          </Link>
        </div>
      </div>
    );
  }

  const progressPct = Math.min(100, (index / sessionTotal) * 100);

  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <div className="tartan-rule" />

      <div className="flex items-center justify-between border-b border-border-soft bg-surface px-6 py-4">
        <Link
          href={`/dashboard/${eventSlug}`}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5 L8 12 L15 19" /></svg>
          Exit to grid
        </Link>
        <div className="flex items-center gap-3.5">
          <div className="h-1.5 w-[220px] overflow-hidden rounded-full bg-border-soft">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                background:
                  "linear-gradient(90deg, var(--color-accent), var(--color-primary))",
              }}
            />
          </div>
          <span className="badge bg-warn-tint text-warn">
            {Math.min(index + 1, sessionTotal)} of {sessionTotal}
          </span>
        </div>
      </div>

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-14 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success-tint">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12 L9 17 L20 6" /></svg>
          </div>
          <div>
            <h1 className="mb-2 font-display text-2xl">You&apos;re all caught up</h1>
            <p className="text-sm text-ink-soft">
              Reviewed all {sessionTotal} photos that were waiting when you started.
            </p>
          </div>
          <div className="card flex items-center gap-7 px-7 py-5">
            <div className="flex flex-col items-center gap-1">
              <span className="font-display text-[28px] text-success">{counts.approved}</span>
              <span className="text-[12px] font-semibold tracking-wide text-ink-soft uppercase">Approved</span>
            </div>
            <div className="h-9 w-px bg-border" />
            <div className="flex flex-col items-center gap-1">
              <span className="font-display text-[28px] text-danger">{counts.rejected}</span>
              <span className="text-[12px] font-semibold tracking-wide text-ink-soft uppercase">Rejected</span>
            </div>
            <div className="h-9 w-px bg-border" />
            <div className="flex flex-col items-center gap-1">
              <span className="font-display text-[28px] text-warn">{counts.skipped}</span>
              <span className="text-[12px] font-semibold tracking-wide text-ink-soft uppercase">Skipped</span>
            </div>
          </div>
          {counts.skipped > 0 && (
            <p className="max-w-sm text-[13px] text-ink-faint">
              Skipped photos are still waiting in Needs Review — they weren&apos;t
              approved or rejected.
            </p>
          )}
          <Link href={`/dashboard/${eventSlug}`} className="btn btn-secondary btn-lg">
            Back to grid
          </Link>
        </div>
      ) : current ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-6">
            <div className="flex max-h-[65vh] w-full max-w-3xl items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={publicUrlFor(current.storage_path)}
                alt={current.uploader_name ?? "Pending photo"}
                className="max-h-[65vh] rounded-lg border border-border-soft object-contain shadow-lg"
              />
            </div>
            {current.uploader_name && (
              <p className="text-sm text-ink-soft">
                <span className="font-semibold text-ink">{current.uploader_name}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 px-6 pb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={skip}
                disabled={busy}
                className="btn btn-ghost"
              >
                Skip for now
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12 H19" /><path d="M13 6 L19 12 L13 18" /></svg>
              </button>
              <button
                onClick={reject}
                disabled={busy}
                className="btn btn-outline btn-lg min-w-[168px] border-danger text-danger"
              >
                Reject
              </button>
              <button
                onClick={approve}
                disabled={busy}
                className="btn btn-secondary btn-lg min-w-[200px]"
              >
                Approve
              </button>
            </div>
            <div className="flex items-center gap-[18px] text-[12.5px] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-raised px-1 text-[11px] font-bold text-ink-soft">R</kbd> Reject
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-raised px-1 text-[11px] font-bold text-ink-soft">A</kbd> Approve
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-raised px-1 text-[11px] font-bold text-ink-soft">→</kbd> Skip
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-ink-soft">
          Loading…
        </div>
      )}
    </div>
  );
}
