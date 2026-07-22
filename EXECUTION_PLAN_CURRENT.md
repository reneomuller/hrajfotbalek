# hrajfotbal.com Phase 1 - Execution Plan

<!-- FORMAT_VERSION: 2.0 -->

> **Version:** 1.2.0
> **Created:** 2026-07-19
> **Last Updated:** 2026-07-22
> **Estimated Duration:** 61.8 hours (3710 minutes)
> **Complexity:** High

---

## Project Context

hrajfotbal.com is a mobile-first booking platform for pickup football games in Prague (single city, single sport). Phase 1 delivers the complete player and admin loop: passwordless magic-link authentication with a durable "shadow" player identity that survives from WhatsApp-era manual bookings, a booking state machine with transactional capacity control, Czech QR/SPD payments with unique variable symbols, a credit wallet, a waitlist with race-safe conversion, cancellation with automatic credit issuance, scheduled cron jobs (nudge / expiry / reminder), a full transactional email suite behind a dry-run seam, and an admin panel with a stats surface computed entirely from an append-only event log.

The central architectural invariant is that **the database is the state authority**. No state-bearing table is ever written from TypeScript directly — every transition (`create_booking`, `admin_create_booking`, `cancel_booking`, `confirm_booking`, `expire_booking`, `join_waitlist`, `notify_waitlist`, `mark_nudged`, `mark_reminder_sent`, `mark_attendance`, `grant_credit`, `merge_players`, the game transitions) runs inside a `SECURITY DEFINER` plpgsql function with `search_path=''`, which writes the state change, the ledger row, and the event row in a single transaction. Concurrency correctness (capacity, credit non-negativity) depends on transaction-scoped advisory locks acquired in a fixed player→game order, and cannot be reconstructed from app-assembled multi-query transitions. Authorization lives inside each function; the service-role key grants reach, not permission.

The schema is deliberately over-provisioned for a future multi-city / multi-sport / marketplace platform: every table carries `city`/`brand`/`policy_version` stamps and every notable action writes to the append-only `events` log, so future metrics are SQL queries rather than new projects. The repository (`/Users/oliverstaehelin/dev/hrajfotbalek`) is greenfield — it currently contains only `index.html`, the volt-on-black design reference that the landing page and Tailwind theme must match rather than reinterpret.

**Business Value:**
- Replaces a manual WhatsApp booking process with a self-service loop, eliminating the organizer's per-game admin overhead (target: full game lifecycle in under 5 minutes of admin time).
- Removes payment-chasing: Czech SPD QR codes with unique variable symbols make each payment self-identifying, reconciled with one tap.
- Converts no-shows and cancellations into retained value (wallet credit) instead of refunds — no money ever leaves the system.
- Establishes an event-log substrate so growth decisions (waitlist depth as expansion trigger, magic-link drop-off, no-show rate) are measurable from day one.

**Technology Stack:**
- **Frontend:** Next.js App Router (TypeScript, Tailwind CSS), mobile-first, volt-on-black theme
- **Backend:** Next.js route handlers (auth callback, cron) + `SECURITY DEFINER` plpgsql RPC functions
- **Database:** Supabase Postgres with deny-by-default RLS on every table, advisory-lock concurrency control
- **Auth:** Supabase passwordless magic link with shadow-player claim on exact email match
- **Email:** Resend behind a `sendEmail()` dry-run seam (`EMAIL_DRY_RUN`)
- **Scheduling:** Vercel Cron → `CRON_SECRET`-gated API routes
- **Hosting:** Vercel (`main` = production)
- **Testing:** Playwright E2E (16 acceptance criteria), SQL assertion scripts for RPC invariants, unit tests for pure functions

**Key Features:**
1. Passwordless magic-link auth with durable shadow-player identity and exact-email-match claim
2. Transactional booking state machine with advisory-lock capacity control (no double-booking)
3. Czech SPD 1.0 QR payments with unique variable symbols and one-tap admin reconciliation
4. Append-only credit wallet with auto-application and guaranteed non-negativity under concurrency
5. Waitlist with simultaneous notification and race-safe conversion via `create_booking(from_waitlist_id)`
6. Idempotent cron lifecycle: scarcity nudge, expiry sweep, 24h reminder
7. Nine transactional emails — eight in-app templates behind a dry-run seam plus the Supabase-delivered magic link
8. Admin panel: games CRUD, payment reconciliation, attendance/settle, credit grants, shadow merge, stats

---

## Constraints

- **Budget:** 61.8 hours of development time across 30 phases (M1 foundation → M5 cutover)
- **Scope:** IN — player booking loop, admin panel, payments, waitlist, cron, emails, stats, PWA basics, E2E. OUT (schema-ready, build no UI or logic) — referral automation, threshold-confirmation, flex spots, player-facing stats, organizer marketplace, bank-API auto-confirmation, multi-sport UI, CZ/RU translations, automated shadow-claim beyond email match, separate staging DB, push notifications / service-worker offline logic, marketing email of any kind
- **Tech Stack:** Next.js App Router + TypeScript + Tailwind on Vercel; Supabase Postgres + magic-link auth + RLS; Resend email; Vercel Cron
- **Dependencies:** Supabase project provisioned (URL, anon key, service-role key); Resend account (DNS may be unverified — the dry-run seam covers this); Vercel project; `PAYMENT_IBAN` for SPD strings
- **Token Budget:** Each phase/milestone MUST fit within 200,000 tokens
- **Security:** RLS deny-by-default on every table, enabled in the same migration that creates it. All state writes through `SECURITY DEFINER` RPCs with `search_path=''` and schema-qualified references. Identity from `auth.uid()`, never a client-supplied id. Service-role key server-only, never under `NEXT_PUBLIC_`. `is_admin` grantable only via the Supabase dashboard — no in-app elevation path. All free text (venue, nickname) HTML-escaped at every render site including OG `content` and `.ics` fields. `credit_ledger` append-only (UPDATE/DELETE revoked). `events` has no client access. Anonymous roster reads only through the `game_roster_public` SECURITY DEFINER view projecting nickname + status, and only for games in `published`/`full`/`played`/`settled` — `draft` and `cancelled` games return no rows.
- **Performance:** Book → QR in <60s for an authenticated player on a phone; admin payment confirmation ≤5s including page load; add-shadow-player-and-booking ≤10s; full admin game lifecycle in <5 minutes; stats queries as simple aggregates over indexed `events`
- **Non-negotiable conventions:** No hardcoded UI strings (all via `lib/strings.ts`); no hardcoded policy windows (all via `lib/policy.ts`, `policy_version='v1'`); no raw UTC rendering (all via `lib/format.ts` → `Europe/Prague` 24h); no unseamed email (all via `sendEmail()`, except the Supabase magic link until Phase 30); no pre-auth soft holds ever

---

## Reference Documents

- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md` - Project analysis, product intent, policies, surfaces, and the 16 acceptance criteria
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md` - Implementation plan with architecture, schema, API contracts, and the phase breakdown
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_TEST_SCENARIOS.md` - Test scenarios mapped to acceptance criteria
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_UI_WIREFRAME.md` - UI wireframes for player and admin surfaces
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_SECURITY_REVIEW.md` - Security review findings (RLS, RPC authorization, PII, XSS)
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_TRACEABILITY_MATRIX.md` - Requirement-to-phase traceability
- `/Users/oliverstaehelin/dev/hrajfotbalek/index.html` - Volt-on-black design reference (match, do not reinterpret)

---

## Common Acceptance Criteria

The following criteria apply to every phase automatically. They are listed here once to keep per-phase acceptance criteria focused on phase-specific deliverables.

- [ ] All new or modified source code has functional tests (unit and/or integration). Asset-only phases (icons, config files, CI/CD workflows) satisfy this by verifying generated artifacts instead.
- [ ] Test coverage meets minimum 70% for new/modified source code
- [ ] `tsc` compiles with 0 errors in strict mode and `npm run build` succeeds
- [ ] No direct client `insert`/`update` on any state-bearing table or column (`bookings` including `attendance`/`nudge_sent_at`/`reminder_sent_at`/`expires_at`, `credit_ledger`, `waitlist` including `notified_at`, `events`, `games.status`) — all writes via `supabase.rpc()`. The only direct inserts anywhere are base rows (`players`, `games`) in the seed script
- [ ] No hardcoded UI strings, policy windows, or raw UTC datetime renders introduced
- [ ] Changes committed to git with descriptive commit message
- [ ] All tasks in CHECKLIST.md marked as completed

---

## Progress Tracking

The five 🛑 **GATE** rows are spec §10 verification gates M1–M5. They are **mandatory halt points for any execution session**, not merely verification criteria: an execution session that reaches a gate stops there and does not begin the next phase until a human has confirmed the gate's criteria. The `Gate` column shows which gate each phase must be complete for. Gate blocks with their full §10 criteria appear inline between the phases below.

| Phase | Gate | Status | Started | Completed | Duration | Notes |
|-------|------|--------|---------|-----------|----------|-------|
| 1. Project scaffold + volt-on-black theme | M1 | Complete | 2026-07-20 | 2026-07-20 | - | `99ed42e` |
| 2. Cross-cutting config seams + sendEmail dry-run | M1 | Complete | 2026-07-20 | 2026-07-20 | - | `3a19c02` |
| 3. DB migration 1: players, games, events + RLS | M1 | Complete | 2026-07-20 | 2026-07-20 | - | `09839bb`; 14/14 RLS assertions green on live DB |
| 4. DB migration 2: bookings, credit_ledger, waitlist, VS seq, roster view + RLS | M1 | Complete | 2026-07-20 | 2026-07-20 | - | `d52b1ac` + checkpoint `c90d344` (migrations applied, SQL suite, VS privilege fix); 13/13 + 20/20 + 10/10 green |
| 5. RPCs: create_booking + admin_create_booking (capacity + credit under advisory locks) | M1 | Complete | 2026-07-20 | 2026-07-20 | ~170m | `b6039d4`; 36/36 SQL + 10/10 concurrency (2 real connections) green on live DB |
| 6. RPC: cancel_booking (window enforcement + credit issuance) | M1 | Complete | 2026-07-20 | 2026-07-20 | ~80m | `b6745de`; 22/22 green on live DB |
| 7. RPCs: confirm_booking + expire_booking + game transitions | M1 | Complete | 2026-07-20 | 2026-07-20 | - | `ca580ef`; 48/48 green on live DB |
| 8. Auth: magic link + shadow claim + /login | M1 | Complete | 2026-07-20 | 2026-07-20 | - | `ca361e3`; 35/35 green on live DB |
| 9. Seed / fixture script v1 | M1 | Complete | 2026-07-20 | 2026-07-20 | - | `a90db2b`; seed + service_role grants |
| **🛑 GATE M1 — Schema + auth** | **M1** | **Verified** | - | 2026-07-20 | - | Human-verified 2026-07-20: signup end-to-end on localhost for two users in separate browsers; `players` rows + auth events confirmed in Supabase; cross-user isolation confirmed. Known: post-signup redirect targets `/games`, which 404s until Phase 10 — expected |
| 10. Games list + detail + live counter + public roster | M2 | Complete | 2026-07-21 | 2026-07-21 | - | `14844f4` |
| 11. Booking flow UI + create_booking wiring + credit auto-apply | M2 | Complete | 2026-07-21 | 2026-07-21 | - | `2b58cbf` |
| 12. SPD QR payment render + confirmation screen | M2 | Complete | 2026-07-21 | 2026-07-21 | - | `a58de15` |
| 13. .ics download + Open Graph share cards | M2 | Complete | 2026-07-21 | 2026-07-21 | - | `095478f`; + `0a89e73` metadataBase fix so OG images resolve in production |
| 14. Account page: my bookings, credit, self-cancel, deletion mailto | M2 | Complete | 2026-07-21 | 2026-07-21 | - | `bc8a9eb` |
| **🛑 GATE M2 — Games + booking** | **M2** | **Verified** | 2026-07-21 | 2026-07-21 | - | Human-verified 2026-07-21: two users booked on phones, QR scanned in a Czech banking app (IBAN/amount/VS pre-filled), VS incremented, WhatsApp card rendered, cancellation released the spot. Gate-fix commits `bd62760`, `7ea62ac`, `c932db8` |
| 15. Transactional email templates (eight in-app, dry-run) | M3 | Complete | 2026-07-21 | 2026-07-22 | - | `6d40118`; + `94313de` fix (templates cannot render through react-dom/server) |
| 16. Email dispatch layer (event → template) | M3 | Complete | 2026-07-21 | 2026-07-22 | - | `603ca6f` (dispatch map + instant-confirm suppression); completed in `8974781` (call sites + M3 verification harnesses) |
| 17. Waitlist join + conversion | M3 | Complete | 2026-07-22 | 2026-07-22 | - | `f2598b8`; race-safe conversion |
| 18. Game cancellation flow (admin) + requireAdmin gate + credit fan-out | M3 | Complete | 2026-07-22 | 2026-07-22 | - | `986ea27`; ships `lib/auth/requireAdmin.ts` |
| 19. Cron foundation: guard + expiry sweep + notify_waitlist RPC + schedules | M3 | Complete | 2026-07-22 | 2026-07-22 | - | `40519f4` |
| 20. Cron nudge + reminder sweeps + stamp RPCs | M3 | Complete | 2026-07-22 | 2026-07-22 | - | `665aaf4` |
| **🛑 GATE M3 — Waitlist + cancellation + cron** | **M3** | **Verified** | 2026-07-22 | 2026-07-22 | - | Human-verified 2026-07-22: untouched loop witnessed (cancel → credit → release → spot-opened notification → conversion, zero touches); cron live-verified — nudge fired a real scarcity email, expiry clean, unauthenticated call 401, idempotency proven in the M3 harness |
| 21. Admin gating + games CRUD | M4 | Complete | 2026-07-22 | 2026-07-22 | - | `d669bb6`; + venues/format/surface/notes migrations 15-16; admin_games.sql 23/23 |
| 22. Admin payments: VS-sorted confirm + roster badges | M4 | Complete | 2026-07-22 | 2026-07-22 | - | `f55d078`; reconciliation logic unchanged in confirm_booking |
| 23. Admin add shadow player + booking (via admin_create_booking) | M4 | Complete | 2026-07-22 | 2026-07-22 | - | `34c4abc`; duplicate email steers to merge |
| 24. Admin attendance → settle (mark_attendance RPC) | M4 | Complete | 2026-07-22 | 2026-07-22 | - | `af91e9f`; migration 17 + settle guard in the DB; mark_attendance.sql 18/18 |
| 25. Admin players: credit grants + shadow merge (grant_credit / merge_players RPCs) | M4 | Complete | 2026-07-22 | 2026-07-22 | - | `082c245`; migration 18; admin_players_rpcs.sql 29/29 |
| 26. Admin stats page (/admin/stats) | M4 | Complete | 2026-07-22 | 2026-07-22 | - | `d716255`; five metrics verified against direct SQL; drop-off deferred to the gate. Cancel-email dry-run evidence in `4310a1d` |
| **🛑 GATE M4 — Admin panel** | **M4** | **Verified** | 2026-07-22 | 2026-07-22 | - | Human-verified 2026-07-22: full fictional lifecycle driven through the admin UI — create with venue/format/notes → shadow + real players → VS-sorted ✓ Paid including the received-amount path → attendance with a no-show → settled; `/admin/stats` reflected the whole life correctly. Gate-walk fix `aa546cd` (game create/edit did not persist — every pre-`venues` game carried a null `venue_id`, so the edit form's picker opened unset and the save was rejected before any RPC ran, while React's form reset put the typed values back). Magic-link drop-off (0/0 → 1/1 on a real phone) not re-run at this gate |
| 27. PWA basics + design/strings/privacy polish | M5 | Pending | - | - | - | |
| 28. E2E Playwright harness + user-path specs | M5 | Pending | - | - | - | |
| 29. E2E data, RLS & concurrency specs | M5 | Pending | - | - | - | |
| 30. Dry-run cutover: SMTP→Resend, EMAIL_DRY_RUN=off, acceptance | M5 | Pending | - | - | - | |
| **🛑 GATE M5 — Polish + dry run** | **M5** | **Not verified** | - | - | - | **STOP — human confirmation required. full §11 acceptance checklist passes against the real game** |

---

## Phases

### Phase 1: Project scaffold + volt-on-black theme

**Goal:** Stand up a runnable Next.js App Router project whose landing page matches the `index.html` volt-on-black reference from extracted theme tokens.

**Dependencies:** None

**Duration:** 70 minutes

**Prompt:**
Context from previous work: This is the first phase, starting fresh. The repository at `/Users/oliverstaehelin/dev/hrajfotbalek` is greenfield and contains only `index.html` — the volt-on-black design reference that the app must match, not reinterpret.

This phase writes no business logic and creates no library seams (those are Phase 2). Its single concern is a runnable, correctly-themed app shell.

1. **Initialize the Next.js App Router project:**
   - TypeScript (strict), Tailwind, ESLint. Confirm `npm run dev` serves a page and `npm run build` succeeds.
   - Set up Supabase CLI migration tooling in the repo (`supabase/` directory) so Phase 3 has somewhere to put its migration. Do not write any migration here.
   - Declare the test runners as devDependencies now — `vitest` and `@playwright/test` — and add the `test:unit` and `test:e2e` scripts to `package.json`. Every later phase's `TEST-*` criterion invokes these scripts, so they must exist from Phase 1 even though no suite exists yet. Configure `test:unit` to exit 0 on an empty suite (`vitest run --passWithNoTests`) so the criterion is runnable before Phase 2 writes the first test. `test:e2e` runs `playwright test`; it is first exercised in Phase 10.

2. **Extract the theme:**
   - Extract the exact color, font, and spacing tokens from `/Users/oliverstaehelin/dev/hrajfotbalek/index.html` into `tailwind.config.ts`. No inline hex values may appear anywhere in the app.
   - Recreate the volt-on-black base layer (background, text, accent) in `app/globals.css` from those tokens.

3. **Port the landing markup:**
   - Port the reference markup into `app/page.tsx`, leaving an explicit, clearly-commented placeholder slot for the live next-game block that Phase 10 wires in.
   - Verify the result on a 375px-wide mobile viewport — this is a mobile-first product, and a desktop-only check will hide layout defects that every real user will hit.

Note on copy: this phase may inline the landing strings temporarily only if Phase 2's `lib/strings.ts` does not yet exist; if so, leave a `TODO(phase-2)` marker on each so Phase 2 can migrate them. Prefer creating them in Phase 2's file if you build the phases in sequence.

**Acceptance Criteria:**
- [ ] [REQ-INFRA-001, REQ-ENV-006] `npm run dev` serves the landing page and `npm run build` succeeds with 0 TypeScript errors in strict mode
- [ ] [REQ-UI-004] The landing page matches the `index.html` volt-on-black reference on a 375px-wide mobile viewport (side-by-side artifact check)
- [ ] [REQ-UI-004] `tailwind.config.ts` defines the color, font, and spacing tokens extracted from `index.html`
- [ ] [REQ-UI-004] A grep of `app/page.tsx` and `app/globals.css` finds no inline hex color values
- [ ] [REQ-UI-005] `app/page.tsx` contains a clearly-commented placeholder slot for the Phase 10 live next-game block
- [ ] [REQ-INFRA-002] The `supabase/` migration directory and CLI tooling are initialized with no migrations present
- [ ] [REQ-INFRA-001] The project is a Next.js App Router + TypeScript + Tailwind application deployable on Vercel with `main` as the production branch
- [ ] [REQ-INFRA-001] `package.json` declares `vitest` and `@playwright/test` as devDependencies and defines the `test:unit` and `test:e2e` scripts that every later phase's `TEST-*` criterion invokes
- [ ] [REQ-INFRA-001] `npm run test:unit` exits 0 against the empty suite (`--passWithNoTests`), so the script is runnable before any test exists

**Files:**
- `package.json` - Project manifest, `test:unit`/`test:e2e` scripts, and vitest + @playwright/test devDependencies
- `tsconfig.json` - TypeScript strict configuration
- `tailwind.config.ts` - Theme tokens extracted from `index.html`
- `app/layout.tsx` - Root layout
- `app/globals.css` - Volt-on-black base layer from the reference tokens
- `app/page.tsx` - Landing page ported from the design reference, with a Phase 10 placeholder
- `supabase/config.toml` - Supabase CLI project configuration
- `/Users/oliverstaehelin/dev/hrajfotbalek/index.html` - Design reference to match

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#phase-1-project-scaffold--config-seams--sendemail-dry-run` - Scaffold milestone breakdown and done-when criteria
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#stack-conventions` - Non-negotiable stack and design conventions (match, don't reinterpret)

**Milestones:**
- **Next.js project initialized** (IP M1.1)
  - [ ] Next.js App Router project created with TypeScript strict, Tailwind, and ESLint
  - [ ] `npm run dev` serves a page and `npm run build` succeeds
  - [ ] Supabase CLI migration tooling initialized under `supabase/`
  - [ ] `vitest` + `@playwright/test` declared as devDependencies; `test:unit` / `test:e2e` scripts defined
  - [ ] `npm run test:unit` exits 0 on the empty suite
- **Volt-on-black theme + landing page** (IP M1.1)
  - [ ] Color/font/spacing tokens extracted from `index.html` into `tailwind.config.ts`
  - [ ] Volt-on-black base layer recreated in `app/globals.css` from those tokens
  - [ ] Landing markup ported into `app/page.tsx` with a commented placeholder for the live next-game block
  - [ ] No inline hex values remain in `app/page.tsx` or `app/globals.css`
  - [ ] Theme verified on a 375px mobile viewport against the reference

---

### Phase 2: Cross-cutting config seams + `sendEmail` dry-run

**Goal:** Create the five cross-cutting seams (strings, policy, format, Supabase clients, email) plus the environment contract that every later phase depends on.

**Dependencies:** Phase 1

**Duration:** 80 minutes

**Prompt:**
Context from previous work: Phase 1 initialized the Next.js App Router project, extracted the volt-on-black theme tokens into `tailwind.config.ts`, ported the landing page, and set up the Supabase CLI migration directory. No library code, business logic, or schema exists yet.

This phase writes no business logic either. Its purpose is to establish the conventions that every one of the next 28 phases depends on, so that no later phase hardcodes a UI string, a policy window, a raw UTC render, or an unseamed email. Getting these seams wrong here means retrofitting the whole plan later.

1. **`lib/strings.ts`** — centralized English UI strings, keyed for the surfaces built in Phases 8-14. Migrate any `TODO(phase-2)` inline strings left in `app/page.tsx` by Phase 1.

2. **`lib/policy.ts`** — named `policy_version='v1'` constants for the cancellation window, nudge (12h), expiry, and reminder (24h) windows. These are config values, never branches, so a v2 policy is a config bump rather than a code change.

3. **`lib/format.ts`** — formats `timestamptz` to `Europe/Prague` 24-hour display (e.g. "Thu 18:30"). Never render raw UTC anywhere in the app.
   Edge case to watch for: a `Europe/Prague` formatter that silently falls back to the host timezone will produce correct-looking output in local dev and wrong output on Vercel — assert the timezone explicitly in the unit test, using a fixed UTC input that crosses a DST boundary.

4. **`lib/supabase/clients.ts`** — browser (anon), server (session), and service-role factories. The service-role key must be server-only. No service-role environment variable may be exposed under a `NEXT_PUBLIC_` prefix; add a review note and a lint rule if practical enforcing this.

5. **`lib/email/sendEmail.ts`** — the single email seam. When `EMAIL_DRY_RUN` is on it logs the payload instead of sending, so the whole system is buildable and testable before Resend DNS verifies. Default the flag conservatively: a missing value logs rather than sends.
   The Supabase magic-link email deliberately sits *outside* this seam until Phase 30 — do not route it through `sendEmail()`.

6. **`.env.example`** documenting Supabase URL/keys, Resend, `PAYMENT_IBAN`, `EMAIL_DRY_RUN`, and `CRON_SECRET`.

**Acceptance Criteria:**
- [ ] [REQ-INT-001] `sendEmail()` with `EMAIL_DRY_RUN=on` logs the payload and makes zero network calls (unit test asserts no send)
- [ ] [REQ-INT-001] `sendEmail()` with `EMAIL_DRY_RUN` unset also logs rather than sends (fail-safe default, unit test)
- [ ] [REQ-UI-003] `lib/format.ts` renders a fixed UTC timestamp as `Europe/Prague` 24h in a unit test, independent of host timezone, including a DST-boundary input
- [ ] [REQ-ENV-004, REQ-SEC-015, REQ-SEC-023] `lib/supabase/clients.ts` exports browser, server, and service-role factories; a grep confirms no `NEXT_PUBLIC_` variable holds the service-role key, and the service-role and anon keys are distinct secrets
- [ ] [REQ-BIZ-029] `lib/policy.ts` exports `policy_version='v1'` plus the cancellation, nudge (12h), expiry, and reminder (24h) window constants as values, not branches
- [ ] [REQ-UI-002] `lib/strings.ts` exists with English-valued keys and `app/page.tsx` sources its copy from it
- [ ] [REQ-ENV-002, REQ-ENV-003] `.env.example` documents Supabase URL/anon/service-role keys, Resend, `PAYMENT_IBAN`, `EMAIL_DRY_RUN`, and `CRON_SECRET`
- [ ] [REQ-SEC-024] No secrets appear in code or git — `.env.example` carries placeholder values only and real credentials live solely in environment configuration
- [ ] [TEST-001] `npm run test:unit -- -t "format"` passes [REQ-UI-003]
- [ ] [TEST-002] `npm run test:unit -- -t "sendEmail"` passes [REQ-INT-001, REQ-SEC-015]

**Files:**
- `lib/strings.ts` - Centralized English UI strings
- `lib/policy.ts` - Versioned policy constants (`policy_version='v1'`)
- `lib/format.ts` - `Europe/Prague` 24h datetime formatter
- `lib/supabase/clients.ts` - Browser/server/service-role client factories
- `lib/email/sendEmail.ts` - The single email seam gated by `EMAIL_DRY_RUN`
- `.env.example` - Environment contract
- `app/page.tsx` - Landing copy migrated to `lib/strings.ts`

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#phase-1-project-scaffold--config-seams--sendemail-dry-run` - Seam definitions and done-when criteria
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#stack-conventions` - i18n, timezone, and email-seam conventions
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#policies` - The v1 policy windows encoded in `lib/policy.ts`

**Milestones:**
- **Strings, policy, and format seams** (IP M1.2)
  - [ ] `lib/strings.ts` created with English-valued keys for the Phase 8-14 surfaces
  - [ ] Landing copy migrated out of `app/page.tsx` into `lib/strings.ts`
  - [ ] `lib/policy.ts` created with `policy_version='v1'` cancellation/nudge/expiry/reminder constants
  - [ ] `lib/format.ts` created and unit-tested for `Europe/Prague` 24h output across a DST boundary
- **Supabase clients + email seam + environment contract** (IP M1.2)
  - [ ] `lib/supabase/clients.ts` created with browser/server/service-role factories, service-role server-only
  - [ ] Review note (and lint rule if practical) added preventing a `NEXT_PUBLIC_` service-role variable
  - [ ] `lib/email/sendEmail.ts` created with the `EMAIL_DRY_RUN` log-instead-of-send branch and conservative default
  - [ ] Magic-link email confirmed to stay outside the `sendEmail()` seam until Phase 30
  - [ ] `.env.example` created documenting every required variable

---

### Phase 3: DB migration 1 — players, games, events + RLS

**Goal:** Ship the players/games/events schema with deny-by-default RLS as the identity and event-log spine.

**Dependencies:** Phase 2

**Duration:** 120 minutes

**Prompt:**
Context from previous work: Phases 1-2 established the app shell and the cross-cutting seams (`lib/strings.ts`, `lib/policy.ts`, `lib/format.ts`, `lib/supabase/clients.ts`, `lib/email/sendEmail.ts`) plus the Supabase client factories and migration tooling. No business logic or schema exists yet.

This phase creates the first migration establishing the identity and event-log spine. It creates no functions — it is pure schema, so the RPC phases (5-7) and the auth phase (8) have tables to target. The critical convention established here, per the working rules, is that **RLS is enabled in the same migration that creates each table** — never as a follow-up.

1. **Create the `players` table:**
   - `id` (UUID PK), `nickname` (text, unique, required, CHECK mirroring the app regex `[A-Za-z0-9 _-]{1,20}`), `email` (text, unique partial on non-null, nullable — null for email-less shadows), `phone` (nullable), `auth_user_id` (UUID FK→`auth.users`, nullable — null means shadow player), `is_admin` (bool default false), `is_seed` (bool default false), `marketing_opt_in` (bool default false), `created_at`.
   - The nullable `auth_user_id` is what makes shadow players possible: an admin creates a player row before that person has ever logged in, and the row is later claimed on exact email match.

2. **Create the `games` table:**
   - `id`, `venue` (text — escaped at every render site downstream), `starts_at` (timestamptz), `capacity` (int), `price_czk` (int), `status` (enum: draft/published/full/played/settled/cancelled), `city` (default 'prague'), `brand` (default 'hrajfotbal'), `created_at`.

