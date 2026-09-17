"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

function CopyableLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="rounded-md border border-border bg-white p-2.5">
        <QRCodeSVG value={url} size={110} />
      </div>
      <span className="text-[12.5px] font-semibold text-ink-soft">
        {label}
      </span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="btn btn-outline btn-sm w-full"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}

export function ShareLinks({ slug }: { slug: string }) {
  const [origin] = useState(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
  );

  if (!origin) return null;

  return (
    <div className="grid grid-cols-2 gap-5">
      <CopyableLink label="Guest upload" url={`${origin}/e/${slug}`} />
      <CopyableLink
        label="Slideshow (TV)"
        url={`${origin}/e/${slug}/slideshow`}
      />
    </div>
  );
}
