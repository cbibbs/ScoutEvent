"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Photo } from "@/lib/supabase/types";

const POLL_FALLBACK_MS = 30_000;

export function Slideshow({
  eventId,
  eventName,
  intervalSeconds,
  initialPhotos,
}: {
  eventId: string;
  eventName: string;
  intervalSeconds: number;
  initialPhotos: Photo[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [photos, setPhotos] = useState(initialPhotos);
  // Monotonically increasing counter; the photo shown is derived from it
  // via `% photos.length` at render time, so it never needs reclamping
  // when the photo list shrinks or grows.
  const [tick, setTick] = useState(0);

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

  // Auto-advance.
  useEffect(() => {
    const ms = Math.max(2, intervalSeconds) * 1000;
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [intervalSeconds]);

  const current = photos.length > 0 ? photos[tick % photos.length] : undefined;

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
          <p className="text-2xl font-semibold">{eventName}</p>
          <p className="text-gray-400">Waiting for the first photo…</p>
        </div>
      )}
      {current?.uploader_name && (
        <p className="absolute bottom-6 left-0 right-0 text-center text-sm text-white/70">
          {current.uploader_name}
        </p>
      )}
    </div>
  );
}