3. **Create the `events` table:**
   - `id`, `event_type` (text from the catalog), nullable `player_id`/`game_id`/`booking_id` FKs, `metadata` (jsonb), `city`, `brand`, `playbook_version` (default 'v1'), `policy_version` (default 'v1'), `created_at`.
   - Add the `(event_type, created_at)` index — Phase 26's stats queries depend on it.

4. **Enable RLS in the same migration:**
   - `players`: read/update own row only, matched via `auth_user_id = auth.uid()`. No public reads — this table holds PII.
   - `games`: published games anonymously readable; nothing else.
   - `events`: no client access whatsoever.
   - Revoke default privileges as belt-and-suspenders.

5. **Write a working `down`** dropping all three tables in reverse dependency order, and generate `lib/types/database.ts` from the migrated schema.

Technical requirements: migration naming is `YYYYMMDDHHMMSS_description.sql`. Test the `down` locally before considering the phase complete — greenfield means there is no production data to lose, which makes this the cheapest possible moment to verify rollback works.

**Acceptance Criteria:**
- [ ] [REQ-DB-001] Migration applies cleanly and its `down` drops `players`, `games`, and `events` in reverse dependency order without error
- [ ] [REQ-SEC-011] A session authenticated as player A cannot read player B's `players` row via the anon API (RLS assertion)
- [ ] [REQ-SEC-014] Any client read or write against `events` is rejected (RLS assertion)
- [ ] [REQ-SEC-013] Anonymous read of `games` returns published games only; draft games are not visible
- [ ] [REQ-USER-008, REQ-SEC-001] `players.nickname` CHECK rejects an insert of `"bad*name!"` and accepts `"Player_1"`
- [ ] [REQ-DB-008, REQ-UI-015] The `(event_type, created_at)` index exists on `events`
- [ ] [REQ-INFRA-002] `lib/types/database.ts` is generated and reflects all three tables
- [ ] [REQ-USER-001, REQ-USER-008] `players` carries the full column set with a nullable `auth_user_id`, giving a durable player identity decoupled from auth that survives independent of login
- [ ] [REQ-DB-002] `games` carries `id, venue, starts_at timestamptz, capacity, price_czk, status`, `city` default `'prague'`, `brand` default `'hrajfotbal'`, and `created_at`
- [ ] [REQ-DB-007, REQ-DB-008] `events` carries `event_type`, nullable `player_id`/`game_id`/`booking_id`, `metadata jsonb`, `city`, `brand`, `playbook_version='v1'`, `policy_version='v1'`, and is append-only; the full Phase 1 catalog of 22 event types is defined
- [ ] [REQ-SEC-010] RLS is enabled deny-by-default on all three tables in the same migration that creates them, with default privileges revoked as belt-and-suspenders
- [ ] [REQ-DB-010, REQ-DB-015] The stamp columns match the spec §5.1 definitions exactly — `games` carries `city`/`brand`; `events` carries `city`/`brand`/`playbook_version`/`policy_version`; `players` carries none — and the schema is over-provisioned for multi-city / multi-sport / referrals / marketplace without rewrite
- [ ] [TEST-003] `supabase test db` passes [REQ-DB-001, REQ-USER-008, REQ-DB-002, REQ-DB-007]
- [ ] [TEST-004] `supabase test db` passes [REQ-SEC-010, REQ-SEC-011, REQ-SEC-014]

**Files:**
- `supabase/migrations/<ts>_players_games_events.sql` - Migration creating the three tables with constraints and RLS policies
- `lib/types/database.ts` - Generated TypeScript database types
- `lib/supabase/clients.ts` - Clients used to run the RLS assertions

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#51-entity-definitions` - Field-level definitions for `players`, `games`, `events`
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#53-indexes--constraints` - Index and constraint requirements
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - RLS deny-by-default policy per table

**Milestones:**
- **Migration 1 — players, games, events + RLS** (IP M2.1)
  - [ ] `players` created with the nickname CHECK, nullable `email`/`auth_user_id`, and uniqueness constraints
  - [ ] `games` created with the status enum and `city`/`brand` defaults
  - [ ] `events` created with `event_type`, nullable FKs, `metadata` jsonb, and version stamps
  - [ ] RLS enabled in the same migration for all three tables (own-row players, anon published games, no-client-access events)
  - [ ] `(event_type, created_at)` index added
  - [ ] Reverse-order `down` written and verified locally
  - [ ] `lib/types/database.ts` regenerated

---

### Phase 4: DB migration 2 — bookings, credit_ledger, waitlist, VS seq, roster view + RLS

**Goal:** Ship the transactional-core schema (bookings/ledger/waitlist/VS/roster view) with RLS and append-only enforcement.

**Dependencies:** Phase 3

**Duration:** 150 minutes

**Prompt:**
Context from previous work: Phase 3 created `players`, `games`, and `events` with deny-by-default RLS and generated `lib/types/database.ts`. Those tables provide the foreign-key targets this phase needs.

This phase completes the schema so the Phase 5, 6, and 7 RPCs have every table, constraint, sequence, and view to target. Two structures here carry disproportionate weight: the partial unique constraint that acts as the last-line backstop against double-booking even if the advisory-lock logic is ever wrong, and the `game_roster_public` view that is the only anonymous read path into booking data.

1. **Create `bookings`:**
   - Full column set: `id`, `game_id` FK, `player_id` FK, `status` (reserved/confirmed/cancelled/expired), `payment_method` (qr/cash/credit/seed_free), `payment_code` (numeric VS, unique, nullable — QR only), `price_czk` (locked at booking time), `credit_applied_czk` (default 0), `is_seed`, `booked_by_admin`, `attendance` (null/present/no_show), `nudge_sent_at`, `reminder_sent_at`, `expires_at`, `cancel_lead_hours`, `created_at`.
   - `nudge_sent_at` and `reminder_sent_at` are the idempotency guards the Phase 20 cron sweeps depend on — they are not optional.
   - Indexes: partial unique `(game_id, player_id) where status in (reserved, confirmed)` — one active booking per player per game; `(status, expires_at)` for the Phase 19 expiry sweep; `(game_id, payment_code)` for the VS-sorted pending list in Phase 22.

2. **Create the VS sequence:** a Postgres sequence rendering as a `26` prefix plus 8-digit zero-padded value. Numbers are never reused — a variable symbol is the permanent identifier of a payment, and reuse would make bank reconciliation ambiguous.

3. **Create `credit_ledger`:** `id`, `player_id` FK, `delta_czk` (int, negative for redemptions), `reason` (cancellation_credit/admin_grant/redemption/adjustment), `booking_id` (nullable FK), `created_at`. **Revoke UPDATE and DELETE privileges** — the balance is `SUM(delta_czk)` and the ledger's integrity depends on it being genuinely append-only, not merely conventionally so.

4. **Create `waitlist`:** `id`, `game_id` FK, `player_id` FK, `joined_at`, `notified_at` (nullable — records the *last* notification time, explicitly not a suppression flag), `converted_booking_id` (nullable FK), unique `(game_id, player_id)`.

5. **Create `game_roster_public`** as a SECURITY DEFINER view projecting exactly `game_id`, `nickname`, and booking `status` — nothing else. It bypasses row-owner RLS so anonymous visitors can see who is playing, which makes it the single highest-risk PII surface in the system. It must never expose `player_id`, `email`, or `phone`.
   - **Filter on game status inside the view**: project rows only for games in `published`, `full`, `played`, or `settled`. A `draft` game is not yet public — leaking its roster would expose who is booked on a game the anon RLS policy on `games` deliberately hides — and a `cancelled` game has no roster worth showing. Because the view is `SECURITY DEFINER` it bypasses the `games` RLS policy that would otherwise have enforced this, so the filter must be written into the view body itself; there is no second line of defence here.

6. **Enable RLS in the same migration** (own-row reads for bookings/ledger/waitlist), write the reverse-order `down`, and regenerate `lib/types/database.ts`.

**Acceptance Criteria:**
- [ ] [REQ-DB-001] Migration applies cleanly; the `down` drops the view, sequence, and three tables in reverse dependency order
- [ ] [REQ-DB-004, REQ-DB-014] A client UPDATE or DELETE against `credit_ledger` is rejected by privilege revocation
- [ ] [REQ-SEC-008, REQ-SEC-013] Anonymous `select * from game_roster_public` returns only `game_id`, `nickname`, `status` — asserting the result contains no `player_id`, `email`, or `phone` column
- [ ] [REQ-SEC-008, REQ-SEC-013] `game_roster_public` returns rows only for games in `published`/`full`/`played`/`settled`; a booking on a `draft` game and a booking on a `cancelled` game each return zero rows through the view, with the status filter written into the view body rather than relied on from `games` RLS (SQL assertion)
- [ ] [REQ-DB-012] Inserting a second `reserved` booking for the same `(game_id, player_id)` is rejected by the partial unique constraint, while a second booking after the first is `cancelled` succeeds
- [ ] [REQ-DB-006] A second `waitlist` insert for the same `(game_id, player_id)` is rejected by the unique constraint
- [ ] [REQ-DB-011] Two successive VS sequence draws return different, non-reused values with the `26` prefix and 8-digit padding
- [ ] [REQ-DB-003] `bookings` carries `nudge_sent_at` and `reminder_sent_at`, and the `(status, expires_at)` and `(game_id, payment_code)` indexes exist
- [ ] [REQ-DB-005] Credit balance is defined as `SUM(delta_czk)` over `credit_ledger`. Non-negativity is **not** a table constraint — a per-row CHECK cannot express a cross-row sum invariant — so the schema stores the ledger and the guard lives in `create_booking`, which re-reads the balance under the per-player advisory lock and raises `CREDIT_NEGATIVE_BLOCKED` rather than writing a redemption that would drive the sum below zero (Phase 5). This criterion is satisfied by the migration defining balance-as-`SUM` with no negativity constraint; the guard itself is asserted in Phase 5
- [ ] [REQ-SEC-010, REQ-SEC-012] RLS is enabled deny-by-default in the same migration for `bookings`, `credit_ledger`, and `waitlist` — own-row reads only, with all writes routed through the `SECURITY DEFINER` RPCs and no direct client inserts or updates
- [ ] [REQ-DB-010, REQ-DB-015] The transactional-core tables carry exactly the spec §5.1 column sets — `bookings`, `credit_ledger`, and `waitlist` carry **no** `city`/`brand`/`policy_version` stamps of their own, deriving that context from their `game_id`/`player_id` FKs and from the stamped `events` row each transition writes — and remain over-provisioned for multi-city / multi-sport / referrals / marketplace
- [ ] [TEST-005] `supabase test db` passes [REQ-DB-003, REQ-DB-004, REQ-DB-006, REQ-DB-011, REQ-DB-012]
- [ ] [TEST-006] `supabase test db` passes [REQ-DB-004, REQ-DB-014]
- [ ] [TEST-007] `supabase test db` passes [REQ-SEC-008, REQ-SEC-013]

**Files:**
- `supabase/migrations/<ts>_bookings_ledger_waitlist.sql` - Migration creating the transactional core, sequence, view, and RLS
- `lib/types/database.ts` - Regenerated database types

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#51-entity-definitions` - Field definitions for `bookings`, `credit_ledger`, `waitlist`, `game_roster_public`
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#53-indexes--constraints` - Partial unique, expiry, and pending indexes plus append-only privileges
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#payments` - VS format and payment-code semantics

**Milestones:**
- **Bookings + VS sequence** (IP M3.1)
  - [ ] `bookings` created with the full column set including `nudge_sent_at` and `reminder_sent_at`
  - [ ] All three indexes added, including the partial unique on `(game_id, player_id)` for active statuses
  - [ ] VS sequence created with `26` prefix and 8-digit zero-pad, never reused
- **Ledger, waitlist, roster view + RLS** (IP M3.1)
  - [ ] `credit_ledger` created with UPDATE/DELETE revoked
  - [ ] `waitlist` created with unique `(game_id, player_id)` and last-notified `notified_at`
  - [ ] `game_roster_public` SECURITY DEFINER view created projecting only `game_id`/`nickname`/`status`
  - [ ] View body filters to `published`/`full`/`played`/`settled` games, returning nothing for `draft` and `cancelled`
  - [ ] RLS enabled in the same migration for own-row reads on all three tables
  - [ ] Reverse-order `down` written and verified; `lib/types/database.ts` regenerated

---

### Phase 5: RPCs `create_booking` + `admin_create_booking` — capacity + credit under advisory locks

**Goal:** Deliver the owner-only `create_booking` RPC with correct advisory-lock capacity control, credit non-negativity, VS allocation, and waitlist conversion, plus the admin-only `admin_create_booking` that books on behalf of any player over the same internals.

**Dependencies:** Phase 4

**Duration:** 170 minutes

**Prompt:**
Context from previous work: Phases 3-4 created the complete schema — `players`, `games`, `events`, `bookings`, `credit_ledger`, `waitlist`, the VS sequence, and the `game_roster_public` view — all with deny-by-default RLS. No functions exist yet.

This is the highest-risk phase in the plan. Concurrency correctness lives here, and it cannot be retrofitted: the "same transaction" guarantee for state + event + ledger only holds inside the database, so any transition assembled from separate TypeScript queries is untrustworthy under load. The function is `SECURITY DEFINER` plpgsql with `SET search_path=''` and every reference schema-qualified — this prevents definer privilege escalation via a hostile search path.

**Implement `create_booking(game_id, payment_method, from_waitlist_id?)`:**

The `payment_method` argument accepts **only `qr` | `cash`** from the client — deliberately narrower than the `bookings.payment_method` column enum from Phase 4. The other two column values, `credit` and `seed_free`, are **outcomes the function derives, never inputs a caller may assert**. Widening the client-supplied domain to the full enum would let any caller pass `seed_free` and book itself free; no in-function check can undo that as safely as never accepting the value.

This does not leave the seed script (Phase 9) or the full-credit path (Phase 11) unimplementable — both reach their methods through derivation rather than assertion. Semantics per LETCO_IMPLEMENTATION.md Section 6.2, resolved in this precedence:

1. **Seed player** — the acting player's `is_seed` is true → `seed_free`, `price_czk = 0`, `confirmed` instantly with no VS. The seed script gets seed bookings by acting as a seed player, not by naming the method.
2. **Full credit** — otherwise, if the wallet balance covers the full price → `credit`, price redeemed from the ledger, `confirmed` instantly with no VS. Phase 11's full-credit path is this branch, chosen by the balance rather than by the UI.
3. **Client choice** — otherwise the caller's `qr` or `cash` applies, with partial credit auto-applied per §4: `qr` allocates a VS and returns `reserved`; `cash` returns `reserved` with no VS.

A call passing `credit` or `seed_free` as `payment_method` is rejected inside the function — not silently downgraded to `qr`, since a silent downgrade would mask a client that believes it can name the method.

1. **Identity:** derive the acting player from `auth.uid()`. Never trust a client-supplied player id; reject a mismatch with `INSUFFICIENT_PERMISSION`.

2. **Lock ordering:** acquire `pg_advisory_xact_lock(hashtextextended(player_id::text, 0))` **first**, then the game lock. This fixed player→game order must hold in every function that takes both locks — a reversed order anywhere creates a deadlock window. Document the ordering in the function header.

3. **Capacity:** under the game lock, count active (reserved + confirmed) bookings and insert only if `count < capacity`. The Phase 4 partial unique constraint is the backstop, not the primary mechanism.

4. **Credit:** under the player lock, re-read `SUM(delta_czk)`, apply `min(balance, price)`, and write the negative redemption row only if the resulting balance stays ≥ 0. Otherwise raise `CREDIT_NEGATIVE_BLOCKED`. The player lock is what prevents one player's two concurrent bookings for *different* games from spending the same credit twice — the game lock cannot help here because the games differ.

5. **Derived method + payment code:** resolve the stored `payment_method` server-side in the precedence above — `is_seed` → `seed_free`, else full balance → `credit`, else the client's `qr`/`cash`. Allocate the VS from the sequence for `qr` bookings; `cash` reserves with no VS; the two derived instant-confirm methods confirm with no VS. Reject a client-supplied `credit` or `seed_free` with `INSUFFICIENT_PERMISSION` before any state is written.

6. **Waitlist conversion:** handle `from_waitlist_id` by setting `converted_booking_id` and emitting `waitlist_converted` in the same transaction.

7. **Events and errors:** write `booking_created` (and `payment_confirmed` for instant-confirm). Map failures to `CAPACITY_FULL` and `DUPLICATE_ACTIVE_BOOKING`.

**Implement `admin_create_booking(game_id UUID, player_id UUID, payment_method)`:**

Phase 23 needs an admin to book *on behalf of* another player — typically a shadow player who has never logged in and has no session to act under. `create_booking` cannot serve this: its whole safety story is that identity comes from `auth.uid()` and a client-supplied player id is rejected. Relaxing that to accept a `player_id` "when the caller is an admin" would put the owner-only path and the act-on-behalf path in one function, one branch apart, which is exactly where an authorization bug hides best. So this is a second, separate entry point.

8. **`admin_create_booking` requirements:**
   - `SECURITY DEFINER` plpgsql, `SET search_path=''`, every reference schema-qualified — identical conventions to `create_booking`.
   - **Admin-or-service-role only**, enforced inside the function: an `auth.uid()` resolving to a player with `is_admin`, or a service-role context. Any other caller raises `INSUFFICIENT_PERMISSION` before any state is written. The service-role key grants reach, not permission.
   - Books for the supplied `player_id`, which may be a shadow player (null `auth_user_id`) — that is the primary case.
   - Sets `booked_by_admin = true` on the booking. `create_booking` never sets it; this function always does. The flag is what makes the two paths distinguishable in the roster, the stats, and any later audit.
   - **Shares `create_booking`'s internals rather than re-implementing them** — the same player→game advisory lock order, the same capacity count under the game lock, the same credit derivation and non-negative re-read under the player lock, the same VS allocation, the same `payment_method` derivation precedence (`is_seed` → `seed_free`; full balance → `credit`; else the caller's `qr`/`cash`), and the same `CAPACITY_FULL` / `DUPLICATE_ACTIVE_BOOKING` / `CREDIT_NEGATIVE_BLOCKED` error mapping. Factor the shared body into a common internal function that both entry points call under their own authorization check, so the two paths cannot drift. A copy-pasted second implementation is the failure mode this phase exists to prevent: concurrency correctness that holds in one function and not the other is worse than none, because it looks tested.
   - Accepts the same narrowed client domain — **only `qr` | `cash`**. An admin may not assert `credit` or `seed_free` either; those stay derived. An admin booking a seed player still gets `seed_free` because the player's `is_seed` says so, not because the admin said so.
   - **Emits `admin_booking_created` alongside `booking_created`**, both in the same transaction as the state change. Both events fire: `booking_created` because a booking was created and every downstream consumer (email dispatch, stats funnel) keys on it, and `admin_booking_created` because the provenance is materially different and Phase 26's stats separate the two.

9. **Write `supabase/tests/booking_create.sql`** asserting: last-spot single winner under concurrency, one-player-two-games credit redeemed at most once with a never-negative ledger, and cross-user rejection. Assert database state, never timing.

10. **Write `supabase/tests/admin_create_booking.sql`** asserting: non-admin rejection, shadow-player booking with `booked_by_admin` set, both event rows present after one transaction, rejection of a caller-supplied `credit`/`seed_free`, and that capacity and credit behave identically to `create_booking` under the same conditions.

**Acceptance Criteria:**
- [ ] [REQ-BIZ-018, REQ-BIZ-045] Two concurrent `create_booking` calls for the last spot yield exactly one `reserved`/`confirmed` booking; the loser raises `CAPACITY_FULL` (SQL assertion)
- [ ] [REQ-BIZ-019, REQ-BIZ-046, REQ-DB-005] Two concurrent credit-funded `create_booking` calls by one player for different games redeem the wallet at most once and `SUM(delta_czk)` never goes below 0 (SQL assertion)
- [ ] [REQ-SEC-004, REQ-SEC-005, REQ-BIZ-047] `create_booking` invoked with another player's id is rejected inside the function with `INSUFFICIENT_PERMISSION`
- [ ] [REQ-DB-011, REQ-BIZ-012, REQ-BIZ-025] A QR booking allocates a unique VS; a booking the function derives as `credit` (full balance) or `seed_free` (seed player) returns `confirmed` with a null `payment_code`
- [ ] [REQ-BIZ-012, REQ-BIZ-025, REQ-SEC-004] `create_booking` accepts only `qr` and `cash` as client-supplied `payment_method` values; a call passing `credit` or `seed_free` is **rejected** inside the function with `INSUFFICIENT_PERMISSION` — not honored and not silently downgraded — so no caller can assert itself a free booking (SQL assertion)
- [ ] [REQ-BIZ-025, REQ-INFRA-008] A booking by an `is_seed` player is stored `seed_free` at `price_czk = 0` and `confirmed` instantly, derived from the player's `is_seed` flag with no method named by the caller — this is how the Phase 9 seed script creates seed bookings (SQL assertion)
- [ ] [REQ-BIZ-022, REQ-BIZ-012] A booking whose wallet balance covers the full price is stored `credit` and `confirmed` instantly with a null `payment_code`, derived from the balance rather than the caller's `qr`/`cash` choice — this is the Phase 11 full-credit path (SQL assertion)
- [ ] [REQ-BIZ-022, REQ-BIZ-023] A booking whose balance covers only part of the price keeps the caller's `qr`/`cash` method, applies the partial credit, and returns the reduced `amount_due` (SQL assertion)
- [ ] [REQ-BIZ-040] `from_waitlist_id` sets `converted_booking_id` and emits `waitlist_converted` in the same transaction as `booking_created`
- [ ] [REQ-DB-012] A second active booking for the same `(game_id, player_id)` raises `DUPLICATE_ACTIVE_BOOKING`
- [ ] [REQ-SEC-003, REQ-DB-013] The function declares `SECURITY DEFINER` with `SET search_path=''`, schema-qualifies every reference, uses transaction-scoped `pg_advisory_xact_lock(hashtextextended(<id>::text, 0))`, and documents the player→game lock order in its header
- [ ] [REQ-BIZ-045, REQ-BIZ-046, REQ-BIZ-047] `supabase/tests/booking_create.sql` runs green
- [ ] [REQ-BIZ-011] A player QR or cash booking creates a `reserved` booking and emits `booking_created`
- [ ] [REQ-BIZ-010, REQ-BIZ-044, REQ-DB-009] The booking state change, its ledger row, and its event row are written in the same transaction inside the dedicated server function — never assembled from separate client queries
- [ ] [REQ-BIZ-016] Any transition not present in the booking transition table is rejected at the function level
- [ ] [REQ-BIZ-023] Credit is auto-applied inside `create_booking` under the per-player advisory lock in the same transaction
- [ ] [REQ-BIZ-034] An unpaid reservation holds until game day by default — `expires_at` stays null unless the booking has been nudged
- [ ] [REQ-USER-002, REQ-SEC-004, REQ-SEC-006] `admin_create_booking(game_id, player_id, payment_method)` is defined `SECURITY DEFINER` with `SET search_path=''`, permits only an admin `auth.uid()` or a service-role context, and rejects every other caller with `INSUFFICIENT_PERMISSION` before any state is written (SQL assertion)
- [ ] [REQ-USER-002, REQ-BIZ-010] `admin_create_booking` creates a booking for a shadow player (null `auth_user_id`) with `booked_by_admin = true`, and emits `booking_created` **and** `admin_booking_created` in the same transaction as the state change (SQL assertion)
- [ ] [REQ-BIZ-045, REQ-BIZ-046, REQ-DB-012] `admin_create_booking` shares `create_booking`'s internals rather than duplicating them — a code review confirms one common internal body called by both entry points, and the same capacity, credit-non-negativity, and `DUPLICATE_ACTIVE_BOOKING` assertions pass against `admin_create_booking` as against `create_booking`
- [ ] [REQ-BIZ-012, REQ-BIZ-025, REQ-SEC-004] `admin_create_booking` accepts only `qr` and `cash` as caller-supplied `payment_method`; a call passing `credit` or `seed_free` is rejected with `INSUFFICIENT_PERMISSION` — admin privilege does not widen the domain, and an admin booking an `is_seed` player still gets `seed_free` by derivation (SQL assertion)
- [ ] [TEST-008] `supabase test db` passes [REQ-BIZ-018, REQ-BIZ-045]
- [ ] [TEST-009] `supabase test db` passes [REQ-BIZ-019, REQ-DB-005, REQ-BIZ-046]
- [ ] [TEST-010] A `create_booking` call naming another player's id is rejected inside the function with `INSUFFICIENT_PERMISSION`, and no booking row is written: `supabase test db` passes [REQ-SEC-004, REQ-SEC-005, REQ-BIZ-047]
- [ ] [TEST-051] A non-admin `admin_create_booking` call is rejected with `INSUFFICIENT_PERMISSION` and writes no booking; an admin call books a shadow player with `booked_by_admin` set and both event rows present: `supabase test db` passes [REQ-USER-002, REQ-SEC-006]

**Files:**
- `supabase/migrations/<ts>_rpc_create_booking.sql` - `create_booking` definition plus the shared internal body both entry points call
- `supabase/migrations/<ts>_rpc_admin_create_booking.sql` - `admin_create_booking` definition (admin-or-service-role, `booked_by_admin`, dual event write)
- `supabase/tests/booking_create.sql` - Capacity, credit-non-negativity, and authorization assertions
- `supabase/tests/admin_create_booking.sql` - Admin authorization, shadow booking, dual-event, and shared-internals assertions
- `lib/types/database.ts` - RPC signatures reflected in generated types

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - `create_booking` argument and return contract
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#3-architecture-design` - Advisory-lock ordering and the concurrency model
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#63-error-codes` - `CAPACITY_FULL`, `DUPLICATE_ACTIVE_BOOKING`, `CREDIT_NEGATIVE_BLOCKED`
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#payments` - Credit auto-application semantics

**Milestones:**
- **Function skeleton + capacity control** (IP M4.1)
  - [ ] Function defined with `SECURITY DEFINER`, `search_path=''`, and identity from `auth.uid()`
  - [ ] Cross-user invocation rejected with `INSUFFICIENT_PERMISSION`
  - [ ] Player-then-game advisory lock order implemented and documented in the function header
  - [ ] Capacity enforced under the game lock, backed by the partial unique constraint
  - [ ] `CAPACITY_FULL` and `DUPLICATE_ACTIVE_BOOKING` mapped as friendly errors
- **Credit application, VS allocation, and waitlist conversion** (IP M4.1)
  - [ ] Credit applied under the player lock with a non-negative re-read guard raising `CREDIT_NEGATIVE_BLOCKED`
  - [ ] VS allocated for QR bookings; full-credit and seed bookings confirm instantly with no VS
  - [ ] `from_waitlist_id` sets `converted_booking_id` and emits `waitlist_converted` in the same transaction
  - [ ] `booking_created` (+ `payment_confirmed` on instant-confirm) written in the same transaction
  - [ ] `supabase/tests/booking_create.sql` written and passing
- **`admin_create_booking` — act-on-behalf entry point** (IP M4.1)
  - [ ] Shared internal body factored out of `create_booking` and called by both entry points
  - [ ] `admin_create_booking` defined with `SECURITY DEFINER`, `search_path=''`, admin-or-service-role check inside the function
  - [ ] Books any player including a shadow, setting `booked_by_admin = true`
  - [ ] `booking_created` + `admin_booking_created` emitted in the same transaction
  - [ ] Caller-supplied `credit`/`seed_free` rejected; derivation precedence unchanged from `create_booking`
  - [ ] `supabase/tests/admin_create_booking.sql` written and passing

---

### Phase 6: RPC `cancel_booking` — window enforcement + credit issuance

**Goal:** Deliver the owner-only `cancel_booking` RPC with window enforcement, credit issuance for money actually applied, and the release event trio.

**Dependencies:** Phase 5

**Duration:** 80 minutes

**Prompt:**
Context from previous work: Phase 4 completed the schema. Phase 5 delivered `create_booking` with player→game advisory-lock ordering, capacity control, credit application, VS allocation, and same-transaction event writes. This phase adds the other owner-only RPC, sharing all of Phase 5's conventions: `SECURITY DEFINER`, `SET search_path=''`, schema-qualified references, authorization inside the function, and the same player→game lock order wherever both locks are taken.

**Implement `cancel_booking(booking_id)`:**

1. **Authorization:** owner resolved from `auth.uid()`; non-owned bookings rejected with `INSUFFICIENT_PERMISSION`.

2. **Window gate:** reject with `CANCEL_WINDOW_CLOSED` unless the game is `published` or `full` **and** `now() < starts_at`. After kickoff the outcome is determined solely by attendance marking, so there is no cancel path past that point.

3. **Transition:** move reserved/confirmed → cancelled, recording `cancel_lead_hours`.

4. **Credit:** issue `cancellation_credit` for money actually applied — QR-paid, **cash-paid**, and credit-applied amounts all count. An unpaid reserved cancellation issues no credit. No cash refunds ever: money never leaves the system, it becomes wallet credit.

5. **Events:** emit `booking_cancelled` + `credit_issued` (where applicable) + `spot_released` when capacity frees in a non-cancelled game — all in the same transaction as the state change.

