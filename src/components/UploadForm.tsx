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

// A paused event reads exactly like a closed one to the guest — "from
// the guest's side a paused event and a finished one are the same thing"
// (design.md §6) — even though submit_photo() raises a distinct message
// for each internally (T6.1). Both stay retryable (default), since either
// could legitimately reopen while the guest still has the page open.
const CLOSED_ERRORS = [
  "uploads are closed for this event",
  "uploads are paused for this event",
];
const CLOSED_MESSAGE =
  "Uploads for this event are closed. Thanks for sharing your photos!";

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

export function UploadForm({
  eventId,
  photoLimit,
}: {
  eventId: string;
  photoLimit: number;
}) {
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

      // Advisory only — enforcement stays in submit_photo() below, which
      // is the only thing that can't be raced or skipped. This just keeps
      // the *common* case (an event that's already full) from ever
      // creating a Storage object that submit_photo() will immediately
      // refuse to attach a row to, which would otherwise leak an orphan
      // no one can reach (design.md §3, T6.4). A stale/approximate count
      // here is accepted — see submit_photo()'s own check for the real
      // gate.
      const { data: currentCount } = await supabase.rpc("event_photo_count", {
        p_event_id: eventId,
      });
      if (typeof currentCount === "number" && currentCount >= photoLimit) {
        updateFile(id, {
          status: "error",
          error: EVENT_FULL_MESSAGE,
          retryable: false,
        });
        return;
      }

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
        // Clean up the orphaned storage object if the DB row couldn't be
        // created (e.g. uploads just closed/paused for this event, or the
        // event is full). Still needed here even with the pre-check above:
        // that check is advisory, and the window/pause state can change in
        // the moment between it and this call.
        await supabase.storage.from("photos").remove([storagePath]);
        const isFull = rpcError.message.includes(EVENT_FULL_ERROR);
        const isClosed = CLOSED_ERRORS.some((m) =>
          rpcError.message.includes(m),
        );
        updateFile(id, {
          status: "error",
          error: isFull
            ? EVENT_FULL_MESSAGE
            : isClosed
              ? CLOSED_MESSAGE
              : rpcError.message,
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
