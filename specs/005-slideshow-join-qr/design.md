# Design: Always-Visible Join QR on the Slideshow

Traces to `requirements.md` in this directory. No schema change, no new
dependency, no RLS change — this is an addition to the existing
`Slideshow` component and the props its page passes it.

## 1. Where the guest URL comes from

The QR encodes exactly what the organizer's share panel copies:
`{origin}/e/{slug}`.

**Resolve the origin on the server, not in the browser.** The slideshow
page is a Server Component, so it can read the request's host and
protocol from `headers()` and pass a finished absolute URL down to
`Slideshow` as a prop. There is then no client/server divergence at all,
and the QR is present in the server-rendered HTML rather than appearing
a beat later.

Do **not** use the pattern `ShareLinks` uses:

```tsx
// Wrong — looks like it avoids a hydration mismatch, and causes one.
const [origin] = useState(() =>
  typeof window !== "undefined" ? window.location.origin : "",
);
```

The lazy initializer runs on the client *during hydration*, so the
server emits no QR and the client's first render emits one; the trees
diverge and React throws out the tree and re-renders it. This was
confirmed in a browser: the guest upload page hydrates clean, a
slideshow built this way logs `Hydration failed because the server
rendered HTML didn't match the client`. `ShareLinks` carries the same
latent defect on the manage page and should be fixed the same way —
tracked separately, not part of this feature.

Behind a proxy (Vercel), prefer `x-forwarded-proto` / `x-forwarded-host`
when present and fall back to `host`, so the URL is correct in
production rather than only on localhost.

The slug is not currently passed to `Slideshow` — the page has the full
event, so pass whatever the component needs (§2) from there.

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

**The window itself can change under a running show.** The above handles
time passing a *fixed* cutoff, which is only half the requirement.
`upload_ends_at` is editable at any moment from the event settings form,
and shortening it is the natural way an organizer says "stop taking
photos now" — so the two timestamps cannot simply be frozen as props at
page load. Failure case: a TV opened at 18:00 with the window ending at
23:00; the organizer moves the end time to 21:05 to stop stragglers; the
screen keeps inviting uploads all evening and every guest who scans it
lands on "uploads are closed".

The existing 30s poll fallback already re-queries this event's photos —
have it re-read the event's `upload_starts_at` / `upload_ends_at` at the
same time and feed the gate from that, so a mid-show edit takes effect
within one poll. Bounded 30s staleness is fine here; the interval above
still handles the ordinary fixed-cutoff case immediately.

## 3. Rendering: legible over any photo

The QR sits in a card, not directly on the photo. A QR drawn straight
onto an arbitrary photo will fail to scan over a dark or busy image, and
a QR code needs a quiet zone of clear space around it to be read at all.

- An opaque light card (`--color-surface-raised`) with generous padding,
  rounded corners, and a shadow to lift it off the photo. **The card's
  padding is the quiet zone** — never let the photo provide it.
- **The quiet zone is 4 modules, on all four sides, and the caption must
  not eat into it.** A QR of a URL this length is around 29-33 modules
  across, so at a 208px code that is roughly 4 × 6.5px ≈ 26px of clear
  space minimum. The card's padding must clear that, *and* the gap
  between the code and the caption below it must clear it too — dark
  text sitting 8px under the code intrudes into the quiet zone just as
  surely as a photo would. This is the difference between a code that
  scans on a desk and one that fails at an angle, at distance, or
  against TV glare.
- A short caption inside the card, below the code: something like "Add
  your photos". It has to explain itself to someone who wasn't told this
  feature exists — which means it also has to be *readable* from roughly
  the distance the code is scannable from, so scale it with the card
  rather than leaving it at a fixed 12px.
- Positioned bottom-right with a comfortable margin from both edges.
  Keep it off the extreme corner: TVs overscan, and a QR clipped by a
  bezel is unscannable.
- Rendered above the photo (the photo is `object-contain`, so it may be
  letterboxed; the card is positioned against the viewport regardless).

**Size.** Big enough to scan from a few steps back, small enough not to
eat the photo. Around 200px of code on a 1080p display is the starting
point, and it has to keep scaling above that — a 4K panel reporting
3840 CSS px must not render the card at half the physical size of a
1080p one.

`QRCodeSVG` takes a numeric `size` in px but emits an SVG whose
`viewBox` is sized to the module count, so render it generously (e.g.
`size={256}`) and let CSS scale the wrapper without distorting the code.

If the width is expressed as a `clamp()`, **check where the upper bound
actually binds.** `clamp(140px, 14vw, 256px)` reaches 256px at a 1829px
viewport, so every display from 1080p upward gets an identical fixed
box — which is precisely the failure this paragraph exists to prevent,
while looking like it scales. Either set the ceiling high enough that it
only guards against absurd sizes (a 4K screen at 13vw wants ~500px), or
size against `vmin` and skip the cap. These are tuning constants, not
protocol; the requirement is "scannable from a few steps away", so
check the result on a real screen rather than trusting the expression.

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