6. **Write `supabase/tests/booking_cancel.sql`** asserting cross-user rejection, window rejection, credit-for-applied-money-only, and the presence of all three event rows after a single cancel transaction. Assert database state, never timing.

**Acceptance Criteria:**
- [ ] [REQ-SEC-004, REQ-SEC-005, REQ-BIZ-047] `cancel_booking` on another player's booking is rejected inside the function with `INSUFFICIENT_PERMISSION`
- [ ] [REQ-BIZ-030, REQ-BIZ-016] `cancel_booking` after `starts_at`, or on a `played`/`settled`/`cancelled` game, raises `CANCEL_WINDOW_CLOSED`
- [ ] [REQ-BIZ-014, REQ-BIZ-031] Cancelling a paid booking within the window issues `cancellation_credit` equal to money applied, including cash-paid amounts — no cash refund ever leaves the system
- [ ] [REQ-BIZ-033] Cancelling an unpaid reserved booking issues no `credit_ledger` row
- [ ] [REQ-BIZ-032] The cancelled booking records `cancel_lead_hours`
- [ ] [REQ-BIZ-010, REQ-BIZ-017, REQ-DB-009] `booking_cancelled`, `credit_issued`, and `spot_released` rows are all present after a single cancel transaction
- [ ] [REQ-SEC-003] The function declares `SECURITY DEFINER` with `SET search_path=''` and schema-qualifies every reference
- [ ] [REQ-BIZ-030, REQ-BIZ-031] `supabase/tests/booking_cancel.sql` runs green
- [ ] [REQ-BIZ-044] Cancellation is modelled purely as a booking state transition executed by the dedicated server function, indifferent to whether a player or a game-level cancellation triggered it
- [ ] [TEST-048] A `cancel_booking` call against another player's booking is rejected inside the function with `INSUFFICIENT_PERMISSION`, and the target booking's status is unchanged: `supabase test db` passes [REQ-SEC-004, REQ-SEC-005, REQ-BIZ-047]
- [ ] [TEST-011] `supabase test db` passes [REQ-BIZ-030, REQ-BIZ-031, REQ-BIZ-017]

**Files:**
- `supabase/migrations/<ts>_rpc_cancel_booking.sql` - `cancel_booking` definition
- `supabase/tests/booking_cancel.sql` - Authorization, window, credit-issuance, and event assertions
- `lib/types/database.ts` - RPC signature reflected in generated types

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - `cancel_booking` argument and return contract
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#63-error-codes` - `CANCEL_WINDOW_CLOSED` semantics
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#policies` - Cancellation window and credit-issuance policy (credit, never cash)

**Milestones:**
- **`cancel_booking` — authorization + window enforcement** (IP M4.2)
  - [ ] Function defined with `SECURITY DEFINER`, `search_path=''`, and owner check from `auth.uid()`
  - [ ] Non-owners rejected with `INSUFFICIENT_PERMISSION`
  - [ ] Window gate rejects unless the game is published/full and `now() < starts_at`
  - [ ] Transition to cancelled records `cancel_lead_hours`
- **Credit issuance + release events** (IP M4.2)
  - [ ] `cancellation_credit` issued for applied money only, including cash-paid amounts
  - [ ] `booking_cancelled` + `credit_issued` emitted in one transaction
  - [ ] `spot_released` emitted when capacity frees in a non-cancelled game
  - [ ] `supabase/tests/booking_cancel.sql` written and passing

---

### Phase 7: RPCs `confirm_booking` + `expire_booking` + game transitions

**Goal:** Deliver the admin-or-cron `confirm_booking`/`expire_booking` RPCs and the game-state transitions with capacity-driven toggles and transactional `cancel_game` fan-out.

**Dependencies:** Phase 4

**Duration:** 150 minutes

**Prompt:**
Context from previous work: Phase 4 completed the schema. Phases 5-6 delivered the owner-only `create_booking` and `cancel_booking` RPCs with advisory-lock concurrency control, credit application, and same-transaction event writes. This phase depends only on Phase 4 and may proceed in parallel with 5-6, but shares their conventions: `SECURITY DEFINER`, `search_path=''`, schema-qualified references, authorization inside the function, player→game lock order wherever both locks are taken.

The key insight for `confirm_booking` is that it is the **single automation seam**. It takes a `confirmed_by` argument and a `received_amount_czk` argument, and is deliberately indifferent to whether the caller is a human tapping ✓ Paid in the admin panel or a future bank-API poller. `received_amount_czk` is precisely that seam: the admin UI omits it (confirming at the expected amount), while a future Fio poller passes the amount the bank actually reported. Getting this boundary right now means future bank automation is a new caller, not a refactor.

1. **Implement `confirm_booking(booking_id UUID, confirmed_by UUID, received_amount_czk INT DEFAULT NULL)`:**
   - Permit only an admin `auth.uid()` or a service-role context; otherwise raise `INSUFFICIENT_PERMISSION`. Authorization is enforced inside the function — the service-role key grants reach, not permission.
   - Transition `reserved → confirmed` and emit `payment_confirmed` in the same transaction.
   - **`received_amount_czk` NULL** (the admin one-tap path) means "confirm at the expected amount": confirm as above and return `credit_issued_czk = 0`. This keeps the common admin case a single tap with no amount entry.
   - **Overpayment** (`received_amount_czk` > amount due): confirm the booking *and* issue the difference as wallet credit — a positive `credit_ledger` row plus a `credit_issued` event, in the same transaction as the `payment_confirmed` event. Return the difference as `credit_issued_czk` [REQ-EH-002].
   - **Underpayment** (`received_amount_czk` < amount due): do **not** confirm. Leave the booking `reserved`, emit no `payment_confirmed` event, and raise so the admin follows up manually — a partial payment is not a payment [REQ-EH-001].
   - **Payment after expiry** (booking already `expired`): issue the full `received_amount_czk` as wallet credit and leave the booking `expired`. The spot is never reinstated and capacity is unchanged [REQ-EH-003]. This is the credit-in-full policy referenced in `expire_booking` below.
   - Return `{ id, status, credit_issued_czk }` on every path, so a caller can tell confirmation from crediting without a second query.

2. **Implement `expire_booking(booking_id)`:**
   - Cron/service-role only. Transition `reserved → expired`, emitting `booking_expired` + `spot_released`.
   - An expired booking is never reinstated: a payment landing after expiry is credited in full to the wallet per the reconciliation policy. Reference this in the function comment so a later contributor doesn't "helpfully" add reinstatement.

3. **Implement the game transitions:**
   - `publish`: draft → published, emitting `game_published`, admin-only. Games are never auto-published — publication is always an explicit admin action.
   - Drive `published ⇄ full` automatically from active-booking count vs capacity — this is a derived state, not something an admin sets.
   - settle / mark-played: `played` reachable from `published` **or** `full`, so an under-capacity game that never filled can still be played and settled; then `played → settled`.
   - `cancel_game`: cancel all active bookings, issue `cancellation_credit` for applied money, clear the waitlist, and emit `game_cancelled` — all in one transaction, so a mid-loop failure cannot leave some players credited and others not.
   - Enforce the edit rule that capacity can never drop below the active-booking count.

4. **Reject any transition not present in the booking or game state table.** Write `supabase/tests/booking_rpcs_b.sql` asserting authorization, transition legality, the three `received_amount_czk` reconciliation paths (over / under / after-expiry), and that `cancel_game` leaves no orphaned waitlist rows while crediting every paid booking.

**Acceptance Criteria:**
- [ ] [REQ-SEC-004, REQ-SEC-006, REQ-BIZ-047] A non-admin, non-service-role caller invoking `confirm_booking` or `expire_booking` is rejected with `INSUFFICIENT_PERMISSION` (SQL assertion)
- [ ] [REQ-BIZ-013, REQ-DB-009] `confirm_booking` moves `reserved → confirmed` and writes exactly one `payment_confirmed` event in the same transaction
- [ ] [REQ-BIZ-013] `confirm_booking` accepts `received_amount_czk INT DEFAULT NULL` and returns `{ id, status, credit_issued_czk }`; a NULL amount confirms at the expected amount and returns `credit_issued_czk = 0` (SQL assertion)
- [ ] [REQ-EH-002] `confirm_booking` called with `received_amount_czk` above the amount due confirms the booking and issues the difference as credit — one `payment_confirmed` event, one `credit_issued` event, one positive `credit_ledger` row for the difference, and `credit_issued_czk` equal to that difference (SQL assertion)
- [ ] [REQ-EH-001] `confirm_booking` called with `received_amount_czk` below the amount due leaves the booking `reserved` and emits no `payment_confirmed` event (SQL assertion)
- [ ] [REQ-EH-003] `confirm_booking` called against an already-`expired` booking issues the full `received_amount_czk` as credit, leaves the booking `expired`, does not reinstate the spot, and leaves capacity unchanged (SQL assertion)
- [ ] [REQ-BIZ-015, REQ-BIZ-017, REQ-DB-009] `expire_booking` moves `reserved → expired` and writes `booking_expired` + `spot_released` in the same transaction
- [ ] [REQ-BIZ-016] A booking already `confirmed`/`cancelled`/`expired` cannot be re-transitioned by either function
- [ ] [REQ-BIZ-001, REQ-BIZ-002] `publish` moves draft → published and emits `game_published`; a non-admin call is rejected
- [ ] [REQ-BIZ-003, REQ-BIZ-004] Active-booking count reaching capacity flips the game to `full`, and a cancellation flips it back to `published`
- [ ] [REQ-BIZ-005, REQ-BIZ-006] An under-capacity `published` game can transition directly to `played` and then `settled`
- [ ] [REQ-BIZ-007] `cancel_game` on a game with paid and unpaid bookings cancels all, credits only the paid, clears every waitlist row, and emits `game_cancelled` — verified in one transaction by assertion
- [ ] [REQ-BIZ-008] An edit lowering capacity below the active-booking count is rejected
- [ ] [REQ-BIZ-007, REQ-BIZ-013, REQ-BIZ-015] `supabase/tests/booking_rpcs_b.sql` runs green
- [ ] [REQ-BIZ-027] `confirm_booking(booking_id, confirmed_by, received_amount_czk)` is the single automation seam — the function makes no assumption that the confirmer is human, so a future Fio bank poller calls the identical entry point, passing the bank-reported amount where the admin UI passes NULL
- [ ] [REQ-SEC-003, REQ-SEC-015] Both functions declare `SECURITY DEFINER` with `SET search_path=''` and schema-qualify every reference; the service-role context grants reach but authorization is still enforced inside the function, and the key is never used for a direct RLS-bypassing table write
- [ ] [REQ-BIZ-010, REQ-BIZ-044] Every booking and game transition occurs only via these dedicated server functions, each writing its event row in the same transaction as the state change
- [ ] [TEST-012] `supabase test db` passes [REQ-SEC-006, REQ-BIZ-047]
- [ ] [TEST-013] `supabase test db` passes [REQ-BIZ-013, REQ-BIZ-015, REQ-DB-009]
- [ ] [TEST-014] `supabase test db` passes [REQ-BIZ-007, REQ-BIZ-001]

**Files:**
- `supabase/migrations/<ts>_booking_rpcs_b.sql` - `confirm_booking`, `expire_booking`, and game-transition definitions
- `supabase/tests/booking_rpcs_b.sql` - Authorization, transition, and `cancel_game` fan-out assertions
- `lib/types/database.ts` - RPC signatures reflected in generated types

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - `confirm_booking`/`expire_booking`/game-transition contracts
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#63-error-codes` - `INSUFFICIENT_PERMISSION` semantics
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#data-model` - Booking and game state machines
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#payments` - Late-payment credit-in-full reconciliation policy

**Milestones:**
- **`confirm_booking` + `expire_booking` (admin-or-cron)** (IP M5.1)
  - [ ] `confirm_booking` defined with admin-or-service-role authorization inside the function
  - [ ] Signature is `(booking_id UUID, confirmed_by UUID, received_amount_czk INT DEFAULT NULL)` returning `{ id, status, credit_issued_czk }`
  - [ ] `reserved → confirmed` transition emits `payment_confirmed` in one transaction
  - [ ] Over / under / after-expiry reconciliation paths implemented per the §4 policy and asserted in SQL
  - [ ] `expire_booking` defined, cron/service-role only, emitting `booking_expired` + `spot_released`
  - [ ] Transitions absent from the state table are rejected
  - [ ] Late-payment credit-in-full policy referenced in the function header (no reinstatement)
- **Game transitions — publish / settle / cancel_game** (IP M5.2)
  - [ ] `publish` (draft→published) defined, admin-only, emitting `game_published`; never auto-published
  - [ ] `published ⇄ full` driven automatically by active-booking count vs capacity
  - [ ] settle / mark-played transitions defined, with `played` reachable from `published` or `full`
  - [ ] `cancel_game` cancels bookings, credits applied money, clears waitlist, emits `game_cancelled` in one transaction
  - [ ] Capacity-below-active-count edit rejected
  - [ ] `supabase/tests/booking_rpcs_b.sql` written and passing

---

### Phase 8: Auth — magic link + shadow claim + `/login`

**Goal:** Deliver end-to-end magic-link auth with exact-match shadow claim, signup validation, and the drop-off event pair.

**Dependencies:** Phase 2, Phase 3

**Duration:** 180 minutes

**Prompt:**
Context from previous work: Phase 3 created `players` (with the nullable `auth_user_id` that makes shadow players possible) and `events`. Phase 2 provided `lib/strings.ts` and the Supabase client factories. Phases 5-7 delivered the RPCs, though this phase depends only on Phase 3.

Wire Supabase passwordless magic-link auth end-to-end. This phase is kept whole rather than split because the request half and the callback half cannot be verified independently — proving "the magic link works" requires the round-trip.

The subtle piece is **shadow claim**: an admin may have created a player row for someone who booked via WhatsApp months ago. When that person finally logs in, their history must attach to the existing row, not fork into a duplicate.

1. **Build the login half:**
   - `/login` page (`app/login/page.tsx`) using `lib/strings.ts` copy, with a magic-link request form.
   - `app/login/actions.ts` requesting the Supabase magic link with `redirectTo` carrying the target game id and pending action (book / join-waitlist), and emitting `auth_link_sent`. This `redirectTo` payload is what makes Phase 11's deep-link resume possible — get it right here.
   - `lib/auth/session.ts` server helpers reading and verifying the session. Protected routes must be gated by a server-side session check, **not** by hidden navigation.
   - Wrap `app/layout.tsx` with session context.
   - The auth email stays on Supabase's built-in sender, deliberately outside the `sendEmail()`/`EMAIL_DRY_RUN` seam, until Phase 30 — this keeps login working on real phones before Resend DNS verifies.

2. **Build the callback and claim half:**
   - `app/auth/callback/route.ts` exchanging the code, establishing the session, and emitting `auth_completed`. The `auth_link_sent` → `auth_completed` pair is the drop-off funnel Phase 26 reports on.
   - `lib/auth/shadowClaim.ts` linking `auth_user_id` to a shadow `players` row **only on exact email match**, emitting `player_claimed`, never creating a duplicate. A shadow player without an email can never be auto-claimed — it is claimable only via the Phase 25 admin merge. Fuzzy matching here would silently bind the wrong person's booking history to the wrong account, which is why the rule is exact-match-or-nothing.
   - On first-time signup: validate the nickname against `[A-Za-z0-9 _-]{1,20}` with a friendly inline error (`NICKNAME_INVALID`) and a distinct taken-name message — never surface a raw constraint violation.
   - Capture required GDPR consent and optional marketing opt-in as separate controls, then emit `account_created`.

**Acceptance Criteria:**
- [ ] [REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-004, REQ-AUTH-008] Requesting a magic link from `/login` emits `auth_link_sent` and the `redirectTo` URL contains the target game id and pending action
- [ ] [REQ-AUTH-002, REQ-AUTH-004] Completing the callback emits `auth_completed`, establishes a server-readable session, and auto-resumes the pending book / join-waitlist intent
- [ ] [REQ-USER-003] A logged-in user whose email exactly matches a shadow player's email is linked to that existing row, preserves history, emits `player_claimed`, and creates no duplicate `players` row
- [ ] [REQ-USER-004] A shadow player with a null email is never auto-claimed by any login — it is claimable only via the admin merge tool
- [ ] [REQ-AUTH-001, REQ-SEC-020] Requesting a protected route unauthenticated is rejected server-side (returns redirect/403), not merely hidden from navigation
- [ ] [REQ-SEC-001, REQ-SEC-002] Signup with nickname `"bad*name"` shows a friendly inline `NICKNAME_INVALID` message; signup with an existing nickname shows a distinct taken-name message, never a raw constraint error
- [ ] [REQ-AUTH-005, REQ-AUTH-006] Signup without GDPR consent is blocked; marketing opt-in is independently optional and persisted to `marketing_opt_in`
- [ ] [REQ-DB-008] `account_created` is emitted on first-time signup
- [ ] [REQ-AUTH-003, REQ-COMP-004] The magic-link email is unaffected by `EMAIL_DRY_RUN` (does not route through `sendEmail()`) and remains on the Supabase built-in sender as a transitional arrangement until the M5 SMTP cutover
- [ ] [REQ-AUTH-007] The signup surface links to `/privacy` — the route itself is created in Phase 27, which owns the file and its human-supplied copy, so this link is expected to 404 until then
- [ ] [TEST-015] `npm run test:unit -- -t "shadowClaim"` passes [REQ-USER-003]
- [ ] [TEST-016] `npm run test:unit -- -t "nickname"` passes [REQ-SEC-001, REQ-SEC-002]

**Files:**
- `app/login/page.tsx` - Magic-link request page
- `app/login/actions.ts` - Link-request server action emitting `auth_link_sent`
- `app/auth/callback/route.ts` - Code exchange, session establishment, `auth_completed`
- `lib/auth/session.ts` - Server-side session read/verify helpers
- `lib/auth/shadowClaim.ts` - Exact-email-match claim logic emitting `player_claimed`
- `app/layout.tsx` - Session context wrapper
- `lib/strings.ts` - Auth copy keys

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - Magic link, shadow claim, GDPR consent, deep-link resume rules
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#phase-6-auth--magic-link--shadow-claim--login` - Milestone breakdown
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#63-error-codes` - `NICKNAME_INVALID` handling

**Milestones:**
- **Magic-link login + server session** (IP M6.1)
  - [ ] `/login` built with `lib/strings.ts` copy and a magic-link request form
  - [ ] Link-request action emits `auth_link_sent` with game id + pending action in `redirectTo`
  - [ ] `lib/auth/session.ts` server helpers implemented and used for route gating
  - [ ] `app/layout.tsx` wrapped with session context and server-side verification
  - [ ] Auth email confirmed to bypass `sendEmail()`/`EMAIL_DRY_RUN`
- **Shadow claim + signup validation + auth events** (IP M6.2)
  - [ ] `/auth/callback` exchanges the code, establishes the session, emits `auth_completed`
  - [ ] `lib/auth/shadowClaim.ts` links on exact email match only, emits `player_claimed`, never duplicates
  - [ ] Email-less shadows confirmed non-auto-claimable (admin merge only)
  - [ ] Nickname charset and uniqueness validated with friendly inline errors
  - [ ] GDPR consent required and marketing opt-in optional; `account_created` emitted
  - [ ] Auth copy keys added to `lib/strings.ts`

---

### Phase 9: Seed / fixture script v1

**Goal:** Provide a one-command seed producing realistic fixtures across every game status and booking state via the real RPCs.

**Dependencies:** Phase 5, Phase 6, Phase 7, Phase 8

**Duration:** 110 minutes

**Prompt:**
Context from previous work: Phases 3-4 built the full schema; Phases 5-7 delivered all the state-transition RPCs (`create_booking`, `cancel_booking`, `confirm_booking`, `expire_booking`, and the game transitions); Phase 8 wired auth. There is now a working state machine but no data to exercise it against.

Build the one-command seed script that populates a dev database with lifelike fixtures, so the admin UI (Phases 21-26) and the E2E suite (Phases 28-29) have realistic data to run against.

The design rule that matters here: **route state transitions through the real RPCs** rather than inserting booking rows directly. Only base rows (players, games) are seeded directly. If the seed can fabricate a booking state the RPCs cannot produce, the fixtures stop being a faithful model of production and tests start passing against impossible states.

**Scope boundary — seed v1 covers only what Phases 5-7 can actually produce.** Two categories are deliberately out of scope here and land later:

- **Waitlist fixtures.** `join_waitlist` does not exist until Phase 17. `create_booking(from_waitlist_id)` needs a `waitlist` row to convert, and there is no sanctioned way to create one at this point in the sequence — a direct insert would be exactly the impossible-state fabrication the rule above forbids. So seed v1 contains **no waitlist rows**, and Phase 17 extends the seed with them once the RPC exists. Anything that verifies against seeded waitlist data (Phase 22 badges, Phase 26 waitlist depth) runs after Phase 17 and is unaffected.
- **Auth-funnel events.** `auth_link_sent`, `auth_completed`, `account_created`, and `player_claimed` are written by the Phase 8 auth routes during a real login round-trip. The seed does not fabricate them: `events` is append-only with no client access, and opening a setup-only write path into it would create the one backdoor the table's whole design exists to prevent — for the sake of a fixture. **The resolution is stated once, here, and Phase 26 follows it:** the magic-link drop-off metric is verified with **one real signup performed at the M4 gate**, not against seeded events. Every other stats metric verifies against seeded data normally.

The two base rows a real signup needs (a player with `auth_user_id`) are still seeded directly, as base rows always are — what is not seeded is the event trail of an authentication that never happened.

1. **Define fixtures in `scripts/fixtures.ts`:**
   - Players: real (with `auth_user_id`), shadow with email, shadow without email, and a seed player (`is_seed`).
   - Games: one in each status — draft, published, full, played, settled, cancelled.
   - Credit balances across several players, including one with a partial balance and one with a balance exceeding a game price (to exercise the full-credit instant-confirm path).

2. **Implement `scripts/seed.ts`:**
   - Insert base rows (players, games) directly.
   - Create bookings and credit movements via the Phase 5/6/7 RPCs so every state is reachable-only.
   - Cover bookings in each state: reserved, confirmed, cancelled, expired. No waitlist entries — those arrive with the Phase 17 seed extension.

3. **Add a documented reset + reseed command** that truncates in dependency order then reseeds, and wire both commands into `package.json` scripts.

Edge case to watch for: seeding through the RPCs means the seed runs under an authorization context. Ensure the script uses the service-role client for admin-or-cron RPCs and appropriately-scoped sessions for owner-only RPCs, rather than weakening the functions' authorization to accommodate seeding.

Related, and the reason the previous rule has teeth: `create_booking` accepts only `qr`/`cash` from a caller (Phase 5) — `credit` and `seed_free` are derived from the player's `is_seed` flag and wallet balance. So the seed produces a `seed_free` booking by calling `create_booking` **as a seed player**, and a `credit` booking by first seeding that player a covering balance. The script never names either method. If a fixture needs a state the RPCs will not derive, that is a signal the fixture is impossible in production, not a reason to insert the row directly.

**Acceptance Criteria:**
- [ ] [REQ-INFRA-008] `npm run seed` populates players, games, bookings, and credit rows and exits with code 0
- [ ] [REQ-INFRA-008] A post-seed SQL scan confirms at least one game in each of draft/published/full/played/settled/cancelled
- [ ] [REQ-INFRA-008] A post-seed SQL scan confirms at least one booking in each of reserved/confirmed/cancelled/expired
- [ ] [REQ-INFRA-008] At least one player has a non-zero credit balance
- [ ] [REQ-INFRA-008] Seed v1 creates **no** `waitlist` rows and **no** synthetic `events` rows — a post-seed scan confirms an empty `waitlist` table and confirms every `events` row present was written by an RPC as part of a state transition, not inserted by the script (waitlist fixtures arrive in Phase 17; auth-funnel events come from a real signup at the M4 gate)
- [ ] [REQ-INFRA-008, REQ-USER-002, REQ-BIZ-025] Fixtures include a real player, a shadow with email, a shadow without email, and a seed player whose booking comes back `payment_method = seed_free` at price 0, confirmed instantly — derived by `create_booking` from the player's `is_seed` flag, with the seed script passing only `qr`/`cash` and never naming `seed_free`
- [ ] [REQ-BIZ-010] Bookings are created via `supabase.rpc()` calls, not direct table inserts (verified by code review of `scripts/seed.ts`)
- [ ] [REQ-INFRA-008] Reset + reseed run back-to-back produces identical fixture counts (idempotent)
- [ ] [REQ-INFRA-008] `package.json` exposes both the seed and reset commands
- [ ] [TEST-017] `npm run seed` passes [REQ-INFRA-008]

**Files:**
- `scripts/seed.ts` - Seed orchestration calling RPCs for state transitions
- `scripts/fixtures.ts` - Fixture data definitions
- `package.json` - Seed and reset script entries
- `lib/supabase/clients.ts` - Service-role client used by the seed

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#75-test-data` - Required fixture coverage
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#low-cost-additions` - Seed/fixture script scope (M1, extended per milestone)
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - RPC contracts the seed invokes

**Milestones:**
- **Seed / fixture script v1** (IP M7.1)
  - [ ] `scripts/fixtures.ts` defines players (real/shadow-with-email/shadow-without-email/seed), games in every status, and credit balances
  - [ ] `scripts/seed.ts` inserts base rows directly and creates bookings/credit via the Phase 5/6/7 RPCs
  - [ ] Correct authorization contexts used per RPC (service-role for admin/cron, scoped sessions for owner-only)
  - [ ] Bookings seeded in every state; no waitlist rows and no synthetic event rows written
  - [ ] Reset + reseed command implemented, truncating in dependency order
  - [ ] Seed and reset wired into `package.json` and verified idempotent

---

## 🛑 GATE M1 — Schema + auth (after Phase 9)

**This is a mandatory halt point, not a checklist.** Spec §10 gate M1 covers Phases 3–9: all migrations, RLS policies, the magic-link flow, shadow-claim logic, event writes for the auth pair, and fixture script v1.

**§10 gate criteria — verify by hand, on a real device:**
- [ ] Sign up on a phone; the resulting player row is visible in Supabase
- [ ] `auth_link_sent` and `auth_completed` events are present in the events table
- [ ] A second test user **cannot** read the first user's rows via the anon API

**STOP — do not proceed past this gate without explicit human confirmation.**

---

### Phase 10: Games list + detail + live counter + public roster

**Goal:** Ship the anonymous player browsing surfaces — games list, live landing block, and game detail with counter and PII-safe roster.

**Dependencies:** Phase 2, Phase 4, Phase 8, Phase 9

**Duration:** 180 minutes

**Prompt:**
Context from previous work: Phase 4 created the `game_roster_public` view and the anon-readable published-games RLS policy. Phase 8 wired auth so button state can reflect session. Phase 9 provides seed fixtures to develop against. Phases 1-2 provided the theme, `lib/format.ts`, and `lib/strings.ts`.

Carried forward from the M1 gate verification (2026-07-20): Phase 8's post-signup redirect targets `/games`, which currently 404s because this phase has not shipped. That was accepted as expected at the gate — `app/games/page.tsx` below is what closes it. Confirm the post-signup redirect lands on a rendered `/games` before this phase is considered complete.

Build the anonymous-readable player browsing surfaces. This is the first read-only player-facing slice, and `/game/[id]` is the primary surface players land on from a WhatsApp link — it must work perfectly for a visitor with no session. The list and detail surfaces are built together because they share `GameCard`, the formatter, and the same anon RLS path.

1. **Games list + landing block:**
   - `app/games/page.tsx` reading published games via the anon RLS policy. Non-published games must not be visible to anonymous visitors.
   - `components/GameCard.tsx` rendering venue (**HTML-escaped**), `Europe/Prague` 24h time via `lib/format.ts`, price, and spots-left.
   - Replace the placeholder next-game slot in `app/page.tsx` (left by Phase 1) with a live next-game block reusing `GameCard`.
   - Source every label from `lib/strings.ts`.

2. **Game detail + counter + roster:**
   - `app/game/[id]/page.tsx` rendering venue (escaped) and Prague 24h time.
   - `components/SpotsCounter.tsx` reading the live active-booking count vs capacity server-side on load. A slightly stale counter is acceptable; a client-computed one that drifts is not.
   - `components/Roster.tsx` reading `game_roster_public` and rendering nickname + status only. Verify at the query level that `player_id`, `email`, and `phone` are never selected — this is the single highest-risk PII surface in the product, and acceptance criterion 10 tests it directly.
   - Add the book / join-waitlist button whose target routes into the Phase 11 flow (the flow itself is built next phase).

Technical requirements: `games.venue` is admin-supplied free text and must be escaped at every render site — HTML here, and later OG `content` and `.ics` fields in Phase 13. All datetimes go through `lib/format.ts`; a raw UTC render anywhere is a defect.

