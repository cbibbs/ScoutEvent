"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@/lib/supabase/client";
import { computeUploadsOpen } from "@/lib/uploadWindow";
import type { Event, Photo } from "@/lib/supabase/types";

const POLL_FALLBACK_MS = 30_000;

// The QR card scales with the display rather than staying a fixed pixel
// box (design.md §3). A vw/px clamp() looked like it scaled but actually
// capped at an identical fixed size for every display at or above
// ~1600px wide — 1080p, 1440p and 4K all landed on the same 256px box.
// Sizing against vmin with only a floor, no ceiling, avoids that trap:
// it keeps growing on genuinely larger panels instead of plateauing.
// Shared with the uploader-name caption's reserved padding so the two
// can never drift out of sync (design.md §3, T3.4).
const QR_CARD_WIDTH = "max(140px, 23vmin)";
const QR_CARD_MARGIN = "clamp(1.5rem, 3vw, 3rem)";
// The quiet zone the QR needs on every side — the card's outer padding
// *and* the gap between the code and the caption below it both have to
// clear 4 QR modules, or the card frame / caption text intrude on the
// quiet zone exactly as a busy photo would (design.md §3). Tied to the
// same vmin basis as the card width so the ratio holds at any display
// size rather than being hand-tuned per breakpoint.
const QR_QUIET_ZONE = "max(18px, 2.9vmin)";
// The caption has to be legible from the distance the code is scannable
// from — a fixed 12-13px reads fine on a laptop and disappears on a 55"
// panel viewed from a few steps back (design.md §3).
const QR_CAPTION_SIZE = "max(13px, 1.7vmin)";

type PolledEventFields = Pick<
  Event,
  | "upload_starts_at"
  | "upload_ends_at"
  | "moderation_enabled"
  | "uploads_paused"
  | "photo_limit"
>;
type UploadWindow = Pick<Event, "upload_starts_at" | "upload_ends_at">;

