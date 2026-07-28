# hrajsport.cz — Phase 2 Specification (v1.1.1)

## 0. Revision history

- **v1.0 (2026-07-28)** — initial Phase 2 contract, drafted from the post-launch update inventory and Oliver's rulings of 24–28 Jul.
- **v1.1.1 (2026-07-28)** — duration ruling, and one stale note removed.
  - **`duration_minutes` is a free numeric input bounded 30–180, defaulting to 60** (§5.2). 60 is the standard match length; 90 is the occasional per-game choice. This supersedes the v1.1 note that left the 90-vs-60 gap open as a ruling still owed.
  - **The fallback constant moves 90 → 60 to match**, shipped ahead of the column rather than with it. Safe only because the pre-launch reset emptied the games table, so no existing row's rendering changed — the same edit after rows exist silently rewrites how every past game reads. `lib/calendar/ics.ts` carried a **second, independent `90`**; it now derives from the policy module, so there is one fallback rather than two that must agree.
  - The v1.1 note about `fix/prelaunch-hardening` being unmerged is removed: it merged as `c59627d`, and this document merged after it, so the precondition it described is satisfied.
- **v1.1 (2026-07-28)** — pre-pipeline hardening pass. Every entry below is a decision recorded before the build rather than discovered at a gate.
  - **Organizer phone moves off `games` into its own table** (§5). `grant select on public.games to anon, authenticated` is table-wide, so a phone column on `games` would be world-readable the moment it existed, whatever the application did. It now follows the `game_roster_public` pattern: deny-by-default base table, `SECURITY DEFINER` read gated on the caller's active booking.
  - **The top-up flow gets its storage and its functions named** (§4): `credit_topups`, the `create_topup` / `confirm_topup` pair, a `'27'`-prefixed VS series distinct from the booking `'26'` series, and the `topup` addition to the `credit_ledger.reason` enum.
  - **Email change keeps double confirmation** (§3.3) — old and new address both confirm. Ruled 2026-07-28.
  - **Vercel Pro restores the §7 cron cadences at cutover** (§9), superseding v2.5 §2's "no external job runner". The external scheduler is retired only after a post-Pro Vercel cron execution is verified. Ruled 2026-07-28.
  - **Profile photo deletion folded into anonymization** (§4), superseding v2.5 §8, which nulls text PII and knows nothing about storage objects.
  - **`duration_minutes` fallback specified at every render site** (§5), including `.ics` and schema.org `endDate` — not only the card and detail.
  - **Auth email template inventory and the password-length setting become explicit G1 checklist items** (§3.1, §10).
  - **The dev database becomes a scheduled prerequisite** (§1.1) rather than an assumption, since production has no seed users to sign in as.
  - **Corrections:** the nickname charset citation is v2.5 §3, not §8 (§3.1); `site_settings` needs an explicit anon `SELECT` grant (§6); the §4 overpayment sentence is rewritten; the waitlist-depth removal is recorded as a supersession (§7); `games.skill_levels` becomes `games.allowed_skill_levels` to keep it distinct from `players.skill_level`.

---

## 1. Standing and relationship to Phase 1

This document is a **delta specification**. The Phase 1 contract (`letco-prompt-hrajfotbal-phase1-v2.md`, v2.5) remains in force for everything it covers; where this document is silent, v2.5 governs. Where this document speaks, it supersedes. §13 of the Phase 1 contract (spec-first dispute resolution, edit the contract before shipping divergence) applies to this document identically.

**Context that changes everything about how Phase 2 is built:** the platform is **live in production with real players and real money**. Phase 1's greenfield liberties are gone. Hard rules for the build:

