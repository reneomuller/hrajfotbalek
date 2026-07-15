# hrajfotbal.com — Phase 1 Build Specification (v2.3)
## Analysis document for Letco (living documentation seed)

**Instruction to the platform:** This document is the source of truth. Where implementation questions arise that this document does not answer, do NOT invent a resolution — surface the question at the next milestone gate. Build in the milestone order defined in §10; each milestone ends with a human verification gate. Do not proceed past a gate without confirmation.

---

## 1. Product intent (PO level)

Booking platform for pickup football games in Prague. Single city, single sport. **Base language: English.** Direct-to-player: nicknames on public rosters, email authentication behind the scenes. Mobile-first — assume 100% of traffic is phones.

This is Phase 1 of a larger platform (Ballin247 holdco). Phase 1 scope is deliberately minimal, but the schema and event log must support multi-city, multi-sport, referrals, and organizer marketplace later **without rewrite**. Every table and event therefore carries city/brand/policy_version stamps even though Phase 1 uses only one value for each.

Three primitives every decision must protect:
1. **Durable player identity** — decoupled from auth. Admins create "shadow" players (from WhatsApp signups) who have never logged in. A shadow player later claims their identity by signing up with a matching email.
2. **Booking state machine** — every spot is a state transition. Payment confirmation is a state change indifferent to whether a human tap or a future bank-API poller triggered it.
3. **Append-only event log** — every notable action writes to `events`. Every future metric must be a SQL query, not a project.

---

## 2. Stack and conventions (non-negotiable)

- Next.js, App Router, TypeScript, Tailwind. Deployed on Vercel. `main` = production.
- Supabase: Postgres, email magic-link auth (built-in), Row Level Security on every table.
- Resend for transactional email. **The Resend domain/DNS may not be verified when the build starts.** Structure all email sending behind a single `sendEmail()` module with an `EMAIL_DRY_RUN` env flag that logs instead of sending. Build and test everything against dry-run; flipping the flag is the only change when DNS clears.
- Scheduled jobs via Vercel Cron hitting authenticated API routes (see §7). No external job runner.
- **Auth email is outside the dry-run seam.** The Supabase magic-link email is NOT routed through `sendEmail()` and is unaffected by `EMAIL_DRY_RUN`; it uses Supabase's built-in email sender until M5, when Supabase SMTP is switched to Resend (see §8).
- **Language:** all user-facing strings in one centralized module (`/lib/strings.ts` or equivalent) keyed in English with **English values**. Czech and Russian translations come later — the centralization is the Phase 1 requirement, translation is not. No hardcoded UI strings anywhere else.
- **Timezone:** all times stored as `timestamptz` (UTC); all display in `Europe/Prague`, formatted 24-hour (e.g. "Thu 18:30"). Never render raw UTC to a user.
- Design: volt-on-black aesthetic; design reference is the attached HTML. Match it, don't reinterpret it.

---

## 3. Data model

Migrations only — every schema change is a migration file, and RLS is enabled in the same migration that creates a table (deny-by-default; see §8).

### players
`id, nickname (unique, required), email (unique, nullable for shadow), phone (nullable), auth_user_id (nullable FK to auth.users — null = shadow player), is_admin bool, is_seed bool, marketing_opt_in bool, created_at`

**Nickname validation (signup):** the nickname is restricted to a **safe charset — letters, digits, space, dash `-`, and underscore `_` — max 20 characters.** This single input constraint closes two surfaces at once: (a) the Open Graph / public-roster **XSS** surface (no `<`, `>`, `&`, quotes, or markup can ever enter a nickname), and (b) the SPD payment-string **injection** surface (no `*` or `:` — the SPD field and key delimiters — can ever reach the QR payload; see §4). Input outside the charset or length is rejected with a friendly inline error. Duplicate nickname at signup likewise returns a friendly inline error suggesting the name is taken — never a raw constraint error.

### games
`id, venue text, starts_at timestamptz, capacity int, price_czk int, status, city text default 'prague', brand text default 'hrajfotbal', created_at`

