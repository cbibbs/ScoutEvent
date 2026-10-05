# Design: Multiple Approvers Per Event

Satisfies `requirements.md` US-33 … US-39. Every section names the
requirement it serves. Where a decision was taken by the organizer in
interview, the reasoning and the rejected alternatives are recorded
with it — they asked that the spec carry the *why* and the roads not
taken, and several of the rejected options are ones a later reader
would otherwise reintroduce as an oversight.

Dates use **E = the first day of the February 2027 Wood Badge course**,
now **confirmed: E = 2027-02-05** (Feature 008 T-0, closed by this
feature — see §13).

## 0. The powers a co-approver gets, and why that set (US-34)

**Decided: moderation decisions only.** Approve, reject, restore, add
to and remove from the slideshow. **Not delete**, and nothing else.

| Rejected | Why not |
|---|---|
| Photographs **plus** "Stop uploads" | The emergency brake stays with the owner. Stop is the one control that ends guest participation for everybody in the room (Feature 007 US-23), and the people being handed a link are being handed a *review* job at a staff meeting, not custody of the event |
| Everything except deleting the event | Puts the photograph limit, the upload window and the moderation toggle in a stranger's hands if the link is forwarded. Turning moderation off also removes the join QR (Feature 007 US-21) and changes what reaches the screen unreviewed — a safety change under `CONSTITUTION.md` principle 1, which is not something a link-holder should be able to make |
| Fully equal to the owner | Same, plus the event itself becomes deletable by anyone holding the link |
| **Keeping delete in the set** (the first version of this decision) | See below — it is the only irreversible action in the app, and the bulk-cleanup benefit does not pay for it |
| Approver marks for deletion, owner confirms | Creates a second queue for the owner to work through, which is the opposite of what adding reviewers is for. If the owner has time to confirm 200 deletions they have time to make them |

### 0a. Why delete came out

The first version of this set included delete, and the asymmetry was
flagged at review rather than built silently. The argument that carried
it:

**Delete is the only irreversible action in the system** — it removes
the `photos` row *and* the stored object, with nothing to undo it —
while Stop uploads, deliberately withheld as the emergency brake, is
reversible in one click. The original set therefore let a forwarded
link buy a stranger **permanent destruction** of a course's
photographs, but not a reversible pause. That is the wrong way round,
and no reading of "the link alone is the credential" survives it.

What it costs, honestly:

- **Clearing junk is slower, and it is the owner's job.** Rejecting a
  photograph keeps it off the screen but does not free the bytes
  (Feature 007 §2 counts rows of every status against `photo_limit`,
  for exactly that reason). So a co-approver can stop bad photographs
  reaching the screen — which is the safety property — and cannot
  recover the capacity they occupy.
- **Rejected photographs accumulate until the owner clears them.**
  Feature 008 §3 already sizes a 1500-photograph course at ~1800
  objects assuming 20% rejection, within 1 GB with under 180 MB of
  headroom. That arithmetic is **unchanged** — it already assumed
  rejection frees nothing — but the *operational* assumption behind it
  changes: there are no extra hands for the clearing step. Feature 008
  §3, §8c, T6.4 and T7.2 are amended to say so (§14).
- **If an event hits its photo limit mid-course**, the two remedies
  (raise the limit, delete junk) are both owner-only. That is a real
  availability cost and it is the same one US-34 already accepts for
  Stop: it needs the owner, and the run book should say to raise
  `photo_limit` to 1800 *before* the course (Feature 008 §3) so the
  situation does not arise.

What it buys is worth more: a leaked link now grants nothing that
cannot be undone, which is the single strongest line in the accepted
risk this feature carries (requirements.md, Accepted risks;
`CONSTITUTION.md` row 8).

**The accepted cost of the whole set, stated rather than implied:** if
the owner is off-site and uploads must stop, nobody else can stop them,
and nobody else can free storage. The mitigations are not substitutes —
a co-approver can reject everything arriving (which keeps it off the
screen but not out of the bucket) and can call the owner. US-34
requires the upload state and the photograph count to be *visible* to
co-approvers precisely so the second of those is possible. Feature
007's Stop remains owner-only and its spec is amended only to say so
explicitly (§14).

## 1. Access: why a bearer link cannot work in the current model

This is the constraint the whole feature turns on, so it is first.

The organizer chose **a shareable approver link, and the link alone is
the credential** (US-33): generate it, hand it out at a staff meeting,
opening it is enough to start reviewing. Rejected with them:

- **Email invitations.** Not a preference, and no longer even a
  weighing — **on the free tier this option does not exist.**

  The organizer rejected it because the sign-in email is unreliable:
  it **fails silently**, with the app reporting "link sent" on a
  refusal (`src/app/(site)/login/page.tsx:54` shows the success state
  on any non-error response), so inviting four staff at once on course
  morning is a plausible *total* failure in which every screen says it
  worked. Feature 008 §12b calls that a live failure on the critical
  path with no visible cause.

  **Verified against the provider's SMTP documentation on 2026-10-05,
  the position is stronger than that and categorical:** without custom
  SMTP, the auth service *refuses to deliver to any address that is
  not on the project's team*, and sends at most 2 messages an hour.
  Wood Badge staff are not project team members. An emailed invitation
  to them would therefore not have been slow or unreliable — **it
  would not have arrived at all**, with the app still reporting
  success. `specs/PROJECT.md`'s auth-email row and
  `CONSTITUTION.md` open decision 6 are amended with both facts (§14).

  So the link-only design is not a workaround for a flaky channel; it
  is **the only way to add a reviewer that does not require a new
  vendor** (custom SMTP, which is an open decision with its own cost
  and its own deadline, not something to take on inside this feature).
  That moves it from convenient to correct, and it is worth recording
  in those terms so nobody later "improves" it by adding invitations.
- **Requiring sign-in after the link.** Reintroduces the same email
  path, one step later — and under the team-only restriction it does
  not merely reintroduce a risk, it reintroduces a wall: the staff
  member's address is refused, so the link would lead to a sign-in
  that cannot complete.
- **Single-use-per-device.** Would mean marking devices, which is the
  per-device tracking identifier Feature 007 design §1 refused for
  guests, for the same reasons.

### 1a. The hard part

Access control in this project is RLS and nothing else
(`specs/PROJECT.md`, "Access control"). Every organizer-facing rule is
written as `organizer_id = auth.uid()`. A visitor holding only a bearer
link has **no `auth.uid()` at all** — they are `anon` — so there is no
way to express "this visitor may update this event's photographs" in
the model the app has. The nine places that predicate is written are
inventoried in §4; none of them can be satisfied by a link.

So one of three things has to change.

### 1b. Rejected: a service-role route handler