export function Slideshow({
  eventId,
  eventName,
  intervalSeconds,
  initialPhotos,
  guestUploadUrl,
  initialUploadStartsAt,
  initialUploadEndsAt,
  initialUploadsOpen,
  initialModerationEnabled,
  initialUploadsPaused,
  initialPhotoLimit,
  initialPhotoCount,
}: {
  eventId: string;
  eventName: string;
  intervalSeconds: number;
  initialPhotos: Photo[];
  guestUploadUrl: string;
  initialUploadStartsAt: string | null;
  initialUploadEndsAt: string | null;
  initialUploadsOpen: boolean;
  initialModerationEnabled: boolean;
  initialUploadsPaused: boolean;
  initialPhotoLimit: number;
  initialPhotoCount: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [photos, setPhotos] = useState(initialPhotos);
  // Monotonically increasing counter; the photo shown is derived from it
  // via `% photos.length` at render time, so it never needs reclamping
  // when the photo list shrinks or grows.
  const [tick, setTick] = useState(0);
  const [uploadsOpen, setUploadsOpen] = useState(initialUploadsOpen);
  // Whether moderation is on gates the join QR the same as the upload
  // window does (design.md §4): nothing should invite a roomful of
  // strangers to put something on screen unreviewed. Unlike the window,
  // this doesn't need re-evaluating against the clock on every
  // auto-advance tick — it only changes when the organizer flips it, which
  // the poll below picks up directly, so plain state (not a ref) is enough.
  const [moderationEnabled, setModerationEnabled] = useState(
    initialModerationEnabled,
  );
  // Stop uploads (US-23) and the photo cap (US-22) gate the QR the same
  // way: a scan that can only end in refusal is worse than no invitation
  // at all (design.md §4, the same reasoning Feature 005 already gives
  // for the closed window). photoLimit is tracked live too since an
  // organizer can raise it mid-event.
  const [uploadsPaused, setUploadsPaused] = useState(initialUploadsPaused);
  const [photoLimit, setPhotoLimit] = useState(initialPhotoLimit);
  const [photoCount, setPhotoCount] = useState(initialPhotoCount);

  // The upload window isn't fixed for the life of the page — an
  // organizer can shorten upload_ends_at mid-show from the event
  // settings form (design.md §2). The 30s poll below refreshes this ref
  // so the auto-advance interval's own re-check always gates against the
  // latest known window rather than what page load saw. A ref (not
  // state) because it only needs to be read from inside interval
  // callbacks, not to trigger a render on its own.
  const uploadWindowRef = useRef<UploadWindow>({
    upload_starts_at: initialUploadStartsAt,
    upload_ends_at: initialUploadEndsAt,
  });

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
  // a screen left running for hours (design.md §6). Also re-reads the
  // event's upload window alongside the photos, so an organizer
  // shortening upload_ends_at mid-show takes effect here within one poll
  // — the fixed-cutoff case below is immediate, but a live edit to the
  // window itself can only be observed by asking the database again
  // (design.md §2).
  useEffect(() => {
    const id = setInterval(async () => {
      const [{ data: freshPhotos }, { data: freshEvent }, { data: freshCount }] =
        await Promise.all([
          supabase
            .from("photos")
            .select("*")
            .eq("event_id", eventId)
            .eq("status", "approved")
            .eq("in_slideshow", true)
            .order("created_at", { ascending: true })
            .returns<Photo[]>(),
          supabase
            .from("events")
            .select(
              "upload_starts_at, upload_ends_at, moderation_enabled, uploads_paused, photo_limit",
            )
            .eq("id", eventId)
            .maybeSingle<PolledEventFields>(),
          // Rows of every status count toward the cap (design.md §2), which
          // an anonymous `select count(*)` on photos cannot see past its
          // RLS policy — event_photo_count() is security definer for
          // exactly this (design.md §3).
          supabase.rpc("event_photo_count", { p_event_id: eventId }),
        ]);
      if (freshPhotos) setPhotos(freshPhotos);
      if (freshEvent) {
        uploadWindowRef.current = freshEvent;
        setUploadsOpen(
          computeUploadsOpen(
            freshEvent.upload_starts_at,
            freshEvent.upload_ends_at,
          ),
        );
        setModerationEnabled(freshEvent.moderation_enabled);
        setUploadsPaused(freshEvent.uploads_paused);
        setPhotoLimit(freshEvent.photo_limit);
      }
      if (typeof freshCount === "number") setPhotoCount(freshCount);
    }, POLL_FALLBACK_MS);
    return () => clearInterval(id);
  }, [eventId, supabase]);

  // Auto-advance. Also re-evaluates "are uploads open" on every tick
  // rather than on a second timer, so a slideshow left running for hours
  // stops advertising the QR within one slide of the cutoff without
  // anyone reloading the screen (design.md §2). Reads uploadWindowRef
  // (kept fresh by the poll above) rather than closing over the initial
  // props, so this reflects a mid-show edit to upload_ends_at too, not
  // only time passing a value frozen at page load. Date.now() stays out
  // of the render body and setUploadsOpen stays out of an effect body by
  // living inside this interval callback instead.
  useEffect(() => {
    const ms = Math.max(2, intervalSeconds) * 1000;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setUploadsOpen(
        computeUploadsOpen(
          uploadWindowRef.current.upload_starts_at,
          uploadWindowRef.current.upload_ends_at,
        ),
      );
    }, ms);
    return () => clearInterval(id);
  }, [intervalSeconds]);

  const current = photos.length > 0 ? photos[tick % photos.length] : undefined;

  // The join QR is the broadcast invitation to a roomful of strangers
  // (design.md §4, US-21/US-22/US-23): it shows only while uploads are
  // open, not paused, moderation is on, and the event isn't full — a scan
  // that can only end in refusal is worse than no invitation at all, the
  // same reasoning Feature 005 already gives for the closed window.
  // Derived once here so the QR card and the caption's reserved padding
  // below can never drift out of sync with each other.
  const qrVisible =
    uploadsOpen && !uploadsPaused && moderationEnabled && photoCount < photoLimit;

  // The encoded value is constant for the life of the page — resolved
  // server-side from the request (design.md §1), not
  // window.location.origin, so there's no client/server divergence to
  // hydrate through and no "origin unknown yet" state to gate on. Still
  // memoized so the component re-rendering on every tick doesn't rebuild
  // the QR's SVG on every slide advance (design.md §4, T3.5).
  const qrCode = useMemo(
    () => (
      <QRCodeSVG
        value={guestUploadUrl}
        size={256}
        style={{ width: "100%", height: "100%" }}
      />
    ),
    [guestUploadUrl],
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
          // caption re-centers once uploads close or moderation goes off.
          style={
            qrVisible
              ? { paddingRight: `calc(${QR_CARD_WIDTH} + ${QR_CARD_MARGIN})` }
              : undefined
          }
        >
          {current.uploader_name}
        </p>
      )}
      {qrVisible && (
        // Opaque light card so the QR is legible over any photo — a code
        // drawn straight onto a dark or busy image won't scan. The
        // card's padding *and* the gap to the caption below the code
        // both have to clear the QR's 4-module quiet zone, so both reuse
        // QR_QUIET_ZONE rather than an arbitrary smaller gap
        // (design.md §3, T3.1-T3.3).
        <div
          className="absolute flex flex-col items-center rounded-xl bg-surface-raised shadow-lg"
          style={{
            right: QR_CARD_MARGIN,
            bottom: QR_CARD_MARGIN,
            width: QR_CARD_WIDTH,
            padding: QR_QUIET_ZONE,
            gap: QR_QUIET_ZONE,
          }}
        >
          <div className="aspect-square w-full">{qrCode}</div>
          <p
            className="text-center leading-snug font-semibold text-ink-soft"
            style={{ fontSize: QR_CAPTION_SIZE }}
          >
            Scan to add your photos
          </p>
        </div>
      )}
    </div>
  );
}