- All work on feature branches; `main` deploys to production on push.
- Migrations are **additive only** (new tables, new nullable columns, new views/RPCs). No destructive migration ships without an explicit human gate sign-off naming it.
- `scripts/reset-platform.mjs` is **never run again** against this database. The E2E suite cannot sign in against production (seed users purged, by design) — E2E development happens against a seeded local/dev database (`npm run seed` there), never production.
- `EMAIL_DRY_RUN` is **off in production**. Any session testing email paths works locally with the dry-run seam on. No session flips the production flag.
- RPC-only writes, `SECURITY DEFINER` with `search_path=''`, deny-by-default RLS with explicit grants — all Phase 1 invariants stand unchanged.

### 1.1 Prerequisites, before any G1 work begins

These are not tasks inside a milestone; they are the conditions that make the milestones executable. Each is verifiable, and none of them is a coding session.

1. **A non-production database exists and is seeded.** Either a local Supabase stack (`supabase/config.toml` already describes one) or a second hosted project. `.env.local` currently points every tool in the repo — including Playwright — at production, and production no longer holds a single account the suite can sign in as. Until this exists, **no E2E work is possible at all**, and §8's screenshot loop has nowhere to run. Verified by: `npm run seed` succeeding against it, then `npm run test:e2e` green against it.
2. **The hosted project's password policy is set** — minimum length 8, matching §3.1. The project default is 6, and client-side validation does not constrain the API.
3. **The three auth email templates are inventoried and staged** (§3.1). Not switched on before the flow that needs them, but written and reviewed, because a wrong placeholder fails silently and Phase 1 lost a session to exactly that.

### 1.2 Supersessions of v2.5, in one place

For audit. Each is argued where it appears.

| v2.5 clause | Phase 2 position | Where |
|---|---|---|
| §2 "Scheduled jobs via Vercel Cron… **No external job runner**" | An external scheduler is permitted and currently required; Vercel Pro restores native cadences at cutover, after which the external jobs are retired | §9.1 |
| §3 / POLISH.md "no `ends_at` column, duration is a display constant" | `games.duration_minutes`, nullable, constant as fallback | §5 |
| §8 "deletion = anonymization: nickname replaced, email/phone nulled" | Plus: the profile photo object is deleted from storage | §4 |
| §9 "waitlist depth per game — the expansion-trigger sensor" | Removed from `/admin/stats`; the data remains queryable | §7 |
| §3 nickname charset | Unchanged — cited correctly as v2.5 §3 | §3.1 |

---

## 2. Goals

1. Replace passwordless-only auth with password-based accounts (with the OTP code as recovery), reducing login friction for returning players.
2. Give players a real profile: photo, history, credit top-ups.
3. Give organizers richer game setup (organizer contact, duration, skill restriction) and admins better operational views (player detail, reworked stats).
4. Rebrand and re-home the product at **hrajsport.cz/football**, with the path namespace reserved for future sports.
5. Land the accumulated content/visual changes (FAQ, stats strip, Player of the Month, venue photo panels, toasts).

---

## 3. Auth rework

### 3.1 Signup (new flow)

- Signed-out users see **two distinct entries: "Log in" and "Sign up."**
- Signup collects, in order: **email** (required), **username/nickname** (required; the existing charset rules from **v2.5 §3** apply — letters, digits, space, dash, underscore, max 20), **password** (required; minimum 8 characters), **country** (required; flag list, scrollable, type-to-jump), **skill level** (required; Beginner / Intermediate / Advanced), **phone** (optional), **TOS checkbox** (required), **game-reminders checkbox** (optional; writes the existing `marketing_opt_in`).
- **The 8-character minimum is a project setting, not a form rule.** The hosted project defaults to 6 and the API enforces whatever it is set to; a client-side check alone is decoration. Setting it is a §1.1 prerequisite and a G1 checklist line.
- Email verification happens **once, at signup** (link or code, same email machinery as Phase 1). After verification the account is password-authenticated forever.
- New columns on `players` (all nullable for existing rows): `country` (ISO 3166-1 alpha-2), `skill_level` (enum: beginner | intermediate | advanced), `tos_accepted_at` (timestamptz), `tos_version` (text).
- `/terms` page renders an attachable markdown document from the repo (`content/terms.md`); a placeholder ships until Oliver supplies the text (same convention as the privacy page — **no generated legal copy**).