**Acceptance Criteria:**
- [ ] [REQ-UI-006, REQ-SEC-013] `/games` renders published games only; a draft game seeded by Phase 9 does not appear for an anonymous visitor
- [ ] [REQ-UI-003] Game times render as `Europe/Prague` 24h (e.g. "Thu 18:30"), never raw UTC or ISO
- [ ] [REQ-SEC-017, REQ-SEC-018] A game seeded with venue `<script>alert(1)</script>` renders escaped text, not executed markup
- [ ] [REQ-UI-005] The landing page next-game block reflects seeded live data with no placeholder remaining in `app/page.tsx`
- [ ] [REQ-UI-007] `/game/[id]` shows a spots-left counter computed server-side from the active-booking count vs capacity
- [ ] [REQ-SEC-008, REQ-UI-007] Anonymous read of the roster returns nickname + status only; the network response contains no `player_id`, `email`, or `phone`
- [ ] [REQ-UI-007] The book / join-waitlist button is present and its target route resolves
- [ ] [REQ-UI-002] Every visible label originates from `lib/strings.ts`
- [ ] [TEST-018] `npm run test:e2e -- -g "games list"` passes [REQ-UI-006, REQ-SEC-018, REQ-SEC-013]
- [ ] [TEST-019] `npm run test:e2e -- -g "roster"` passes [REQ-UI-007, REQ-SEC-008]

**Files:**
- `app/games/page.tsx` - Published games list
- `components/GameCard.tsx` - Game summary card with escaped venue and Prague time
- `app/page.tsx` - Landing page with the live next-game block replacing the placeholder
- `app/game/[id]/page.tsx` - Game detail page
- `components/SpotsCounter.tsx` - Server-computed live spots-left counter
- `components/Roster.tsx` - PII-safe roster from `game_roster_public`
- `lib/format.ts` - Prague 24h formatting used by all surfaces
- `lib/strings.ts` - Labels for the browsing surfaces

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#surfaces` - Player surface definitions for `/games` and `/game/[id]`
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - Output escaping and anonymous-read boundaries
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_UI_WIREFRAME.md` - Wireframes for the list and detail surfaces
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#51-entity-definitions` - `game_roster_public` projection

**Milestones:**
- **Games list + landing next-game block** (IP M8.1)
  - [ ] `app/games/page.tsx` lists published games via the anon RLS policy
  - [ ] `components/GameCard.tsx` renders escaped venue, Prague 24h time, price, and spots-left
  - [ ] `app/page.tsx` placeholder replaced with a live next-game block reusing `GameCard`
  - [ ] All labels sourced from `lib/strings.ts`
  - [ ] Anonymous access verified to exclude non-published games
- **Game detail + live counter + public roster** (IP M8.2)
  - [ ] `app/game/[id]/page.tsx` renders escaped venue and Prague 24h time
  - [ ] `components/SpotsCounter.tsx` reads the live active-booking count server-side
  - [ ] `components/Roster.tsx` reads `game_roster_public` rendering nickname + status only
  - [ ] Book / join-waitlist button added, routing into the Phase 11 flow
  - [ ] Roster query verified never to select `player_id`/`email`/`phone`

---

### Phase 11: Booking flow UI + `create_booking` wiring + credit auto-apply

**Goal:** Deliver the player booking flow wired to `create_booking`, with deep-link resume, credit auto-apply UX, and friendly race/duplicate errors.

**Dependencies:** Phase 5, Phase 8, Phase 10

**Duration:** 180 minutes

**Prompt:**
Context from previous work: Phase 5 delivered `create_booking` with capacity control, credit auto-application, and waitlist conversion. Phase 8 wired magic-link auth with `redirectTo` carrying game id + pending action. Phase 10 built `/game/[id]` with a book button whose target now needs implementing.

Implement the player booking flow. The flow and its deep-link resume are built together because the resume path re-enters the same server action — verifying one without the other proves nothing.

Two rules govern this phase absolutely. First, **all writes go through `supabase.rpc('create_booking', ...)`** with the user's JWT — a client-assembled transition is a regression, not a shortcut. Second, **no pre-auth soft holds, ever**: a spot is never reserved for an unauthenticated visitor. The booking comes into existence only when the RPC runs under an authenticated session.

1. **Payment-method choice + RPC wiring:**
   - `components/PaymentMethodChoice.tsx` offering QR vs cash.
   - `app/game/[id]/book/page.tsx` gated by an authenticated session.
   - `app/game/[id]/book/actions.ts` calling `create_booking` via `supabase.rpc()` with the user's JWT so `auth.uid()` inside the function identifies the acting player.
   - Wire the book button in `app/game/[id]/page.tsx` to this flow.
   - Return the booking result (VS + `amount_due`, or instant-confirmed) for the Phase 12 confirmation screen.

2. **Deep-link resume + credit UX + friendly errors:**
   - `lib/booking/resume.ts` reading the game id and pending action from the post-auth redirect and resuming `create_booking` automatically. A player who taps Book while logged out should land back on their game with the intent fulfilled — not on a bare home screen having lost their place.
   - Branch the UX on the RPC **result**, not on a client-side prediction: the UI sends only the player's `qr`/`cash` choice, and `create_booking` decides the actual method. A returned `payment_method` of `credit` or `seed_free` (both `confirmed`, no VS) renders instant confirmation with no QR; a returned `qr`/`cash` with a non-zero `credit_applied_czk` renders the reduced `amount_due`. The client must not try to guess the full-credit case from a locally-known balance — the balance it holds may be stale, and the function's answer is the only authoritative one.
   - `components/BookingError.tsx` mapping `CAPACITY_FULL` to "spot already taken, you're still on the waitlist" and `DUPLICATE_ACTIVE_BOOKING` to its own friendly copy. A race loser must never see a raw Postgres error — losing a race is a normal outcome in this product, not an exception.
   - Add the friendly-error and credit-outcome copy to `lib/strings.ts`.

Verification: the acceptance bar is book → QR in under 60 seconds for an authenticated player on a phone (criterion 1). First-time signup is explicitly not held to that bar since the magic-link round-trip is outside our control.

**Acceptance Criteria:**
- [ ] [REQ-UI-008, REQ-BIZ-011] Booking a spot persists via `supabase.rpc('create_booking', ...)` only; a grep of the booking flow finds no direct `.insert()`/`.update()` on `bookings`
- [ ] [REQ-UI-008, REQ-BIZ-024] The QR-vs-cash choice is the only `payment_method` the UI sends, and a cash-at-pitch booking sits `reserved` until an admin confirms it; a grep of the booking flow finds no client code sending `credit` or `seed_free`
- [ ] [REQ-AUTH-004] An unauthenticated Book tap round-trips through the magic link and resumes the booking automatically, landing on the confirmation
- [ ] [REQ-BIZ-022] A booking fully covered by credit comes back from the RPC as `payment_method = credit`, `confirmed`, with no VS, and the UI shows no QR — the outcome is read from the RPC result, not predicted client-side from a locally-held balance
- [ ] [REQ-BIZ-022, REQ-BIZ-023] A booking partially covered by credit displays the reduced `amount_due` (price minus credit applied)
- [ ] [REQ-BIZ-039] A `CAPACITY_FULL` rejection renders the friendly "spot already taken, you're still on the waitlist" screen, not a raw error
- [ ] [REQ-DB-012] A `DUPLICATE_ACTIVE_BOOKING` rejection renders its distinct friendly message
- [ ] [REQ-SEC-021] No booking row exists for an unauthenticated visitor at any point in the flow (no pre-auth soft hold)
- [ ] [TEST-020] `npm run test:e2e -- -g "book create_booking"` passes [REQ-SEC-021, REQ-BIZ-024, REQ-BIZ-011]
- [ ] [TEST-021] `npm run test:e2e -- -g "credit auto-apply"` passes [REQ-BIZ-022, REQ-BIZ-023, REQ-BIZ-039]

**Files:**
- `app/game/[id]/book/page.tsx` - Session-gated booking page
- `app/game/[id]/book/actions.ts` - Server action calling `create_booking`
- `components/PaymentMethodChoice.tsx` - QR vs cash selection
- `app/game/[id]/page.tsx` - Book button wired to the flow
- `lib/booking/resume.ts` - Post-auth deep-link resume logic
- `components/BookingError.tsx` - RPC error → friendly copy mapping
- `lib/strings.ts` - Booking flow and error copy

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - `create_booking` argument and return contract
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#63-error-codes` - `CAPACITY_FULL` and `DUPLICATE_ACTIVE_BOOKING` mapping
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - Deep-link resume and the no-pre-auth-soft-holds rule
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#payments` - Credit auto-application semantics

**Milestones:**
- **Payment-method choice + `create_booking` wiring** (IP M9.1)
  - [ ] `components/PaymentMethodChoice.tsx` offering QR vs cash built
  - [ ] `app/game/[id]/book/page.tsx` built and session-gated
  - [ ] `app/game/[id]/book/actions.ts` calls `create_booking` via `supabase.rpc()` with the user's JWT
  - [ ] Book button on the detail page wired to the flow
  - [ ] Booking result (VS + amount due, or instant-confirmed) returned for the Phase 12 screen
- **Deep-link resume + credit auto-apply UX + friendly errors** (IP M9.2)
  - [ ] `lib/booking/resume.ts` resumes the pending action after magic-link completion
  - [ ] UX branches on full-credit (instant confirm, no QR) vs partial credit (reduced amount due)
  - [ ] `components/BookingError.tsx` maps `CAPACITY_FULL` and `DUPLICATE_ACTIVE_BOOKING` to friendly copy
  - [ ] Error and credit-outcome copy added to `lib/strings.ts`
  - [ ] No pre-auth soft hold verified — booking exists only after the authenticated RPC call

---

### Phase 12: SPD QR payment render + confirmation screen

**Goal:** Render the Czech SPD 1.0 payment QR with a sanitized MSG field, a plain-text fallback, and the booking confirmation screen.

**Dependencies:** Phase 2, Phase 10, Phase 11

**Duration:** 100 minutes

**Prompt:**
Context from previous work: Phase 11 delivered the booking flow, which now returns a booking with a variable symbol and an amount due (or an instant-confirmed state). Phase 10 built the game detail page. Phase 2 provided `PAYMENT_IBAN` in the environment contract.

This phase renders the payment artifact. The QR is the product's core payment mechanism — a malformed string means a player's money goes nowhere, or worse, somewhere else.

1. **`lib/payments/spd.ts`** building the SPD 1.0 string: `SPD*1.0*ACC:<IBAN>*AM:<amount>.00*CC:CZK*X-VS:<VS>*MSG:<nickname>` with `PAYMENT_IBAN` from env.
   - **Sanitize the `MSG` nickname**: strip `*`, control characters, and non-ASCII, and cap at 60 characters. The `*` is the SPD field delimiter — an unsanitized nickname containing one would break the framing and could inject arbitrary SPD fields, potentially redirecting a payment. The nickname charset is already restricted at signup, but this is defence in depth at the render site.
   - Compute the amount as `price_czk − credit_applied_czk`; skip the QR entirely when credit covers the full price.

2. **`components/QrPayment.tsx`** rendering the SPD string as a scannable QR plus a plain-text fallback (account number, amount, VS) — some players will type it into their banking app manually.

3. **`app/game/[id]/book/confirmation/page.tsx`** showing the QR/text or the instant-confirmed state, with all copy from `lib/strings.ts`. Leave a clearly-marked slot for the `.ics` link that Phase 13 adds.

4. **Unit-test the SPD payload and the sanitizer**, including a hostile nickname containing `*`, control characters, non-ASCII, and >60 characters.

Verification note: QR validity cannot be proven by unit test alone. The M2 gate requires scanning the generated QR with a named Czech banking app on a named device — George (Česká spořitelna) is the designated primary; record the app version and device model, and attach a screenshot of the bank's payment pre-fill screen showing account, amount, and VS. Treat that artifact as the authoritative check.

**Acceptance Criteria:**
- [ ] [REQ-BIZ-021, REQ-INFRA-010, REQ-ENV-002] `lib/payments/spd.ts` produces a string exactly matching `SPD*1.0*ACC:<IBAN>*AM:<amount>.00*CC:CZK*X-VS:<VS>*MSG:<nickname>` for a known input, with the IBAN sourced from the `PAYMENT_IBAN` env variable (unit test)
- [ ] [REQ-SEC-007] A nickname containing `*`, control characters, non-ASCII, or exceeding 60 chars is sanitized so the SPD framing has exactly the expected field count (unit test)
- [ ] [REQ-BIZ-022] The QR amount equals `price_czk − credit_applied_czk`, and no QR is rendered when credit covers the full price
- [ ] [REQ-UI-011] The confirmation screen shows the QR plus a plain-text fallback containing account number, amount, and VS
- [ ] [REQ-BIZ-022] An instant-confirmed booking renders the confirmed state with no QR and no VS
- [ ] [REQ-BIZ-020] The generated QR scans in **George (Česká spořitelna)** version `<app-version>` on `<device model + OS version>`; the bank's payment pre-fill screen shows account `<PAYMENT_IBAN>`, amount `<price_czk − credit_applied_czk>` CZK, and VS `<payment_code>` — payments stay Czech (CZK, QR platba, variable symbols) regardless of UI language; the pre-fill screenshot is attached to the M2 gate record (artifact check, M2 gate)
- [ ] [REQ-UI-002] All confirmation-screen copy originates from `lib/strings.ts`
- [ ] [TEST-022] `npm run test:unit -- -t "spd"` passes [REQ-BIZ-021, REQ-SEC-007, REQ-ENV-002]

**Files:**
- `lib/payments/spd.ts` - SPD 1.0 string builder and MSG sanitizer
- `components/QrPayment.tsx` - QR rendering with text fallback
- `app/game/[id]/book/confirmation/page.tsx` - Booking confirmation screen with a Phase 13 `.ics` slot
- `lib/strings.ts` - Confirmation and payment copy

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#payments` - SPD string format, VS semantics, and amount computation
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#72-unit-tests` - Unit test targets for the SPD builder and sanitizer
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#milestones` - M2 gate requiring a real banking-app scan

**Milestones:**
- **SPD 1.0 string builder + sanitizer** (IP M10.1)
  - [ ] `lib/payments/spd.ts` builds the SPD 1.0 string from `PAYMENT_IBAN`, amount, VS, and nickname
  - [ ] MSG sanitizer strips `*`/control/non-ASCII and caps at 60 chars
  - [ ] Amount computed as `price_czk − credit_applied_czk`; QR skipped on full credit
  - [ ] Payload and sanitizer unit-tested including a hostile nickname
- **QR render + confirmation screen** (IP M10.1)
  - [ ] `components/QrPayment.tsx` renders the QR plus account/amount/VS text fallback
  - [ ] `app/game/[id]/book/confirmation/page.tsx` shows QR/text or the instant-confirmed state
  - [ ] Confirmation copy sourced from `lib/strings.ts` with a marked slot for the Phase 13 `.ics` link
  - [ ] Generated QR scanned in George (Česká spořitelna) on a named device, with app version, device model, and pre-fill screenshot recorded (M2 artifact check)

---

### Phase 13: `.ics` download + Open Graph share cards

**Goal:** Deliver the calendar download and WhatsApp-facing Open Graph share cards with venue escaped at every interpolation site.

**Dependencies:** Phase 1, Phase 10, Phase 12

**Duration:** 80 minutes

**Prompt:**
Context from previous work: Phase 10 built `/game/[id]` and the landing page. Phase 12 built the booking confirmation screen with a marked slot for the `.ics` link. Phase 1 established the volt-on-black theme tokens.

Build the sharing and calendar artifacts. Game links are shared almost exclusively in WhatsApp, so the preview card is an acquisition surface, not decoration.

1. **`.ics` calendar download:**
   - `lib/calendar/ics.ts` generating an event with venue as location (**escaped per the iCalendar text rules** — commas, semicolons, backslashes, and newlines), `starts_at`, and a 90-minute default duration.
   - `app/game/[id]/ics/route.ts` serving the download with the correct content type and filename.
   - Link the `.ics` from the Phase 12 confirmation screen slot.
   - Unit-test the generator with a venue containing special characters.

2. **Open Graph share cards:**
   - `lib/og/shareImage.tsx` producing the volt-on-black share image (venue, time, spots-left) using the Phase 1 theme tokens.
   - `generateMetadata` OG tags on `app/game/[id]/page.tsx` and the landing `/`, **escaping venue in every `content` attribute**.

Venue is admin-supplied free text. It is escaped in three distinct grammars in this phase — HTML attribute (OG `content`), iCalendar text, and the image render — and each needs its own escaping, not one shared "sanitize" helper. Getting this wrong in the `.ics` produces a file phones silently refuse to open.

**Acceptance Criteria:**
- [ ] [REQ-UI-013] `/game/[id]/ics` downloads a valid `.ics` that opens in a phone calendar with correct venue, start time, and 90-minute duration
- [ ] [REQ-SEC-018] A venue containing commas, semicolons, backslashes, or newlines produces a still-valid `.ics` (unit test)
- [ ] [REQ-UI-013, REQ-UI-008] The `.ics` link is present and working on the booking confirmation screen
- [ ] [REQ-UI-012, REQ-UI-007] Pasting a `/game/[id]` link into WhatsApp renders a preview card with venue, time, and spots-left (artifact check)
- [ ] [REQ-UI-012] The landing page `/` also renders an Open Graph preview card
- [ ] [REQ-SEC-017, REQ-SEC-018] A venue containing HTML special characters is escaped in the OG `content` attribute (asserted against the rendered `<head>`)
- [ ] [REQ-UI-004] The share image uses `tailwind.config.ts` theme tokens, matching the volt-on-black reference
- [ ] [TEST-023] `npm run test:unit -- -t "ics"` passes [REQ-UI-013]
- [ ] [TEST-024] `npm run test:e2e -- -g "open graph"` passes [REQ-UI-012, REQ-SEC-018]

**Files:**
- `lib/calendar/ics.ts` - `.ics` generator with iCalendar-escaped venue
- `app/game/[id]/ics/route.ts` - `.ics` download route
- `lib/og/shareImage.tsx` - Volt-on-black Open Graph share image
- `app/game/[id]/page.tsx` - `generateMetadata` OG tags
- `app/page.tsx` - Landing OG tags
- `app/game/[id]/book/confirmation/page.tsx` - `.ics` link added to the confirmation screen

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#low-cost-additions` - Open Graph and `.ics` scope (M2)
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - Escaping at HTML, OG `content`, and `.ics` render sites
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#72-unit-tests` - Unit test targets for the `.ics` generator
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#acceptance-criteria` - Criterion 13

**Milestones:**
- **`.ics` calendar download** (IP M10.2)
  - [ ] `lib/calendar/ics.ts` generates an event with iCalendar-escaped venue location, `starts_at`, and 90-min default
  - [ ] `app/game/[id]/ics/route.ts` serves the download with correct content type and filename
  - [ ] `.ics` linked from the Phase 12 confirmation screen
  - [ ] Generator unit-tested with a venue containing iCalendar special characters
  - [ ] `.ics` verified to open in a phone calendar (artifact check)
- **Open Graph share cards** (IP M10.2)
  - [ ] `lib/og/shareImage.tsx` produces the volt-on-black share image from theme tokens
  - [ ] OG `generateMetadata` added to `/game/[id]` with escaped venue in every `content`
  - [ ] OG tags added to the landing `/`
  - [ ] WhatsApp preview card verified for a real game link (artifact check)

---

### Phase 14: Account page — my bookings, credit, self-cancel, deletion mailto

**Goal:** Close the M2 player loop with an account page for bookings, credit balance, self-cancel, and deletion request.

**Dependencies:** Phase 2, Phase 6, Phase 8, Phase 11

**Duration:** 150 minutes

**Prompt:**
Context from previous work: Phase 6 delivered `cancel_booking` with window enforcement and credit issuance. Phase 8 provided the session. Phases 11-13 completed the booking, payment, and sharing surfaces. The player can now book but has no way to see or cancel what they booked.

Build `/account` to close the M2 player loop and give the cancel path a UI before the M3 cron and email work begins. The page and the cancel action ship together because the account page is the only surface the cancel action can be exercised from.

1. **Account page:**
   - `app/account/page.tsx` gated by an authenticated session, reading the player's own rows under own-row RLS.
   - `components/BookingList.tsx` rendering bookings with status and payment badges (paid / reserved / cash / seed).
   - `components/CreditBalance.tsx` reading the balance as `SUM(delta_czk)` **server-side**. A client-computed balance will drift from the ledger, and the ledger is the authority.
   - The account-deletion `mailto` link. Deletion in Phase 1 is by email request only — there is deliberately no self-serve deletion UI, because deletion is implemented as *anonymization* (nickname replaced with a placeholder, email/phone nulled, row retained so events and ledger stay keyed) rather than a hard delete.
   - Source all labels from `lib/strings.ts`.

2. **Self-cancel wiring:**
   - `app/account/actions.ts` calling `cancel_booking` via `supabase.rpc()`.
   - On success, reflect the issued cancellation credit in the balance.
   - Map a `CANCEL_WINDOW_CLOSED` rejection to friendly copy. Disable the cancel affordance after kickoff for a good UX — but the RPC remains the enforcement authority. The UI mirrors the rule; it does not own it. A UI that merely hides the button while the RPC would accept the call is a security defect, not a cosmetic one.

**Acceptance Criteria:**
- [ ] [REQ-UI-009, REQ-SEC-011] `/account` requires an authenticated session and shows only the signed-in player's bookings
- [ ] [REQ-UI-009] Each booking displays the correct payment badge among paid / reserved / cash / seed
- [ ] [REQ-DB-005] The credit balance is computed server-side as `SUM(delta_czk)` and matches a direct SQL query of the ledger
- [ ] [REQ-USER-006] An account-deletion `mailto` link is present and no self-serve deletion UI exists anywhere in the app
- [ ] [REQ-BIZ-031] Cancelling a paid booking within the window succeeds and the issued credit appears in the displayed balance immediately
- [ ] [REQ-BIZ-030] Attempting to cancel after `starts_at` is rejected by the RPC and rendered as friendly `CANCEL_WINDOW_CLOSED` copy
- [ ] [REQ-BIZ-010] The cancel action calls `supabase.rpc('cancel_booking', ...)` with no direct table write
- [ ] [REQ-UI-002] Every visible label originates from `lib/strings.ts`
- [ ] [REQ-USER-007] The deletion-request path is documented as anonymization — `nickname` becomes `deleted-player-<id>`, `email`/`phone` are nulled, and `events`/`credit_ledger` rows are retained keyed to the anonymized `player_id`
- [ ] [TEST-025] `npm run test:e2e -- -g "account"` passes [REQ-UI-009, REQ-USER-006]
- [ ] [TEST-026] `npm run test:e2e -- -g "self-cancel"` passes [REQ-BIZ-030, REQ-BIZ-031]

**Files:**
- `app/account/page.tsx` - Session-gated account page
- `components/BookingList.tsx` - Bookings with status and payment badges
- `components/CreditBalance.tsx` - Server-computed ledger balance
- `app/account/actions.ts` - Self-cancel action calling `cancel_booking`
- `lib/strings.ts` - Account and cancellation copy

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#surfaces` - `/account` surface definition
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#policies` - Cancellation window and credit-issuance rules
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - Deletion-as-anonymization policy
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - `cancel_booking` contract

**Milestones:**
- **Account page — bookings, credit balance, deletion mailto** (IP M11.1)
  - [ ] `app/account/page.tsx` built, session-gated, reading own rows under RLS
  - [ ] `components/BookingList.tsx` renders bookings with paid/reserved/cash/seed badges
  - [ ] `components/CreditBalance.tsx` reads `SUM(delta_czk)` server-side
  - [ ] Account-deletion `mailto` link added with no self-serve deletion UI
  - [ ] All labels sourced from `lib/strings.ts`
- **Self-cancel wiring** (IP M11.2)
  - [ ] `app/account/actions.ts` calls `cancel_booking` via `supabase.rpc()`
  - [ ] Issued cancellation credit reflected in the balance on success
  - [ ] `CANCEL_WINDOW_CLOSED` mapped to friendly copy in `lib/strings.ts`
  - [ ] Cancel affordance disabled after kickoff with the RPC retained as enforcement authority

---

## 🛑 GATE M2 — Games + booking (after Phase 14)

**This is a mandatory halt point, not a checklist.** Spec §10 gate M2 covers Phases 10–14: list, detail, live counter, `createBooking()` with the capacity transaction, the QR screen with VS + SPD string, the cash option, credit auto-apply, OG tags, and the `.ics` link.

**§10 gate criteria — verify by hand, on real devices:**
- [ ] Two real users book a test game end-to-end on phones
- [ ] The QR scans correctly in George (Česká spořitelna), app version and device model recorded, with the pre-fill screen showing the correct account, amount, and VS — screenshot attached to this gate record
- [ ] A game link pasted into WhatsApp shows a proper preview card
- [ ] The VS sequence increments
- [ ] Concurrent booking of the last spot leaves exactly one winner

**STOP — do not proceed past this gate without explicit human confirmation.**

---

### Phase 15: Transactional email templates (eight in-app, dry-run)

**Goal:** Build all eight in-app transactional email templates with escaped interpolation and copy sourced entirely from `lib/strings.ts`. The ninth transactional email in the ANALYZE §9 list — the magic link — is Supabase's built-in mailer and is not built here.

**Dependencies:** Phase 2, Phase 13

**Duration:** 110 minutes

**Prompt:**
Context from previous work: Phase 2 built the `sendEmail()` seam gated by `EMAIL_DRY_RUN`. Phases 5-7 delivered the RPCs that emit the trigger events. Phase 13 produced the `.ics` generator this phase attaches. No email has been rendered yet.

Build every transactional email template. This phase produces templates only — the event→template dispatch layer is Phase 16, so these are pure render functions with no knowledge of when they fire. That separation is what lets each template be unit-tested against a fixed props object.

ANALYZE §9 lists **nine** transactional emails. One of them — the **magic link** — is sent by Supabase's built-in mailer, outside the `sendEmail()`/dry-run seam (§2/§8), so it is not a template in this codebase and has no entry in `lib/strings.ts`. The remaining **eight** are the in-app templates built here, and they are exactly the eight the Phase 16 dispatch map keys on.

**Build all eight in-app templates** (English, HTML, venue and nickname escaped at every render site):

1. **`lib/email/templates/bookingEmails.tsx`** — "Spot held — pay with this QR" (VS + SPD string + `.ics` attachment) and "Payment confirmed" (+ `.ics` attachment). These two are deliberately distinct: one is a payment request, the other a receipt, and conflating them was an explicit specification correction.

2. **`lib/email/templates/lifecycleEmails.tsx`** — the three cron-triggered notices sharing one layout: scarcity nudge ("pay online within 12h or lose the spot"), expiry notice, and the 24h reminder.

3. **`lib/email/templates/waitlistEmail.tsx`** — waitlist spot-open.

4. **`lib/email/templates/cancellationEmails.tsx`** — cancellation + credit receipt, and the game-cancelled notice.

Every subject and body string goes in `lib/strings.ts` — no hardcoded copy in templates. Pull the nudge (12h) and reminder (24h) window figures from `lib/policy.ts` rather than writing them into the copy as literals, so a v2 policy bump updates the emails too.

Extend `lib/email/sendEmail.ts` to accept a chosen template plus props, render it to escaped HTML, and honor `EMAIL_DRY_RUN`.

**Acceptance Criteria:**
- [ ] [REQ-INT-003] The **spot-held** ("Spot held — pay with this QR") template renders in dry-run with copy sourced from `lib/strings.ts`
- [ ] [REQ-INT-004] The **payment-confirmed** template renders in dry-run with copy sourced from `lib/strings.ts`
- [ ] [REQ-INT-005] The **scarcity nudge** template renders in dry-run with copy sourced from `lib/strings.ts`
- [ ] [REQ-INT-006] The **expiry notice** template renders in dry-run with copy sourced from `lib/strings.ts`
- [ ] [REQ-INT-007] The **waitlist spot-open** template renders in dry-run with copy sourced from `lib/strings.ts`
- [ ] [REQ-INT-008] The **cancellation + credit receipt** template renders in dry-run with copy sourced from `lib/strings.ts`
- [ ] [REQ-INT-009] The **game-cancelled notice** template renders in dry-run with copy sourced from `lib/strings.ts`
- [ ] [REQ-INT-010] The **24h reminder** template renders in dry-run with copy sourced from `lib/strings.ts`
- [ ] [REQ-AUTH-003, REQ-INT-001] The ninth ANALYZE §9 email — the **magic link** — is confirmed to have no in-app template: it is sent by Supabase's built-in mailer, and a grep finds no magic-link subject or body in `lib/strings.ts` or `lib/email/templates/`
- [ ] [REQ-SEC-017, REQ-SEC-018] A venue or nickname containing HTML special characters renders escaped in every template body (unit test per template family)
- [ ] [REQ-INT-003, REQ-UI-013] The spot-held template includes the VS, the SPD string, and the `.ics` attachment
- [ ] [REQ-INT-004, REQ-UI-013] The payment-confirmed template includes the `.ics` attachment
- [ ] [REQ-BIZ-029] The nudge and reminder copy source their 12h/24h figures from `lib/policy.ts`, not hardcoded literals
- [ ] [REQ-INT-001] `lib/email/sendEmail.ts` renders a chosen template to escaped HTML and makes zero network calls under `EMAIL_DRY_RUN=on`
- [ ] [REQ-UI-002] A grep finds no email subject or body string hardcoded outside `lib/strings.ts`
- [ ] [TEST-027] `npm run test:unit -- -t "email templates"` passes [REQ-INT-003, REQ-INT-004, REQ-SEC-018]