Put the link token in a Next.js route handler, validate it there, and
perform every approver action with the Supabase **service-role** key,
which bypasses RLS.

`CONSTITUTION.md` §5 permits serverless route handlers in the existing
deployment, and Feature 006's signing endpoint is one. This is not that
endpoint, and the difference is the whole argument:

- **Scope.** Feature 006's handler does one thing — mint a presigned
  URL for one original. This would have to carry *every* read and write
  an approver makes: the three paginated grids with their filters and
  counts, the one-at-a-time queue and its paging, each decision, bulk
  decisions, deletes, and storage deletes. That is the moderation API,
  re-implemented outside the database. It is an app-specific backend in
  all but name, which is the line principle 5 exists to hold.
- **Two copies of the rule.** The predicate "may this caller act on
  this photograph" would exist in SQL (for owners) and in TypeScript
  (for approvers), and they would drift. This project has already made
  that exact mistake once, in Feature 007's `photo_limit` pre-check,
  which compared a live count against a stale limit and refused uploads
  the server would have accepted (Feature 007 design §3).
- **Blast radius.** The service-role key can read and write every row
  in the project, including every other event. A bug in token
  validation is not a scoped leak, it is total compromise. The current
  model has no such key anywhere near the app.
- **It breaks realtime.** Feature 003 US-10 requires the queue to
  update live, and §8 below makes that load-bearing for concurrent
  review. `postgres_changes` is a client subscription authorized by the
  caller's own token; proxying it through a route handler means
  building a second push channel or dropping the requirement.
- **It gets worse, not better, when display copies go private.**
  Under `CONSTITUTION.md` decision 1 the bytes are read through signed
  URLs gated by RLS. A session-less approver cannot sign anything, so
  the handler would have to sign on their behalf or proxy the bytes —
  the second of which puts every reviewed photograph through Vercel's
  bandwidth and defeats the caching behaviour Feature 006 §1b measured.

### 1c. Rejected: passing the token into `security definer` functions

Keep the visitor anonymous and give every operation its own RPC taking
the token: `approve_photo(token, id)`, `list_pending(token, after, n)`,
and so on. No service-role key, and the rule stays in SQL.

It still fails: it replaces declarative row access with a hand-written
function per operation (including paging, filtering and counting),
`postgres_changes` still cannot be authorized by a token passed as an
argument, storage reads after decision 1 cannot be signed at all, and
the token travels in the body of every single request rather than once.
It is the service-role design with better blast radius and the same
duplication.

### 1d. Chosen: silent anonymous sign-in at the moment the link is claimed

Taking a place calls Supabase's **anonymous sign-in**, which creates a
real user record with no email, no password and no identifying
attribute, and issues an ordinary session. From that point the visitor
*has* an `auth.uid()`, so:

- the UX is exactly what the organizer chose — open the link, press
  one button, review. No email, nothing to receive, nothing to fail
  silently;
- RLS stays the single enforcement point, and every policy keys on a
  real `auth.uid()` as it does today;
- realtime, paginated queries, counts and (later) signed storage reads
  all work unchanged, because the approver is an ordinary authenticated
  client;
- no new endpoint, no service-role key, no second copy of any rule.

The admission itself is a **membership row**, not a property of the
session: the session says *who*, the row says *what they may touch*
(§2). That separation is what makes withdrawal one `delete`.

### 1e. What enabling anonymous sign-in costs project-wide

This is a project-level change, not a feature-level one, and it has
consequences the interview did not cover. They are bounded here rather
than discovered later.

1. **Anonymous users match `to authenticated`.** Supabase issues
   anonymous sessions with the `authenticated` role and an
   `is_anonymous: true` claim. Every existing policy written
   `to authenticated` therefore *applies* to them. All of them also
   require `organizer_id = auth.uid()`, which an anonymous user cannot
   satisfy — **except one**: `events` has
   `for all … with check (organizer_id = auth.uid())`, so an anonymous
   user could insert an event naming *themselves* as organizer and
   become an owner. That is new, it is reachable by anyone with the
   public anon key (which ships in the bundle), and it would let a
   stranger create events and consume the shared 1 GB.

   **Mitigation, in the same migration that enables any of this:** add
   `coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false`
   to that policy's `with check`. An anonymous session then has exactly
   the powers of an anonymous visitor, plus whatever membership rows
   grant it, and nothing else. This is not optional and must not be
   deferred to a follow-up.

2. **Account creation is no longer gated by email.** Anyone can mint
   anonymous users at Supabase's auth rate limit (documented default:
   30 anonymous sign-ins per hour per IP — **confirm at T0.2**, since
   an undocumented assumption about a limit is what this project keeps
   getting wrong). They count toward monthly active users (free
   allowance 50,000 — not a practical constraint at this scale, but now
   a figure that an outsider can move). With (1) in place, such a user
   can do nothing an anonymous visitor could not already do.

3. **Rows accumulate.** Rotating a link deletes membership rows; it
   does not delete the `auth.users` rows behind them. They are tiny
   (the database allowance binds at 500 MB and 1,500 photo rows are
   under 1 MB — `specs/PROJECT.md`), so cleanup is housekeeping, not a
   requirement. T7.1 records a query to delete anonymous users holding
   no membership, to be run after the course.

4. **The venue is one NAT.** Feature 007 design §1 made this point
   about rate limiting, and it applies in reverse here: 2-4 staff
   claiming at the same meeting share one IP address. Four claims
   against a 30/hour/IP limit is comfortable; a dry run that repeatedly
   claims and rotates could reach it, which is a thing to know before
   doing it on course morning rather than after (T0.2, T6.2).

5. **CAPTCHA on anonymous sign-in was considered and rejected.**
   Supabase offers it as the standard mitigation for (2). It would sit
   in front of the one action this feature is trying to make
   frictionless, to defend an allowance that is not currently
   threatened. If (2) ever becomes real abuse, the response is to turn
   the toggle off — which disables claiming and leaves owners able to
   moderate — not to put a puzzle in front of staff at a campsite.

## 2. Data model (US-33, US-38, US-39)

Two tables. Both are deliberately thin: the second one is the only
place a co-approver exists at all, and it holds no personal data (§10).

```sql
create table public.event_approver_links (
  event_id    uuid primary key references public.events (id) on delete cascade,
  token       text not null unique,
  place_limit int  not null default 4 check (place_limit between 1 and 20),
  created_at  timestamptz not null default now()
);

create table public.event_approvers (
  event_id    uuid not null
                references public.event_approver_links (event_id) on delete cascade,
  approver_id uuid not null references auth.users (id) on delete cascade,
  claimed_at  timestamptz not null default now(),
  primary key (event_id, approver_id)
);

create index if not exists event_approvers_approver_idx
  on public.event_approvers (approver_id);
```