**Auth email templates — the full inventory.** Phase 1 shipped one template and `AUTH_EMAIL_TEMPLATE.md` documents its `{{ .Token }}` / `{{ .TokenHash }}` treatment. Password auth adds two more, each a separate template in the Supabase dashboard, each failing the same silent way if its placeholder is wrong:

| Template | Fires on | Must carry |
|---|---|---|
| Magic Link | §3.2 recovery / no-password-yet path | `{{ .Token }}` **and** `{{ .TokenHash }}` link |
| Confirm signup | §3.1 first verification | `{{ .Token }}` **and** `{{ .TokenHash }}` link |
| Change email address | §3.3, sent to **both** addresses | `{{ .TokenHash }}` link |

All three are G1 checklist items, verified by receiving each on a real phone. A template that renders a button but no code produces a six-digit box that rejects every code — the Phase 1 failure, repeated per template.

### 3.2 Login

- **Password is the primary login.** Email + password, standard form, explicit submit button.
- **The OTP code path (built in Phase 1) becomes "Forgot password / no password yet":** requesting it emails the existing code+link mail; a verified entry lands the user in a set-new-password step, then normal session.
- **Existing passwordless players** (the current real accounts and anyone who signs up before Phase 2 ships): on first login after release they are routed through the OTP path into set-password, one time. No account is stranded.
- Sessions persist until explicit sign-out (Phase 1 behavior, now stated as contract). No "remember me" control.
- Magic-link deep flows (post-auth booking resume, shadow claim on exact email match) continue to work unchanged through the shared post-auth path. **Password signup must route through that same post-auth path** — the exact-email-match shadow claim is not an auth-method feature and must not be reachable only from the link flow.

### 3.3 Account management

- `/account` gains: **change password** (current password required), **change email**, both placed above the existing delete-account mailto.
- **Change email requires confirmation from both addresses** — the current one and the new one. This is Supabase's `double_confirm_changes` behaviour and it is kept deliberately: an email change is an account takeover in one step if the old mailbox has no say. The UI states plainly that two confirmations are needed and that the address does not change until both land. Ruled 2026-07-28.

---

## 4. Profile

- **Profile picture:** upload via Supabase Storage (dedicated bucket, public-read, authenticated-write of own object only; 2 MB limit; jpeg/png/webp; client-side crop to square). Initials avatar remains the permanent fallback everywhere. Admin can remove any player's photo (moderation; emits an event).
  - Storage policies are a **separate policy surface** (`storage.objects`) from table RLS and get the same deny-by-default treatment and the same explicit grants. The Phase 1 lesson applies unchanged: a missing grant returns empty rather than erroring, which reads as a missing photo rather than a missing policy.
  - The 2 MB limit is enforced at the bucket, not only in the browser.
- **Photo deletion on account anonymization (supersedes v2.5 §8).** v2.5 defines deletion as anonymization — the `players` row is retained, `nickname` replaced with a placeholder, `email`/`phone` nulled, `events` and `credit_ledger` preserved. That rule was written before photos existed and nulls only text. Anonymization now **also deletes the storage object and clears its reference**; a public-read image of someone who asked to be forgotten is the most visible PII the system holds, and it would otherwise outlive every column that named them.
- **History on `/account`:** games-played count, list of previous games (venue, date, attendance if marked), list of upcoming bookings (existing bookings surface, re-grouped).
- **Credit top-up:** a "Top up credit" action on `/account`. Player picks or enters an amount (presets 150 / 300 / 450 CZK, free entry allowed, min 50 / max 2000). The system creates a **pending top-up**, renders the standard SPD QR screen, and emits `topup_requested`. Admin confirms receipt via the same one-tap pattern as booking payments. Confirmation writes the ledger (`reason: topup`), emits `topup_confirmed`, and sends a **receipt email** (new template, standard format: amount, new balance, VS reference). Credit spends through the existing auto-apply rails unchanged.