**Files:**
- `lib/email/templates/bookingEmails.tsx` - Spot-held and payment-confirmed templates
- `lib/email/templates/lifecycleEmails.tsx` - Nudge, expiry, and reminder templates
- `lib/email/templates/waitlistEmail.tsx` - Waitlist spot-open template
- `lib/email/templates/cancellationEmails.tsx` - Cancellation receipt and game-cancelled templates
- `lib/email/sendEmail.ts` - Template rendering extension honoring dry-run
- `lib/strings.ts` - All email subject and body copy
- `lib/policy.ts` - Nudge and reminder window figures interpolated into copy
- `lib/calendar/ics.ts` - `.ics` attachment source

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#surfaces` - The nine transactional emails (eight in-app + the Supabase magic link) and the spot-held vs payment-confirmed split
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#policies` - Nudge (12h) and reminder (24h) copy semantics
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - Escaping requirements in email bodies
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#stack-conventions` - The `sendEmail()` seam and dry-run convention

**Milestones:**
- **Booking + cancellation templates** (IP M12.1)
  - [ ] `bookingEmails.tsx` built with spot-held (VS + SPD + `.ics`) and payment-confirmed (+ `.ics`) bodies
  - [ ] `cancellationEmails.tsx` built with the credit receipt and game-cancelled notice
  - [ ] Venue and nickname HTML-escaped at every render site in both files
- **Lifecycle + waitlist templates** (IP M12.1)
  - [ ] `lifecycleEmails.tsx` built with nudge, expiry, and 24h reminder sharing one layout
  - [ ] `waitlistEmail.tsx` built for waitlist spot-open
  - [ ] Nudge/reminder window figures interpolated from `lib/policy.ts`
- **Copy centralization + render seam** (IP M12.1)
  - [ ] All eight in-app subjects and bodies added to `lib/strings.ts` with no hardcoded copy in templates
  - [ ] `lib/email/sendEmail.ts` extended to render a chosen template to escaped HTML honoring `EMAIL_DRY_RUN`
  - [ ] Per-template escaping unit tests passing

---

### Phase 16: Email dispatch layer (event → template)

**Goal:** Deliver the event-keyed dispatch map that resolves each trigger event to exactly one template, suppressing the spot-held email on instant-confirmed bookings.

**Dependencies:** Phase 6, Phase 7, Phase 15

**Duration:** 70 minutes

**Prompt:**
Context from previous work: Phase 15 built all eight in-app transactional email templates as pure render functions and extended `sendEmail()` to render a chosen template. Phases 5-7 delivered the RPCs that emit the trigger events (`booking_created`, `payment_confirmed`, `booking_expired`, `booking_cancelled`, `game_cancelled`, and so on). Nothing yet decides *which* template fires *when*.

Build `lib/email/dispatch.ts`, the single place that maps a trigger event to a template. Everything runs in dry-run by default — logged, not sent — which makes the entire M3 lifecycle observable before cron drives it and before Resend DNS verifies.

**Template/event count, stated once so the two numbers never read as a conflict:** ANALYZE §9 lists nine transactional emails. Eight of them are the in-app templates from Phase 15 and each is dispatch-mapped here, one event to one template. The ninth, **magic link**, is delivered by Supabase's built-in mailer on login/signup request — it is deliberately *not* dispatch-mapped, has no entry in this map, and stays outside the `sendEmail()`/dry-run seam for all of Phase 1. So: **nine emails exist; eight are dispatch-mapped; `magic_link` is delivered by Supabase.**

1. **Map the eight trigger events** (the eight in-app templates, exhaustively):
   - `booking_created` → spot-held
   - `payment_confirmed` → payment-confirmed
   - `nudge_sent` → nudge
   - `booking_expired` → expiry
   - `waitlist_notified` → waitlist spot-open
   - `booking_cancelled` → cancellation + credit receipt
   - `game_cancelled` → game-cancelled notice
   - `reminder_sent` → reminder

2. **Suppress the spot-held email for instant-confirmed bookings** (seed players and full-credit bookings). Those bookings emit both `booking_created` and `payment_confirmed` in the same transaction, so a naive event-to-template map would send two emails for a booking that was never pending payment. They must receive only the payment-confirmed email. This is the one piece of real logic in the dispatch layer and the reason it is worth its own module rather than being inlined at each call site.

3. **Make dispatch resolution table-driven and unit-testable** — a test should be able to enumerate the map and assert one-template-per-event without invoking any RPC or network.

**Acceptance Criteria:**
- [ ] [REQ-INT-003] `booking_created` resolves to exactly one template — spot-held
- [ ] [REQ-INT-004] `payment_confirmed` resolves to exactly one template — payment-confirmed
- [ ] [REQ-INT-005] `nudge_sent` resolves to exactly one template — scarcity nudge
- [ ] [REQ-INT-006] `booking_expired` resolves to exactly one template — expiry notice
- [ ] [REQ-INT-007] `waitlist_notified` resolves to exactly one template — waitlist spot-open
- [ ] [REQ-INT-008] `booking_cancelled` resolves to exactly one template — cancellation + credit receipt
- [ ] [REQ-INT-009] `game_cancelled` resolves to exactly one template — game-cancelled notice
- [ ] [REQ-INT-010] `reminder_sent` resolves to exactly one template — 24h reminder
- [ ] [REQ-INT-003, REQ-INT-004, REQ-INT-005, REQ-INT-006, REQ-INT-007, REQ-INT-008, REQ-INT-009, REQ-INT-010] A unit test enumerating the dispatch map asserts it contains exactly these eight keys — no more, no fewer — and no `magic_link` key (that email is Supabase-delivered, not dispatched)
- [ ] [REQ-INT-004, REQ-BIZ-012] An instant-confirmed booking (seed or full-credit) dispatches exactly one email — payment-confirmed — and never the spot-held one (unit test)
- [ ] [REQ-INT-003] A normal QR booking dispatches the spot-held email on `booking_created`
- [ ] [REQ-INT-001] With `EMAIL_DRY_RUN=on`, every dispatch path logs and makes zero network calls
- [ ] [REQ-INT-001] An unmapped event type is a no-op rather than an error or a wrong-template send
- [ ] [REQ-INT-001] The dispatch map is data, not a chain of conditionals, and requires no RPC or network to test
- [ ] [TEST-028] `npm run test:unit -- -t "dispatch"` passes [REQ-INT-001, REQ-INT-004]

**Files:**
- `lib/email/dispatch.ts` - Event → template dispatch map with instant-confirm suppression
- `lib/email/sendEmail.ts` - Send seam invoked by dispatch
- `lib/email/templates/bookingEmails.tsx` - Templates resolved by the map
- `lib/email/templates/lifecycleEmails.tsx` - Templates resolved by the map
- `lib/email/templates/waitlistEmail.tsx` - Template resolved by the map
- `lib/email/templates/cancellationEmails.tsx` - Templates resolved by the map

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#surfaces` - Trigger events for each transactional email
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - Events emitted by each RPC
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#stack-conventions` - The `sendEmail()` seam and dry-run convention

**Milestones:**
- **Event → template dispatch map** (IP M12.2)
  - [ ] `lib/email/dispatch.ts` maps all eight trigger events to their templates as data, with `magic_link` deliberately absent (Supabase-delivered)
  - [ ] Unmapped event types treated as a no-op
  - [ ] Dispatch verified to route through `sendEmail()` and honor `EMAIL_DRY_RUN`
- **Instant-confirm suppression + tests** (IP M12.2)
  - [ ] Spot-held suppressed for instant-confirmed bookings (seed / full-credit)
  - [ ] Unit test asserting exactly one email per instant-confirm passes
  - [ ] Unit test enumerating the map asserting one template per event passes

---

### Phase 17: Waitlist join + conversion

**Goal:** Deliver waitlist join on full games and race-safe conversion via `create_booking(from_waitlist_id)`.

**Dependencies:** Phase 4, Phase 5, Phase 9, Phase 10, Phase 15

**Duration:** 160 minutes

**Prompt:**
Context from previous work: Phase 4 created the `waitlist` table with its unique `(game_id, player_id)` constraint. Phase 5's `create_booking` already accepts `from_waitlist_id`, setting `converted_booking_id` and emitting `waitlist_converted` in the same transaction. Phase 10 built the game detail page; Phase 15 built the waitlist spot-open email. This phase wires the UI on both ends of that existing machinery.

1. **`join_waitlist(game_id)` RPC — the write path:**
   - `waitlist` is a state-bearing table, so it falls under the Common Acceptance Criterion "No direct client `insert`/`update` on any state-bearing table … all writes via `supabase.rpc()`". A server action inserting the row directly would violate that invariant, so this phase adds the missing function rather than making an exception for it.
   - `supabase/migrations/<ts>_rpc_join_waitlist.sql` defining `join_waitlist(game_id)` as `SECURITY DEFINER` plpgsql with `SET search_path=''` and every reference schema-qualified, matching the Phase 5-7 RPC conventions.
   - Identity from `auth.uid()` — never a client-supplied player id.
   - Insert the `waitlist` row **and** write the `waitlist_joined` event in the same transaction, which is what the one-event-per-transition invariant requires; a TypeScript-assembled insert-then-log pair cannot give that guarantee.
   - Rely on the unique `(game_id, player_id)` constraint to dedupe rather than a read-then-write check (which would race); surface the rejection as a friendly already-joined state rather than an error.
   - Reject a join on a game that is not `full` inside the function.

2. **Waitlist join UI on full games:**
   - `components/WaitlistButton.tsx` shown only when the game status is `full`, replacing the Book button.
   - `app/game/[id]/waitlist/actions.ts` invoking `supabase.rpc("join_waitlist", { game_id })` under the authenticated session — never a direct `.insert()` on `waitlist`.
   - Gate the action behind an authenticated session.
   - Wire the Book/Join swap into `app/game/[id]/page.tsx`.

3. **Conversion via `create_booking(from_waitlist_id)`:**
   - `lib/booking/waitlistConvert.ts` calling `create_booking` with `from_waitlist_id` via `supabase.rpc()`.
   - `components/WaitlistConvert.tsx` as the entry point reached from the waitlist spot-open email or screen.
   - Map a `CAPACITY_FULL` rejection to "spot already taken, you're still on the waitlist."

The design decision worth understanding: when a spot frees, **all** active waitlisted players are notified simultaneously, not one at a time in queue order. The race is settled by `create_booking`'s transactional capacity check — first successful insert wins. This is deliberate; a sequential offer-and-timeout queue would leave spots idle while waiting for a response. It also means losing the race is a completely normal outcome that many players will experience, so the friendly copy matters more than it might appear.

Related: `notified_at` records the *last* time a player was notified. It is explicitly **not** a suppression flag — a player who lost one race is re-notified on the next release. Do not add an "already notified" filter.

4. **Extend the seed with waitlist fixtures** (the deferred half of Phase 9):
   - Seed v1 deliberately created no `waitlist` rows, because `join_waitlist` did not exist yet and a direct insert would have fabricated a state the RPCs could not produce. That constraint is now lifted, so this phase closes the gap.
   - Extend `scripts/fixtures.ts` and `scripts/seed.ts` to add at least one waitlist entry on a full game, created by calling `join_waitlist` under an appropriately-scoped session — never by direct insert, on the same reasoning that governed Phase 9.
   - Include at least one waitlisted player with a non-null `notified_at` and no `converted_booking_id`, so the re-notification path (Phase 19) and the waitlist-depth metric (Phase 26) have realistic data to verify against.
   - Keep the reset + reseed idempotency guarantee intact — the extended seed must still produce identical fixture counts across back-to-back runs.

**Acceptance Criteria:**
- [ ] [REQ-BIZ-037] The Join-waitlist button appears only when a game's status is `full`, replacing the Book button — one-tap join on full games
- [ ] [REQ-BIZ-037, REQ-DB-008] Joining invokes `supabase.rpc("join_waitlist", ...)`, creating exactly one `waitlist` row and one `waitlist_joined` event; a grep of the waitlist flow finds no direct `.insert()` on `waitlist`
- [ ] [REQ-BIZ-037, REQ-DB-009, REQ-BIZ-044] `join_waitlist` writes the `waitlist` row and the `waitlist_joined` event in the same transaction (SQL assertion: a forced failure after the insert leaves neither behind)
- [ ] [REQ-SEC-003, REQ-SEC-004, REQ-DB-013] `join_waitlist` declares `SECURITY DEFINER` with `SET search_path=''`, schema-qualifies every reference, and derives the player from `auth.uid()`, rejecting a client-supplied id with `INSUFFICIENT_PERMISSION`
- [ ] [REQ-DB-006] A second join attempt by the same player is rejected by the unique constraint and rendered as a friendly already-joined state, not an error
- [ ] [REQ-AUTH-004] The join action requires an authenticated session, and an unauthenticated join tap resumes automatically after magic-link completion
- [ ] [REQ-BIZ-040] A waitlisted player converting calls `create_booking` with `from_waitlist_id`, which sets `converted_booking_id` and emits `waitlist_converted`
- [ ] [REQ-BIZ-039] Two waitlisted players converting the same freed spot concurrently yield exactly one booking; the loser sees the friendly still-on-waitlist screen (criterion 11)
- [ ] [REQ-BIZ-038] `notified_at` is updated on each notification and is never used to filter out a previously-notified player
- [ ] [REQ-UI-002] All waitlist and race copy originates from `lib/strings.ts`
- [ ] [REQ-INT-007] The conversion entry point is reachable from the waitlist spot-open email sent on `waitlist_notified`
- [ ] [REQ-INFRA-008] The seed is extended with waitlist fixtures — at least one entry on a full game and at least one entry with a non-null `notified_at` and null `converted_booking_id` — all created via `join_waitlist` with no direct `.insert()` on `waitlist`, and reset + reseed still produces identical fixture counts
- [ ] [TEST-029] `npm run test:e2e -- -g "waitlist join"` passes [REQ-BIZ-037, REQ-DB-006]
- [ ] [TEST-030] `npm run test:e2e -- -g "waitlist convert"` passes [REQ-BIZ-040, REQ-BIZ-039]

**Files:**
- `supabase/migrations/<ts>_rpc_join_waitlist.sql` - `join_waitlist(game_id)` SECURITY DEFINER definition writing the row + `waitlist_joined` event in one transaction
- `supabase/tests/join_waitlist.sql` - Same-transaction, dedupe, and authorization assertions
- `components/WaitlistButton.tsx` - Join button shown on full games
- `app/game/[id]/waitlist/actions.ts` - Join action invoking `supabase.rpc("join_waitlist", ...)`
- `app/game/[id]/page.tsx` - Book/Join button swap by game status
- `lib/booking/waitlistConvert.ts` - Conversion via `create_booking(from_waitlist_id)`
- `components/WaitlistConvert.tsx` - Conversion entry point from the notification
- `scripts/fixtures.ts` - Waitlist fixture definitions deferred from Phase 9
- `scripts/seed.ts` - Waitlist seeding via `join_waitlist`
- `lib/strings.ts` - Waitlist and race copy

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#policies` - Waitlist notification, `notified_at` semantics, and race resolution
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - `create_booking` `from_waitlist_id` argument
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#53-indexes--constraints` - Waitlist unique constraint
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#acceptance-criteria` - Criteria 2 and 11

**Milestones:**
- **Waitlist join on full games** (IP M13.1)
  - [ ] `join_waitlist(game_id)` SECURITY DEFINER RPC written, inserting the `waitlist` row and emitting `waitlist_joined` in one transaction
  - [ ] `components/WaitlistButton.tsx` built, shown only when the game is `full`
  - [ ] `app/game/[id]/waitlist/actions.ts` calls `supabase.rpc("join_waitlist", ...)` with no direct `.insert()` on `waitlist`
  - [ ] Book/Join swap wired into `app/game/[id]/page.tsx`
  - [ ] Duplicate join deduped by the unique constraint with a friendly already-joined state
  - [ ] Action gated behind an authenticated session
- **Waitlist conversion via `create_booking(from_waitlist_id)`** (IP M13.2)
  - [ ] `lib/booking/waitlistConvert.ts` calls `create_booking` with `from_waitlist_id`
  - [ ] `components/WaitlistConvert.tsx` built as the notification entry point
  - [ ] `CAPACITY_FULL` mapped to the still-on-waitlist copy
  - [ ] `notified_at` confirmed as last-notified, not a suppression flag
  - [ ] Race and conversion copy added to `lib/strings.ts`
- **Waitlist seed extension (deferred from Phase 9)** (IP M13.2)
  - [ ] `scripts/fixtures.ts` extended with waitlist fixtures on a full game
  - [ ] `scripts/seed.ts` creates them via `join_waitlist`, never a direct insert
  - [ ] At least one fixture carries a non-null `notified_at` with null `converted_booking_id`
  - [ ] Reset + reseed idempotency re-verified with the extended fixture set

---

### Phase 18: Game cancellation flow (admin) + credit fan-out

**Goal:** Deliver the admin cancel-game trigger over `cancel_game` with an idempotent credit-receipt email fan-out to all affected players.

**Dependencies:** Phase 7, Phase 8, Phase 16

**Duration:** 130 minutes

**Prompt:**
Context from previous work: Phase 7 delivered the `cancel_game` RPC, which cancels all active bookings, issues `cancellation_credit` for applied money, clears the waitlist, and emits `game_cancelled` — all in one transaction. Phase 15 built the game-cancelled notice and cancellation+credit receipt templates; Phase 16 built the dispatch layer.

This phase is a thin admin trigger over the transactional RPC plus the email fan-out. It exists as its own phase because it spans admin action → bulk state change → multi-recipient email, and that whole path must be verifiable end-to-end independently — a rained-out game cancellation touches every booked player's money at once, and a partial execution would be visible and damaging.

**This phase ships the first admin route, so it ships the admin gate with it.** `lib/auth/requireAdmin.ts` was originally scheduled for Phase 21; it moves here, because a route that cancels every booking on a game and moves everyone's money cannot ship three phases ahead of the thing that checks who is calling it.

The alternative that was rejected: letting the route run under a service-role context and leaning on `cancel_game`'s inside-function authorization alone. That does not work for an admin *surface*. A service-role caller satisfies `cancel_game`'s check by construction — the RPC is designed to accept it, because cron and future bank pollers are legitimate service-role callers. So the RPC would authorize the call no matter which human triggered it, and the only thing standing between any authenticated player and a game cancellation would be not knowing the URL. Inside-function authorization is the right last line of defence; it is not a substitute for identifying the human at the surface.

So: build `requireAdmin` here, gate this route with it, and Phase 21 reuses the same helper when it mounts the admin layout rather than creating its own.

1. **Admin gate (moved forward from Phase 21):**
   - `lib/auth/requireAdmin.ts` resolving the session player from `auth.uid()` and verifying `is_admin` **server-side**, redirecting or 403-ing non-admins. This is the same helper Phase 21 will mount at the layout level; write it to be layout-mountable now so Phase 21 adds no second implementation.
   - The route calls it with a **session-derived admin identity**, not a service-role context. `cancel_game`'s own check then remains the last line of defence, as designed.

2. **Admin cancel-game trigger:**
   - `components/admin/CancelGameButton.tsx` with a confirmation guard (this action is irreversible and affects everyone booked).
   - `app/admin/games/[id]/cancel/actions.ts` calling `requireAdmin` first, then invoking `cancel_game` via `supabase.rpc()` under the admin session.
   - Surface the RPC result back to the admin: how many bookings were cancelled, how much credit was issued, how many waitlist rows were cleared.
   - Build the action and component so they mount cleanly under the Phase 21 admin layout with no rework.

3. **Email fan-out:**
   - Extend `lib/email/dispatch.ts` to fan out the game-cancelled notice to all affected players on `game_cancelled`.
   - Send the cancellation + credit receipt to players whose money was credited, paired with their `credit_issued` event.
   - Make the fan-out idempotent and retryable so a re-run sends no duplicates. The state change is transactional inside the RPC, but the emails are not — a failure partway through the send loop must be safely resumable.
   - Add cancel-confirmation and notice copy to `lib/strings.ts`.

**Acceptance Criteria:**
- [ ] [REQ-BIZ-007] Cancelling a game invokes `cancel_game` via `supabase.rpc()` and displays the counts of bookings cancelled, credits issued, and waitlist rows cleared
- [ ] [REQ-BIZ-007, REQ-UI-016] The cancel button requires an explicit confirmation step before firing
- [ ] [REQ-SEC-020] `lib/auth/requireAdmin.ts` exists in this phase and the cancel route calls it, verifying `is_admin` server-side from the session; a non-admin authenticated session and an anonymous request are both rejected by direct URL access, with `cancel_game`'s inside-function check as the last line of defence rather than the only one
- [ ] [REQ-SEC-020] The cancel route runs under a session-derived admin identity, not a service-role context — a grep confirms the action does not reach for the service-role client to satisfy `cancel_game`'s authorization
- [ ] [REQ-INT-009] Every player with an active booking on the cancelled game receives the game-cancelled notice (verified in dry-run logs)
- [ ] [REQ-INT-008, REQ-BIZ-031] Players whose money was credited additionally receive the cancellation + credit receipt; players with unpaid reserved bookings do not
- [ ] [REQ-INFRA-007] Re-running the fan-out for the same `game_cancelled` event produces zero additional sends (idempotency test)
- [ ] [REQ-BIZ-007] After cancellation, the game's waitlist is empty and every affected booking is `cancelled`
- [ ] [TEST-031] `npm run test:e2e -- -g "cancel game"` passes [REQ-BIZ-007, REQ-SEC-020]
- [ ] [TEST-032] `npm run test:unit -- -t "game_cancelled fan-out"` passes [REQ-INT-009, REQ-INT-008]

**Files:**
- `lib/auth/requireAdmin.ts` - Server-side `is_admin` verification helper (moved forward from Phase 21; Phase 21 mounts it at the layout)
- `components/admin/CancelGameButton.tsx` - Confirm-guarded cancel trigger
- `app/admin/games/[id]/cancel/actions.ts` - Action calling `requireAdmin` then invoking `cancel_game`
- `lib/email/dispatch.ts` - Game-cancelled fan-out and credit receipt pairing
- `lib/strings.ts` - Cancel confirmation and notice copy

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - `cancel_game` fan-out contract
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#surfaces` - Game-cancelled notice and cancellation receipt triggers
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#policies` - Credit-not-cash refund policy

**Milestones:**
- **Admin gate + cancel-game trigger over `cancel_game`** (IP M14.1)
  - [ ] `lib/auth/requireAdmin.ts` built (moved forward from Phase 21), layout-mountable, verifying `is_admin` server-side
  - [ ] `components/admin/CancelGameButton.tsx` built with a confirmation guard
  - [ ] `app/admin/games/[id]/cancel/actions.ts` calls `requireAdmin` then invokes `cancel_game` via `supabase.rpc()` under the admin session
  - [ ] RPC result (cancelled / credited / cleared counts) surfaced to the admin
  - [ ] Non-admin and anonymous direct-URL access verified rejected at the surface, with the RPC check retained as the last line of defence
- **Email fan-out to affected players** (IP M14.2)
  - [ ] `lib/email/dispatch.ts` fans out the game-cancelled notice on `game_cancelled`
  - [ ] Credit receipt sent to players whose money was credited, paired with `credit_issued`
  - [ ] Fan-out made idempotent/retryable with a verified no-duplicate re-run
  - [ ] Cancel-confirmation and notice copy added to `lib/strings.ts`

---

### Phase 19: Cron foundation — guard + expiry sweep + waitlist fan-out + schedules

**Goal:** Ship the `CRON_SECRET` guard, the idempotent expiry sweep with spot release, the waitlist spot-open fan-out, and all three Vercel Cron schedule registrations.

**Dependencies:** Phase 4, Phase 7, Phase 16, Phase 17

**Duration:** 110 minutes

**Prompt:**
Context from previous work: Phase 7 delivered `expire_booking`. Phase 15 built the lifecycle email templates and Phase 16 the dispatch layer. Phase 17 wired the waitlist. Phase 4 created the `(status, expires_at)` index this sweep depends on. The lifecycle is fully built but nothing drives it automatically yet.

This phase builds the cron foundation — the shared guard, the schedule registrations, and the expiry sweep that is the hardest of the three because it drives the waitlist release chain. Phase 20 adds the nudge and reminder sweeps on top of this foundation.

Every route is gated by `CRON_SECRET`, calls RPCs with the service-role client, and must be **strictly idempotent** — a double-run produces no duplicate emails or events. Vercel Cron offers at-least-once delivery, and a retry that double-charges a player's inbox is exactly the kind of failure that erodes trust in an automated system.

1. **`lib/cron/guard.ts`** rejecting any request without a valid `CRON_SECRET` header, returning `CRON_UNAUTHORIZED` (401). These routes mutate state and send mail; an open endpoint is a direct abuse vector.

2. **`app/api/cron/expiry/route.ts`** (every 15 min): select `reserved` bookings with `expires_at < now()` using the `(status, expires_at)` index, and call `expire_booking` per booking with the service-role client, driving `booking_expired` + `spot_released`.

3. **Waitlist spot-open fan-out — `notify_waitlist(game_id)` RPC plus the email side:**

   The fan-out has to stamp `notified_at` on every notified waitlist row. `waitlist` is a state-bearing table, so that write cannot come from TypeScript: the Common Acceptance Criteria forbid it, and more concretely, a route that updates rows in a loop and emits events alongside them gives no transactional guarantee that the two agree. A crash midway leaves some players stamped-but-eventless and others eventless-but-notified, and Phase 26's waitlist metrics read the event log.

   - **`supabase/migrations/<ts>_rpc_notify_waitlist.sql`** defining `notify_waitlist(game_id)` as `SECURITY DEFINER` plpgsql with `SET search_path=''` and every reference schema-qualified, matching the Phase 5-7 conventions.
   - **Service-role only**, enforced inside the function — this is a cron-driven sweep with no human caller. Any other context raises `INSUFFICIENT_PERMISSION`.
   - Selects **all** active waitlisted players for the game (those with no `converted_booking_id`), updates each row's `notified_at`, and **emits one `waitlist_notified` event per notified player** — all in a single transaction. One event per player, not one per fan-out: Phase 16's dispatch map keys on `waitlist_notified` to send the spot-open email, and Phase 26 counts these rows per player.
   - Returns the notified player set so the caller knows who to mail without a second query.
   - Do **not** filter on a previous `notified_at` — re-notification is intended, and a player who lost one race is notified again on the next release.

   Then extend `lib/email/dispatch.ts` to call `notify_waitlist` on a `spot_released` event and send the spot-open email to each player it returns. The email send stays outside the transaction — mail is not transactional and pretending otherwise would hold a database transaction open across a network call. The idempotency story is the one that already governs this phase: the state and events are transactional, the sends are made re-runnable.

4. **`vercel.json`** registering all three schedules now, so Phase 20's routes need no config change: nudge (30 min), expiry (15 min), reminder (30 min).

Idempotency here rests on the one-event-per-transition invariant enforced inside `expire_booking`: a booking already `expired` cannot be re-transitioned, so a second sweep finds nothing to do. Test the double-run explicitly.