Game status machine:
`draft → published → (full ⇄ published) → played → settled`, with `played` reachable from either `full` or `published`, and `cancelled` reachable from draft/published/full.
- `draft → published`: admin **Create** saves a game as `draft`; an explicit admin **Publish** action performs `draft → published` and emits `game_published`. Games are never auto-published.
- `published → full`: automatic when confirmed+reserved bookings reach capacity.
- `full → published`: automatic when a spot releases.
- `published → played` / `full → played`: `played` set by admin after start time, regardless of whether the game sold out — an under-capacity game is marked `played` directly from `published`. `settled` set by admin after attendance marking completes.
- Game cancellation: all active bookings cancelled, any applied money credited to wallets, waitlist cleared, all affected players emailed.
- Game edits with active bookings: **capacity can never be reduced below the current count of active (reserved + confirmed) bookings** — the admin edit is rejected otherwise. **Price changes never affect existing bookings** — each booking's `price_czk`/`credit_applied_czk` is locked at booking time; a new price applies only to bookings created after the edit.

### bookings
`id, game_id, player_id, status, payment_method (qr|cash|credit|seed_free), payment_code (unique numeric VS, nullable — only QR bookings), price_czk, credit_applied_czk int default 0, is_seed bool, booked_by_admin bool, attendance (null|present|no_show), nudge_sent_at timestamptz null, reminder_sent_at timestamptz null, expires_at timestamptz null, cancel_lead_hours numeric null, created_at`

Booking status machine — **transitions ONLY via dedicated server functions, each writing its event in the same transaction:**

| From | To | Trigger | Server function | Event |
|---|---|---|---|---|
| — | reserved | player books (QR/cash) | `createBooking()` | booking_created |
| — | confirmed | seed booking, or full-credit booking | `createBooking()` | booking_created + payment_confirmed |
| reserved | confirmed | admin ✓ Paid (or future bank poller) | `confirmBooking()` | payment_confirmed |
| reserved | cancelled | player cancels, or game cancelled | `cancelBooking()` | booking_cancelled (+ credit_issued if money was applied) |
| confirmed | cancelled | player cancels, or game cancelled | `cancelBooking()` | booking_cancelled + credit_issued |
| reserved | expired | nudge window lapses | `expireBooking()` (cron) | booking_expired |

Any transition not in this table is invalid and must be rejected at the function level. `spot_released` fires on every cancelled/expired transition that frees capacity in a non-cancelled game.

**Server-function mandate (non-negotiable):** these transitions are implemented as **plpgsql `SECURITY DEFINER` functions** — `create_booking`, `confirm_booking`, `cancel_booking`, `expire_booking` — invoked from the app exclusively via `supabase.rpc()`. The logical names in the tables above (`createBooking()` etc.) map one-to-one to these database functions. Each function performs its state check, insert/update, ledger writes, and event insert in a single database transaction. No state-bearing table is ever written from TypeScript directly, and no transition is ever assembled from separate client-side queries — the "same transaction" guarantee only holds inside the database.

**Function authorization (non-negotiable):** every `SECURITY DEFINER` function hardens its `search_path` (`SET search_path = ''`, schema-qualifying every reference) to close the classic definer privilege-escalation vector, and derives identity from the session — **never** from a client-supplied player or booking id. `create_booking` and `cancel_booking` are **owner-only**: the acting player is resolved from `auth.uid()` and must own the target booking; a call passing another player's id is rejected. `cancel_booking` additionally enforces the §5 cancellation window — it rejects the call unless the game is `published` or `full` **and** `now() < starts_at`; after kickoff a booking can no longer be cancelled and its outcome is set solely by attendance marking (§9). `confirm_booking` and `expire_booking` are **admin-or-cron-only**: permitted only when `auth.uid()` maps to an admin player, or the call runs in the service-role cron/admin context. No function ever trusts a client-supplied identity.

**Concurrency rule (critical):** all advisory locks are transaction-scoped (`pg_advisory_xact_lock`, auto-released at commit). Because every `id` is a UUID (not a bigint), each lock hashes the id to a bigint key: `pg_advisory_xact_lock(hashtextextended(<id>::text, 0))` — this hashing form is used **everywhere** an advisory lock is taken. `create_booking` acquires locks in a fixed order to avoid deadlock — **player lock first, then game lock**:
1. `pg_advisory_xact_lock(hashtextextended(player_id::text, 0))` — serializes this player's credit redemptions across all games (see the credit-redemption rule below).
2. `pg_advisory_xact_lock(hashtextextended(game_id::text, 0))` — serializes capacity for this game.

