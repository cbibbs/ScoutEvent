# Tasks: Event Photo Collection & Slideshow

Each task references the requirement/design section it implements. Check
off `[x]` only when the code exists and has been exercised (build/lint
passing, and manually verified where noted).

## Phase 0 — Project scaffold

- [x] T0.1 Initialize Next.js 16 + TypeScript + Tailwind app at repo root
      (design §4).
- [x] T0.2 Add ESLint/Prettier config, `.gitignore`, `.env.example` listing
      `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [x] T0.3 Add `lib/supabase/client.ts` and `lib/supabase/server.ts`
      (design §4).
- [x] T0.4 Root README: project purpose, one-time Supabase + Vercel free
      account setup steps, how to run locally (US-7).

## Phase 1 — Database & storage schema

- [x] T1.1 SQL migration: `events`, `photos` tables (design §2).
- [x] T1.2 SQL migration: RLS policies on `events`, `photos`, and
      `submit_photo()` function (design §3).
- [x] T1.3 SQL/setup doc: create `photos` Storage bucket, public-read
      policy, disable listing (design §3).
- [x] T1.4 Document how the organizer applies migrations to their own
      free Supabase project (SQL editor or CLI) in README.

## Phase 2 — Organizer auth

- [x] T2.1 `/login` page: email magic-link sign-in via Supabase Auth
      (US-1).
- [x] T2.2 Auth guard for `/dashboard/*` routes; redirect to `/login`
      when signed out (US-1).
- [x] T2.3 Sign-out control.

## Phase 3 — Event management

- [x] T3.1 `/dashboard`: list signed-in organizer's events (US-6).
- [x] T3.2 `/dashboard/new`: create-event form (name, date, upload
      window, moderation toggle); generates unique slug (US-1).
- [x] T3.3 `/dashboard/[slug]`: settings panel to edit the above fields
      and slideshow interval (US-1, US-5).
- [x] T3.4 Share panel on `/dashboard/[slug]`: guest URL + slideshow URL
      as text, plus QR code via `qrcode.react` (US-2).

## Phase 4 — Guest upload

- [x] T4.1 `/e/[slug]` page: fetch event by slug, render name + upload
      control (US-3).
- [x] T4.2 Client-side validation (type/size) + per-file
      progress/success/failure UI (US-3).
- [x] T4.3 Client-side compression via `browser-image-compression`
      before upload (US-3, design §5).
- [x] T4.4 Upload to Storage + call `submit_photo()` RPC; surface
      upload-window-closed message when rejected (US-3, US-4).
- [x] T4.5 Optional guest display-name field, passed through to
      `submit_photo()` (US-3).

## Phase 5 — Moderation & photo management

- [x] T5.1 Photo grid on `/dashboard/[slug]` showing all photos with
      status badge (US-6).
- [x] T5.2 Approve/reject actions for pending photos (US-4).
- [x] T5.3 Delete action removing both storage object and DB row (US-4,
      US-6).

## Phase 6 — Slideshow

- [x] T6.1 `/e/[slug]/slideshow` page: fetch approved photos, full-screen
      auto-advancing display (US-5).
- [x] T6.2 Realtime subscription appending newly approved photos live
      (US-5, design §6).
- [x] T6.3 Empty state when zero approved photos (US-5).
- [x] T6.4 30s polling fallback in case realtime disconnects (design §6).

## Phase 7 — Polish & deploy

- [x] T7.1 Responsive/mobile pass on guest upload and dashboard pages.
- [x] T7.2 Error/empty states across pages (bad slug, network errors).
- [x] T7.3 `vercel.json`/deploy docs: connecting the repo to Vercel free
      tier, setting env vars (US-7).
- [x] T7.4 README section documenting free-tier limits relied on and what
      to do as they're approached (US-7, design §1).

## Deferred (see design §7 — not part of this feature's completion)

- [ ] Bulk ZIP download of event photos.
- [ ] Private storage bucket + signed URLs.
- [ ] Scheduled keep-alive ping to prevent Supabase free-project pausing.