### 4.1 Top-up data model and functions

Named here because "same pattern as bookings" does not survive contact with the schema: `bookings.payment_code` is `bigint unique` under a `payment_method = 'qr'` check constraint, so a top-up cannot borrow that row.

- **`credit_topups`** — `id, player_id, amount_czk int, payment_code bigint unique, status (pending|confirmed|cancelled), received_amount_czk int null, confirmed_by uuid null, confirmed_at timestamptz null, city, brand, policy_version, created_at`. RLS deny-by-default; a player reads their own rows; **no client writes** — the RPCs below are the only writers, per v2.5 §3.
- **VS series.** Booking VS is `'26' || lpad(nextval('booking_payment_code_seq'), 8, '0')`. Top-ups take a **separate sequence with a `'27'` prefix**, so both stay inside the Czech 10-digit VS limit and cannot collide, and a bank statement distinguishes a top-up from a game payment at a glance. Never reused, like the booking series.
- **`create_topup(p_amount_czk int)`** — owner-only, identity from `auth.uid()`, never from an argument. Validates the 50–2000 range, draws the VS, inserts `pending`, emits `topup_requested`, returns the row for the QR screen.
- **`confirm_topup(p_topup_id uuid, p_confirmed_by uuid, p_received_amount_czk int default null)`** — admin-or-service-role only, mirroring `confirm_booking`'s signature so a future bank poller calls it the same way. Writes the ledger row, flips the status, emits `topup_confirmed`, all in one transaction.
- **Reconciliation for top-ups is simpler than for bookings, and deliberately different.** A booking has a price, so a payment can be short or long of it and v2.5 §4's under/over rules apply. A top-up has no price — the player chose a number and the bank reports what actually arrived. **The credited amount is always the received amount.** `received_amount_czk` null means "credit the requested amount" (the one-tap path); when supplied, that value is credited and the requested amount is only ever a record of intent. There is no overpayment case and no underpayment case, because there is nothing to be over or under.
- **Ledger enum.** `credit_ledger.reason` gains `topup`. `alter type … add value` cannot run in the same transaction that uses the new value, so it ships as its own migration ahead of the one that writes it.
- **Unconfirmed top-ups are not liabilities and not spendable** — the balance is `SUM(delta_czk)` over `credit_ledger`, and a pending top-up writes nothing there. A top-up paid but never confirmed is an admin follow-up, exactly like an unmatched booking payment (v2.5 §4), and is resolved through the same manual credit grant with a `payment_unmatched` event.
- New events for the v2.5 §3 catalog: `topup_requested`, `topup_confirmed`, `profile_photo_removed`.

---

## 5. Games: setup and display