Under the game lock, count active bookings (reserved + confirmed) and insert only if count < capacity. Plus a defensive unique constraint on `(game_id, player_id)` where status in (reserved, confirmed) — one active booking per player per game. Never enforce capacity in application code alone.

**Credit-redemption serialization (critical):** the game lock protects capacity but **not** the player's wallet, which is player-scoped, not game-scoped. Two near-simultaneous bookings by one player for *different* games take different game locks and do not block each other; without a player lock both would read the same balance and both redeem it, driving the ledger negative — the same credit spent twice. The player lock in step 1 serializes redemption per player. Holding it, `create_booking` re-reads the balance (`SUM(delta_czk)` for the player), applies `min(balance, price)`, and writes the negative redemption row **only if the resulting balance stays ≥ 0**, rejecting any redemption that would take it below zero. The non-negative-balance guard is the belt-and-suspenders backstop behind the lock.

### credit_ledger
`id, player_id, delta_czk int, reason (cancellation_credit|admin_grant|redemption|adjustment), booking_id nullable, created_at`
Append-only — no UPDATE or DELETE, enforced by RLS/privileges. Balance = `SUM(delta_czk)` and **must never go negative**. Redemptions are negative rows written inside the `create_booking` transaction under the per-player advisory lock (see the concurrency rule above), which re-reads the balance and rejects any redemption that would take it below zero.

### waitlist
`id, game_id, player_id, joined_at, notified_at nullable, converted_booking_id nullable`
Unique on `(game_id, player_id)`.

### events
`id, event_type text, player_id nullable, game_id nullable, booking_id nullable, metadata jsonb, city, brand, playbook_version text default 'v1', policy_version text default 'v1', created_at`
Append-only. Full Phase 1 catalog:
`account_created, auth_link_sent, auth_completed, game_published, game_cancelled, game_settled, booking_created, payment_confirmed, booking_cancelled, booking_expired, spot_released, waitlist_joined, waitlist_notified, waitlist_converted, nudge_sent, reminder_sent, attendance_marked, credit_issued, credit_redeemed, payment_unmatched, admin_booking_created, player_claimed`

Every server function that changes state writes its event **in the same transaction** as the state change. A state change without its event row is a bug.

### game_roster_public (view)
Nicknames + booking statuses for a game. **No email, phone, or player id exposure.** This view is the only thing anonymous users read for rosters. Implement it as a **`SECURITY DEFINER` view/function** (owned by a role with `SELECT` on the base tables) projecting only `nickname` + booking `status`, so anonymous reads bypass the row-owner RLS on `bookings` without leaking any PII. A test asserts anon cannot retrieve `player_id`, `email`, or `phone` (see §11.10).

---

## 4. Payments (Phase 1: semi-manual, automation-ready)

Payments remain Czech regardless of UI language: CZK, Czech QR platba standard, variable symbols.

- Every QR booking gets a unique numeric **variable symbol (VS)**: literal prefix `26` + the global sequence zero-padded to **8 digits** (10 characters total, within the Czech VS 10-digit limit), e.g. `2600000001`. Postgres sequence; never reused.
- Player payment screen renders a **Czech SPD 1.0 QR string** encoded as QR code, exactly:
  `SPD*1.0*ACC:<IBAN>*AM:<amount>.00*CC:CZK*X-VS:<VS>*MSG:<NICKNAME>`
  IBAN comes from env variable `PAYMENT_IBAN`. Also render the same data as plain text fallback (account number, amount, VS) below the QR.
  The `MSG` value (player nickname) is **sanitized before interpolation**: strip every character outside the SPD-permitted set — the asterisk `*` (the SPD field delimiter) above all, plus control and non-ASCII characters — and cap the field length (SPD `MSG` max 60 chars). A nickname can never break the SPD framing or overflow the field.
