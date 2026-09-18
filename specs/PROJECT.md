# ScoutEvent — Project-Wide Technical Decisions

Decisions that span features live here. A single feature's decisions
stay in that feature's `design.md`.

`CONSTITUTION.md` covers *how* we work and what the project won't trade
away. This file covers *what we chose* and what those choices constrain.
The README covers how to set the thing up and run it — this file is for
whoever is designing the next feature and needs to know what they're
building on.

Promoted here from `specs/001-photo-collection-slideshow/design.md` §1
and §3, which the constitution said to do "if a second feature is added
later" — by the time it happened there were six. That spec stays as the
historical record of Feature 001; where the two disagree, this file
wins.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| App framework | Next.js 16 (App Router, TypeScript) | See "Framework specifics" below — 16 differs from older App Router material in ways that have already caused bugs here |
| Hosting | Vercel (Hobby) | Free. Hobby forbids commercial use; fine for a unit running its own events, not fine if this is ever sold or run for others |
| Auth | Supabase Auth, email magic link | Organizers only. Guests never authenticate |
| Database | Supabase Postgres | RLS is the access control layer; the browser talks to it directly |
| Display photos | Supabase Storage, public-read bucket | 1600px/2560px copies — every screen reads these |
| Original photos | Cloudflare R2, private bucket | Specced in Feature 006, not yet built. Chosen for free egress, not capacity — see that design's §1a |
| Realtime | Supabase Realtime (postgres_changes) | Always paired with a polling fallback; see "Realtime" below |
| QR codes | `qrcode.react` | Renders locally, no API call, no rate limit |
| Image compression | `browser-image-compression` | Runs in the guest's browser before upload |

One vendor for auth/DB/storage/realtime was a deliberate choice: fewer
moving parts, fewer free tiers to watch, and RLS meaning no backend to
write. Feature 006 spends that deliberately for originals only — if R2
is misconfigured or abandoned, every screen still works, because only
the download path reads from it.

## Where the data lives

- **Postgres**: `events` and `photos` rows. Photo rows carry storage
  paths, never image bytes.
- **Supabase Storage**, bucket `photos`, public-read: display copies at
  `{event_id}/{uuid}.jpg`. Public-read with unguessable paths is an
  accepted tradeoff whose production status is an open question — see
  `CONSTITUTION.md`.
- **R2**, private (Feature 006): originals at
  `originals/{event_id}/{uuid}.jpg`, reachable only via short-lived
  presigned URLs.

## Access control

RLS is the enforcement point, not client code. Two rules have held
across every feature and should keep holding:

1. **Anonymous writes go through `security definer` functions, never
   raw inserts.** `submit_photo()` owns "is this upload allowed" and
   "what status does it start in", so that logic exists once, server
   side, and cannot be argued with by a client. Feature 006's signing
   endpoint follows the same shape for the same reason.
2. **Organizers see and change only their own events' photos.** Every
   organizer-facing query relies on this rather than filtering in the
   client.

## Free-tier limits

| Limit | Allowance | What happens at the edge |
|---|---|---|
| Supabase database | 500MB | Metadata only; storage binds long before this |
| Supabase storage | 1GB | ~1,500 display copies. The real capacity constraint |
| Supabase egress | 2GB/mo | Slideshow re-downloads drive this. A bulk download of full-resolution photos would blow it in one click — which is why originals went to R2 |
| Supabase auth email | a few per hour | Fails *silently*: the app says "link sent" and nothing arrives. Organizers only |
| Supabase project pause | after 7 idle days | Wake it before an event |
| R2 storage | 10GB | ~2,500 originals. Confirm billing behaviour at the ceiling before relying on it |
| R2 egress | unmetered | The reason it was chosen |
| Vercel bandwidth | 100GB/mo (Hobby) | Far above need |

## Framework specifics (Next.js 16)

These have each already caused a real bug in this codebase:

- Route middleware is `src/proxy.ts` exporting `proxy(request)`, not
  `middleware.ts`.
- A route's `params` is a `Promise` and must be awaited.
- React Compiler lint rules are enforced: no impure calls (`Date.now()`)
  in a render body, no ref mutation during render, no synchronous
  `setState` in an effect body. Use derived state, a ref, or a real
  subscription callback.
- A handler a `useEffect` depends on needs a stable identity, or the
  effect tears down every render.
- Don't get the origin from `window.location` in a client component to
  render something server-side too — it hydrates differently than it
  renders and React throws out the tree. Resolve it on the server from
  request headers and pass it down.

Read `node_modules/next/dist/docs/` before writing code against any of
this, per the repo's `AGENTS.md`.

## Realtime

Every realtime subscription is paired with a polling fallback, because a
screen or dashboard may be open for hours and a dropped socket must
self-heal. Two rules learned the hard way:

- **Counts come from the server, never from arithmetic on payloads.** A
  change arrives twice — once as the local optimistic update, once as
  the realtime echo — so anything that increments will double-count.
- **Never silently insert a new row into an already-loaded, paginated
  page**; it misrepresents the pagination bounds. Update what's loaded,
  refresh the count, let the user page to the rest.
