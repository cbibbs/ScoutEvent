"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

function CopyableLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm font-medium">{label}</p>
      <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800">
        <QRCodeSVG value={url} size={160} />
      </div>
      <div className="flex w-full max-w-xs items-center gap-2">
        <input
          readOnly
          value={url}
          className="w-full truncate rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function ShareLinks({ slug }: { slug: string }) {
  const [origin] = useState(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
  );

  if (!origin) return null;

  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
      <CopyableLink label="Guest upload link" url={`${origin}/e/${slug}`} />
      <CopyableLink
        label="Slideshow (for the venue screen)"
        url={`${origin}/e/${slug}/slideshow`}
      />
    </div>
  );
}