**Acceptance Criteria:**
- [ ] [REQ-SEC-019, REQ-SEC-022, REQ-ENV-003] A request to the expiry route without a valid `CRON_SECRET` header returns 401 `CRON_UNAUTHORIZED` and mutates nothing, with the same `CRON_SECRET` value configured in Vercel Cron and the API-route check
- [ ] [REQ-BIZ-015, REQ-BIZ-036, REQ-INT-006] The expiry route transitions `reserved` bookings past `expires_at` to `expired` via `expire_booking` and emits `booking_expired` + `spot_released`
- [ ] [REQ-DB-003, REQ-INFRA-005] The expiry query uses the `(status, expires_at)` index
- [ ] [REQ-BIZ-036] A confirmed (prepaid) booking is never expired by the sweep
- [ ] [REQ-BIZ-038, REQ-INT-007] A spot release notifies every active waitlisted player (no `converted_booking_id`) and updates their `notified_at`
- [ ] [REQ-BIZ-038, REQ-DB-009, REQ-BIZ-044] `notified_at` is written only by `notify_waitlist` — a grep of the cron routes and dispatch layer finds no direct `.update()` on `waitlist` anywhere in Phases 19/20
- [ ] [REQ-SEC-003, REQ-SEC-006, REQ-DB-013] `notify_waitlist(game_id)` declares `SECURITY DEFINER` with `SET search_path=''`, schema-qualifies every reference, and permits only a service-role context — any other caller is rejected with `INSUFFICIENT_PERMISSION` (SQL assertion)
- [ ] [REQ-BIZ-038, REQ-DB-008, REQ-DB-009] `notify_waitlist` emits exactly one `waitlist_notified` event **per notified player**, in the same transaction as the `notified_at` stamps — a fan-out over three active waitlisted players writes three event rows and three stamps, and a forced failure mid-fan-out leaves neither (SQL assertion)
- [ ] [REQ-INFRA-007] Running the expiry route twice back-to-back produces zero additional emails and zero additional events
- [ ] [REQ-INFRA-003, REQ-INFRA-004, REQ-INFRA-005, REQ-INFRA-006] `vercel.json` registers nudge at 30 min, expiry at 15 min, and reminder at 30 min as Vercel Cron schedules hitting authenticated API routes, with no external job runner
- [ ] [REQ-SEC-015] The route calls its RPCs with the server-side service-role client only — never a direct RLS-bypassing table write, and the key is never exposed under `NEXT_PUBLIC_`
- [ ] [TEST-033] Every cron route rejects a request carrying no `CRON_SECRET` header, or a wrong one, with 401 `CRON_UNAUTHORIZED` and no state mutation — the shared guard established in this phase, asserted once for all three routes: `npm run test:e2e -- -g "cron unauthorized"` passes [REQ-SEC-019, REQ-SEC-022, REQ-ENV-003]
- [ ] [TEST-034] The expiry sweep transitions `reserved` bookings past `expires_at` to `expired`; `confirmed` bookings are untouched regardless of `expires_at`: `npm run test:e2e -- -g "cron sweep expiry"` passes [REQ-BIZ-036]
- [ ] [TEST-035] A back-to-back double-run of the expiry route produces zero additional `booking_expired`/`spot_released` events and zero additional emails: `npm run test:e2e -- -g "cron idempotency expiry"` passes [REQ-INFRA-007]
- [ ] [TEST-052] `notify_waitlist` stamps `notified_at` and writes one `waitlist_notified` event per active waitlisted player in one transaction, rejects a non-service-role caller, and re-notifies a previously-notified player: `supabase test db` passes [REQ-BIZ-038, REQ-SEC-006, REQ-DB-009]

**Files:**
- `lib/cron/guard.ts` - `CRON_SECRET` header verification returning `CRON_UNAUTHORIZED`
- `app/api/cron/expiry/route.ts` - Expiry sweep and spot release
- `supabase/migrations/<ts>_rpc_notify_waitlist.sql` - `notify_waitlist(game_id)` stamping `notified_at` + emitting `waitlist_notified` per player
- `supabase/tests/notify_waitlist.sql` - Per-player event, same-transaction, authorization, and re-notification assertions
- `lib/email/dispatch.ts` - Waitlist spot-open fan-out calling `notify_waitlist` on release
- `vercel.json` - Cron schedule registration for all three routes
- `lib/supabase/clients.ts` - Service-role client used by the sweep

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#scheduled-jobs` - Cron route definitions, schedules, and the idempotency requirement
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#policies` - Expiry and waitlist notification policies
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#63-error-codes` - `CRON_UNAUTHORIZED`
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#53-indexes--constraints` - The `(status, expires_at)` expiry-sweep index

**Milestones:**
- **Cron guard + schedule registration** (IP M15.1)
  - [ ] `lib/cron/guard.ts` rejects requests lacking a valid `CRON_SECRET` with 401 `CRON_UNAUTHORIZED`
  - [ ] Guard verified to mutate nothing on rejection
  - [ ] `vercel.json` registers all three schedules (nudge 30 min, expiry 15 min, reminder 30 min)
- **Expiry sweep + waitlist spot-open fan-out** (IP M15.1)
  - [ ] `app/api/cron/expiry/route.ts` expires lapsed reservations via `expire_booking` with the service-role client
  - [ ] Sweep query verified to use the `(status, expires_at)` index and skip confirmed bookings
  - [ ] `notify_waitlist(game_id)` SECURITY DEFINER RPC written — service-role only, stamping `notified_at` and emitting one `waitlist_notified` per player in one transaction
  - [ ] `lib/email/dispatch.ts` calls `notify_waitlist` on `spot_released` and mails each returned player, with no direct `waitlist` write
  - [ ] Re-notification confirmed (no suppression filter on `notified_at`)
  - [ ] Route verified idempotent on a back-to-back double-run

---

### Phase 20: Cron nudge + reminder sweeps

**Goal:** Ship the scarcity nudge and 24h reminder sweeps, each firing at most once per booking via its `*_sent_at` column guard.

**Dependencies:** Phase 4, Phase 19

**Duration:** 110 minutes

**Prompt:**
Context from previous work: Phase 19 built `lib/cron/guard.ts`, the expiry sweep, the waitlist spot-open fan-out, and registered all three schedules in `vercel.json`. Phase 4 created the `nudge_sent_at` and `reminder_sent_at` columns. Phase 15/16 built the nudge and reminder templates and the dispatch layer.

Both sweeps in this phase share one shape — select eligible bookings whose `*_sent_at` is null, stamp the column and emit the event through an RPC, dispatch an email — which is why they ship together. Both are guarded by the existing `lib/cron/guard.ts` and use the service-role client. Both must be strictly idempotent: the `*_sent_at` column guard is the mechanism, and a double-run must produce zero additional emails or events.

**Both stamps go through RPCs, not route code.** `nudge_sent_at`, `expires_at`, and `reminder_sent_at` all live on `bookings`, a state-bearing table, and each stamp has an event that must be written with it. A route that updates the column and then inserts the event has a window where the two disagree — and since the column *is* the idempotency guard, a stamp that lands without its event means a booking silently loses its email while looking already-processed. That is the failure that survives to production unnoticed.

1. **`mark_nudged(booking_id)` and `mark_reminder_sent(booking_id)` RPCs:**
   - `supabase/migrations/<ts>_rpc_cron_stamps.sql` defining both as `SECURITY DEFINER` plpgsql with `SET search_path=''` and every reference schema-qualified.
   - **Service-role only**, enforced inside each function; any other caller raises `INSUFFICIENT_PERMISSION`.
   - `mark_nudged` sets `nudge_sent_at = now()` and `expires_at = now() + <nudge window>`, and emits `nudge_sent` — one transaction. It is a no-op returning "already nudged" if `nudge_sent_at` is already set, so the guard lives in the database rather than in the route's `WHERE` clause alone.
   - `mark_reminder_sent` sets `reminder_sent_at = now()` and emits `reminder_sent` — one transaction, same already-stamped no-op behaviour.
   - Both take the policy window as an argument supplied from `lib/policy.ts` rather than hardcoding 12h/24h in SQL, so a v2 policy stays a config bump.

2. **`app/api/cron/nudge/route.ts`** (every 30 min):
   - Find games that are `full` **and** have waitlist ≥ 1. Scarcity is the whole justification for the nudge — with no one waiting, there is no reason to pressure a player.
   - For each unpaid `reserved` booking on those games with `nudge_sent_at` null — **including cash reservations, no exemption** — call `mark_nudged` and dispatch the scarcity email.
   - One nudge per booking, ever. Confirmed (prepaid) bookings are never touched: prepaying is spot insurance, and nudging a player who already paid would be a trust-destroying bug.
   - The `expires_at` that `mark_nudged` sets is what the Phase 19 expiry sweep later acts on — the two routes form a chain.

3. **`app/api/cron/reminder/route.ts`** (every 30 min):
   - Select active bookings whose game starts within 24h (window from `lib/policy.ts`) and whose `reminder_sent_at` is null.
   - Call `mark_reminder_sent` per booking and dispatch the reminder. One per booking, ever.

Test each double-run explicitly — run each route twice back-to-back and assert zero additional emails and events.

**Acceptance Criteria:**
- [ ] [REQ-SEC-019, REQ-SEC-022, REQ-ENV-003] A request to either route without a valid `CRON_SECRET` header returns 401 `CRON_UNAUTHORIZED` and mutates nothing
- [ ] [REQ-BIZ-035, REQ-INFRA-004] The nudge route targets only unpaid `reserved` bookings on games that are `full` with waitlist ≥ 1, running every 30 minutes
- [ ] [REQ-BIZ-035, REQ-BIZ-024] Cash reservations are nudged with no exemption
- [ ] [REQ-BIZ-035, REQ-INT-005] The nudge sets `nudge_sent_at` and `expires_at = now() + 12h` and sends exactly one email per eligible booking
- [ ] [REQ-BIZ-010, REQ-BIZ-044, REQ-DB-009] `nudge_sent_at`, `expires_at`, and `reminder_sent_at` are written only by `mark_nudged` / `mark_reminder_sent`, each stamping its column and emitting its event (`nudge_sent` / `reminder_sent`) in one transaction — a grep of both routes finds no direct `.update()` on `bookings` (SQL assertion: a forced failure after the stamp leaves neither the stamp nor the event)
- [ ] [REQ-SEC-003, REQ-SEC-006, REQ-DB-013] Both RPCs declare `SECURITY DEFINER` with `SET search_path=''`, schema-qualify every reference, permit only a service-role context, and no-op on an already-stamped booking rather than re-stamping (SQL assertion)
- [ ] [REQ-BIZ-035] Confirmed (prepaid) bookings are never nudged
- [ ] [REQ-BIZ-035] A booking with a non-null `nudge_sent_at` is skipped on subsequent runs — one nudge per booking ever
- [ ] [REQ-BIZ-041, REQ-INFRA-006, REQ-INT-010] The reminder route sends exactly one 24h reminder per active booking, sets `reminder_sent_at`, and emits `reminder_sent`, running every 30 minutes
- [ ] [REQ-INFRA-007] Running each route twice back-to-back produces zero additional emails and zero additional events (criterion 12)
- [ ] [REQ-BIZ-029] Both routes read their 12h/24h windows from `lib/policy.ts` and pass them into the RPCs as arguments, with no hardcoded literals in either the routes or the SQL
- [ ] [TEST-049] Eligible unpaid reservations receive exactly one nudge, and active bookings within 24h of kickoff receive exactly one reminder: `npm run test:e2e -- -g "cron sweep nudge reminder"` passes [REQ-BIZ-035, REQ-BIZ-041]
- [ ] [TEST-050] A back-to-back double-run of the nudge and reminder routes produces zero additional emails and zero additional `nudge_sent`/`reminder_sent` events: `npm run test:e2e -- -g "cron idempotency nudge reminder"` passes [REQ-INFRA-007]

**Files:**
- `supabase/migrations/<ts>_rpc_cron_stamps.sql` - `mark_nudged` and `mark_reminder_sent` definitions
- `supabase/tests/cron_stamps.sql` - Same-transaction stamp+event, authorization, and already-stamped no-op assertions
- `app/api/cron/nudge/route.ts` - Scarcity nudge sweep calling `mark_nudged`
- `app/api/cron/reminder/route.ts` - 24h reminder sweep calling `mark_reminder_sent`
- `lib/cron/guard.ts` - Shared `CRON_SECRET` guard (from Phase 19)
- `lib/policy.ts` - Nudge (12h) and reminder (24h) windows
- `lib/email/dispatch.ts` - Nudge and reminder dispatch

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#scheduled-jobs` - Nudge and reminder route definitions and idempotency requirement
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#policies` - Nudge eligibility (including cash) and the 12h/24h windows
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#63-error-codes` - `CRON_UNAUTHORIZED`
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#acceptance-criteria` - Criterion 12

**Milestones:**
- **Stamp RPCs** (IP M15.1)
  - [ ] `mark_nudged` and `mark_reminder_sent` defined `SECURITY DEFINER`, `search_path=''`, service-role only
  - [ ] Each stamps its column and emits its event in one transaction, no-opping when already stamped
  - [ ] Policy windows passed in as arguments from `lib/policy.ts`, not hardcoded in SQL
  - [ ] `supabase/tests/cron_stamps.sql` written and passing
- **Scarcity nudge sweep** (IP M15.1)
  - [ ] `app/api/cron/nudge/route.ts` selects unpaid `reserved` bookings on `full` games with waitlist ≥ 1
  - [ ] Cash reservations included with no exemption; confirmed bookings never touched
  - [ ] Stamping delegated to `mark_nudged` with no direct `bookings` write in the route
  - [ ] Route guarded by `lib/cron/guard.ts` and verified idempotent on a double-run
- **24h reminder sweep** (IP M15.2)
  - [ ] `app/api/cron/reminder/route.ts` selects active bookings starting within 24h with null `reminder_sent_at`
  - [ ] Reminder dispatched via `mark_reminder_sent` — one per booking ever, with no direct `bookings` write in the route
  - [ ] Route guarded by `lib/cron/guard.ts`
  - [ ] Double-run verified to send no duplicate reminders

---

## 🛑 GATE M3 — Waitlist + cancellation loop + cron (after Phase 20)

**This is a mandatory halt point, not a checklist.** Spec §10 gate M3 covers Phases 15–20: waitlist join, `cancelBooking()` with credit issuance, the game cancellation flow, the expiry sweep, the nudge job, the reminder job, and all emails. Dry-run mode is acceptable at this gate if DNS is still pending.

**§10 gate criteria — verify by hand:**
- [ ] Cancel a confirmed booking → credit appears in the ledger
- [ ] The spot releases and waitlist emails fire (or dry-run logs show them)
- [ ] A waitlisted player converts
- [ ] **Zero human touches** occur between the cancel and the conversion

**STOP — do not proceed past this gate without explicit human confirmation.**

---

### Phase 21: Admin gating + games CRUD

**Goal:** Open the admin milestone with server-verified `is_admin` gating and full games CRUD wired to the transition RPCs.

**Dependencies:** Phase 7, Phase 8, Phase 18

**Duration:** 170 minutes

**Prompt:**
Context from previous work: Phase 7 delivered the game-transition RPCs (publish, settle, `cancel_game`) with capacity-driven `published ⇄ full` toggles. Phase 8 provided the session helpers and `players.is_admin` exists from Phase 3. Phase 18 built the cancel-game trigger this surface links to — **and, with it, `lib/auth/requireAdmin.ts`**, which shipped there because that route needed a real gate at the moment it went live.

Build the `/admin` shell and the games management surface. This opens the M4 admin milestone. Gating and CRUD ship together because the CRUD surface cannot be security-verified without its gate, and the gate has nothing to protect without the surface.

1. **Admin gating:**
   - **Reuse the existing `lib/auth/requireAdmin.ts` from Phase 18** — do not write a second implementation. If it needs extending for layout use, extend it in place. Two admin checks in one codebase is how they drift, and the weaker one is always the one an attacker finds.
   - `app/admin/layout.tsx` calling `requireAdmin` so every nested admin route is gated — including the Phase 18 cancel route, which now mounts under it and can drop its own direct call in favour of the layout gate. Gating by hidden navigation is not gating; an unlisted route is still a reachable route.
   - Confirm no code path anywhere can *set* `is_admin`. The flag is granted only manually via the Supabase dashboard: no API route, RPC, or UI toggle ever writes it. The admin surface is gated *by* the flag and can never *grant* it. Verify this by grepping for any write to `is_admin` outside a migration.

2. **Games CRUD:**
   - `app/admin/games/page.tsx` listing all games with status.
   - `app/admin/games/new/page.tsx` creating a game saved as `draft` — creation and publication are deliberately separate steps so a half-configured game is never publicly visible, and games are never auto-published.
   - `app/admin/games/[id]/edit/page.tsx` for venue/time/capacity/price edits.
   - `app/admin/games/actions.ts` wiring create, publish (draft→published, emitting `game_published`), edit, and cancel to the Phase 7 RPCs via `supabase.rpc()`.
   - Enforce the edit rules: reject a capacity below the active-booking count (you cannot un-book someone by editing a number), and lock `price_czk` on existing bookings so a price change applies only to future bookings — a player who booked at 200 CZK owes 200 CZK regardless of later repricing.
   - Add games-CRUD copy to `lib/strings.ts`.

**Acceptance Criteria:**
- [ ] [REQ-SEC-020] A non-admin authenticated session requesting any `/admin/*` route is rejected server-side (redirect or 403), verified by direct URL access, not just absent navigation
- [ ] [REQ-SEC-020] An anonymous request to any `/admin/*` route is rejected server-side
- [ ] [REQ-SEC-016] A grep of the application code finds no write to `players.is_admin` outside migrations — the flag is grantable only manually via the Supabase dashboard
- [ ] [REQ-BIZ-002, REQ-UI-016] Creating a game saves it with status `draft` and it does not appear on the public `/games` list
- [ ] [REQ-BIZ-002] An explicit publish action moves the game draft→published and emits `game_published`; no code path auto-publishes
- [ ] [REQ-BIZ-008] Editing capacity to a value below the current active-booking count is rejected with a clear message
- [ ] [REQ-BIZ-009] Changing `price_czk` leaves existing bookings' locked `price_czk` unchanged; only subsequent bookings use the new price
- [ ] [REQ-BIZ-010] All game state changes go through `supabase.rpc()` with no direct `games.status` write
- [ ] [REQ-UI-016] The Phase 18 cancel route is confirmed to mount under the gated admin layout, completing create / edit / publish / cancel on one admin games surface
- [ ] [REQ-SEC-020] Exactly one admin-check implementation exists — the layout reuses the Phase 18 `lib/auth/requireAdmin.ts`, and a grep finds no second `is_admin` verification helper anywhere in the codebase
- [ ] [TEST-036] `npm run test:e2e -- -g "admin gating"` passes [REQ-SEC-020, REQ-SEC-016]
- [ ] [TEST-037] `npm run test:e2e -- -g "games CRUD"` passes [REQ-BIZ-002, REQ-BIZ-008, REQ-BIZ-009]

**Files:**
- `lib/auth/requireAdmin.ts` - Existing Phase 18 helper reused (extended in place if needed), not reimplemented
- `app/admin/layout.tsx` - Admin shell gating every nested route
- `app/admin/games/page.tsx` - Games list with status
- `app/admin/games/new/page.tsx` - Game creation (saves as draft)
- `app/admin/games/[id]/edit/page.tsx` - Game edit surface
- `app/admin/games/actions.ts` - Create/publish/edit/cancel wired to the Phase 7 RPCs
- `lib/strings.ts` - Admin games copy

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - Admin elevation policy and server-verified gating
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#surfaces` - Admin games surface and edit rules
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#data-model` - Game state machine and capacity/price edit constraints
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - Game-transition RPC contracts

**Milestones:**
- **Admin gating (server-verified `is_admin`)** (IP M16.1)
  - [ ] Phase 18's `lib/auth/requireAdmin.ts` reused (extended in place if needed) with no second implementation introduced
  - [ ] `app/admin/layout.tsx` gates every nested admin route via `requireAdmin`
  - [ ] Direct-URL access by non-admin and anonymous callers verified rejected
  - [ ] No in-app path can grant `is_admin` (verified by grep)
  - [ ] Admin shell labels sourced from `lib/strings.ts`
- **Games CRUD (create / edit / publish / cancel)** (IP M16.2)
  - [ ] `app/admin/games/page.tsx` lists all games with status
  - [ ] `app/admin/games/new/page.tsx` creates a game as `draft`
  - [ ] `app/admin/games/[id]/edit/page.tsx` supports venue/time/capacity/price edits
  - [ ] `app/admin/games/actions.ts` wires create/publish/edit/cancel to the Phase 7 RPCs
  - [ ] Capacity floor and price-lock edit rules enforced
  - [ ] Games-CRUD copy added to `lib/strings.ts`

---

### Phase 22: Admin payments — VS-sorted confirm + roster badges

**Goal:** Deliver the VS-sorted payment reconciliation surface with roster badges, one-tap ✓ Paid in ≤5s, and over/underpayment handling.

**Dependencies:** Phase 4, Phase 7, Phase 9, Phase 21

**Duration:** 110 minutes

**Prompt:**
Context from previous work: Phase 7 delivered `confirm_booking`, the single automation seam. Phase 21 built the admin shell with server-verified gating and games CRUD. Phase 4 created the `(game_id, payment_code)` index that makes the VS-sorted pending list fast. Phase 9's seed provides bookings in every payment state to develop against.

Build the reconciliation surface. This is the only reconciliation UI in Phase 1 — there is deliberately no separate payment queue. The operational reality it serves: the organizer opens their banking app, sees a list of incoming payments with variable symbols, and taps ✓ Paid against matching entries. Every second of friction here is multiplied by the number of players in every game, which is why the ≤5s target (including page load) is a hard requirement rather than an aspiration.

1. **`app/admin/games/[id]/page.tsx`** rendering the roster and the pending bookings sorted by VS, using the `(game_id, payment_code)` index.

2. **`components/admin/PaymentBadge.tsx`** distinguishing paid / reserved / cash / seed.

3. **`app/admin/games/[id]/actions.ts`** with a one-tap ✓ Paid calling `confirm_booking` via `supabase.rpc()`, omitting `received_amount_czk` so the RPC confirms at the expected amount. Keep the confirm payload minimal and consider optimistic UI so a confirmation completes in ≤5s including page load.

4. **Over/underpayment handling** per the reconciliation policy. All of it lives in the Phase 7 `confirm_booking` RPC — this phase supplies the amount and renders the outcome, and implements no reconciliation logic of its own:
   - Add an "amount differs" affordance beside ✓ Paid that reveals a received-amount field and calls `confirm_booking` with `received_amount_czk` set.
   - Overpayment: the RPC confirms the booking and issues `credit_issued` for the difference — the surplus becomes wallet credit, since money never leaves the system. Surface the returned `credit_issued_czk` in the confirmation toast.
   - Underpayment: the RPC leaves the booking `reserved` and issues no confirmation; show the admin the shortfall so they can follow up.
   - Payment after expiry: the RPC credits the full amount and leaves the booking `expired`; the UI must not offer to reinstate the spot.

5. Add reconciliation copy to `lib/strings.ts`.

**Acceptance Criteria:**
- [ ] [REQ-BIZ-026, REQ-BIZ-028] The pending bookings list is sorted by variable symbol and its query uses the `(game_id, payment_code)` index — this VS-sorted list is the only reconciliation surface under `policy_version = 'v1'`, with no separate admin queue UI
- [ ] [REQ-BIZ-013, REQ-BIZ-026, REQ-PERF-002] One-tap ✓ Paid calls `confirm_booking` via `supabase.rpc()` with `received_amount_czk` omitted (NULL) and completes in ≤5s including page load (criterion 3)
- [ ] [REQ-UI-016] The roster displays correct badges distinguishing paid / reserved / cash / seed for the Phase 9 seeded fixtures
- [ ] [REQ-EH-002] Entering a received amount above the amount due and confirming calls `confirm_booking` with that `received_amount_czk`; the booking becomes `confirmed`, a positive `credit_ledger` row and `credit_issued` event are written for the difference, and the returned `credit_issued_czk` is shown to the admin
- [ ] [REQ-EH-001] Entering a received amount below the amount due leaves the booking `reserved` with no `payment_confirmed` event, and the UI reports the shortfall rather than confirming
- [ ] [REQ-SEC-020] The surface is unreachable without an admin session (inherits the Phase 21 gate, verified by direct URL access)
- [ ] [REQ-UI-002] All reconciliation copy originates from `lib/strings.ts`
- [ ] [REQ-EH-003] Confirming against an already-`expired` booking with a `received_amount_czk` credits the full amount to the wallet; the booking remains `expired`, the spot is not reinstated, capacity is unchanged, and the UI offers no reinstatement action
- [ ] [REQ-BIZ-024] A cash-at-pitch booking remains `reserved` until an admin confirms it from this surface
- [ ] [TEST-038] `npm run test:e2e -- -g "admin confirm"` passes [REQ-BIZ-026, REQ-UI-016, REQ-PERF-002]

**Files:**
- `app/admin/games/[id]/page.tsx` - Per-game roster and VS-sorted pending list
- `components/admin/PaymentBadge.tsx` - Paid / reserved / cash / seed badge
- `app/admin/games/[id]/actions.ts` - One-tap ✓ Paid calling `confirm_booking`
- `lib/strings.ts` - Reconciliation copy

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#payments` - Reconciliation policy, over/underpayment handling, VS matching
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#surfaces` - Admin one-tap confirm performance target
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - `confirm_booking` contract and `confirmed_by` automation seam
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#53-indexes--constraints` - Pending-list VS index

**Milestones:**
- **VS-sorted pending list + roster badges** (IP M17.1)
  - [ ] `app/admin/games/[id]/page.tsx` renders the roster and VS-sorted pending list using the pending index
  - [ ] `components/admin/PaymentBadge.tsx` distinguishes paid / reserved / cash / seed
  - [ ] Badges verified against the Phase 9 seeded fixtures
- **One-tap confirm + over/underpayment handling** (IP M17.1)
  - [ ] `app/admin/games/[id]/actions.ts` one-tap ✓ Paid calls `confirm_booking` via `supabase.rpc()`
  - [ ] Confirmation verified to complete in ≤5s including page load
  - [ ] Overpayment confirms and issues `credit_issued` for the difference
  - [ ] Underpayment leaves the booking `reserved`
  - [ ] Reconciliation copy added to `lib/strings.ts`

---

### Phase 23: Admin add shadow player + booking

**Goal:** Deliver the one-action add-shadow-player-and-booking flow in ≤10s, with duplicate-identity prevention steering to the merge tool.

**Dependencies:** Phase 5, Phase 21, Phase 22

**Duration:** 70 minutes

**Prompt:**
Context from previous work: Phase 21 built the admin shell with server-verified gating. Phase 22 built the per-game reconciliation surface this flow is reached from. Phase 3 created `players` with the nullable `auth_user_id` and the nickname CHECK. Phase 8 built the exact-email-match shadow claim. **Phase 5 delivered `admin_create_booking(game_id, player_id, payment_method)` — the RPC this flow calls.**

This flow exists because people still sign up via WhatsApp and may never log in. The shadow player is a first-class identity that can later be claimed on exact email match (Phase 8) or merged by an admin (Phase 25).

1. **`app/admin/games/[id]/add-player/page.tsx`** capturing nickname and optional email, with charset validation mirroring `[A-Za-z0-9 _-]{1,20}` and a friendly inline error rather than a raw constraint violation.

2. **`app/admin/games/[id]/add-player/actions.ts`** creating the shadow `players` row and the booking in one action, in ≤10s.
   - The booking is created by calling **`admin_create_booking(game_id, player_id, payment_method)`** via `supabase.rpc()` under the admin session. That RPC is the *only* sanctioned way to book on behalf of another player: it enforces admin-or-service-role authorization inside the function, sets `booked_by_admin = true`, and emits `admin_booking_created` alongside `booking_created` in the same transaction as the state change.
   - Do not reach for `create_booking` here. It derives identity from `auth.uid()` and rejects a client-supplied player id by design — the admin is not the player being booked, and the two paths are deliberately separate functions rather than one function with an is-admin branch.
   - Pass only `qr` or `cash`. The stored method is derived exactly as it is for a player booking: a seed player still comes back `seed_free`, and a shadow player carrying enough wallet credit still comes back `credit`. Admin privilege widens *who* can be booked, never *what the booking costs*.
   - The shadow `players` row is a base-row insert and is created directly; only the booking goes through the RPC.

3. **Duplicate prevention:** check the supplied email against existing players first. On a match, steer the admin to the Phase 25 merge tool rather than creating a duplicate identity. Duplicate player rows fragment booking history and credit balance, and are far more expensive to fix after the fact than to prevent here.

**Acceptance Criteria:**
- [ ] [REQ-USER-002, REQ-UI-017, REQ-PERF-003] Adding a player creates a shadow `players` row plus a booking in one action in ≤10s and emits `admin_booking_created` (criterion 4)
- [ ] [REQ-USER-002, REQ-BIZ-010] The booking is created by calling `supabase.rpc('admin_create_booking', ...)` under the admin session — a grep of the flow finds no call to `create_booking` and no direct `.insert()` on `bookings`
- [ ] [REQ-USER-002] The created player row has a null `auth_user_id` and the booking has `booked_by_admin` set by the RPC
- [ ] [REQ-DB-008, REQ-DB-009] Both `booking_created` and `admin_booking_created` event rows are present after one add-player action
- [ ] [REQ-BIZ-025, REQ-BIZ-022] The action sends only `qr`/`cash`; adding an `is_seed` player yields a `seed_free` booking and adding a shadow with a covering balance yields a `credit` booking, both derived by the RPC rather than named by the admin
- [ ] [REQ-USER-005] Adding a player with an email matching an existing player steers the admin to the merge tool and creates no duplicate row
- [ ] [REQ-SEC-001, REQ-SEC-002] A nickname violating the `[A-Za-z0-9 _-]{1,20}` charset is rejected with a friendly inline message, not a raw constraint error
- [ ] [REQ-USER-004] Email is genuinely optional — an email-less shadow player can be created, and it can only ever be claimed via the admin merge tool
- [ ] [REQ-SEC-020] The surface is unreachable without an admin session (inherits the Phase 21 gate), and `admin_create_booking`'s own inside-function admin check rejects the call independently of that gate
- [ ] [REQ-UI-018] Waitlist depth for the game is shown as a visible number on the admin game surface (expansion-trigger sensor)
- [ ] [TEST-039] `npm run test:e2e -- -g "add player"` passes [REQ-USER-002, REQ-UI-017, REQ-PERF-003]

