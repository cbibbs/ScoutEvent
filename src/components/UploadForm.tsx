"use client";

import { useMemo, useState } from "react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { uploadWindowState } from "@/lib/uploadWindow";

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

      // Advisory only — enforcement stays in submit_photo() below, which
      // is the only thing that can't be raced or skipped and the only
      // thing allowed to mark a refusal non-retryable (design.md §3). This
      // just keeps the *common* case (an event that's already closed,
      // paused, or full) from ever creating a Storage object that
      // submit_photo() will immediately refuse to attach a row to, which
      // would otherwise leak an orphan no one can reach (T6.4, T7.3).
      //
      // Fetches the event's window/pause/limit fresh here rather than
      // trusting a value captured at page load: an earlier version
      // compared this live count against a `photoLimit` prop from page
      // load, so raising an event's limit mid-event — the US-22 recovery
      // path — left every guest already on the page refused against the
      // stale number, told the event was full, with no retry offered
      // despite the server now being willing to accept them. Advisory may
      // be weaker than the enforcement point behind it, never stricter
      // (design.md §3, T7.2).
      const [{ data: currentCount }, { data: freshEvent }] = await Promise.all(
        [
          supabase.rpc("event_photo_count", { p_event_id: eventId }),
          supabase
            .from("events")
            .select("upload_starts_at, upload_ends_at, uploads_paused, photo_limit")
            .eq("id", eventId)
            .maybeSingle<{
              upload_starts_at: string | null;
              upload_ends_at: string | null;
              uploads_paused: boolean;
              photo_limit: number;
            }>(),
        ],
      );
      if (freshEvent) {
        const { notOpenYet, closed } = uploadWindowState(
          freshEvent.upload_starts_at,
          freshEvent.upload_ends_at,
        );
        if (notOpenYet || closed || freshEvent.uploads_paused) {
          // Not `retryable: false` — this could still legitimately open
          // while the guest has the page open, same as the server's own
          // refusal for this case (design.md §6).
          updateFile(id, { status: "error", error: CLOSED_MESSAGE });
          return;
        }
        const full =
          typeof currentCount === "number" &&
          typeof freshEvent.photo_limit === "number" &&
          currentCount >= freshEvent.photo_limit;
        if (full) {
          // Not `retryable: false` here either — only submit_photo()'s own
          // refusal may set that (design.md §3). This check just compared
          // live-against-live a moment ago; the two-request round trip is
          // still enough of a gap that the real gate gets the final word.
          updateFile(id, { status: "error", error: EVENT_FULL_MESSAGE });
          return;
        }
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
        // submit_photo() refused (uploads closed/paused for this event,
        // or the event is full), which leaves an orphaned object behind —
        // the pre-check above catches the common case but this one can
        // still race it. There is deliberately no attempt here to delete
        // it: anon has no DELETE policy on storage.objects, so the call
        // would fail silently every time and this comment would be lying
        // about what it does (design.md §3). Cleanup for an orphan is the
        // organizer's job now that their DELETE policy covers objects
        // without a matching `photos` row too (T6.5).
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
