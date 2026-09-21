"use client";

import { useMemo, useState } from "react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";

const MAX_ORIGINAL_SIZE_MB = 15;

// Matches the message submit_photo() raises when an event's photo_limit
// is reached (supabase/migrations/20260921000000_upload_abuse_protection.sql,
// design.md §6) — distinguishable from the upload-window errors and from a
// network failure, so this one can skip the retry affordance. Retrying
// "the event is full" can't help.
const EVENT_FULL_ERROR = "event photo limit reached";
const EVENT_FULL_MESSAGE =
  "This event has reached its photo limit — let the organizer know.";

type FileStatus = "compressing" | "uploading" | "done" | "error";

interface QueuedFile {
  id: string;
  file: File;
  name: string;
  status: FileStatus;
  error?: string;
  // False only for refusals a retry cannot fix (the event is full) — see
  // EVENT_FULL_ERROR above. Defaults to true (retryable) everywhere else,
  // including the closed-upload-window case, which reads as closed rather
  // than as a fault (design.md §6) but could still legitimately reopen.
  retryable?: boolean;
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
        // (e.g. uploads just closed for this event, or the event is full).
        await supabase.storage.from("photos").remove([storagePath]);
        const isFull = rpcError.message.includes(EVENT_FULL_ERROR);
        updateFile(id, {
          status: "error",
          error: isFull ? EVENT_FULL_MESSAGE : rpcError.message,
          retryable: !isFull,
        });
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
      <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-primary bg-primary-tint px-5 py-10 text-center">
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="7" width="18" height="14" rx="2.5" />
          <path d="M8 7 L9.5 4 H14.5 L16 7" />
          <circle cx="12" cy="14" r="3.6" />
        </svg>
        <span className="text-base font-bold text-primary-dark">
          Tap to add photos
        </span>
        <span className="text-[13px] text-ink-soft">
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
              className="flex items-center justify-between gap-2 rounded-md border border-border-soft bg-surface-raised px-3 py-2 text-sm"
            >
              <span className="truncate">{f.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={
                    f.status === "done"
                      ? "flex items-center gap-1 font-semibold text-success"
                      : f.status === "error"
                        ? "text-danger"
                        : "text-ink-soft"
                  }
                >
                  {f.status === "compressing" && "Preparing…"}
                  {f.status === "uploading" && "Uploading…"}
                  {f.status === "done" && "Uploaded ✓"}
                  {f.status === "error" && (f.error ?? "Failed")}
                </span>
                {f.status === "error" && f.retryable !== false && (
                  <button
                    type="button"
                    onClick={() => retry(f)}
                    className="rounded border border-border px-2 py-0.5 text-xs hover:border-ink-faint"
                  >
                    Retry
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <label className="flex flex-col">
        <span className="field-label">Your name (optional)</span>
        <input
          value={uploaderName}
          onChange={(e) => setUploaderName(e.target.value)}
          placeholder="e.g. Alex"
          className="input"
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