**Files:**
- `app/admin/games/[id]/add-player/page.tsx` - Add-player form with charset validation
- `app/admin/games/[id]/add-player/actions.ts` - Shadow-player insert plus booking via `admin_create_booking`
- `app/admin/games/[id]/page.tsx` - Entry point linking to the add-player flow
- `lib/strings.ts` - Add-player copy

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#surfaces` - Add-player performance target and flow definition
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - Shadow-player identity and claim rules
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#51-entity-definitions` - `players` nullable `auth_user_id` and `bookings.booked_by_admin`
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#acceptance-criteria` - Criterion 4

**Milestones:**
- **Add shadow player + booking in one flow** (IP M17.2)
  - [ ] `app/admin/games/[id]/add-player/page.tsx` captures nickname and optional email with charset validation
  - [ ] `app/admin/games/[id]/add-player/actions.ts` inserts the shadow player and books via `admin_create_booking` in one action
  - [ ] Booking created via `supabase.rpc('admin_create_booking', ...)` with `booked_by_admin` set and both `booking_created` + `admin_booking_created` emitted
  - [ ] Only `qr`/`cash` sent; `seed_free`/`credit` outcomes left to RPC derivation
  - [ ] Email-less shadow creation supported
  - [ ] Flow verified to complete in ≤10s
- **Duplicate-identity prevention** (IP M17.2)
  - [ ] Supplied email checked against existing players before creation
  - [ ] Existing-email match steers to the Phase 25 merge tool instead of duplicating
  - [ ] Friendly inline nickname error rendered from `lib/strings.ts`

---

### Phase 24: Admin attendance → settle

**Goal:** Deliver attendance marking and the settle transition with a hard block on any unpaid `reserved` booking surviving into `settled`.

**Dependencies:** Phase 4, Phase 7, Phase 21, Phase 22

**Duration:** 130 minutes

**Prompt:**
Context from previous work: Phase 7 delivered the settle transitions plus `confirm_booking`. Phase 21 built the admin shell. Phase 22 built the reconciliation surface whose cash-confirm action this flow reuses.

Build the game close-out flow. This is where a game's books are closed, and the correctness requirement is unusually sharp: a `reserved` booking surviving into `settled` is an unreconciled debt with no surface that will ever surface it again. The state would be permanently ambiguous, which is why this is a hard block rather than a warning.

1. **`mark_attendance(booking_id, attendance)` RPC — the write path:**
   - `bookings.attendance` is a column on a state-bearing table and its write has an event (`attendance_marked`) that must land with it. A server action doing an `.update()` and then logging the event separately violates the RPC-only invariant and gives no guarantee the two agree — and attendance is what drives the no-show metric and the settle gate, so a stamp without its event corrupts both.
   - `supabase/migrations/<ts>_rpc_mark_attendance.sql` defining `mark_attendance(booking_id UUID, attendance)` as `SECURITY DEFINER` plpgsql with `SET search_path=''` and every reference schema-qualified, matching the Phase 5-7 conventions.
   - **Admin-only**, enforced inside the function: an `auth.uid()` resolving to a player with `is_admin`, or a service-role context. Anything else raises `INSUFFICIENT_PERMISSION`. Marking someone a no-show is a consequential act with money attached — it must not be reachable by the player it describes.
   - Writes `bookings.attendance` and emits `attendance_marked` in one transaction.
   - Accepts only `present` / `no_show`, and rejects marking attendance on a booking that is not active (`cancelled`/`expired`) — those outcomes were already settled by their own transitions.

2. **`app/admin/games/[id]/attendance/page.tsx`** listing bookings with present / no-show controls.

3. **`app/admin/games/[id]/attendance/actions.ts`** calling `mark_attendance` via `supabase.rpc()` per booking, then transitioning the game to `settled` via the Phase 7 RPC.

4. **Resolve every unpaid `reserved` booking at settle:** either the player paid cash on the pitch (admin `confirm_booking`) or they are marked no_show and cancelled. **Block settle until none remain**, and surface which bookings are outstanding so the admin knows exactly what to resolve.

5. **Support marking an under-capacity game `played` directly from `published`** — a game that never filled still gets played and settled, and the state machine allows `published → played` for exactly this reason.

6. Add attendance and settle copy to `lib/strings.ts`.

**Acceptance Criteria:**
- [ ] [REQ-UI-019, REQ-DB-008, REQ-DB-009] Marking attendance calls `supabase.rpc('mark_attendance', ...)`, which writes `present`/`no_show` to `bookings.attendance` and emits `attendance_marked` in one transaction — a grep of the attendance flow finds no direct `.update()` on `bookings` (SQL assertion: a forced failure after the write leaves neither)
- [ ] [REQ-SEC-003, REQ-SEC-006, REQ-DB-013] `mark_attendance` declares `SECURITY DEFINER` with `SET search_path=''`, schema-qualifies every reference, and permits only an admin `auth.uid()` or service-role context — a non-admin player marking their own booking is rejected with `INSUFFICIENT_PERMISSION` (SQL assertion)
- [ ] [REQ-BIZ-016] `mark_attendance` accepts only `present`/`no_show` and rejects marking a `cancelled` or `expired` booking
- [ ] [REQ-BIZ-042] Attempting to settle a game with any unpaid `reserved` booking remaining is blocked with a clear message identifying the outstanding bookings
- [ ] [REQ-BIZ-042, REQ-BIZ-006] Resolving each unpaid reserved booking (cash-confirm or no_show/cancel) then settling succeeds, and a post-settle SQL check finds zero `reserved` bookings on the game (criterion 8)
- [ ] [REQ-BIZ-005] An under-capacity `published` game can be marked `played` directly and then settled
- [ ] [REQ-BIZ-010] The settle transition goes through `supabase.rpc()` with no direct `games.status` write
- [ ] [REQ-SEC-020] The surface is unreachable without an admin session (inherits the Phase 21 gate)
- [ ] [REQ-UI-002] All attendance and settle copy originates from `lib/strings.ts`
- [ ] [TEST-040] `npm run test:e2e -- -g "attendance settle"` passes [REQ-BIZ-042, REQ-BIZ-005]
- [ ] [TEST-053] `mark_attendance` writes the attendance and its event in one transaction, rejects a non-admin caller, and rejects a non-active booking: `supabase test db` passes [REQ-UI-019, REQ-SEC-006, REQ-DB-009]

**Files:**
- `supabase/migrations/<ts>_rpc_mark_attendance.sql` - `mark_attendance(booking_id, attendance)` definition
- `supabase/tests/mark_attendance.sql` - Same-transaction, authorization, and transition-legality assertions
- `app/admin/games/[id]/attendance/page.tsx` - Attendance marking UI
- `app/admin/games/[id]/attendance/actions.ts` - `mark_attendance` calls and the settle transition with reserved resolution
- `app/admin/games/[id]/actions.ts` - Cash-confirm action reused for on-pitch payment
- `lib/strings.ts` - Attendance and settle copy

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#surfaces` - Attendance/settle rules and the no-reserved-survives-settle requirement
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#data-model` - Game state machine including `published → played`
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#62-key-contracts` - Attendance and settle transition contracts
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#acceptance-criteria` - Criterion 8

**Milestones:**
- **Attendance marking** (IP M18.1)
  - [ ] `mark_attendance(booking_id, attendance)` SECURITY DEFINER RPC written — admin-only, writing the column and emitting `attendance_marked` in one transaction
  - [ ] `app/admin/games/[id]/attendance/page.tsx` lists bookings with present / no-show controls
  - [ ] `app/admin/games/[id]/attendance/actions.ts` calls `mark_attendance` via `supabase.rpc()` with no direct `bookings` write
  - [ ] `supabase/tests/mark_attendance.sql` written and passing
  - [ ] Attendance and settle copy added to `lib/strings.ts`
- **Settle with reserved-booking resolution** (IP M18.1)
  - [ ] Settle transition invoked via the Phase 7 RPC
  - [ ] Settle blocked until every unpaid `reserved` booking is cash-confirmed or no_show/cancelled
  - [ ] Outstanding bookings surfaced by name so the admin knows what to resolve
  - [ ] Under-capacity game markable `played` directly from `published`
  - [ ] Post-settle SQL check confirming zero `reserved` bookings passes

---

### Phase 25: Admin players — credit grants + shadow merge

**Goal:** Deliver the player list with balances, manual credit grants with unmatched-payment logging, and the transactional shadow-player merge.

**Dependencies:** Phase 4, Phase 21, Phase 23

**Duration:** 140 minutes

**Prompt:**
Context from previous work: Phase 21 built the admin shell. Phase 23 built the add-shadow-player flow that steers duplicate identities here. Phase 4 created `credit_ledger` with UPDATE/DELETE revoked. Phase 8 established that email-less shadows are never auto-claimed.

Build the player-side admin operations. These are the identity and money-correction endpoints of the system — where a payment that arrived with a wrong variable symbol gets resolved, and where identity mistakes get corrected.

Both write paths here are RPCs. `credit_ledger` is append-only with UPDATE/DELETE revoked, and the merge repoints foreign keys across four tables — neither can be assembled from TypeScript queries and still hold its guarantees.

1. **`grant_credit(player_id, delta_czk, reason)` RPC:**
   - `supabase/migrations/<ts>_rpc_grant_credit.sql`, `SECURITY DEFINER` plpgsql with `SET search_path=''` and every reference schema-qualified.
   - **Admin-only**, enforced inside the function; anything else raises `INSUFFICIENT_PERMISSION`. This function mints money — it is the single most privilege-sensitive write in the system, and it must not be reachable by the player being credited.
   - Writes the `credit_ledger` row and emits `credit_issued` in one transaction. When `reason` marks the unmatched-payment resolution path, it additionally emits `payment_unmatched` in that same transaction, so the event trail explaining the money can never be missing from the money.
   - Accepts only the `credit_ledger` reason enum values, and rejects a `delta_czk` that would drive the player's balance below zero — the same non-negativity rule `create_booking` enforces, applied here because an adjustment can be negative.

2. **`merge_players(shadow_id, surviving_id)` RPC:**
   - `supabase/migrations/<ts>_rpc_merge_players.sql`, same conventions, **admin-only** inside the function.
   - Repoints `bookings`, `waitlist`, `credit_ledger`, and `events` foreign keys to the surviving id **in one transaction**, retaining all history. A partial merge would strand a player's credit on an orphaned row — precisely the failure the transactional boundary exists to prevent, and unreachable from app code because `credit_ledger` has UPDATE revoked for clients.
   - Rejects merging a player into itself, and rejects a surviving id that does not exist.

3. **`app/admin/players/page.tsx`** listing players with `SUM(delta_czk)` balances computed server-side.

4. **`app/admin/players/actions.ts`** calling `grant_credit` via `supabase.rpc()`. The operational scenario: a payment arrives with a wrong or missing VS; the admin resolves it by granting the player credit and logging why. No direct `credit_ledger` insert.

5. **`app/admin/players/merge/page.tsx`** selecting a shadow row and a surviving player, showing both identities' booking counts and balances before confirming.

6. **`app/admin/players/merge/actions.ts`** calling `merge_players` via `supabase.rpc()` — the action orchestrates confirmation and result display, never the repoint itself.

7. **Restrict merge to the admin path only** — email-less shadows are never auto-claimed, and merge is their only route to a real account.

**Acceptance Criteria:**
- [ ] [REQ-USER-009, REQ-DB-005] `/admin/players` lists players with balances matching a direct `SUM(delta_czk)` query
- [ ] [REQ-BIZ-043, REQ-DB-014, REQ-BIZ-010] A manual credit grant calls `supabase.rpc('grant_credit', ...)`, which writes the append-only `admin_grant` row and emits `credit_issued` in one transaction; the player's displayed balance updates accordingly and a grep of the admin players flow finds no direct `.insert()` on `credit_ledger`
- [ ] [REQ-SEC-003, REQ-SEC-006, REQ-DB-013] `grant_credit` declares `SECURITY DEFINER` with `SET search_path=''`, schema-qualifies every reference, permits only an admin `auth.uid()` or service-role context, and rejects a grant that would drive the player's balance below zero (SQL assertion)
- [ ] [REQ-EH-004] Resolving an unmatched payment emits `payment_unmatched` in the **same transaction** as the `credit_issued` event and the `admin_grant` `credit_ledger` row — a forced failure leaves none of the three
- [ ] [REQ-USER-005, REQ-BIZ-010] Merging a shadow into a surviving player calls `supabase.rpc('merge_players', ...)`, which repoints all bookings, waitlist, ledger, and events rows in one transaction; a post-merge SQL check finds zero rows still referencing the merged id, and a grep finds no direct FK update in the action
- [ ] [REQ-SEC-006] `merge_players` permits only an admin `auth.uid()` or service-role context and rejects a self-merge or an unknown surviving id (SQL assertion)
- [ ] [REQ-USER-005] The merged player's credit balance after merge equals the sum of both players' pre-merge balances
- [ ] [REQ-USER-005, REQ-DB-009] A simulated failure partway through the merge leaves the database unchanged (no partial repoint)
- [ ] [REQ-USER-004, REQ-SEC-020] The merge surface is reachable only via the admin path and is unreachable without an admin session — it is the sole claim route for an email-less shadow player
- [ ] [REQ-UI-002] All grants and merge copy originates from `lib/strings.ts`
- [ ] [TEST-041] `npm run test:e2e -- -g "credit grant merge"` passes [REQ-BIZ-043, REQ-USER-004, REQ-USER-005]
- [ ] [TEST-054] `grant_credit` writes ledger row + `credit_issued` (+ `payment_unmatched` where applicable) in one transaction and rejects non-admin callers; `merge_players` repoints all four tables atomically and rolls back cleanly on a mid-merge failure: `supabase test db` passes [REQ-BIZ-043, REQ-EH-004, REQ-USER-005, REQ-SEC-006]

**Files:**
- `supabase/migrations/<ts>_rpc_grant_credit.sql` - `grant_credit(player_id, delta_czk, reason)` definition
- `supabase/migrations/<ts>_rpc_merge_players.sql` - `merge_players(shadow_id, surviving_id)` transactional FK repoint
- `supabase/tests/admin_players_rpcs.sql` - Grant, unmatched-payment, merge-atomicity, and authorization assertions
- `app/admin/players/page.tsx` - Player list with server-computed balances
- `app/admin/players/actions.ts` - Credit grants via `grant_credit`
- `app/admin/players/merge/page.tsx` - Shadow merge selection surface
- `app/admin/players/merge/actions.ts` - Merge orchestration calling `merge_players`
- `lib/strings.ts` - Grants and merge copy

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#payments` - Unmatched-payment resolution and manual credit grants
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - Shadow merge as the only path for email-less shadows
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#51-entity-definitions` - `credit_ledger` reasons and FK relationships
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#surfaces` - Admin players surface definition

**Milestones:**
- **Player list + credit grants** (IP M18.2)
  - [ ] `grant_credit(player_id, delta_czk, reason)` SECURITY DEFINER RPC written — admin-only, ledger row + `credit_issued` (+ `payment_unmatched`) in one transaction
  - [ ] `app/admin/players/page.tsx` lists players with server-computed `SUM(delta_czk)` balances
  - [ ] `app/admin/players/actions.ts` calls `grant_credit` with no direct `credit_ledger` insert
  - [ ] Displayed balance verified against a direct SQL query
- **Shadow-player merge** (IP M18.2)
  - [ ] `merge_players(shadow_id, surviving_id)` SECURITY DEFINER RPC written — admin-only, repointing bookings/waitlist/ledger/events FKs in one transaction
  - [ ] `app/admin/players/merge/page.tsx` built for shadow/surviving selection with pre-merge counts and balances
  - [ ] `app/admin/players/merge/actions.ts` calls `merge_players` and renders the result
  - [ ] Post-merge SQL check finds zero rows referencing the merged id; balances sum correctly
  - [ ] Partial-failure rollback verified
  - [ ] Merge restricted to the admin path only
  - [ ] Grants and merge copy added to `lib/strings.ts`

---

### Phase 26: Admin stats page (`/admin/stats`)

**Goal:** Ship the read-only `/admin/stats` page computing all six metric groups as direct SQL over events and tables.

**Dependencies:** Phase 9, Phase 17, Phase 21

**Duration:** 150 minutes

**Prompt:**
Context from previous work: Phase 3 created the `events` table with its `(event_type, created_at)` index. Every phase since has written events in the same transaction as its state change. The full Phase 1 catalog is **22** event types, exactly as declared in Phase 3 and ANALYZE §3: `account_created`, `auth_link_sent`, `auth_completed`, `player_claimed`, `game_published`, `game_cancelled`, `game_settled`, `booking_created`, `payment_confirmed`, `booking_cancelled`, `booking_expired`, `spot_released`, `waitlist_joined`, `waitlist_notified`, `waitlist_converted`, `nudge_sent`, `reminder_sent`, `attendance_marked`, `credit_issued`, `credit_redeemed`, `payment_unmatched`, `admin_booking_created`. Phase 21 built the admin shell that gates this page. Phase 9's seed (extended with waitlist fixtures in Phase 17) provides data to verify against.

Build the read-only stats page. This phase validates the plan's central architectural thesis — that because every notable action writes to an append-only event log, **every metric is a SQL query rather than a new project**. No new infrastructure, no analytics service, no event pipeline.

1. **Implement `lib/stats/queries.ts`** with six aggregate queries over `events` and the tables, all using the `(event_type, created_at)` index:
   - Signup → first-booking → attendance funnel.
   - Booking-to-payment conversion (`booking_created` → `payment_confirmed`).
   - No-show rate (from `bookings.attendance`).
   - Waitlist depth per upcoming game.
   - Credit outstanding (`SUM(delta_czk)` across all players).
   - Magic-link drop-off (`auth_link_sent` → `auth_completed`).

   **Verification note for the drop-off metric.** The seed deliberately fabricates no auth-funnel events (Phase 9): `events` is append-only with no client access, and a setup-only insert path into it would be a backdoor through the one table whose design exists to forbid exactly that. So this metric is the single query **not** verified against seeded data. It is verified with **one real signup performed at the M4 gate** — sign up on a phone, then confirm the page's drop-off figure moves from 0/0 to 1/1. That is a criterion of the M4 gate, not a fixture assertion, and it is recorded there. The other five metrics verify against seeded data normally.

2. **Build `components/admin/StatCard.tsx`** as the metric tile, and `app/admin/stats/page.tsx` rendering the six groups read-only, gated by the Phase 21 admin layout.

3. **Surface waitlist depth per game prominently.** This is the expansion-trigger sensor: when games consistently run a deep waitlist, that is the signal to add a second weekly slot or a second venue. It is the most operationally consequential number on the page.

Keep every query to simple aggregates so an events scan stays fast. The page is read-only — it must never write.

**Acceptance Criteria:**
- [ ] [REQ-UI-015, REQ-SEC-020] `/admin/stats` renders all six metric groups read-only and is inaccessible to non-admin sessions (inherits the Phase 21 gate)
- [ ] [REQ-UI-015] The signup→first-booking→attendance funnel figures match a direct SQL query against the Phase 9 seeded events
- [ ] [REQ-UI-015] Booking-to-payment conversion equals `payment_confirmed` count over `booking_created` count for the seeded data
- [ ] [REQ-UI-015, REQ-AUTH-002] Magic-link drop-off equals `auth_completed` count over `auth_link_sent` count — verified with **one real signup at the M4 gate** rather than against seeded events, since the seed fabricates no auth-funnel events; the figure moves from 0/0 to 1/1 after that signup (artifact check, M4 gate)
- [ ] [REQ-UI-015] No-show rate matches a direct query over `bookings.attendance`
- [ ] [REQ-UI-015, REQ-DB-005] Credit outstanding equals `SUM(delta_czk)` across all players
- [ ] [REQ-UI-015, REQ-UI-018] Waitlist depth is shown per upcoming game as a visible number and matches the seeded waitlist rows
- [ ] [REQ-UI-015] All six queries are simple aggregates using the `(event_type, created_at)` index computed as direct SQL; none performs a write
- [ ] [REQ-UI-015] `lib/stats/queries.ts` documents each metric's SQL alongside its implementation
- [ ] [TEST-042] `npm run test:e2e -- -g "admin stats"` passes [REQ-UI-015]

**Files:**
- `lib/stats/queries.ts` - The six aggregate queries over `events` and tables
- `components/admin/StatCard.tsx` - Metric tile component
- `app/admin/stats/page.tsx` - Read-only stats page under the admin layout

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#low-cost-additions` - The six required metric groups (M4)
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#51-entity-definitions` - `events` table shape and the metrics-as-queries thesis
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#53-indexes--constraints` - The `(event_type, created_at)` stats index
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#milestones` - M4 gate requiring stats to reflect a fictional game's events

**Milestones:**
- **Stats queries over the event log** (IP M19.1)
  - [ ] `lib/stats/queries.ts` implements the funnel, conversion, no-show rate, waitlist depth, credit outstanding, and drop-off queries
  - [ ] All queries kept to simple aggregates using the `(event_type, created_at)` index
  - [ ] Each metric's SQL documented alongside its implementation
  - [ ] Five metrics verified against direct SQL over the Phase 9 + Phase 17 seeded data
  - [ ] Magic-link drop-off deferred to the M4-gate real-signup check, with the reason noted alongside the query
- **`/admin/stats` read-only surface** (IP M19.1)
  - [ ] `components/admin/StatCard.tsx` built as the metric tile
  - [ ] `app/admin/stats/page.tsx` renders all six groups read-only under the admin gate
  - [ ] Waitlist depth per game surfaced prominently as the expansion-trigger sensor
  - [ ] Page confirmed to perform no writes

---

## 🛑 GATE M4 — Admin panel (after Phase 26)

**This is a mandatory halt point, not a checklist.** Spec §10 gate M4 covers Phases 21–26: all admin surfaces from §9, including `/admin/stats`.

**§10 gate criteria — verify by hand, timed:**
- [ ] Run a fictional game lifecycle end to end — create, fill with shadow + real players, confirm payments, mark attendance, settle
- [ ] The whole lifecycle takes **under 5 minutes of admin time**
- [ ] The stats page reflects the fictional game's events correctly
- [ ] **One real signup is performed on a phone**, and `/admin/stats` magic-link drop-off moves from 0/0 to 1/1 — this is the agreed verification for that metric, since the seed deliberately fabricates no auth-funnel events (Phase 9 / Phase 26)

**STOP — do not proceed past this gate without explicit human confirmation.**

---

### Phase 27: PWA basics + design/strings/privacy polish

**Goal:** Deliver the M5 non-code polish — PWA install artifacts, English copy and design conformance, and the DRAFT privacy page.

**Dependencies:** Phase 13, Phase 14

**Duration:** 150 minutes

**Prompt:**
Context from previous work: Phases 10-14 built every player surface. Phase 13 produced the volt-on-black share image. Phase 1 established the theme tokens from `index.html` and Phase 2 the centralized `lib/strings.ts`.

This phase is largely artifact and verification work rather than new logic, and its acceptance is correspondingly artifact-based: installing on a real phone, reviewing side-by-side against the design reference, confirming a DRAFT marker. Unit tests are not the right instrument here.

1. **PWA basics:**
   - `app/manifest.ts` with name, start URL, display `standalone`, background and theme colors, and icon references.
   - 192px and 512px maskable icons plus an Apple touch icon in the volt-on-black style.
   - Theme-color and apple-touch-icon metadata in `app/layout.tsx`.
   - **No service worker, no offline logic.** Offline behavior is explicitly out of scope; the goal is only that "Add to Home Screen" produces a clean icon and splash. Adding a service worker here would introduce cache-invalidation problems the product has no need for.

2. **English copy pass + design conformance:**
   - Review every key in `lib/strings.ts` for copy quality and consistency, and confirm no user-facing string is hardcoded anywhere else.
   - Compare each player surface against `/Users/oliverstaehelin/dev/hrajfotbalek/index.html` on a real mobile viewport and correct drift in `app/page.tsx` and the other surfaces.
   - Verify colors, fonts, and spacing resolve from theme tokens rather than ad-hoc values — after twenty-six phases of feature work, token drift is likely.
   - Confirm the mobile-first layout holds on a real phone, not just a desktop browser's responsive mode.

3. **`/privacy` DRAFT page — this phase owns the file:**
   - **`app/privacy/page.tsx` is created here and nowhere else.** Phases 8 and 14 link to `/privacy` before it exists; those links are dead until this phase, which is acceptable because both are pre-launch surfaces, but it does mean no earlier phase should "helpfully" stub the route. One owner, one file.
   - Placeholder copy **clearly marked DRAFT**. Do not generate final legal text.
   - **The copy is explicitly human-owned.** A GDPR privacy policy is a legal representation about what this system does with personal data; a generated draft that reads as finished is worse than an obvious placeholder, because it invites shipping. Leave the human-supplied slot unmistakable — a visible DRAFT banner and a marked insertion point, not lorem ipsum that could pass for real text. Phase 30 replaces it with the human-supplied copy at the M5 cutover.
   - Confirm the signup consent link (Phase 8) and the account deletion-request context (Phase 14) both resolve to `/privacy` once this page exists.

**Acceptance Criteria:**
- [ ] [REQ-UI-014] Installing the app to a real phone home screen shows the correct volt-on-black icon and splash (artifact check)
- [ ] [REQ-UI-014] `app/manifest.ts` validates and references the 192px and 512px icons, the Apple touch icon, `display: standalone`, and the theme color
- [ ] [REQ-UI-014] No service worker file or offline caching logic exists anywhere in the project (artifact check)
- [ ] [REQ-UI-001, REQ-UI-004] A side-by-side review on a real phone shows the app matches the `index.html` volt-on-black reference and the mobile-first layout holds (artifact check)
- [ ] [REQ-UI-002] A grep finds no hardcoded user-facing strings outside `lib/strings.ts`
- [ ] [REQ-UI-004] All colors, fonts, and spacing resolve from `tailwind.config.ts` tokens with no ad-hoc inline values
- [ ] [REQ-UI-010, REQ-COMP-003] `app/privacy/page.tsx` is created in this phase (no earlier phase stubs the route) and renders placeholder text with a visible DRAFT banner and an unmistakable human-supplied insertion point; it contains no generated legal copy that could be mistaken for final text, and Phase 30 replaces it at the M5 cutover (artifact check)
- [ ] [REQ-AUTH-007, REQ-USER-006] The signup consent link and the account deletion context both resolve to `/privacy`
- [ ] [TEST-043] `npm run test:e2e -- -g "manifest"` passes [REQ-UI-014]

**Files:**
- `app/manifest.ts` - PWA web manifest
- `public/icons/icon-192.png` - 192px maskable home-screen icon
- `public/icons/icon-512.png` - 512px maskable home-screen icon
- `public/apple-touch-icon.png` - Apple touch icon
- `app/layout.tsx` - Theme-color and apple-touch-icon metadata
- `lib/strings.ts` - Full English copy quality pass
- `app/page.tsx` - Design-conformance corrections
- `app/privacy/page.tsx` - DRAFT privacy page

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#low-cost-additions` - PWA basics scope (manifest + icons + theme color, no offline logic)
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - DRAFT privacy page requirement
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#stack-conventions` - Design-reference conformance (match, don't reinterpret)
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#out-of-scope` - Service-worker/offline logic explicitly excluded

**Milestones:**
- **PWA manifest + icons + theme color** (IP M20.1)
  - [ ] `app/manifest.ts` implemented with name, start URL, standalone display, colors, and icon references
  - [ ] 192px and 512px maskable icons plus Apple touch icon added in volt-on-black style
  - [ ] Theme-color and apple-touch-icon metadata added to `app/layout.tsx`
  - [ ] Absence of any service worker or offline logic confirmed
  - [ ] Home-screen install verified on a real phone
- **English copy pass + design conformance** (IP M20.2)
  - [ ] Every `lib/strings.ts` key reviewed for English copy quality and consistency
  - [ ] Grep confirms no hardcoded user-facing strings outside `lib/strings.ts`
  - [ ] Each player surface compared against `index.html` on a real mobile viewport, drift corrected
  - [ ] Colors/fonts/spacing verified to resolve from theme tokens
  - [ ] Mobile-first layout verified on a real device
- **`/privacy` DRAFT page** (IP M20.3)
  - [ ] `app/privacy/page.tsx` built with clearly-marked DRAFT placeholder copy
  - [ ] No final legal text generated; human-supplied slot left obvious
  - [ ] Signup consent link and account deletion context confirmed to point at `/privacy`

---

### Phase 28: E2E Playwright harness + user-path specs

**Goal:** Stand up the Playwright harness against seed fixtures in dry-run and cover every user-visible acceptance criterion.

**Dependencies:** Phase 9, Phase 20, Phase 24, Phase 25, Phase 26, Phase 27

**Duration:** 110 minutes

**Prompt:**
Context from previous work: The full system is built. Phases 1-7 delivered the foundation and RPCs; 8-14 the player surfaces; 15-20 the email and cron lifecycle; 21-26 the admin panel; 27 the polish. Phase 9 provides seed fixtures.

Build the Playwright harness and the specs covering every acceptance criterion that has a user-visible path. Phase 29 adds the data, RLS, and concurrency specs that assert via API/SQL instead. Splitting them this way keeps each phase's failure mode distinct: a red spec here means a broken user journey, a red spec there means a broken invariant.