- Amount = `price_czk − credit_applied_czk`. If credit covers the full price, the booking confirms instantly with `payment_method = credit` and no QR is shown.
- Credit auto-application: `create_booking` reads the ledger balance **under the per-player advisory lock** (§3 concurrency rule), applies `min(balance, price)`, writes the negative redemption row (rejecting any that would take the balance below zero), and sets `credit_applied_czk` — all in the same transaction.
- Cash at pitch: selectable at booking; booking sits in `reserved` until admin confirms at the game.
- Seed players (`is_seed`): price 0, `payment_method = seed_free`, confirmed instantly, flagged at booking level.
- Admin confirmation: pending bookings sorted by VS, one-tap ✓ Paid → `confirmBooking()`. Target ≤5 seconds per confirmation including page load.
- **Automation seam:** `confirmBooking(bookingId, confirmedBy)` is the single entry point. A future Fio bank poller calls the same function. Nothing in Phase 1 may assume the confirmer is human.
- **Payment reconciliation (policy, not a module — `policy_version = 'v1'`):** the VS-sorted pending list (admin one-tap ✓ Paid) is the **only** reconciliation surface in Phase 1 — no separate admin queue UI is built.
  - **Underpayment** (amount received < amount due): the booking stays `reserved`; the admin follows up manually. No auto-confirm.
  - **Overpayment** (amount received > amount due): the admin confirms the booking (`confirm_booking`) and the difference is issued as wallet credit (`credit_issued`).
  - **Payment after expiry** (booking already `expired`): the full amount is issued as wallet credit; the spot is **not** reinstated.
  - **Unmatched payment** (no VS match): resolved by a manual admin credit grant, logged with a `payment_unmatched` event.

---

## 5. Policies (versioned v1 — implement as config values, not hardcoded logic)

Config module with named constants; `policy_version = 'v1'` stamped on events.

- **Cancellation:** permitted **only while the game is `published` or `full` and strictly before `starts_at`**; once kickoff (`starts_at`) passes, a booking can no longer be cancelled and its outcome is determined **solely by attendance marking** (present / no_show, §9). Within that window, cancellation at any lead time → full credit of money actually applied (QR-paid, cash-paid, and/or credit-applied amounts) to wallet via `cancellation_credit`. "No cash refunds ever" means no money ever leaves the system — a cancelled cash-paid booking is refunded as wallet credit, never returned as cash. Record `cancel_lead_hours` on the booking. Unpaid reserved cancellations (no money applied) issue no credit.
- **Reservation hold:** unpaid reservations hold until game day by default (`expires_at` null unless nudged).
- **Scarcity nudge:** when a game is full AND waitlist ≥ 1, every unpaid `reserved` booking — **including cash reservations** — gets one email: "pay online within 12h or lose the spot." Sets `nudge_sent_at` and `expires_at = now() + 12h`; on expiry the spot is released to the waitlist like any other. No exemption for cash, and no manual-release surface. Confirmed (prepaid) bookings are never expired by this mechanism — prepaying is spot insurance. One nudge per booking, ever.
- **Expiry:** cron sweeps bookings where `expires_at < now()` and status = reserved → `expireBooking()` → spot_released → waitlist notification. A payment that lands **after** a booking has expired is credited in full to the player's wallet (see §4 payment reconciliation) — the spot is never reinstated.
- **Waitlist:** one-tap join on full games. When a spot frees (cancel or expire), email **all active** waitlisted players (those with no `converted_booking_id`) simultaneously (`waitlist_notified`; `notified_at` = the last time notified, **not** a suppression flag — players are re-notified on every subsequent release), first-come-first-served. The race is settled by `create_booking`'s transactional capacity check — first successful insert wins; later attempts get a friendly "spot already taken, you're still on the waitlist" screen. A waitlisted player converts by calling `create_booking` with a `from_waitlist_id` argument, which sets `converted_booking_id` and emits `waitlist_converted` in the same transaction.
- **Game reminder:** every player with an active booking gets one reminder email 24h before `starts_at` (`reminder_sent` event). One per booking, ever.

---

## 6. Low-cost additions (IN scope — small, but build after the core of each milestone, never instead of it)

