"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@/lib/supabase/client";
import { computeUploadsOpen } from "@/lib/uploadWindow";
import type { Photo } from "@/lib/supabase/types";

const POLL_FALLBACK_MS = 30_000;

// The QR card scales with the display rather than staying a fixed pixel
// box (design.md §3) — a 4K screen would otherwise render it half the
// physical size of a 1080p one. Shared between the card and the
// uploader-name caption so the caption's reserved padding can never
// drift out of sync with the card it's protecting (design.md §3, T3.4).
const QR_CARD_WIDTH = "clamp(140px, 14vw, 256px)";
const QR_CARD_MARGIN = "clamp(1.5rem, 3vw, 3rem)";
// The card's padding *is* the QR's quiet zone (design.md §3) — scaled
// with the same clamp() family as the card itself so it stays a
// consistent proportion of the code rather than shrinking relative to it
// on a large display.
const QR_CARD_PADDING = "clamp(0.875rem, 1.4vw, 1.5rem)";

export function Slideshow({
  eventId,
  eventName,
  intervalSeconds,
  initialPhotos,
  slug,
  uploadStartsAt,
  uploadEndsAt,
  initialUploadsOpen,
}: {
  eventId: string;
  eventName: string;
  intervalSeconds: number;
  initialPhotos: Photo[];
  slug: string;
  uploadStartsAt: string | null;
  uploadEndsAt: string | null;
  initialUploadsOpen: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [photos, setPhotos] = useState(initialPhotos);
  // Monotonically increasing counter; the photo shown is derived from it
  // via `% photos.length` at render time, so it never needs reclamping
  // when the photo list shrinks or grows.
  const [tick, setTick] = useState(0);
  const [uploadsOpen, setUploadsOpen] = useState(initialUploadsOpen);

  // Mirrors the ShareLinks pattern: window.location.origin doesn't exist
  // during SSR, so compute it lazily on the client to avoid a hydration
  // mismatch, and render no QR until it's known (design.md §1).
  const [origin] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );

  // Realtime: append newly-approved photos, drop ones no longer approved
  // (design.md §6).
  useEffect(() => {
    const channel = supabase
      .channel(`photos-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "photos",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const row = payload.new as Photo | undefined;
          const oldRow = payload.old as Partial<Photo> | undefined;

          if (payload.eventType === "DELETE") {
            const deletedId = oldRow?.id;
            if (deletedId) {
              setPhotos((prev) => prev.filter((p) => p.id !== deletedId));
            }
            return;
          }

          if (!row) return;

          setPhotos((prev) => {
            const withoutThis = prev.filter((p) => p.id !== row.id);
            return row.status === "approved" && row.in_slideshow
              ? [...withoutThis, row]
              : withoutThis;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, supabase]);

  // Self-healing poll in case the realtime subscription silently drops on
  // a screen left running for hours (design.md §6).
  useEffect(() => {
    const id = setInterval(async () => {
      const { data } = await supabase
        .from("photos")
        .select("*")
        .eq("event_id", eventId)
        .eq("status", "approved")
        .eq("in_slideshow", true)
        .order("created_at", { ascending: true })
        .returns<Photo[]>();
      if (data) setPhotos(data);
    }, POLL_FALLBACK_MS);
    return () => clearInterval(id);
  }, [eventId, supabase]);

  // Auto-advance. Also re-evaluates "are uploads open" on every tick
  // rather than on a second timer, so a slideshow left running for hours
  // stops advertising the QR within one slide of upload_ends_at without
  // anyone reloading the screen (design.md §2). Date.now() stays out of
  // the render body and setUploadsOpen stays out of an effect body by
  // living inside this interval callback instead.
  useEffect(() => {
    const ms = Math.max(2, intervalSeconds) * 1000;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setUploadsOpen(computeUploadsOpen(uploadStartsAt, uploadEndsAt));
    }, ms);
    return () => clearInterval(id);
  }, [intervalSeconds, uploadStartsAt, uploadEndsAt]);

  const current = photos.length > 0 ? photos[tick % photos.length] : undefined;

  // The encoded value is constant for the life of the page (origin and
  // slug never change), so hoist the QR element itself rather than
  // rebuilding it every tick (design.md §4, T3.5).
  const guestUrl = origin ? `${origin}/e/${slug}` : "";
  const qrCode = useMemo(
    () =>
      guestUrl ? (
        <QRCodeSVG
          value={guestUrl}
          size={256}
          style={{ width: "100%", height: "100%" }}
        />
      ) : null,
    [guestUrl],
  );

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black">
      {current ? (
        // Dynamic, user-uploaded images from Supabase Storage; next/image
        // would need a remote-pattern config per project for little gain here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={current.id}
          src={
            supabase.storage.from("photos").getPublicUrl(current.storage_path)
              .data.publicUrl
          }
          alt={current.uploader_name ?? eventName}
          className="max-h-screen max-w-screen object-contain"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-white">
          <p className="font-display text-3xl">{eventName}</p>
          <p className="text-white/50">Waiting for the first photo…</p>
        </div>
      )}
      {current?.uploader_name && (
        <p
          className="absolute right-0 bottom-6 left-0 text-center text-sm text-white/70"
          // Reserve at least the QR card's width plus its margin so a long
          // uploader name can never run underneath it (design.md §3, T3.4).
          // Only reserved while the card is actually showing, so the
          // caption re-centers once uploads close.
          style={
            uploadsOpen && qrCode
              ? { paddingRight: `calc(${QR_CARD_WIDTH} + ${QR_CARD_MARGIN})` }
              : undefined
          }
        >
          {current.uploader_name}
        </p>
      )}
      {uploadsOpen && qrCode && (
        // Opaque light card so the QR is legible over any photo — a code
        // drawn straight onto a dark or busy image won't scan. The card's
        // own padding is the quiet zone; never let the photo provide it
        // (design.md §3, T3.1-T3.3).
        <div
          className="absolute flex flex-col items-center gap-2 rounded-xl bg-surface-raised shadow-lg"
          style={{
            right: QR_CARD_MARGIN,
            bottom: QR_CARD_MARGIN,
            width: QR_CARD_WIDTH,
            padding: QR_CARD_PADDING,
          }}
        >
          <div className="aspect-square w-full">{qrCode}</div>
          <p className="text-center text-xs leading-snug font-semibold text-ink-soft">
            Scan to add your photos
          </p>
        </div>
      )}
    </div>
  );
}
