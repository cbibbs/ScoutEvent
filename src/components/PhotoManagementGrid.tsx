"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Photo, PhotoStatus } from "@/lib/supabase/types";

const STATUS_STYLES: Record<PhotoStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function PhotoManagementGrid({
  initialPhotos,
}: {
  initialPhotos: Photo[];
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [busyId, setBusyId] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  function publicUrlFor(storagePath: string): string {
    return supabase.storage.from("photos").getPublicUrl(storagePath).data
      .publicUrl;
  }

  async function updateStatus(photo: Photo, status: PhotoStatus) {
    setBusyId(photo.id);
    const { error } = await supabase
      .from("photos")
      .update({ status })
      .eq("id", photo.id);
    setBusyId(null);
    if (!error) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, status } : p)),
      );
    }
  }

  async function deletePhoto(photo: Photo) {
    if (!confirm("Delete this photo permanently?")) return;
    setBusyId(photo.id);
    await supabase.storage.from("photos").remove([photo.storage_path]);
    const { error } = await supabase
      .from("photos")
      .delete()
      .eq("id", photo.id);
    setBusyId(null);
    if (!error) {
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    }
  }

  if (photos.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No photos uploaded yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {photos.map((photo) => (
        <div
          key={photo.id}
          className="flex flex-col overflow-hidden rounded-md border border-gray-200 dark:border-gray-800"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publicUrlFor(photo.storage_path)}
            alt={photo.uploader_name ?? "Uploaded photo"}
            className="aspect-square w-full object-cover"
          />
          <div className="flex flex-col gap-2 p-2">
            <span
              className={`w-fit rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[photo.status]}`}
            >
              {photo.status}
            </span>
            {photo.uploader_name && (
              <span className="truncate text-xs text-gray-500">
                {photo.uploader_name}
              </span>
            )}
            <div className="flex flex-wrap gap-1">
              {photo.status !== "approved" && (
                <button
                  disabled={busyId === photo.id}
                  onClick={() => updateStatus(photo, "approved")}
                  className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Approve
                </button>
              )}
              {photo.status !== "rejected" && (
                <button
                  disabled={busyId === photo.id}
                  onClick={() => updateStatus(photo, "rejected")}
                  className="rounded bg-gray-500 px-2 py-1 text-xs text-white hover:bg-gray-600 disabled:opacity-50"
                >
                  Reject
                </button>
              )}
              <button
                disabled={busyId === photo.id}
                onClick={() => deletePhoto(photo)}
                className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