1. **Open Graph meta tags** on `/game/[id]` and `/` — venue, date/time, spots left, volt-on-black share image. Game links will be shared almost exclusively in WhatsApp; the preview card is an acquisition surface. (M2)
2. **Add-to-calendar:** `.ics` download link on the booking confirmation screen and in the confirmation email — venue as location, starts_at, 90-min default duration. (M2)
3. **PWA basics:** manifest + icons + theme color so "Add to Home Screen" produces a clean app icon and splash. No offline logic, no service-worker complexity. (M5)
4. **Admin stats page** (`/admin/stats`, read-only): signup→first-booking→attendance funnel, booking-to-payment conversion, no-show rate, waitlist depth per upcoming game, credit outstanding, magic-link drop-off. All direct SQL over `events` + tables — no new infrastructure. (M4)
5. **Seed/fixture script:** one command that populates a dev database with sample players (incl. shadow + seed), games in each status, bookings in each state, waitlist entries, and credit balances — so admin UI and E2E tests run against realistic data. (M1, extended at each milestone)

---

## 7. Scheduled jobs (Vercel Cron → authenticated API routes)

Routes gated by `CRON_SECRET` header check.
1. **Nudge job** (every 30 min): find full games with waitlist ≥1, send at most one nudge per eligible booking.
2. **Expiry sweep** (every 15 min): expire lapsed reservations, release spots, fire waitlist emails.
3. **Reminder job** (every 30 min): send 24h-before reminders, at most one per booking.

All jobs must be idempotent — running twice in a row produces no duplicate emails or events.

---

## 8. Auth, privacy, security

- Passwordless email magic link (Supabase built-in). Emit `auth_link_sent` and `auth_completed` events — this pair measures drop-off. Auth email uses **Supabase's built-in email sender** until M5 and sits **outside** the `sendEmail()`/`EMAIL_DRY_RUN` seam (see §2); at M5 Supabase SMTP is switched to Resend alongside `EMAIL_DRY_RUN=off`. This keeps login working on real phones before the Resend DNS is verified.
- Signup: GDPR consent checkbox (required), marketing opt-in (separate, optional), link to privacy page.
- **Deep-link resume:** the magic-link `redirectTo` carries the target game id and the pending action (book / join-waitlist). After `auth_completed`, the app resumes that action automatically — the player lands back on the game with their intent fulfilled, not on a bare home screen. **No pre-auth soft holds — ever:** a spot is never reserved for an unauthenticated visitor; the booking comes into existence only when `create_booking` runs under the authenticated session.
- **Shadow claim:** automatic claim requires an **exact email match** — when a new auth user's email exactly matches a shadow player's email, link `auth_user_id` to the existing player row (preserving history) and emit `player_claimed`; never create a duplicate player. A shadow player **without an email can never be auto-claimed** and is claimable **only via an admin merge**. Any mis-bind (wrong player linked, or two rows that should be one) is resolved with the §9 shadow-player merge tool, not by the automatic path.
- **Account deletion = anonymization:** via email request in Phase 1 (mailto link on account page); no self-serve deletion UI. Deletion is performed as **anonymization, not a hard delete** — the `players` row is retained but its PII is nulled: `nickname` is replaced with a deleted-player placeholder (e.g. `deleted-player-<id>`) and `email`/`phone` are set null. The player's `events` and `credit_ledger` rows are **retained, keyed to the now-anonymized `player_id`**, so the append-only history and ledger integrity are never broken by a deletion.
- **Privacy page:** use placeholder text clearly marked DRAFT — final copy is supplied by a human at M5. Do not generate final legal text.
- **RLS, deny-by-default:** RLS enabled on every table in its creation migration; default privileges revoked as belt-and-suspenders.
  - players: user reads/updates own row only (matched via auth_user_id). No public reads.
  - bookings, credit_ledger, waitlist: user reads own rows only. **All writes go through the plpgsql `SECURITY DEFINER` RPCs mandated in §3** (`create_booking`, `confirm_booking`, `cancel_booking`, `expire_booking`), invoked via `supabase.rpc()`. Player actions (`create_booking`, `cancel_booking`) are called **with the user's JWT**, so `auth.uid()` inside the function identifies the acting player; cron and admin API routes call `confirm_booking`/`expire_booking` **with the service-role key**. Authorization is enforced **inside each function** per §3 (owner-only vs admin-or-cron-only), not at the transport layer — the service-role key grants *reach*, not permission. There are **no direct client inserts/updates on any state-bearing table**, and no transition assembled from separate TypeScript queries.
  - games (published), game_roster_public: anonymous read.
  - events: no client access whatsoever.