1. **Harness:**
   - `playwright.config.ts` running against the seed fixtures with `EMAIL_DRY_RUN=on`.
   - `e2e/helpers/session.ts` seeding an authenticated session directly, so magic-link round-trips don't block authenticated flows. Without this, every authenticated test would need a mail-reading step and the suite would be unusably slow and flaky.
   - Add E2E scripts to `package.json`.

2. **User-path specs:**
   - `e2e/booking.spec.ts` — book→QR in <60s for an authenticated player, and credit auto-apply full (instant confirm, no QR) and partial (reduced amount due) — criteria 1, 7.
   - `e2e/waitlist.spec.ts` — full-game waitlist join, and cancel→credit→release→convert with zero human touches between cancel and conversion, plus the nudge → paid-or-expired → released chain — criteria 2, 5, 6.
   - `e2e/admin.spec.ts` — confirm ≤5s with correct badges, add-shadow ≤10s, attendance→settle leaving no reserved booking, and the WhatsApp preview card / `.ics` checks — criteria 3, 4, 8, 13.

**Acceptance Criteria:**
- [ ] [REQ-API-001] The suite runs green against `scripts/seed.ts` fixtures with `EMAIL_DRY_RUN=on`, covering every acceptance criterion with a user-visible path
- [ ] [REQ-API-001] `e2e/helpers/session.ts` seeds authenticated sessions without any magic-link round-trip
- [ ] [REQ-PERF-001] Book→QR completes in under 60 seconds for an authenticated player (criterion 1)
- [ ] [REQ-BIZ-022, REQ-BIZ-023] Credit auto-apply passes for both the full-credit (instant confirm, no QR) and partial-credit cases (criterion 7)
- [ ] [REQ-BIZ-037, REQ-BIZ-038, REQ-BIZ-040] Full-game waitlist join and the cancel→credit→release→convert chain pass with zero manual intervention between steps (criteria 2, 5)
- [ ] [REQ-BIZ-035, REQ-BIZ-036] The scarcity nudge → paid-or-expired → released chain passes (criterion 6)
- [ ] [REQ-PERF-002, REQ-PERF-003, REQ-BIZ-042] Admin confirm completes in ≤5s with correct badges, add-shadow in ≤10s, and attendance→settle leaves no `reserved` booking (criteria 3, 4, 8)
- [ ] [REQ-UI-012, REQ-UI-013] The WhatsApp preview card and `.ics` calendar checks pass (criterion 13)
- [ ] [REQ-API-001] `package.json` exposes the E2E run scripts
- [ ] [REQ-PERF-004] A full admin game lifecycle (create → fill → confirm → attendance → settle) is exercised end-to-end in under 5 minutes of admin time (M4 gate)
- [ ] [TEST-044] `npm run test:e2e` passes [REQ-API-001, REQ-API-002]

**Files:**
- `playwright.config.ts` - Test configuration against seed fixtures in dry-run
- `e2e/helpers/session.ts` - Seeded authenticated session helper
- `e2e/booking.spec.ts` - Book→QR and credit auto-apply specs
- `e2e/waitlist.spec.ts` - Waitlist join, cancel→credit→release→convert, and nudge chain specs
- `e2e/admin.spec.ts` - Admin lifecycle specs
- `package.json` - E2E script entries

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#acceptance-criteria` - Criteria 1-8 and 13
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#74-e2e-tests` - E2E strategy
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#75-test-data` - Seed fixtures and dry-run test mode
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_TEST_SCENARIOS.md` - Detailed test scenarios per criterion

**Milestones:**
- **Playwright harness** (IP M21.1)
  - [ ] `playwright.config.ts` runs against seed fixtures with `EMAIL_DRY_RUN=on`
  - [ ] `e2e/helpers/session.ts` seeds authenticated sessions without magic-link round-trips
  - [ ] E2E scripts added to `package.json`
- **Player-path specs** (IP M21.1)
  - [ ] `e2e/booking.spec.ts` covers book→QR under 60s and credit auto-apply full/partial (criteria 1, 7)
  - [ ] `e2e/waitlist.spec.ts` covers join, cancel→credit→release→convert, and the nudge chain (criteria 2, 5, 6)
- **Admin-path specs** (IP M21.1)
  - [ ] `e2e/admin.spec.ts` covers confirm ≤5s with badges and add-shadow ≤10s (criteria 3, 4)
  - [ ] `e2e/admin.spec.ts` covers attendance→settle leaving no reserved booking (criterion 8)
  - [ ] `e2e/admin.spec.ts` covers the WhatsApp preview card and `.ics` checks (criterion 13)

---

### Phase 29: E2E data, RLS & concurrency specs

**Goal:** Deliver the API/SQL-asserted specs for RLS isolation, cross-user and non-admin RPC rejection, event-catalog completeness, cron idempotency, and the two concurrency invariants.

**Dependencies:** Phase 28

**Duration:** 100 minutes

**Prompt:**
Context from previous work: Phase 28 built the Playwright harness (`playwright.config.ts`, `e2e/helpers/session.ts`) and the user-path specs. This phase adds the criteria that have no user-visible path and must be asserted via API/SQL rather than by eyeballing a page.

1. **`e2e/concurrency.spec.ts`** with a deterministic parallel-request harness asserting:
   - Last-spot single winner: two parallel `create_booking` calls leave exactly one booking (criterion 11).
   - Credit double-spend prevention: two parallel credit-funded bookings by one player for different games redeem the wallet at most once and `SUM(delta_czk)` never goes negative (criterion 16).
   - **Assert database state, never timing.** A test that depends on request ordering will be flaky, whereas the invariant "exactly one booking exists" is deterministic regardless of which request won. This distinction is the difference between a suite that catches real concurrency regressions and one that gets disabled after a month of false alarms.

2. **`e2e/data.spec.ts`** asserting:
   - RLS isolation — a logged-in player cannot read another player's data; anonymous `game_roster_public` exposes nickname + status only, with no `player_id`/`email`/`phone` in the response (criterion 10).
   - Cross-user `create_booking`/`cancel_booking` and non-admin `confirm_booking`/`expire_booking` calls rejected inside the function (criterion 15).
   - Every catalog action writes its event row, asserted per action (criterion 9).
   - Cron double-run producing no duplicate emails or events, per route (criterion 12).

**Acceptance Criteria:**
- [ ] [REQ-BIZ-045] Two parallel `create_booking` calls for the last spot leave exactly one booking in the database (criterion 11)
- [ ] [REQ-BIZ-046] Two parallel credit-funded bookings by one player for different games redeem the wallet at most once and `SUM(delta_czk)` never goes negative (criterion 16)
- [ ] [REQ-BIZ-045, REQ-BIZ-046] The concurrency harness asserts database state rather than request timing or ordering
- [ ] [REQ-SEC-009, REQ-SEC-011, REQ-SEC-012] A logged-in player cannot read another player's rows via the API, and anonymous roster reads expose no `player_id`/`email`/`phone` (criterion 10)
- [ ] [REQ-SEC-005, REQ-BIZ-047] Cross-user `create_booking`/`cancel_booking` calls are rejected inside the function (criterion 15)
- [ ] [REQ-SEC-006, REQ-BIZ-047] Non-admin `confirm_booking`/`expire_booking` calls are rejected inside the function (criterion 15)
- [ ] [REQ-API-002, REQ-DB-008] Every catalog action produces its event row, asserted per action (criterion 9)
- [ ] [REQ-INFRA-007] Each of the three cron routes run twice produces no duplicate emails or events (criterion 12)
- [ ] [REQ-API-001] The full suite (Phase 28 + 29 specs) runs green against seed fixtures with `EMAIL_DRY_RUN=on`
- [ ] [TEST-045] `npm run test:e2e -- -g "concurrency"` passes [REQ-BIZ-045, REQ-BIZ-046]
- [ ] [TEST-046] `npm run test:e2e -- -g "data"` passes [REQ-SEC-009, REQ-BIZ-047]

**Files:**
- `e2e/concurrency.spec.ts` - Parallel-request harness for criteria 11 and 16
- `e2e/data.spec.ts` - RLS, cross-user RPC, event-catalog, and cron-idempotency specs
- `e2e/helpers/session.ts` - Session helper reused from Phase 28
- `playwright.config.ts` - Configuration reused from Phase 28

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#acceptance-criteria` - Criteria 9, 10, 11, 12, 15, 16
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_IMPLEMENTATION.md#74-e2e-tests` - Data-assertion approach for non-visual criteria
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_TEST_SCENARIOS.md` - Detailed test scenarios per criterion
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_SECURITY_REVIEW.md` - RLS and RPC authorization surfaces under test

**Milestones:**
- **Concurrency specs** (IP M21.2)
  - [ ] `e2e/concurrency.spec.ts` asserts last-spot single winner (criterion 11)
  - [ ] `e2e/concurrency.spec.ts` asserts no credit double-spend and a never-negative ledger (criterion 16)
  - [ ] Harness verified to assert database state rather than timing
- **Data, RLS & idempotency specs** (IP M21.2)
  - [ ] `e2e/data.spec.ts` asserts RLS isolation and anon roster projection (criterion 10)
  - [ ] `e2e/data.spec.ts` asserts cross-user and non-admin RPC rejection (criterion 15)
  - [ ] `e2e/data.spec.ts` asserts every catalog action writes its event (criterion 9)
  - [ ] `e2e/data.spec.ts` asserts cron double-run idempotency for all three routes (criterion 12)
  - [ ] Full suite runs green in dry-run against seed fixtures

---

### Phase 30: Dry-run cutover — SMTP→Resend, `EMAIL_DRY_RUN=off`, acceptance

**Goal:** Perform the M5 production cutover — SMTP→Resend, `EMAIL_DRY_RUN=off` — and pass the real-game acceptance gate.

**Dependencies:** Phase 29

**Duration:** 90 minutes

**Prompt:**
Context from previous work: The complete system is built and Phases 28-29's Playwright suite proves all 16 acceptance criteria pass in dry-run. Every email since Phase 15 has been rendered and logged but never actually sent. Phase 2's `sendEmail()` seam was designed for precisely this moment.

Perform the production cutover. This is a config and ops phase with minimal code change — the payoff of having built everything behind the dry-run seam is that the cutover is a flag flip, not a refactor. Do not proceed until Resend DNS is verified.

1. **SMTP switch + flag flip:**
   - Switch Supabase SMTP from the built-in sender to Resend in `supabase/config.toml`. This also moves the magic-link email — which has deliberately sat outside the `sendEmail()` seam since Phase 8 — onto Resend.
   - Document `EMAIL_DRY_RUN=off` and the Resend SMTP credentials in `.env.example` for production.
   - Verify magic-link delivery on a real phone immediately after the switch. Auth email regressing here would lock every user out, and it is the one path the E2E suite deliberately bypasses via the seeded-session helper — so it has the least automated coverage of anything in the system.

2. **Live-send path verification:**
   - Confirm `lib/email/sendEmail.ts` takes the live-send branch when `EMAIL_DRY_RUN` is off and logs when on.
   - **Confirm the conservative default** established in Phase 2 still holds: a missing flag value logs rather than sends. A misconfigured environment should fail toward silence, never toward blasting real players with test email.
   - Send one live email per template family and confirm delivery.

3. **Real dry-run game acceptance + lessons:**
   - Create a real game and run the full acceptance checklist end-to-end — book→QR on a phone, WhatsApp preview card, `.ics` opening in a phone calendar, concurrency winner — in parallel with the existing WhatsApp process, so the manual process remains the safety net.
   - Confirm every acceptance criterion passes against the real game.
   - Append the Phase 1 lessons learned to `CLAUDE.md` so future sessions start smarter.

**Acceptance Criteria:**
- [ ] [REQ-AUTH-009, REQ-ENV-005, REQ-COMP-002] `supabase/config.toml` routes SMTP through Resend and the change is limited to configuration with no logic change, moving the auth email onto the Resend seam at M5
- [ ] [REQ-AUTH-003, REQ-COMP-004] A magic-link email is delivered to a real phone after the SMTP switch and login succeeds (artifact check)
- [ ] [REQ-ENV-001, REQ-COMP-001, REQ-INT-002] With `EMAIL_DRY_RUN=off`, a transactional email is delivered for real rather than dry-run logged (artifact check)
- [ ] [REQ-INT-001] With `EMAIL_DRY_RUN` unset or on, `sendEmail()` logs and sends nothing (fail-safe default, unit test)
- [ ] [REQ-INT-002] One live email per template family is delivered and confirmed
- [ ] [REQ-ENV-001, REQ-ENV-005] `.env.example` documents `EMAIL_DRY_RUN=off` and the Resend SMTP credentials for production
- [ ] [REQ-PERF-004] A real game runs end-to-end in parallel with the WhatsApp process and every acceptance criterion passes, with the full admin lifecycle inside 5 minutes of admin time (artifact check, criterion 14)
- [ ] [REQ-UI-012, REQ-UI-013] The WhatsApp preview card renders and the `.ics` opens in a phone calendar for the real game (criterion 13)
- [ ] [REQ-INFRA-009] Phase 1 lessons learned are appended to `CLAUDE.md` so future sessions start smarter
- [ ] [REQ-COMP-003] The `/privacy` DRAFT placeholder is replaced with the final human-supplied legal copy at the M5 cutover
- [ ] [TEST-047] `npm run test:unit -- -t "sendEmail live"` passes [REQ-ENV-001, REQ-INT-002]

**Files:**
- `supabase/config.toml` - SMTP provider switched to Resend
- `.env.example` - Production `EMAIL_DRY_RUN=off` and Resend credentials documented
- `lib/email/sendEmail.ts` - Live-send branch confirmed with conservative flag default
- `CLAUDE.md` - Phase 1 lessons learned

**Design References:**
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#milestones` - M5 cutover gate definition
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#stack-conventions` - The dry-run seam and cutover-as-flag-flip design
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#auth-privacy-security` - Magic-link SMTP migration at M5
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#acceptance-criteria` - Criteria 13 and 14
- `~/.letco/planning-workspace/5c6cc4ab-875b-4c34-90ab-5db4096734de/LETCO_ANALYZE.md#working-rules` - `CLAUDE.md` lessons-learned requirement

**Milestones:**
- **Supabase SMTP → Resend + `EMAIL_DRY_RUN=off`** (IP M22.1)
  - [ ] `supabase/config.toml` switched from the built-in sender to Resend
  - [ ] `EMAIL_DRY_RUN=off` and Resend credentials documented in `.env.example`
  - [ ] Flip confirmed gated on verified Resend DNS
  - [ ] Magic-link delivery verified on a real phone post-switch
- **Live-send path verification** (IP M22.2)
  - [ ] `lib/email/sendEmail.ts` confirmed to take the live-send branch with the flag off
  - [ ] Conservative default confirmed — a missing value logs rather than sends
  - [ ] One live email per template family sent and delivery confirmed
- **Real dry-run game acceptance + `CLAUDE.md` lessons** (IP M22.3)
  - [ ] Real game created and the full acceptance checklist run end-to-end in parallel with the WhatsApp process
  - [ ] WhatsApp preview card and `.ics` confirmed for the real game
  - [ ] Every acceptance criterion confirmed passing against the real game
  - [ ] Phase 1 lessons learned appended to `CLAUDE.md`

---

## 🛑 GATE M5 — Polish + dry run (end of Phase 30)

**This is a mandatory halt point, not a checklist.** Spec §10 gate M5 covers Phases 27–30: full English copy review, mobile pass on real devices, design-reference conformance, PWA manifest, final privacy text dropped in by a human, `EMAIL_DRY_RUN` off, Supabase SMTP switched from the built-in sender to Resend, and a real game created running shadow to the WhatsApp process.

**§10 gate criterion:**
- [ ] The full acceptance checklist (spec §11, mirrored in **Success Criteria** below) passes in its entirety

This is the final gate: passing it is what makes Phase 1 done. Every §11 criterion must be confirmed against the real dry-run game, not against fixtures.

**STOP — do not proceed past this gate without explicit human confirmation.**

---

## Success Criteria

### Functional Requirements
- An authenticated player can book a spot and see a scannable SPD QR in under 60 seconds on a phone
- A full game shows a waitlist button, join works, and a freed spot converts for exactly one racing player
- Admin payment confirmation completes in ≤5 seconds and the roster distinguishes paid / reserved / cash / seed
- An admin can create a shadow player and their booking in one action in ≤10 seconds
- Cancellation issues wallet credit, releases the spot, and fires waitlist notification with zero human intervention
- The scarcity nudge leads to payment or expiry, and an expired spot is released to the waitlist
- Credit auto-applies on the next booking in both the full-coverage (instant confirm, no QR) and partial-coverage cases
- Attendance marking drives a game to `settled` with every unpaid `reserved` booking resolved and none surviving
- A game link shared in WhatsApp renders a correct preview card, and the `.ics` opens in a phone calendar
- A full admin game lifecycle (create → fill → confirm → attendance → settle) takes under 5 minutes of admin time
- A real game runs end-to-end in parallel with the WhatsApp process

### Technical Requirements
- Every state transition runs inside a `SECURITY DEFINER` plpgsql RPC with `search_path=''` and schema-qualified references; zero direct client writes to any state-bearing table
- Booking the last spot concurrently from two sessions yields exactly one booking
- Two concurrent credit-funded bookings by one player for different games redeem the wallet at most once, and `SUM(delta_czk)` never goes negative
- Cross-user RPC calls (`create_booking`/`cancel_booking` with another player's id) and non-admin calls to `confirm_booking`/`expire_booking`/`admin_create_booking`/`mark_attendance`/`grant_credit`/`merge_players`, plus non-service-role calls to `notify_waitlist`/`mark_nudged`/`mark_reminder_sent`, are all rejected inside the function
- Booking on behalf of another player happens only through `admin_create_booking`, a separate admin-only entry point sharing `create_booking`'s internals — never by relaxing `create_booking`'s `auth.uid()` identity rule
- RLS is enabled deny-by-default on every table in the migration that creates it; a logged-in player cannot read another player's rows; anonymous `game_roster_public` reads expose nickname + status only
- `credit_ledger` is genuinely append-only (UPDATE/DELETE revoked); `events` has no client access
- Every action in the event catalog writes its event row in the same transaction as its state change
- All three cron routes are `CRON_SECRET`-gated and idempotent: a double-run produces no duplicate emails or events
- Every migration ships a working `down` that drops objects in reverse dependency order
- No hardcoded UI strings, policy windows, or raw UTC renders anywhere in the codebase
- All user- and admin-supplied free text is escaped at every render site: HTML, OG `content`, `.ics` fields, and email bodies
- The service-role key is server-only and never exposed under `NEXT_PUBLIC_`; `is_admin` has no in-app grant path

### Quality Requirements
- Test coverage > 70% for all new code
- All tests pass (unit, integration via SQL assertion scripts, and the full Playwright E2E suite)
- All 16 acceptance criteria pass, verified by Playwright for user-visible paths and API/SQL assertions for data criteria
- TypeScript strict mode enabled, 0 compilation errors
- The app matches the `index.html` volt-on-black design reference on real mobile devices
- All changes committed to git with descriptive messages

### Documentation Requirements
- `.env.example` documents every required environment variable including the production `EMAIL_DRY_RUN=off` configuration
- Each metric in `lib/stats/queries.ts` documents its SQL alongside the implementation
- The seed reset + reseed procedure is documented and wired into `package.json`
- Advisory-lock ordering is documented in the header of every RPC that takes both locks
- `/privacy` carries a clearly-marked DRAFT placeholder awaiting human-supplied legal copy
- Phase 1 lessons learned appended to `CLAUDE.md`
- CHECKLIST.md fully completed

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Credit double-spend across concurrent games | Medium | Critical | Player advisory lock acquired before the game lock, plus a non-negative balance re-read guard inside `create_booking` (Phase 5); asserted by criterion 16 in `e2e/concurrency.spec.ts` (Phase 29) |
| Last-spot double-booking | Medium | Critical | Game advisory lock with an in-transaction capacity count, backed by the partial unique constraint on `(game_id, player_id) where status in (reserved, confirmed)` (Phases 4-5); asserted by criterion 11 |
| PII leak via roster or misconfigured RLS | Medium | High | `game_roster_public` SECURITY DEFINER view projecting only nickname + status; deny-by-default RLS enabled in each creating migration; anon-leak test in `e2e/data.spec.ts` (criterion 10) |
| Definer privilege escalation via search path | Medium | High | `SET search_path=''` plus schema-qualified references in every RPC; verified by code review in Phases 5-7 |
| Cron non-idempotency producing duplicate emails | Medium | Medium | `nudge_sent_at`/`reminder_sent_at` column guards (Phase 20) and the one-event-per-transition invariant (Phase 19); explicit double-run test (criterion 12) |
| SPD/QR string fails in a real Czech banking app | Medium | High | Spec-conformant builder with a nickname sanitizer (strip `*`/control/non-ASCII, cap 60) and unit-tested payload (Phase 12); M2 gate requires a scan in George (Česká spořitelna) on a named device, evidenced by a pre-fill screenshot showing account, amount, and VS |
| `admin_create_booking` drifting from `create_booking`'s concurrency guarantees | Medium | Critical | Both entry points call one shared internal body rather than duplicating capacity/credit/lock logic (Phase 5); the same capacity, credit-non-negativity, and duplicate-booking assertions run against both functions in `supabase/tests/admin_create_booking.sql` |
| Admin surface reachable without a session-verified admin identity | Medium | High | `lib/auth/requireAdmin.ts` ships in Phase 18 with the first admin route rather than in Phase 21, and Phase 21 reuses it at the layout with a grep confirming no second implementation exists; RPC inside-function checks remain the last line of defence, not the only one |
| Lock-order deadlock between concurrent RPCs | Medium | High | Fixed player→game acquisition order in every function that takes both locks, documented in each function header (Phases 5-7) |
| Resend DNS unverified at launch | Medium | Medium | The entire system is built and tested behind the `EMAIL_DRY_RUN` seam; the cutover is a flag flip with no code change (Phase 30) |
| Nickname XSS or SPD injection | Low | High | Safe charset enforced at signup by both an app regex and a DB CHECK, plus escaping/sanitizing at every render site (Phases 3, 8, 12, 13, 15) |
| Shadow-claim mis-bind attaching wrong history | Medium | Medium | Exact-email-match-only auto-claim (Phase 8); email-less shadows claimable only via the Phase 25 admin merge |
| Reserved booking surviving into `settled` | Medium | High | Settle blocked until every unpaid reserved booking is cash-confirmed or no_show/cancelled (Phase 24); asserted by criterion 8 |
| Partial shadow merge stranding credit | Low | High | All FK repoints (bookings, waitlist, ledger, events) executed in one transaction with a rollback test (Phase 25) |
| Service-role key exposure to the client | Low | Critical | Server-only client module, no `NEXT_PUBLIC_` prefix, review gate in Phase 2 |
| Flaky concurrency E2E tests | Medium | Medium | Deterministic parallel-request harness asserting database state rather than request timing (Phase 29) |
| Magic-link auth regression after the SMTP switch | Medium | High | Real-phone magic-link delivery verification immediately after the Phase 30 switch; this path is deliberately bypassed by the E2E seeded-session helper and so has the least automated coverage |
| Design drift from the `index.html` reference | Medium | Low | Theme tokens extracted once in Phase 1 and a dedicated side-by-side conformance pass on real devices in Phase 27 |

---

## Testing Strategy

### Unit Tests
- `lib/payments/spd.ts`: SPD 1.0 string format for known inputs; nickname sanitizer against `*`, control characters, non-ASCII, and >60-char inputs; amount computation as `price_czk − credit_applied_czk`
- `lib/calendar/ics.ts`: event generation with iCalendar-escaped venue location, correct `starts_at`, and the 90-minute default duration
- `lib/format.ts`: fixed UTC timestamps rendered as `Europe/Prague` 24h independent of host timezone, including a DST-boundary input
- `lib/email/sendEmail.ts`: dry-run branch logs and makes zero network calls; missing flag defaults to logging
- `lib/email/dispatch.ts`: each of the eight trigger events resolves to exactly one template and the map contains exactly those eight keys (the ninth ANALYZE §9 email, `magic_link`, is Supabase-delivered and intentionally unmapped); an instant-confirmed booking dispatches only payment-confirmed
- Email templates: venue and nickname HTML-escaped in every template body
- Nickname validator: charset `[A-Za-z0-9 _-]{1,20}` acceptance and rejection cases
- These are pure functions — mock no external services
- Target: 70%+ coverage for all new code

### Integration Tests
- `supabase/tests/booking_create.sql` (Phase 5): concurrent last-spot booking yields exactly one winner; two concurrent credit-funded bookings by one player redeem the wallet at most once with a never-negative ledger; cross-user invocation rejected
- `supabase/tests/booking_cancel.sql` (Phase 6): cancellation window rejection; credit issued for applied money only including cash-paid; `booking_cancelled` + `credit_issued` + `spot_released` all present after one transaction
- `supabase/tests/admin_create_booking.sql` (Phase 5): non-admin rejection; shadow-player booking with `booked_by_admin` set; `booking_created` + `admin_booking_created` both present after one transaction; caller-supplied `credit`/`seed_free` rejected; capacity and credit invariants hold identically to `create_booking`
- `supabase/tests/booking_rpcs_b.sql` (Phase 7): non-admin/non-cron rejection of `confirm_booking`/`expire_booking`; `cancel_game` credits every paid booking and leaves no orphaned waitlist rows, all in one transaction; capacity-below-active-count edit rejected; under-capacity `published → played` reachable
- `supabase/tests/join_waitlist.sql` (Phase 17): row + `waitlist_joined` event in one transaction; duplicate join deduped by the unique constraint; client-supplied id rejected
- `supabase/tests/notify_waitlist.sql` (Phase 19): one `waitlist_notified` event per notified player written in the same transaction as the `notified_at` stamps; non-service-role caller rejected; previously-notified players re-notified
- `supabase/tests/cron_stamps.sql` (Phase 20): `mark_nudged`/`mark_reminder_sent` stamp their column and emit their event in one transaction; non-service-role callers rejected; already-stamped bookings no-op
- `supabase/tests/mark_attendance.sql` (Phase 24): attendance write + `attendance_marked` in one transaction; non-admin rejected; `cancelled`/`expired` bookings rejected
- `supabase/tests/admin_players_rpcs.sql` (Phase 25): `grant_credit` writes ledger row + `credit_issued` (+ `payment_unmatched`) in one transaction and rejects non-admins and balance-negative grants; `merge_players` repoints all four tables atomically and rolls back cleanly mid-merge
- RLS assertions: cross-user read isolation on `players`, `bookings`, `credit_ledger`, `waitlist`; anonymous `game_roster_public` projection contains no `player_id`/`email`/`phone` and returns nothing for `draft` or `cancelled` games; `events` rejects all client access; `credit_ledger` rejects client UPDATE/DELETE
- Migration rollback: each `down` drops objects in reverse dependency order without error
- Cron idempotency: each route run twice back-to-back produces zero additional emails and events
- Shadow merge: post-merge SQL check finds zero rows referencing the merged id, the surviving balance equals the sum of pre-merge balances, and a mid-merge failure rolls back cleanly

### E2E Tests (Playwright)
- `e2e/booking.spec.ts` (Phase 28): book→QR under 60s for an authenticated player (criterion 1); credit auto-apply full and partial (criterion 7)
- `e2e/waitlist.spec.ts` (Phase 28): full-game waitlist join (criterion 2); cancel→credit→release→convert with zero human touches (criterion 5); scarcity nudge → paid or expired → released (criterion 6)
- `e2e/admin.spec.ts` (Phase 28): confirm ≤5s with correct badges (criterion 3); add shadow player ≤10s (criterion 4); attendance→settle with no reserved surviving (criterion 8); WhatsApp preview card and `.ics` (criterion 13)
- `e2e/concurrency.spec.ts` (Phase 29): deterministic parallel-request harness for last-spot single winner (criterion 11) and one-player credit double-spend prevention (criterion 16), asserting database state rather than timing
- `e2e/data.spec.ts` (Phase 29): every catalog action writes its event row (criterion 9); RLS isolation and anon roster projection (criterion 10); cron double-run idempotency (criterion 12); cross-user and non-admin RPC rejection (criterion 15)
- Suite runs against `scripts/seed.ts` fixtures with `EMAIL_DRY_RUN=on`; email criteria assert against dry-run logs
- `e2e/helpers/session.ts` seeds authenticated sessions so magic-link round-trips do not block or destabilize the suite

### Manual / Artifact Verification
- SPD QR scanned in George (Česká spořitelna), app version and device model recorded, pre-fill screenshot showing the correct account, amount, and VS attached to the M2 gate record (M2 gate, Phase 12)
- Game link pasted into WhatsApp renders the preview card; `.ics` opens in a phone calendar (Phase 13)
- PWA install on a real phone home screen shows the correct icon and splash (Phase 27)
- Side-by-side design conformance against `index.html` on a real mobile device (Phases 1 and 27)
- Magic-link and transactional email delivery on real phones after the Phase 30 SMTP cutover
- Real game run end-to-end in parallel with the WhatsApp process (criterion 14, Phase 30)

---

**Format Version:** 2.0
**Status:** Ready for execution