- **Organizer per game:** game creation/edit gains organizer **name** (required, defaults to the creating admin's nickname) and organizer **phone** (optional). Name renders publicly on card and detail. **Phone renders only to players with an active booking on that game.**

### 5.1 Organizer phone: where it lives, and why not on `games`

Migration 1 does `grant select on public.games to anon, authenticated` — **table-wide**. Every column of `games` is readable by anyone through PostgREST, and a column added tomorrow is exposed the moment it exists. An application-side check would gate the render and nothing else; the number would still be one API call away. The same migration already grants player-facing `UPDATE` per column, with a comment noting that an RLS policy cannot restrict which columns a role may touch — the mechanism is understood in this codebase, it simply was not applied to `SELECT`.

So the phone does not go on `games`:

- **`game_organizer_contacts`** — `game_id (PK, FK games), organizer_name text not null, organizer_phone text null, created_at, updated_at`. RLS enabled, **deny-by-default, no grants to `anon` or `authenticated` at all**. Written only through the admin game RPCs.
- **`game_organizer_public`** — a `SECURITY DEFINER` read exposing `organizer_name` for any published game, on the same terms as the roster view: public, projected, no PII.
- **`game_organizer_phone(p_game_id uuid)`** — a `SECURITY DEFINER` function returning the phone **only** when `auth.uid()` resolves to a player holding a `reserved` or `confirmed` booking on that game, and null otherwise. Identity from the session, never from an argument (v2.5 §3). This is the `game_roster_public` pattern applied to a single field: public projection over a private base.
- A test asserts anon cannot retrieve `organizer_phone` by any route, and that a player without an active booking on that game cannot either — the same assertion shape as v2.5 §11.10.

### 5.2 Duration

- New nullable column `duration_minutes` on `games` — a **free numeric input at create/edit, bounded 30–180, defaulting to 60**. Cards and detail render `TUE 28 JUL 19:30–20:30`.
- **60 is the standard; 90 is an occasional per-game choice.** That is the inversion of the Phase 1 assumption — the M5 ruling rested on "every game this product runs is in fact 90 minutes" — and it is why the column arrives now.
- **This supersedes the Phase 1 "policy constant only" ruling** — POLISH.md deferred the column until a differently-long game was actually scheduled, and one has been. The constant `policy.game.durationMinutes` remains the fallback for null rows and is not removed.
- **The constant moves 90 → 60 to match, and shipped ahead of the column** (2026-07-28). Safe only because the pre-launch reset had emptied the games table: with no rows, no existing game's rendering changed. The same edit made after rows exist rewrites how every past game reads, silently — so if this is ever revisited with live data, the question is whether to backfill, never whether to move the fallback.
- **There is one fallback, not two.** `lib/calendar/ics.ts` carried its own `DEFAULT_DURATION_MINUTES = 90`, independent of the policy module. It now derives from `policy.game.durationMinutes`, with a test asserting they agree — two constants that must match and nothing enforcing it is a calendar entry that contradicts the page it came from.
- **The constant stays display-only and `POLICY_VERSION` does not move.** Nothing transitions on a duration — no RPC, no sweep, no state change consults it — so this is not a policy window in the v2.5 §5 sense and stamping a new `policy_version` would falsely imply the cancellation, nudge and expiry windows had changed.
- **Every site that reads the constant takes the column-with-fallback treatment** once the column ships, not only the card and detail:
  - the `.ics` builder — player-visible in a phone calendar, and covered by existing tests;
  - `lib/games/schemaOrg.ts` `endDate` — structured data fails silently, so its tests are the only feedback loop;
  - the "in progress" label wherever a game's end time is inferred.
  A render site left on the constant produces a game whose calendar entry disagrees with its own page.

### 5.3 Skill restriction

- Game create/edit selects **All levels** (default) or one/two specific levels. All-levels games render **no badge anywhere**. Restricted games render the level badge(s) on the card and detail.
- New nullable column **`allowed_skill_levels`** (enum array) on `games` — named apart from `players.skill_level` deliberately, because a scalar and an array one letter apart is a bug waiting for a tired afternoon.
- Restriction is **display and social signaling only** in Phase 2 — booking is not enforced against player skill (revisit with data).

### 5.4 Venue and share

- **Venue photo panel:** the traced-map panel is replaced by a **venue photo panel** using the existing venue image slot (`public/venues/`, image reference on the venue). Photos are human-supplied real pitch photographs (VENUES.md gets a v2 recipe: photograph the pitch, landscape, Claude crops/grades to the panel frame). Beneath the panel: venue name + **"Open map"** button (existing Google Maps link). A venue without a photo renders name + button only — no empty frame. The traced-map assets remain in the repo, unused.
- **Share:** game card and detail carry **Copy link** (primary) and **WhatsApp** (secondary) share actions. Copy shows a confirmation toast.

---

## 6. Home page

- Language switcher stays (Phase 1).
- **How-it-works moves up:** the 01 find a game / 02 claim your spot / 03 show up strip relocates above the fold-two content; directly beneath it, the equipment line: **"Training bibs, goalie gloves and balls provided."**
- **Stats strip** under the wordmark (scrolling section, not the fixed header): **Games per week** (computed from published games, trailing 7 days) and **Active players** (an admin-editable number — a new single-row `site_settings` table, admin RPC to update, honest framing: community size including the WhatsApp cohort).
- **`site_settings` is read anonymously and must say so.** Both the stats strip and Player of the Month render for signed-out visitors, so the migration grants `select` to `anon` and `authenticated` explicitly. Writes go through the admin RPC only. Without the grant the reads return empty rather than erroring, and an empty stats strip looks like a content bug rather than a permissions one — the most repeated lesson in this project.
- **Community section becomes three equal panels:** Join the Community (existing) · **FAQ** · **Player of the Month** (photo + username, admin-picked via a `site_settings` reference; renders initials avatar if the player has no photo).
- **FAQ content (final):**
  1. *When should I show up?* — 10 minutes before kickoff.
  2. *What should I bring?* — Shoes and yourself. Bibs, gloves and balls are provided.
  3. *How do I pay?* — Scan the QR from your banking app after booking, or pay cash at the pitch.
  4. *What if I can't make it?* — Cancel anytime before kickoff for full wallet credit.
  5. *What if the game is full?* — Join the waitlist; we email you the moment a spot opens.
  6. *Do I need to be good?* — All levels welcome; games are casual unless a level badge says otherwise.

---

## 7. Admin

- **Player detail pages:** clicking a player in the admin list opens their page: photo, nickname, email, country, skill, credit balance, games-played count, per-game list (venue + date + attendance), no-show count. **Manual no-show marking** lives here and on the game roster (both call the existing `mark_attendance` RPC).
- **Manage merges into Edit:** one game-editing surface carrying all current manage functions (add shadow player, roster, ✓ Paid, attendance, cancel).
- **Stats rework:** remove credits-outstanding, magic-link drop-off, waitlist depth. Keep **no-show rate**. Add: **fill rate** (spots sold ÷ capacity), **confirmed revenue** (CZK), **new vs. returning players**, **cancellations**. All metrics filterable **day / week / month**. Everything remains a query over the events log and current tables — no new tracking machinery.
- **Removing waitlist depth supersedes v2.5 §9**, which called it "the expansion-trigger sensor". The decision is that a number nobody looked at is not a sensor. Nothing about the data changes — `waitlist` is intact and the depth is one query away the day it is wanted again; only the panel goes.
- Admin sets **Active players** and **Player of the Month** (both in the new `site_settings`, via admin RPC, each change emitting an event).

---

## 8. General UX

- **Toast notifications** for: booking created, sign-in, cancellation + credit ("Refund completed — 150 CZK credited"), top-up confirmed, link copied. One shared component, volt-on-black, auto-dismiss.
- **The UX iteration loop** (working method, not a feature): the Playwright harness produces screenshot strips of key flows at phone width; Oliver reviews strips and returns batch verdicts; sessions apply. Used at each Phase 2 gate. This runs against the §1.1 dev database — it cannot run against production.

---

## 9. Rebrand and domain cutover

- The product moves to **hrajsport.cz**, football living at **`/football`**.
- Implementation: **Next.js rewrites** map `/football/*` onto the existing routes (code does not physically move); `/` on hrajsport.cz redirects to `/football`. The path namespace (`/volleyball`, …) is reserved; the `brand`/`city` stamps from Phase 1 remain the data-side preparation.
- Cutover (the **final step of Phase 2's last gate**, human-executed): attach hrajsport.cz in Vercel; update `NEXT_PUBLIC_SITE_URL`; update Supabase Site URL + redirect list (keep the old vercel.app URL in the redirect list during transition); OG metadata to the new origin; the old URL 301-redirects. Wordmark and brand within `/football` remain **HRAJ FOTBAL**.
- Every origin-derived surface moves with `NEXT_PUBLIC_SITE_URL` and is checked at the gate: OG `metadataBase`, the share-link builder, the `.ics` URL field, and the auth `emailRedirectTo`. A redirect target that is not on the Supabase allow-list **does not error** — it silently redirects to the project Site URL, where nothing exchanges the credential (v2.5, and the Phase 1 lesson that cost the most).
- **Nothing in this section happens before the cutover gate.** All prior Phase 2 work is verified on the existing production URL and branch previews.

### 9.1 Cron cadence at cutover (supersedes v2.5 §2)

v2.5 §2 states "Scheduled jobs via Vercel Cron hitting authenticated API routes. **No external job runner.**" That has not been true since launch: the Hobby plan permits daily cron only, so `vercel.json` runs the three sweeps once a day and an external scheduler (cron-job.org) drives the §7 cadences over the same `CRON_SECRET`-gated routes. **This document supersedes that clause: an external runner is permitted, and is currently required.**

Vercel Pro is mandatory by G3 (§10) and lifts the limit. At cutover:

1. Restore the §7 cadences in `vercel.json` — expiry every 15 minutes, nudge and reminder every 30.
2. Deploy, and **verify a real post-Pro Vercel cron execution** — a fired run visible in the Vercel log with its matching `booking_expired` / `nudge_sent` / `reminder_sent` rows, not merely a schedule that has been accepted.
3. **Only then** retire the cron-job.org jobs. Ruled 2026-07-28: the external jobs are the safety net for exactly as long as the native ones are unproven, and both running together is harmless — all three routes are idempotent, which was proven at the M3 gate.

After retirement the runbook (`LAUNCH.md`) records the external scheduler as historical rather than deleting it, since the Hobby-plan constraint returns the day the plan does.

---

## 10. Gates

Phase 2 has **three human gates**; the planning pipeline maps its phases onto them. §1.1's prerequisites are complete before G1 work begins.

- **G1 — Auth + profile:** a brand-new user signs up with password on a real phone (country, skill, TOS); an existing passwordless user is migrated through the OTP→set-password path; password change works; an email change is confirmed from **both** addresses; a profile photo uploads and renders, and is gone from storage after an anonymization; a top-up flows end to end (request → QR → admin confirm → balance + receipt email). No existing player locked out.
  - Checklist items that are settings rather than code, each verified explicitly: **password minimum is 8 on the hosted project**; **all three auth email templates** (Magic Link, Confirm signup, Change email address) received on a real phone, each showing both a working link and a readable code where §3.1 requires one.
- **G2 — Games + content:** a game created with organizer/duration/skill restriction renders correctly everywhere (badge only when restricted, phone only to booked players — and **not retrievable by anon through any route**); venue photo panel + Open-map fallback verified; home page carries the new strip, FAQ, three-panel community section; stats rework verified against a known week of data; toasts observed. Duration verified in the `.ics` and the structured data, not only on screen.
- **G3 — Cutover:** full §11-style checklist on a phone at hrajsport.cz/football; old URL redirects; auth round-trips on the new origin (link and code paths both); one real game booked post-cutover; **Vercel cron cadences restored and one native execution verified before the external jobs are retired** (§9.1). Vercel Pro must be active by this gate.

---

## 11. Out of scope for Phase 2

Ordered/prioritized waitlist (FCFS stands; revisit with data) · booking enforcement by skill level · translated transactional email (`players.locale` remains backlog; emails stay English) · push notifications · a separate staging database (E2E runs against a locally seeded database instead) · payment provider integration (bank QR + admin confirm remains the payment system) · any second sport's actual content.

---

## 12. Process

This spec goes through the Pilot's full pipeline: analysis → validation → implementation plan → execution plan → build, with the same adversarial review posture as Phase 1 and the same standard: **machines gather evidence, humans render verdicts.** The plan document of record lives in the repo. Gate verifications are recorded in both the plan and the repo snapshot. CLAUDE.md's Phase 1 lessons apply from day one.