- **Service-role key:** used **only** server-side by cron and admin API routes to invoke the admin-or-cron RPCs (`confirm_booking`, `expire_booking`) — never to perform direct table writes that bypass RLS, and never exposed under `NEXT_PUBLIC_`. Authorization always happens inside the function (§3), so a service-role call is not a blanket write grant. No secrets in code or git.
- **Admin elevation:** `is_admin` is granted **only** manually via the Supabase dashboard in Phase 1. There is **no in-app path to elevate a player to admin** — no API route, RPC, or UI toggle ever sets `is_admin`. The admin surface (§9) is *gated by* the flag but can never *grant* it.
- **Output escaping / XSS:** all user- or admin-supplied free text is HTML-escaped at render as defence-in-depth behind the §3 input constraints. Nicknames are already charset-restricted at signup (§3); `games.venue` free text — which appears on public game pages, OG cards, and `.ics` files — is **escaped at every render site** (HTML, OG meta `content`, and `.ics` fields) and never interpolated raw.

---

## 9. Surfaces

**Player (English, mobile-first):**
- `/` — landing (existing design from attached HTML) + live next-game block replacing the hardcoded counter
- `/games` — games list
- `/game/[id]` — roster (public view), live spots counter, book / join-waitlist button, OG tags
- Booking flow — payment method choice → QR screen (VS + SPD QR + text fallback) or cash confirmation screen; confirmation shows `.ics` link
- `/account` — my bookings, credit balance, cancel buttons, profile, deletion mailto
- `/login` — magic link
- `/privacy` — privacy page (DRAFT placeholder per §8)

**Admin (`/admin`, gated by `players.is_admin`, server-verified — not just hidden nav):**
- Games: create / edit / cancel; per-game roster with payment status badges (paid / reserved / cash / seed). Edit enforces the §3 rule: capacity cannot drop below the count of active bookings; price changes apply to future bookings only.
- One-tap ✓ Paid, pending sorted by VS
- Add player manually: creates shadow player + booking in one flow, ≤10 seconds
- Waitlist depth per game (visible number — this is the expansion-trigger sensor)
- Attendance marking (present / no-show) → game to settled. Unpaid `reserved` bookings are resolved here: either the player pays cash on the pitch (admin `confirm_booking`) or is marked no_show and cancelled during attendance marking — **no `reserved` booking survives into `settled`**.
- Player list, credit balances, manual credit grants, shadow-player merge
- `/admin/stats` per §6

**Transactional emails (all through the `sendEmail()` module, English — except the magic link, see §8),** each with its trigger event:
- **Magic link** — Supabase built-in, on login/signup request (outside the `sendEmail()`/dry-run seam; see §2/§8).
- **"Spot held — pay with this QR"** (QR/VS + `.ics`) — on `booking_created`, for QR and cash bookings.
- **"Payment confirmed"** (+ `.ics`) — on `payment_confirmed`. Instant-confirmed bookings (seed, full-credit) get **only** this email, never the "spot held" one.
- **Scarcity nudge** — on `nudge_sent`.
- **Expiry notice** — on `booking_expired`.
- **Waitlist spot-open** — on `waitlist_notified`.
- **Cancellation + credit receipt** — on `booking_cancelled` (with `credit_issued` where money was applied).
- **Game-cancelled notice** — on `game_cancelled`.
- **24h reminder** — on `reminder_sent`.

---

## 10. Milestones and verification gates

Build strictly in this order. Each gate = human verification before proceeding.

**M1 — Schema + auth.** All migrations, RLS policies, magic-link flow, shadow-claim logic, event writes for auth pair, fixture script v1.
*Gate:* sign up on a phone; player row visible in Supabase; `auth_link_sent`/`auth_completed` events present; a second test user cannot read the first user's rows via the anon API.

**M2 — Games + booking.** List, detail, live counter, `createBooking()` with capacity transaction, QR screen with VS + SPD string, cash option, credit auto-apply, OG tags, `.ics` link.
*Gate:* two real users book a test game end-to-end on phones; QR scans correctly in a Czech banking app; a game link pasted into WhatsApp shows a proper preview card; VS sequence increments; concurrent booking of the last spot leaves exactly one winner.

