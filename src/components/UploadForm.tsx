"use client";

import { useMemo, useState } from "react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";

const MAX_ORIGINAL_SIZE_MB = 15;

type FileStatus = "compressing" | "uploading" | "done" | "error";

interface QueuedFile {
  id: string;
  file: File;
  name: string;
  status: FileStatus;
  error?: string;
}

export function UploadForm({ eventId }: { eventId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [uploaderName, setUploaderName] = useState("");
  const [queue, setQueue] = useState<QueuedFile[]>([]);

  function updateFile(id: string, patch: Partial<QueuedFile>) {
    setQueue((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  }

  async function processFile(id: string, file: File) {
    if (!file.type.startsWith("image/")) {
      updateFile(id, { status: "error", error: "Not an image file" });
      return;
    }
    if (file.size > MAX_ORIGINAL_SIZE_MB * 1024 * 1024) {
      updateFile(id, {
        status: "error",
        error: `File is over ${MAX_ORIGINAL_SIZE_MB}MB`,
      });
      return;
    }

    try {
      updateFile(id, { status: "compressing", error: undefined });

      // Favor upload speed over maximum fidelity: a venue network is
      // often slow/congested, and 1600px is still sharp filling a TV.
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.6,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: "image/jpeg",
      });

      updateFile(id, { status: "uploading" });

      const storagePath = `${eventId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(storagePath, compressed, { contentType: "image/jpeg" });

      if (uploadError) {
        updateFile(id, { status: "error", error: uploadError.message });
        return;
      }

      const dimensions = await readImageDimensions(compressed);

      const { error: rpcError } = await supabase.rpc("submit_photo", {
        p_event_id: eventId,
        p_storage_path: storagePath,
        p_uploader_name: uploaderName || null,
        p_width: dimensions?.width ?? null,
        p_height: dimensions?.height ?? null,
      });

      if (rpcError) {
        // Clean up the orphaned storage object if the DB row couldn't be created
        // (e.g. uploads just closed for this event).
        await supabase.storage.from("photos").remove([storagePath]);
        updateFile(id, { status: "error", error: rpcError.message });
        return;
      }

      updateFile(id, { status: "done" });
    } catch (err) {
      updateFile(id, {
        status: "error",
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    Array.from(fileList).forEach((file) => {
      const id = crypto.randomUUID();
      setQueue((prev) => [
        ...prev,
        { id, file, name: file.name, status: "compressing" },
      ]);
      void processFile(id, file);
    });
  }

  function retry(f: QueuedFile) {
    void processFile(f.id, f.file);
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-300 px-4 py-10 text-center hover:border-blue-400 dark:border-gray-700">
        <span className="font-medium">Tap to add photos</span>
        <span className="text-xs text-gray-500">
          Use your camera or pick from your gallery
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {queue.length > 0 && (
        <ul className="flex flex-col gap-2">
          {queue.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800"
            >
              <span className="truncate">{f.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={
                    f.status === "done"
                      ? "text-green-600"
                      : f.status === "error"
                        ? "text-red-600"
                        : "text-gray-500"
                  }
                >
                  {f.status === "compressing" && "Preparing…"}
                  {f.status === "uploading" && "Uploading…"}
                  {f.status === "done" && "Uploaded ✓"}
                  {f.status === "error" && (f.error ?? "Failed")}
                </span>
                {f.status === "error" && (
                  <button
                    type="button"
                    onClick={() => retry(f)}
                    className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    Retry
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Your name (optional)</span>
        <input
          value={uploaderName}
          onChange={(e) => setUploaderName(e.target.value)}
          placeholder="e.g. Alex"
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
    </div>
  );
}

function readImageDimensions(
  file: Blob,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