Decisions inside that:

- **The token is not a column on `events`.** It cannot be: the
  `events` SELECT policy is `using (true)` — every guest page and the
  slideshow read event rows anonymously, and two of them use
  `select *`. A credential stored there would be world-readable. This
  is the kind of thing that is obvious once written down and invisible
  in a code review, so it is recorded: **nothing secret may ever be
  added to `public.events`.**
- **The token is stored in plaintext, readable only by the owner.**
  Storing only a hash would survive a database leak better, but the
  owner could then never re-display the link (US-38 requires
  retrieving it later — a second staff meeting, a member joining on day
  two), and the only recovery would be rotation, which ejects everyone
  already working. At a campsite that trade is wrong. The compensating
  controls are that the row is readable by nobody but the owner, and
  that rotation is one action.
- **`event_approvers.event_id` references the *link*, not the event.**
  "No link, no approvers" is then a referential fact rather than
  something the application has to remember: deleting the link row
  removes every admission it granted, and the chain still cascades from
  `events` because the link row does.
- **`claimed_at` is kept; nothing else is.** It supports the owner's
  "3 of 4 places taken" display and the cleanup in §1e(3). It is not
  attribution: it records that *a* place was taken and when, never what
  was done with it (§10).
- **`place_limit` defaults to 4** — the organizer's stated staff count
  (Feature 008's "2-4, working concurrently"). The upper bound of 20 is
  a guard against a typo turning a bounded link into an open one, not a
  product opinion.

### 2a. Functions

Four, all small. Error signalling follows the existing convention in
`submit_photo()`: distinguishable **messages** that the client matches
on (Feature 007 design §6). If this project ever moves to SQLSTATEs, it
should do so for all of these at once rather than half.

```sql
-- Owner only. First call issues; later calls rotate. Returns the token.
create or replace function public.rotate_approver_link(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not exists (select 1 from public.events e
                 where e.id = p_event_id and e.organizer_id = auth.uid()) then
    raise exception 'not the owner of this event';
  end if;
  v_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.event_approver_links (event_id, token)
    values (p_event_id, v_token)
    on conflict (event_id) do update
      set token = excluded.token, created_at = now();
  delete from public.event_approvers where event_id = p_event_id;
  return v_token;
end $$;

-- Anonymous-readable, so the claim page can name the event before
-- anything is consumed. Returns zero rows for an unrecognized token.
create or replace function public.approver_link_preview(p_token text)
returns table (event_name text, places_remaining int)
language sql security definer stable set search_path = public as $$
  select e.name,
         greatest(l.place_limit
                  - (select count(*) from public.event_approvers a
                     where a.event_id = l.event_id), 0)::int
  from public.event_approver_links l
  join public.events e on e.id = l.event_id
  where l.token = p_token;
$$;

-- Takes a place for the *current session's* user. Idempotent.
create or replace function public.claim_approver_place(p_token text)
returns table (event_id uuid, event_slug text)
language plpgsql security definer set search_path = public as $$
declare
  v_link  public.event_approver_links;
  v_uid   uuid := auth.uid();
  v_taken int;
begin
  if v_uid is null then
    raise exception 'no session to attach this place to';
  end if;

  -- A place may only be held by an anonymous session (§5a guard 2).
  -- This is what makes "an approver sees only shared events" a total
  -- rule rather than a filter over an awkward combined state.
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false then
    raise exception 'places are for visitors without an account';
  end if;

  -- The row lock is the cap. Counting without it lets two simultaneous
  -- claims both read "3 of 4" and both insert (US-38).
  select * into v_link from public.event_approver_links
    where token = p_token for update;
  if v_link.event_id is null then
    raise exception 'approver link not recognized';
  end if;

  if not exists (select 1 from public.event_approvers a
                 where a.event_id = v_link.event_id and a.approver_id = v_uid) then
    select count(*) into v_taken from public.event_approvers a
      where a.event_id = v_link.event_id;
    if v_taken >= v_link.place_limit then
      raise exception 'approver places are full';
    end if;
    insert into public.event_approvers (event_id, approver_id)
      values (v_link.event_id, v_uid);
  end if;

  return query select e.id, e.slug from public.events e where e.id = v_link.event_id;
end $$;

-- The membership predicate. One definition, used by every policy below.
create or replace function public.can_moderate_event(p_event_id uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.events e
                 where e.id = p_event_id and e.organizer_id = auth.uid())
      or exists (select 1 from public.event_approvers a
                 where a.event_id = p_event_id and a.approver_id = auth.uid());
$$;
```

Three details that matter:

- `can_moderate_event` is **`security invoker` and carries no `SET`
  clause**, both deliberately. A plain SQL function with neither can be
  *inlined* by the planner into the policy expression and planned as a
  semi-join; attaching `set search_path` would block inlining and make
  it a per-row function call over 1500-row queries. Safety is preserved
  by schema-qualifying every name inside it. It works for a co-approver
  because `event_approvers` lets a caller read their own row (§2b).
- The other three are `security definer` **with** `set search_path`,
  as `submit_photo()` already is, because they must act on rows the
  caller cannot otherwise see.
- `claim_approver_place` is granted to `authenticated` only (an
  anonymous session *is* authenticated); `approver_link_preview` to
  `anon, authenticated`; `can_moderate_event` to `anon, authenticated`
  (it is referenced by policies evaluated for anonymous callers, where
  it simply returns false).

### 2b. Policies on the new tables

```sql
-- event_approver_links: the owner, and nobody else, for every command.
create policy "owners manage their approver link"
  on public.event_approver_links for all to authenticated
  using      (exists (select 1 from public.events e
                      where e.id = event_approver_links.event_id
                        and e.organizer_id = auth.uid()))
  with check (exists (select 1 from public.events e
                      where e.id = event_approver_links.event_id
                        and e.organizer_id = auth.uid()));

-- event_approvers: readable by the event's owner (to count places) and
-- by an approver for their own row (which is what makes
-- can_moderate_event work as security invoker). No write policies at
-- all — every write goes through the functions above.
create policy "owners and approvers read places"
  on public.event_approvers for select to authenticated
  using (
    approver_id = auth.uid()
    or exists (select 1 from public.events e
               where e.id = event_approvers.event_id
                 and e.organizer_id = auth.uid())
  );
```

**Grant `select` on both tables to `anon` and `authenticated`
explicitly in the migration.** RLS, not the grant, decides which rows
anyone sees — but `can_moderate_event` is `security invoker` and is
evaluated inside the `photos` SELECT policy for *every* caller,
including the anonymous slideshow. If the `anon` role lacks the
table-level grant, that evaluation raises *permission denied* rather
than returning false, which would take the public slideshow down with
an error on a table it has no business knowing about. Supabase's
default privileges normally grant this already; "normally" is not a
thing to leave a projector depending on. The alternative — making
`can_moderate_event` `security definer` — would sidestep the grant and
the own-row policy both, at the cost of either blocking inlining (with
`set search_path`) or leaving a definer function without one. The
grant is the cheaper answer.

Both policies are written against `events.organizer_id` directly rather
than through `can_moderate_event`, because a policy on `event_approvers`
that called a function which reads `event_approvers` is a recursion
this project does not need to find out about at 2am.

The owner changing `place_limit` is an ordinary `update` on
`event_approver_links` under the policy above — no function needed.
"Stop sharing entirely" is an ordinary `delete` of that row, and
memberships cascade.

## 3. Claiming a place (US-33)

Route: **`/approve/[token]`**, outside `(site)` chrome and outside the
`/dashboard` matcher in `src/proxy.ts`.

1. The page renders server-side from `approver_link_preview(token)`:
   the event's name and how many places remain, with a single button —
   *"Start reviewing photos for <event>"*. If the preview returns
   nothing, it renders the "no longer valid" state (US-33) and offers
   nothing to press.
2. **The button is required; nothing is consumed by loading the page.**
   A link pasted into a group chat gets unfurled by the messaging
   service, and a place consumed by a link preview would be invisible
   and infuriating. An explicit action also means Next's prefetching
   cannot claim.
3. On press, in the browser: if there is no session, call anonymous
   sign-in, then `claim_approver_place(token)`. If an **anonymous**
   session already exists, reuse it (that is what makes re-opening the
   link idempotent). If an **account** session exists, stop before
   claiming and render §5b's explanation. **Never sign out an existing
   session to claim** — the person at the staff meeting may be the
   owner of a different event, and taking their dashboard away at a
   campsite is the failure US-33 names. The refusal is also enforced
   server-side in `claim_approver_place`, so the client check is the
   explanation, not the control.
4. On success, `router.replace()` to `/dashboard/<slug>`. `replace`,
   not `push`, so the token is not left in history (US-33), and the
   page sets `<meta name="referrer" content="no-referrer">` and
   `noindex` so the token is not handed to a third party or crawled.
5. Failures, each with its own message, and none of which may leave the
   person looking at a page that claims success:
   - link not recognized (rotated, deleted, or never existed) — one
     message for all three, by requirement;
   - places full — says to ask the organizer;
   - anonymous sign-in refused because the project toggle is off —
     this is a **configuration** failure and must say so ("reviewer
     links are not switched on for this site yet"), because the
     alternative is a volunteer debugging a generic error at a
     campsite. See §12;
   - rate-limited (HTTP 429 from the auth endpoint, §1e(4)) — says to
     wait a minute and press again, and is *retryable*, unlike the
     other three;
   - **signed in to an account** — §5b's two messages (owner of this
     event / signed in as someone else), neither of which is a failure
     of the link and neither of which may sign anybody out.

**Why the token is a path segment and not a fragment.** A fragment
(`/approve#<token>`) never reaches a server at all, which is
marginally better against proxy and access logs. It also cannot be
rendered server-side, so step 1 — naming the event before anyone
commits — would have to become a client round trip, and the link
becomes harder to read aloud or type from a printed sheet. Path
segment, with `replace` and `no-referrer`, is the balance taken.
Vercel's request logs will contain claim URLs; they are short-lived
credentials bounded by a place count and revocable in one action, which
is the level of protection this is designed to have (requirements.md,
Accepted risks).

## 4. Rewriting the owner-only predicate (US-34, US-35)

The brief counted ten hardcoded `organizer_id = auth.uid()` sites.
The exact inventory is **nine in SQL** (two of which are already
superseded by a later migration and are historical), plus **three in
application code**. All twelve are listed so none is missed; the
superseded two must *not* be edited in place, since
`specs/PROJECT.md`'s migration model is append-only files applied by
hand.

| # | Where | What it governs | Change |
|---|---|---|---|
| 1-2 | `20260913000000_init.sql:54,55` | `events` ALL — settings, Stop, delete | **Unchanged (owner-only)** + add the `is_anonymous` guard to `with check` (§1e) |
| 3 | `20260913000000_init.sql:64` | `photos` SELECT | Historical — superseded by #8 |
| 4-5 | `20260913000000_init.sql:79,85` | `photos` UPDATE using / with check | → `public.can_moderate_event(photos.event_id)` |
| 6 | `20260913000000_init.sql:96` | `photos` DELETE | **Unchanged (owner-only)** — deletion is not a co-approver power (§0a). `can_moderate_event` deliberately does not gate it |
| 7 | `20260913000000_init.sql:202` | `storage.objects` DELETE | Historical — superseded by #9 |
| 8 | `20260914000000_slideshow_curation.sql:19` | `photos` SELECT (live) | → `(status='approved' and in_slideshow) or can_moderate_event(photos.event_id)` |
| 9 | `20260921000000_upload_abuse_protection.sql:171` | `storage.objects` DELETE (live) | **Unchanged (owner-only)**, for the same reason as #6. Feature 007 §3 widened this to cover orphans; it stays owner-scoped |
| 10 | `src/app/(site)/dashboard/page.tsx:14` | Which events are listed | Owned events for an account session; **shared events only** for an approver session (§5) |
| 11 | `src/app/(site)/dashboard/[slug]/page.tsx:34` | Manage-page guard | owner **or** approver; owner-only controls still owner-gated |
| 12 | `src/app/(site)/dashboard/[slug]/review/page.tsx:25` | Review-page guard | owner **or** approver |

**So only three of the nine SQL sites actually change**: the live
`photos` SELECT (#8) and the two halves of `photos` UPDATE (#4, #5).
The migration recreates those by name (`drop policy if exists` then
`create policy`, the pattern the existing migrations use), so after it
the live definition of each lives in this feature's migration and the
older files are history. Nothing is narrowed: each becomes "the old one
**or** a membership row", so an owner's access is bit-for-bit what it
was. That property is what makes migrate-first safe (§12).

**The two DELETE policies are not touched at all**, which is the
cleanest possible expression of §0a: a co-approver cannot delete a
photograph row, and cannot delete its object either, because neither
policy knows what a membership is. Nothing in the client needs to be
trusted for that to hold. It also means the awkward bit of the storage
policy — matching `e.id::text` against `(storage.foldername(name))[1]`
rather than casting the folder name to `uuid`, since a cast would
*error* on any non-UUID path instead of denying — stays exactly as
Feature 007 §3 left it, with no new predicate threaded through it.

**`events` stays owner-only, and that is the whole of §0 expressed in
SQL.** A co-approver has no UPDATE path to `events`, so settings, the
photo limit, the moderation toggle and `uploads_paused` are closed to
them by construction — not by hiding buttons. `submit_photo()` and
`event_photo_count()` are untouched.

## 5. What each role sees (US-34, US-35)

**Dashboard (`/dashboard`).** One list, chosen by what kind of session
is asking:

- an **account session** (signed in by email) lists the events it owns
  — `organizer_id = auth.uid()`, exactly today's query, unchanged;
- an **approver session** (anonymous) lists the events it holds places
  on — `events` joined to its own `event_approvers` rows — and nothing
  else.

A co-approver therefore sees only the events shared with them, which is
US-35 read strictly. An earlier draft proposed two labelled sections to
cover a person who both owns events and holds places; that was rejected
in favour of the strict reading, and the right response to the rejection
is not to defend against the combined state but to make it unreachable.

### 5a. Why the combined state cannot arise

Two guards, each of which is independently sufficient, and both of
which are in the same migration:

1. **An approver session can never own an event.** Places are held only
   by anonymous sessions, and the `is_anonymous` guard on `events`
   (§1e(1)) refuses an insert naming an anonymous user as organizer. So
   "approver session with events of its own" is not a state the
   database can hold.
2. **An account session can never hold a place.**
   `claim_approver_place` refuses a caller whose session is not
   anonymous (§2a). So "account session with places" is not a state the
   database can hold either.

The dashboard branch above is therefore total, not a filter over an
awkward case: **exactly one of the two lists is ever non-empty for a
given session**, and the code can read the session's own
`is_anonymous` to decide which query to run without consulting either
table. That is worth stating because the alternative implementation —
run both queries and merge — would reintroduce the rejected combined
list the moment either guard was weakened.

### 5b. What happens to an owner who opens their own approver link

This is the failure the strict rule could have caused and does not.
Signing the owner out to claim anonymously would take away their own
dashboard, on their own phone, at a campsite — unacceptable, and
specifically forbidden by US-33. So:

- **Nothing is signed out, and no place is taken.** The claim page
  detects an account session and refuses before touching anything.
- If that account **owns the event**, the page says so and offers the
  way through to managing it: *"This is your event — you don't need a
  reviewer place."* Their session is untouched.
- If it does not, the page explains plainly: *"You're signed in as
  <email>. Reviewer places are for people without an account. To help
  review this event, open this link in a private window — or sign out
  first."* An explicit explanation rather than silence, because the
  surprising part ("my account can't do this") needs a reason attached
  or it reads as a bug.

What a real account holder therefore **loses** is the ability to be a
co-approver on someone else's event without using a second browser
profile or private window. That is a genuine limitation and it is the
price of US-35's strict reading; the workaround costs one long-press on
a phone and is named on the page rather than left to be discovered. It
is also not a regression — nobody can co-approve anything today.

**One trap this creates, for the implementer and the run book.** The
reverse move is the dangerous one: a co-approver who signs in with an
email address *in the same browser* replaces their anonymous session
with an account session and silently loses their place (the membership
row still points at the anonymous user, which nothing is signed in as
any more). They cannot re-claim, because of guard (2); they must sign
out, re-open the link, and take a **fresh** place, while the abandoned
one stays taken until the link is withdrawn. Mitigations:

- the site header (`src/components/Header.tsx`) must not offer
  "Organizer sign in" to an approver session, and `SignOutButton`
  should read as what it is for that session — leaving review, which
  loses the place;
- the run book gets the line already in T7.2, plus: *if a reviewer
  loses access, re-send the link; if places are full, raise the number
  rather than rotating.*

**Manage page (`/dashboard/[slug]`).** The guard becomes "owner or
holds a place"; anything else still `notFound()` — the same response as
a non-existent event, per US-35. Rendering, by role:

| Element | Owner | Co-approver |
|---|---|---|
| Needs Review / Slideshow / Library grids | yes | yes |
| Approve, reject, restore, add/remove from slideshow (single and bulk) | yes | yes |
| Delete photo, bulk delete, delete selected | yes | **omitted** — and refused by RLS, §4 (§0a) |
| "Review one at a time" | yes | yes |
| Upload state + "N of LIMIT photos" | yes, with Stop/Resume | **read-only** (US-34) |
| Event settings form | yes | hidden |
| Guest upload + slideshow links / QR | yes | yes — these are public URLs; a co-approver standing in the room may need to re-show the QR |
| Approver link panel (§9) | yes | hidden |
| Delete event | yes | hidden |

Hiding is cosmetic. US-34's last clause is the real requirement and it
is already satisfied by §4: a co-approver who reconstructs the request
by hand gets a refusal from Postgres — including for delete, where the
policy was simply left owner-only. The UI must not *rely* on the
refusal being invisible — in particular, do not render a disabled Stop
or Delete button that silently does nothing; omit them, and omit
"Delete selected" from the bulk toolbar rather than letting a selection
produce a refusal for every row in it.

## 6. Collisions: first decision wins, and the second reviewer is told
(US-36)

Today `src/components/manage/ReviewQueue.tsx:59-62` (approve) and
`:71-74` (reject) write

```js
.update({ status, in_slideshow }).eq("id", current.id)
```

with **no precondition on the current status**, and
`PhotoManager.tsx:332-335` and `:371-374` do the same for single and
bulk actions. With one reviewer that is fine. With four, the second write
silently replaces the first, and neither person is told — Feature 008
§5c predicted exactly this and could not test it.

**Decision: an expected-status precondition on every write that sets
`status`.** The client sends the status it believed the photograph had
when it rendered the control:

```js
const { data } = await supabase
  .from("photos")
  .update({ status: "approved", in_slideshow: true })
  .eq("id", photo.id)
  .eq("status", expectedStatus)   // what this reviewer was shown
  .select("id");
// data.length === 0  →  somebody else decided it first
```

- The check is performed **inside the UPDATE statement**, by Postgres,
  under the same row lock as the write. Two decisions arriving in the
  same instant cannot both succeed, which is US-36's second clause.
  A read-then-write check in the client would not satisfy it.
- `expectedStatus` is `'pending'` in the review queue and in Needs
  Review; it is whatever the loaded card shows in Library (so
  *restoring* a rejected photograph carries `status = 'rejected'`).
- **"Add to slideshow" carries `status = 'approved'`** for the same
  reason: without it, a toggle from a stale Library page can set
  `in_slideshow = true` on a photograph someone else just rejected. It
  would not reach the screen (the public policy requires both), but it
  would be an inconsistent row produced by a race, and the fix costs
  one `.eq()`.
- **Delete carries no precondition**, and after §0a it is an
  owner-only action anyway, so the two-reviewer collision question does
  not arise for it. Deleting something already deleted affects zero
  rows and needs no explanation; deleting something a co-approver just
  approved is the owner's decision, not a collision.
- **Bulk actions** add the same `.eq("status", expected)` alongside
  `.in("id", ids)` and use `.select("id")` to learn how many rows were
  actually written. The UI reports "approved 11; 2 had already been
  decided by someone else" (US-36's third clause). A bulk action that
  reports a flat success while silently applying to a subset is the
  failure mode being removed, so the count is not optional.

**Rejected alternatives**, from the interview:

| Rejected | Why not |
|---|---|
| Claim/lease — a reviewer holds a photograph for N seconds | Every lease needs an expiry, and every expiry is wrong in one of the two directions when a laptop lid closes mid-review: too short and two people get it anyway, too long and the queue stalls behind a reviewer who went to dinner. Complexity with no clean setting |
| Disjoint slices — reviewer k takes every kth photograph | One idle reviewer leaves their slice untouched and nobody else can reach it. Failure is silent and shaped exactly like "we finished", which is the worst shape |
| Last write wins | The current behaviour. A reject becomes an approve with nobody told, on the one path whose purpose is keeping things off a screen |

A single helper module must own the three call sites, so the
precondition cannot be present in two of them and absent in the third
after the next refactor.

## 7. The review session with several reviewers (US-37)

This section **amends Feature 004 US-14 and design §4**, which were
right for one reviewer and are wrong for four.

### 7a. The paging bug, which must be fixed here

`ReviewQueue.tsx:36-50` pages with
`.range(items.length, items.length + 9)` over `status = 'pending'`
ordered oldest-first. Offsets are positions in a result set that is
*shrinking from the front* as other reviewers decide photographs: after
10 rows leave the filter, `range(10, 19)` returns what was previously
rows 20-29, and rows 10-19 — still pending, still nobody's work — are
**never shown to anybody in that session**. A queue that silently omits
photographs is worse than one that duplicates them, and this is the
mechanism by which 1500 photographs can be "fully reviewed" with
undecided ones left behind. `PhotoManager.tsx:272` has the same defect
on Needs Review's "Load more".

**Fix: keyset paging.** Page by the last row seen, not by a count of
rows consumed:

```js
// after the last item currently held, oldest-first, ties broken by id
.eq("status", "pending")
.or(`created_at.gt.${last.created_at},` +
    `and(created_at.eq.${last.created_at},id.gt.${last.id})`)
.order("created_at", { ascending: true })
.order("id", { ascending: true })
.limit(FETCH_BATCH)
```

Rows decided by others simply do not appear — which is correct, they
are not undecided work — and no still-pending row can be stepped over,
whatever anyone else is doing. The `(created_at, id)` tuple is needed
because a burst of uploads shares a timestamp; `created_at` alone would
skip or repeat within a tie. The existing
`photos (event_id, status, created_at)` index serves this; add `id` as
a trailing column if the plan shows a sort.

### 7b. What the session is fixed to

Feature 004 design §4 fixed the session by **count** (`sessionTotal`)
and stepped exactly that many times. With other reviewers working, a
count is meaningless: the reviewer may step 47 times and see 12
photographs, or run out at 30.

Fix the session by a **horizon** instead — the `(created_at, id)` of
the newest pending photograph at the moment the session opens. The
session walks pending photographs **at or before the horizon**, in
oldest-first keyset order. That preserves the whole of Feature 004's
original intent:

- photographs uploaded after the session began are excluded, so the
  session still terminates and does not recede (the exact thing US-14
  was written to guarantee);
- the reviewer still reaches new uploads by exiting and reopening,
  which starts a new session with a new horizon;

and it fixes what the count could not: photographs decided by other
reviewers drop out of the walk instead of shifting it.

### 7c. What the progress indicator means with N reviewers

`ReviewQueue` keeps **local** counters
(`setCounts((c) => ({ ...c, approved: c.approved + 1 }))`, lines 64,
76 and 82). With four reviewers each sees a private tally and no idea what
the team has done — and the "12 of 47" badge reads as *your* work
against *everyone's* queue, which is a lie in the direction that makes
people think they are failing.

Two figures, labelled, never one:

- **"You: 12 decided (9 approved · 3 rejected · 2 skipped)"** — local,
  honest, and genuinely private: it is derived from this session's own
  actions and no attribution is read back from anywhere (§10).
- **"143 of this batch still waiting"** — a server count of pending
  photographs at or before the horizon, refreshed on the existing
  realtime + poll machinery, exactly as `specs/PROJECT.md` requires
  ("counts come from the server, never from arithmetic on payloads").
  It falls as the whole team works, which is what a reviewer actually
  wants to know.

The progress bar tracks the second figure (work remaining), not the
first.

**So the honest equivalent of "of 47" at four reviewers is: the batch
is still fixed, but the number left in it is shared and live.** The
fixed denominator was only ever a proxy for "how much is left", and
with four people that quantity genuinely moves. Freezing it would not
preserve the old promise, it would just display a stale one.

Completion (replacing Feature 004 design §4's "stepped through
`sessionTotal` photographs"): the session ends when the keyset walk
returns no further pending photograph at or before the horizon —
whether this reviewer decided them or someone else did. The completion
screen shows the reviewer's own tally, says plainly that others may
have decided some of the batch, and states how many photographs have
arrived since the horizon ("18 new since you started — start a new
session"). Skipped photographs are still pending, so they remain in the
batch; a reviewer who skips and then reaches the end is offered "go
through the ones you skipped" rather than being told they are done when
they are not. (Feature 004's completion text already promises skipped
photographs are still in Needs Review; this keeps that true.)

## 8. Realtime with several reviewers (US-36)

No new mechanism: `photos` is already in the realtime publication and
both the manage page and this queue already subscribe (Feature 003 §1,
Feature 004 §3). Two things change in how it is used.

- It stops being a nicety. With one reviewer, a missed UPDATE meant a
  stale card. With four, it is how a reviewer learns the photograph in
  front of them has just been decided by someone else. `ReviewQueue`
  does not subscribe today — it must, filtered on
  `event_id=eq.<id>`, and when an UPDATE says a photograph in the
  pending batch is no longer pending, that photograph is dropped from
  the local batch. If it is the one currently displayed, show the
  "already decided by someone else" notice and advance, exactly as §6
  does on a refused write. The subscription is the fast path; the §6
  precondition is the guarantee. Neither replaces the other.
- RLS applies to realtime, and co-approvers now satisfy the `photos`
  SELECT policy for their event (§4), so they receive the same stream
  an owner does — including, correctly, *pending* rows they could not
  see before.

The 30s poll fallback stays as it is. Feature 008 §2b-i's warning about
unbounded polled queries applies: the batch count query is
`head: true` with `count: exact` and transfers no rows.

## 9. Places, rotation, and the owner's panel (US-38)

A card on the manage page, next to "Share with guests" and owner-only:

- **No link yet** — one button, *"Create a reviewer link"*, with one
  line saying what it does: anyone with this link can review photos for
  this event; they cannot change settings or stop uploads.
- **Link exists** — the URL as selectable text and as a QR (same
  `CopyableLink` shape as `ShareLinks`, which US-33 asks for and which
  suits handing it out at a meeting), *"2 of 4 places taken"*, a places
  selector (1-20), and *"Replace link"*.
- **Replace link** confirms with the consequence spelled out: *"The old
  link stops working and all 2 people using it will need the new one."*
  That text is the requirement (US-38), not decoration — the thing a
  rushed owner must not be able to misread is that this is not
  per-person.
- *"Stop sharing"* deletes the link row; memberships cascade. Same
  confirmation shape.

**Rotation is the only revocation**, by decision. Rejected: *rotate but
keep existing approvers* (then a leaked link cannot actually be killed,
which is the only reason to rotate), and *per-approver revocation*
(there is nobody to name — §10 — so the owner would be choosing between
"claimed at 14:02" and "claimed at 14:06", which is worse than useless;
at 2-4 people everyone re-claiming costs a minute).

**Raising the limit admits more people without disturbing anyone**,
because it is a plain column update and admissions are rows (US-38).
This is also the remedy for the "losing a place costs a place" risk in
requirements.md: a co-approver who clears their browser or switches
device arrives as a new person and needs a free place. The panel's
"2 of 4 places taken" is what makes that visible before it becomes a
problem, and the owner should be advised in the run book (Feature 008
T6.4) to set places to **staff count + 2**.

## 10. Attribution: deliberately not recorded (US-39)

**Decided: the system does not record which reviewer decided which
photograph.** The organizer's reasoning: adding a co-approver should
not mean the app starts holding new personal data about a volunteer,
and a per-decision record is a surveillance artefact that would exist
forever for a benefit nobody has asked for. Rejected: *recording and
displaying it*, and *recording it silently* (which is worse than
either — the data exists, with all the obligations that implies, and
nobody knows).

**The tension, stated rather than buried.** Anonymous sign-in
necessarily creates an opaque identifier, and `event_approvers` holds
it. So it is not true that the system knows nothing; what is true, and
what this spec commits to, is:

- that identifier is **never written against a photograph** — no
  `decided_by`, no audit table, no `updated_by` trigger;
- it is **never displayed** to anyone, including the owner, who sees
  only a count of places taken;
- it carries no name, no email and no self-declared label, because
  nothing is asked of a co-approver at any point;
- it is **destroyed on rotation**, when the membership row is deleted.

Two honest footnotes. First, Supabase's own auth logs record sign-in
events — including, as any hosted auth service does, network-level
detail such as an IP address — for the platform's retention window.
That is outside this application's control and outside what it
queries, but "the system holds nothing about volunteers" would be an
overclaim, so it is not made. Second, and the real cost:

> **A photograph that should not have reached the screen is
> untraceable.** Nobody can be asked why they approved it, because
> nothing knows who did.

For a closed adult-staff course that is an acceptable trade. **It
should be revisited before this app is used at an event where youth are
present**, where a youth-serving organization may be required to answer
"who put that on the screen" and where the answer "we deliberately do
not know" is a different sort of problem. `CONSTITUTION.md`'s open
decisions carry this as a bounded, revisit-on-condition item (§14), not
as closed.

## 11. Interaction with private display copies (open decision 1 / #42)

`CONSTITUTION.md` decision 1 and Feature 006 design §6 commit to making
the `photos` bucket private, with reads signed under *"an RLS policy on
`storage.objects` mirroring the policy already on `photos` … signable
by an anonymous caller only while the row is `approved` and
`in_slideshow`, and **by the owning organizer** at any status."*

**Checked, and it would break this feature on the day it ships.** A
co-approver is neither "an anonymous caller" in the public sense nor
"the owning organizer". Under that predicate as written they could sign
only approved, in-slideshow objects — which is to say, every pending
photograph in the review queue and every rejected one in the Library
would be a broken image, on the screens whose entire purpose is looking
at those photographs. The failure is total and arrives silently with a
deploy nobody associates with this feature.

**The fix is one word and it must be written down now**: the mirrored
policy's organizer branch is `public.can_moderate_event(p.event_id)`,
not `organizer_id = auth.uid()`. Feature 006 design §6 is amended to
say so (§14). Two further notes for whoever builds it:

- the signing call must run with the approver's own session, which it
  will by default (it is the same browser client);
- Feature 006 §6's requirement to mint URLs on a rounded expiry
  boundary so clients share byte-identical URLs applies to the review
  screens as well, where Feature 008 §2b(4) already costs moderation at
  0.6-1.0 GB of transfer. Signing per cell per render would multiply
  that.

This is the clearest instance of the rule the constitution says this
project breaks most often, caught before rather than after: a later
feature's predicate is invalidated by this one, and the amendment is
made at the time.

## 12. Deploy order and tolerating an unapplied migration

`specs/PROJECT.md`, "Migrations and deploy order": migrations are
applied by hand, code is deployed separately, there is always a window
where one has landed and the other has not, **and the code must never
remove capability that existed before it.** Feature 007 shipped a guard
that read `undefined` as invalid and broke every settings save; that is
the standard being held to here.

**The migration widens and never narrows** (§4): every rewritten
predicate is "the old one OR membership". Applying it with the old code
deployed changes nothing observable. So **migrate first** is both safe
and preferred — but, per PROJECT.md, do not rely on remembering to.

If the code lands first:

- `event_approver_links` / `event_approvers` do not exist, and
  PostgREST answers `42P01`. The owner's approver panel must render a
  *"reviewer links aren't available yet"* state. It must **not** throw,
  and it must not take the manage page down with it — the page is where
  Stop uploads lives (Feature 007 US-23), and losing that to a missing
  table would be precisely Feature 007's bug again.
- The approver session's shared-events query fails the same way. Treat
  a failed membership query as **"no shared events"**, never as "not an
  owner": an account session's own list comes from its own query (§5)
  and must render regardless.
- The manage/review guards are `owner || approver`. With the table
  absent, `approver` must evaluate false on error, leaving the owner
  guard exactly as it is today. State the direction of failure
  explicitly in the code, per PROJECT.md's rule about booleans over
  possibly-absent columns.
- `/approve/[token]` degrades to the "link not valid" state. It is a
  new route; nothing regresses.

**One step is not SQL and cannot be.** Anonymous sign-in is an Auth
setting in the Supabase dashboard, not a table this project can write
in a migration — unlike the bucket `file_size_limit`, which Feature 007
§3 correctly insisted belonged in SQL. So it is a manual step (T0.1)
with a verification, and §3's error handling exists because an
acceptance criterion that depends on someone remembering a dashboard
click is hoped for, not enforced.

**Phases 1 and 2 are independently valuable and independently
deployable.** The §6 preconditions and §7 keyset paging are code-only,
need no migration, and are improvements for a *single* reviewer today
(the paging bug can skip photographs whenever a second tab or the grid
decides anything). Ship them first, separately, and the risky part of
this feature shrinks.

## 13. Where this sits on the February timeline

**E is confirmed: February 2027, E = 2027-02-05.** Feature 008's T-0
("confirm the actual course dates before anything below is scheduled")
is closed by this, and every date in Feature 008's schedule table
stands as written.

Feature 008 §13 requires multi-reviewer to be **deployed by E−7 weeks
(2026-12-18)** so it can be exercised at the **dry run, E−4 weeks
(2027-01-08)**, and the change freeze is **E−2 (2027-01-22)**.

Today is 2026-10-04. The plan:

| | Date | Why |
|---|---|---|
| Spec approved | ~2026-10-09 | This document |
| Phases 1-2 (concurrency fixes, migration) deployed | by 2026-10-30 | Code-only phase first; no dependency on the decision gate |
| Phases 3-5 (claim flow, panel, approver views) deployed | by **2026-11-27** | Before the Feature 008 mitigation window opens, not inside it |
| Concurrency test (§6/§7, Feature 008 T4.3) run with 4 people | at the dry run, 2027-01-08 | Needs four real devices; the dry run is the first time four people are in a room |
| Mitigation deadline | 2026-12-18 (E−7w) | **Met with three weeks of slack** |

**It fits, with margin, and the margin is deliberate.** Feature 008's
decision gate is 2026-11-20, and whatever it decides generates up to
three further changes to be specced by 11-27 and deployed by 12-18
(§11b criterion 6 — the criterion Feature 008 thinks is most likely to
force the paid plan). This feature must not be competing for that
window, which is why it targets 11-27 for the whole of itself rather
than 12-18. It also does not depend on the gate's outcome in either
direction: nothing here moves bytes.

One interaction worth recording in the other direction: **this feature
is what keeps Feature 008 §12b survivable.** That risk was sized as a
rate limit — "2-4 reviewers plus the organizer signing in on the
morning of the course" — and the documented position (verified
2026-10-05) is categorical instead: the default mail service delivers
only to project team members, so **the reviewers could never have
signed in at all**, and the day-before mitigation Feature 008 proposes
for them was never available. Co-approvers are admitted by a link and
receive no email, so the number of people who must get a working
sign-in drops to the owner alone, which is the one case the free tier
does support. Feature 008 §12b and T6.1 are re-scoped accordingly
(§14), and `CONSTITUTION.md` decision 6 is re-stated against the
team-only restriction rather than the rate limit: it now turns on
whether anyone other than the owner needs an *account* before the
course, which this feature is specifically designed to avoid.

## 14. Amendments this feature makes

Per `CONSTITUTION.md`: a feature that changes an earlier feature's
behaviour must amend that earlier spec. All of the following are
**carried out as part of this feature**, not noted for later.

| Spec | What changes |
|---|---|
| `CONSTITUTION.md` open decision 3 | Multiple organizers: struck through as **decided**, kept until this work lands |
| `CONSTITUTION.md` open decisions | New bounded row: the leaked approver link, accepted for adult-staff events, revisit before youth-present events (requirements.md, Accepted risks; §10) |
| `specs/PROJECT.md` — Stack | Auth row: anonymous sign-in exists, for co-approvers only, with the `is_anonymous` guard (§1e) |
| `specs/PROJECT.md` — Where the data lives | `event_approver_links` and `event_approvers` added |
| `specs/PROJECT.md` — Access control rule 2 | "Organizers see and change only their own events' photos" → membership-based for reading and moderating, one predicate (`can_moderate_event`); **deletion stays owner-only** (§0a) |
| `specs/001` US-6 | "an organizer sees only their own events and photos" is no longer the whole rule |
| `specs/001` out-of-scope ("Multiple organizers per event") | Superseded |
| `specs/003` US-10 / design §1 | "in principle another organizer" is now real; "no RLS changes needed — the organizer's existing SELECT policy" is now the membership policy |
| `specs/004` US-14 | Snapshot semantics: fixed *batch*, live *remaining*, private tally (§7) |
| `specs/004` design §1 and §4 | `.range()` paging on a shrinking filter replaced with keyset paging (§7a); `sessionTotal` replaced with a horizon (§7b) |
| `specs/006` design §6 | The mirrored `storage.objects` predicate's organizer branch becomes `can_moderate_event` (§11) |
| `specs/007` US-22 / US-23 | The actor is the **owner**, explicitly, now that "organizer" is ambiguous |
| `specs/008` T-0 | Closed: E = 2027-02-05 confirmed |
| `specs/008` §5c / T4.3 | The four-step concurrency test is absorbed as a task in this feature's `tasks.md` (T6.3) |
| `specs/008` §12b / T6.1 | Re-scoped: the risk is **categorical, not a rate limit** — the default mail service delivers only to project team members, so a co-organizer address is refused outright. Co-approvers do not use email at all, so the test is the owner alone (§13) |
| `specs/PROJECT.md` — auth email row, `CONSTITUTION.md` decision 6 | Both re-stated against the verified facts: 2 messages/hour, **team-only delivery**, silent from the app; templates do not require custom SMTP; the owner is a single point of failure for authenticated access |
| `specs/008` §3, §8c, T6.4, T7.2 | Deletion and retention cleanup are **owner-only work**. The storage arithmetic is unchanged (it already assumed rejection frees nothing), but the assumption that more reviewers means more hands for the deletion step is removed, and the pre-downgrade deletion in T7.3 is the owner's alone (§0a) |

Deliberately **not** amended: Feature 007 US-21 and Feature 005 US-17
(the join QR gated on moderation). Feature 008 US-29 says more
reviewers makes that coupling more survivable and must not be recorded
as resolving it. Nothing here touches it.

## 15. Deliberately not designed here

- Per-approver revocation and any identity for a co-approver (§10).
- Any role between co-approver and owner, or transfer of ownership.
- Feature 008 §5b's grid work (select-all, larger pages, thumbnails).
  It is the other half of moderation throughput and is independent of
  this; neither blocks the other.
- The bounded slideshow working set (Feature 008 §7) and private
  display copies (decision 1) — §11 states the one constraint this
  feature imposes on the latter and designs nothing else about it.
- Cleaning up anonymous users: a query, recorded in tasks, not a
  mechanism.
