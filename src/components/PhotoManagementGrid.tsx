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

  async function updatePhoto(photo: Photo, patch: Partial<Photo>) {
    setBusyId(photo.id);
    const { error } = await supabase
      .from("photos")
      .update(patch)
      .eq("id", photo.id);
    setBusyId(null);
    if (!error) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, ...patch } : p)),
      );
    }
  }

  // Approving and showing in the slideshow are the same click — the
  // common case is "this is fine, show it" (design.md §2).
  const approve = (photo: Photo) =>
    updatePhoto(photo, { status: "approved", in_slideshow: true });
  const reject = (photo: Photo) =>
    updatePhoto(photo, { status: "rejected", in_slideshow: false });
  const restore = (photo: Photo) => updatePhoto(photo, { status: "approved" });
  const toggleSlideshow = (photo: Photo) =>
    updatePhoto(photo, { in_slideshow: !photo.in_slideshow });

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

  const pending = photos.filter((p) => p.status === "pending");
  const library = photos.filter((p) => p.status !== "pending");

  if (photos.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No photos uploaded yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Needs review ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nothing waiting on you.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {pending.map((photo) => (
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
                  {photo.uploader_name && (
                    <span className="truncate text-xs text-gray-500">
                      {photo.uploader_name}
                    </span>
                  )}
                  <div className="flex flex-wrap gap-1">
                    <button
                      disabled={busyId === photo.id}
                      onClick={() => approve(photo)}
                      className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busyId === photo.id}
                      onClick={() => reject(photo)}
                      className="rounded bg-gray-500 px-2 py-1 text-xs text-white hover:bg-gray-600 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Library ({library.length})
        </h3>
        {library.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Approved and rejected photos will show up here.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {library.map((photo) => (
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
                  {photo.status === "approved" && (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={photo.in_slideshow}
                        disabled={busyId === photo.id}
                        onChange={() => toggleSlideshow(photo)}
                      />
                      In slideshow
                    </label>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {photo.status === "rejected" && (
                      <button
                        disabled={busyId === photo.id}
                        onClick={() => restore(photo)}
                        className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Restore
                      </button>
                    )}
                    {photo.status === "approved" && (
                      <button
                        disabled={busyId === photo.id}
                        onClick={() => reject(photo)}
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
        )}
      </section>
    </div>
  );
}