**M3 — Waitlist + cancellation loop + cron.** Waitlist join, `cancelBooking()` with credit issuance, game cancellation flow, expiry sweep, nudge job, reminder job, all emails (dry-run mode acceptable at gate if DNS pending).
*Gate:* cancel a confirmed booking → credit appears in ledger → spot releases → waitlist emails fire (or dry-run logs) → waitlisted player converts. Zero human touches between cancel and conversion.

**M4 — Admin panel.** All admin surfaces from §9, including `/admin/stats`.
*Gate:* run a fictional game lifecycle — create, fill with shadow + real players, confirm payments, mark attendance, settle — in under 5 minutes of admin time; stats page reflects the fictional game's events correctly.

**M5 — Polish + dry run.** Full English copy review, mobile pass on real devices, design-reference conformance, PWA manifest, final privacy text dropped in by human, `EMAIL_DRY_RUN` off, Supabase SMTP switched from the built-in sender to Resend, real game created running shadow to the WhatsApp process.
*Gate:* full acceptance checklist below.

---

## 11. Acceptance criteria (Phase 1 done when all pass)

1. Book → QR displayed in <60 s for an **authenticated** player on a phone. (First-time signup speed is *not* held to this 60 s bar — magic-link round-trip time is outside our control; it is tracked instead via the `auth_link_sent` → `auth_completed` funnel.)
2. Full game shows waitlist button; join works
3. Admin payment confirmation ≤5 s; roster distinguishes paid / reserved / cash / seed
4. Shadow-player booking created in ≤10 s
5. Cancellation: credit → spot release → waitlist email, untouched by human hands
6. Scarcity nudge: nudge sent → paid or expired → spot released
7. Credit auto-applies on next booking (full and partial cases)
8. Attendance marked; game reaches settled — including an under-capacity game marked `played` directly from `published`, with every unpaid `reserved` booking resolved (cash-confirmed or no_show/cancelled) and none surviving into `settled`
9. Every action in the event catalog produces its event row (assert per action in E2E)
10. RLS verified: a logged-in player cannot read another player's data via the API; anonymous reads of `game_roster_public` expose nickname + status only — never `player_id`, `email`, or `phone`
11. Booking the last spot concurrently from two sessions yields exactly one confirmed booking
12. Cron jobs are idempotent: double-run produces no duplicate emails or events
13. Game link shared in WhatsApp renders a correct preview card; `.ics` opens in a phone calendar app
14. Dry-run game runs end-to-end in parallel with the WhatsApp process
15. Cross-user RPC rejected: a player invoking `create_booking`/`cancel_booking` with **another** player's id — or a non-admin invoking `confirm_booking`/`expire_booking` — is rejected inside the function, not honored (assert via API in E2E)
16. Credit double-spend prevented: two concurrent credit-funded bookings by **one** player for **different** games redeem the wallet at most once, and the ledger never goes negative (assert via SQL in E2E)

E2E coverage (Playwright): every criterion above that has a user-visible path gets a test. Where a criterion is about data (events, ledger, RLS), assert via API/SQL in the test, not by eyeballing.

---

## 12. Explicitly OUT of scope (schema-ready, build NO UI or logic)

Referral automation · threshold-confirmation mechanic · flex spots · player-facing stats · organizer tooling/marketplace · bank-API auto-confirmation · multi-sport UI · CZ/RU translations · automated shadow-claim beyond email match · separate staging DB · push notifications / service-worker offline logic · marketing email of any kind.

If any task appears to require one of these, stop and raise it at the gate instead of building it.

---

## 13. Working rules

- This document is the contract. Disagreements are resolved by editing this document first, then implementing.
- Schema changes only via migration files; RLS in the same migration.
- State transitions only via the plpgsql `SECURITY DEFINER` RPC functions (§3), invoked via `supabase.rpc()` — player actions with the user's JWT, cron/admin routes with the service-role key, with authorization enforced inside each function (§3/§8); every transition writes its event in the same transaction.
- `credit_ledger` and `events` are append-only.
- All user-facing strings centralized, English values.
- No secrets in code; nothing secret under `NEXT_PUBLIC_`.
- `npm run dev` passes locally before any push; `main` is production.
- Lessons learned are appended to CLAUDE.md so future sessions start smarter.
