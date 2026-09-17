# Design: Always-Visible Join QR on the Slideshow

Traces to `requirements.md` in this directory. No schema change, no new
dependency, no RLS change — this is an addition to the existing
`Slideshow` component and the props its page passes it.

## 1. Where the guest URL comes from

The QR encodes exactly what the organizer's share panel copies:
`{origin}/e/{slug}`.

`Slideshow` is a client component, and `window.location.origin` does not
exist during SSR. Computing it in the render body would produce a
hydration mismatch. Use the pattern `ShareLinks` already established:

```tsx
const [origin] = useState(() =>
  typeof window !== "undefined" ? window.location.origin : "",
);
```

…and render no QR while `origin` is empty. The slug is not currently
passed to `Slideshow` — `/e/[slug]/slideshow/page.tsx` has the full
event, so add `slug` (and the two upload-window fields, §2) to its
props.

## 2. Upload-window gating, re-evaluated as the show runs

The event's `upload_starts_at` / `upload_ends_at` already gate uploads
server-side in `submit_photo()` (Feature 001 design §3) and are already
mirrored client-side on the guest page (`uploadWindowState` in
`/e/[slug]/page.tsx`). Reuse that same shape — extract it if it's
convenient, but do not invent a second interpretation of the window.

The requirement that matters here is that a slideshow left running for
hours must stop showing the QR when the window closes, without anyone
touching that screen. So "are uploads open" is **not** a one-time
computation at page load:

- The server page computes the initial value and passes it as a prop, so
  the first paint is already correct.
- The component re-evaluates it on the **auto-advance interval that
  already exists** — no second timer. That interval fires every
  `slideshow_interval_seconds` (minimum 2), so the QR disappears within
  one slide of the cutoff, which is plenty.

**React Compiler constraint.** `Date.now()` is impure and must not run
in the render body, and `setState` must not be called synchronously in
an effect body — both rules have already bitten this codebase. Both are
satisfied by doing the recomputation *inside the interval callback*,
which is a callback rather than an effect body:

```tsx
const id = setInterval(() => {
  setTick((t) => t + 1);
  setUploadsOpen(computeUploadsOpen(uploadStartsAt, uploadEndsAt));
}, ms);
```

Note this interval runs whether or not there are photos, so gating still
works correctly in the empty state.

## 3. Rendering: legible over any photo

The QR sits in a card, not directly on the photo. A QR drawn straight
onto an arbitrary photo will fail to scan over a dark or busy image, and
a QR code needs a quiet zone of clear space around it to be read at all.

- An opaque light card (`--color-surface-raised`) with generous padding,
  rounded corners, and a shadow to lift it off the photo. **The card's
  padding is the quiet zone** — never let the photo provide it.
- A short caption inside the card, above or below the code: something
  like "Add your photos". It has to explain itself to someone who
  wasn't told this feature exists.
- Positioned bottom-right with a comfortable margin from both edges.
  Keep it off the extreme corner: TVs overscan, and a QR clipped by a
  bezel is unscannable.
- Rendered above the photo (the photo is `object-contain`, so it may be
  letterboxed; the card is positioned against the viewport regardless).

**Size.** Big enough to scan from a few steps back, small enough not to
eat the photo. Start around 200px on a 1080p display and let it scale
with the display rather than staying a fixed pixel box — a 4K screen
would otherwise render it half the physical size. `QRCodeSVG` takes a
numeric `size` in px, but it renders an SVG, so render it generously
(e.g. `size={256}`) and let CSS scale it: a `clamp()`-based width on the
wrapper keeps it proportional on both a laptop and a large TV. These are
tuning constants, not protocol — the requirement is "scannable from a
few steps away", so adjust against a real screen.

**Don't let it fight the caption.** The uploader-name caption (US-5) is
absolutely positioned across the bottom and centered. A long name would
otherwise run underneath the QR card — give the caption right padding of
at least the card's width plus its margin so the two can never overlap.

## 4. Cost

Nothing recurring: `qrcode.react` renders locally with no network call
(the same reason it was chosen for US-2), so this adds no bandwidth, no
storage, and no third-party dependency to stay inside a free tier.

The encoded value is constant for the life of the page — origin and slug
never change. It must not be regenerated on every slide advance; the
component re-renders on each tick, so keep the QR's inputs stable
(memoize the element or hoist it) rather than rebuilding it per photo.

## 5. Non-goals

A per-event toggle (see requirements.md — an organizer who wants no
uploads closes the upload window, which this already honors), and any
other on-screen chrome.
