<!-- Gap fill: No changes needed. Coverage: 100% -->

# Implementation Plan: hrajfotbal.com — Phase 1

## 1. Executive Summary

hrajfotbal.com is a mobile-first booking platform for pickup football games in Prague (single city, single sport). Phase 1 delivers the full player + admin loop: passwordless magic-link auth with durable "shadow" player identity, a booking state machine with transactional capacity control, Czech QR/SPD payments with variable symbols, a credit wallet, a waitlist, cancellation with credit issuance, scheduled cron jobs (nudge / expiry / reminder), a full transactional email suite behind a dry-run seam, and an admin panel with stats. The architecture is deliberately over-provisioned for a future multi-city / multi-sport / marketplace platform: every table carries `city`/`brand`/`policy_version` stamps and every notable action writes to an append-only `events` log so future metrics are SQL queries, not new projects.

**Key deliverables:**
- Supabase Postgres schema (6 tables + 1 view) with RLS deny-by-default on every table and `SECURITY DEFINER` plpgsql RPC functions as the *only* write path for state-bearing tables.
- Next.js (App Router, TS, Tailwind) player surfaces (`/`, `/games`, `/game/[id]`, booking flow, `/account`, `/login`, `/privacy`) and admin surfaces (`/admin/*`).
- Payments: unique numeric VS, SPD 1.0 QR string, credit auto-application, semi-manual one-tap ✓ Paid reconciliation.
- Cron-driven lifecycle (nudge / expiry / reminder), all idempotent, all emails behind a `sendEmail()` dry-run seam.
- Playwright E2E covering all 16 acceptance criteria.

**Success criteria:** All 16 acceptance criteria in ANALYZE §11 pass, verified by Playwright E2E (user-visible paths) and API/SQL assertions (events, ledger, RLS, concurrency).

**Project Size:** L (score: ~34) → Target: 15-25 phases

Scoring inputs (from ANALYZE): features ≈ 20 (§9/§10 capabilities), tables = 6 (players, games, bookings, credit_ledger, waitlist, events), services = 5 (4 SECURITY DEFINER RPCs + sendEmail/QR/ics utility layer), routes = 6 groups (auth callback, cron, admin actions, booking actions, roster read, stats), pages ≈ 9, components ≈ 8. `score = 20 + 6×0.5 + 5×0.5 + 6×0.3 + 9×0.5 + 8×0.3 = 34.2` → L band (21-35). 22 phases sit inside the 15-25 target.

### Phase Overview

| Phase | Name | Files (M/C) | Est. Hours | Depends On |
|-------|------|-------------|------------|------------|
| 1 | Project scaffold + config seams + sendEmail dry-run | 0/8 | 2.5h | - |
| 2 | DB migration 1: players, games, events + RLS | 0/2 | 2.0h | Phase 1 |
| 3 | DB migration 2: bookings, credit_ledger, waitlist, VS seq, roster view + RLS | 0/2 | 2.5h | Phase 2 |
| 4 | Booking RPCs A: `create_booking` + `cancel_booking` | 0/2 | 3.5h | Phase 3 |
| 5 | Booking RPCs B: `confirm_booking` + `expire_booking` + game transitions | 0/2 | 2.5h | Phase 3 |
| 6 | Auth: magic link + shadow claim + `/login` | 2/5 | 3.0h | Phase 2 |
| 7 | Seed / fixture script v1 + concurrency tests (criteria 11, 16) | 0/3 | 3.0h | Phase 4, 5 |
| **🚦 GATE M1** | **Human verification — spec §10 M1 (Schema + auth); do not proceed without confirmation** | — | — | Phase 7 |
| 8 | Games list + detail + live counter + public roster | 1/5 | 3.0h | Phase 3, 6 |
| 9 | Booking flow UI + `create_booking` wiring + credit auto-apply | 2/5 | 3.0h | Phase 4, 8 |
| 10 | QR/SPD render + `.ics` + Open Graph tags + confirmation | 1/6 | 3.0h | Phase 9 |
| 11 | Account page: my bookings, credit, self-cancel, deletion mailto | 1/4 | 2.5h | Phase 4, 6 |
| **🚦 GATE M2** | **Human verification — spec §10 M2 (Games + booking); do not proceed without confirmation** | — | — | Phase 11 |
| 12 | Transactional email templates + event wiring | 2/5 | 3.0h | Phase 1, 4, 5 |
| 13 | Waitlist join + conversion | 2/4 | 2.5h | Phase 4, 8 |
| 14 | Game cancellation flow (admin) + credit fan-out | 2/2 | 2.0h | Phase 5, 12 |
| 15 | Cron jobs: nudge, expiry, reminder (idempotent) | 1/5 | 3.0h | Phase 5, 12, 13 |
| **🚦 GATE M3** | **Human verification — spec §10 M3 (Waitlist + cancellation + cron); do not proceed without confirmation** | — | — | Phase 15 |
| 16 | Admin gating + games CRUD (create/edit/publish/cancel) | 1/6 | 3.0h | Phase 5, 6 |
| 17 | Admin payments (confirm, roster badges) + add shadow player | 1/5 | 3.0h | Phase 5, 16 |
| 18 | Admin attendance/settle + credit grants + shadow merge | 1/6 | 3.5h | Phase 5, 16 |
| 19 | Admin stats page (`/admin/stats`) | 0/3 | 2.5h | Phase 16 |
| **🚦 GATE M4** | **Human verification — spec §10 M4 (Admin panel); do not proceed without confirmation** | — | — | Phase 19 |
| 20 | PWA basics + design/strings/privacy polish | 3/5 | 2.5h | Phase 10, 11 |
| 21 | E2E Playwright suite (remaining 14 criteria) | 1/6 | 3.5h | Phase 15, 18 |
| 22 | Dry-run cutover: SMTP→Resend, `EMAIL_DRY_RUN=off`, acceptance | 3/1 | 1.5h | Phase 21 |
| **🚦 GATE M5** | **Human verification — spec §10 M5 (Polish + dry run); full §11 acceptance checklist; do not proceed without confirmation** | — | — | Phase 22 |

This table is the plan's spine. All 22 phases validate against the hard constraints (≤4h, ≤8 files, 1-3 milestones, independently testable). Dependencies are acyclic and reference earlier phases only.

## 2. Impact Analysis

This is a **greenfield** project: the repo (`/Users/oliverstaehelin/dev/hrajfotbalek`) currently contains only `index.html` (the volt-on-black design reference to match) and the spec. Essentially everything is a *create*; the sole "modify" surface is the design reference, translated into the app's landing page and Tailwind theme.

### 2.1 Files to Modify

| File Path | Type of Change | Impact Level |
|-----------|----------------|--------------|
| `index.html` | Reference only — port markup/styling into `app/page.tsx` + `tailwind.config` theme (not edited in place) | Low |
| `app/globals.css` | Extend with volt-on-black theme tokens (recreated per phase) | Med |
| `app/page.tsx` | Landing: replace hardcoded next-game counter with live block | Med |

### 2.2 Files to Create

| File Path | Purpose |
|-----------|---------|
| `supabase/migrations/*.sql` | Schema, RLS, RPC functions, VS sequence, roster view |
| `lib/strings.ts` | Centralized English UI strings (no hardcoded strings elsewhere) |
| `lib/policy.ts` | Versioned policy config constants (`policy_version = 'v1'`) |
| `lib/email/sendEmail.ts` | Single email seam with `EMAIL_DRY_RUN` flag |
| `lib/supabase/*` | Server + browser Supabase clients, service-role client |
| `lib/format.ts` | `Europe/Prague` 24h datetime formatting |
| `lib/payments/spd.ts` | SPD 1.0 QR string builder + MSG sanitizer |
| `lib/calendar/ics.ts` | `.ics` generator |
| `app/**` | Player + admin pages and route handlers |
| `app/api/cron/*` | Nudge / expiry / reminder cron routes |
| `scripts/seed.ts` | Fixture/seed script |
| `e2e/*.spec.ts` | Playwright tests |

### 2.3 Breaking Changes

None — greenfield. Internal contract to preserve across phases: **no state-bearing table is ever written from TypeScript directly**; all transitions go through the `SECURITY DEFINER` RPCs via `supabase.rpc()`. Any code introducing a direct `insert`/`update` on `bookings`/`credit_ledger`/`waitlist`/`events`/`games.status` is a regression.

### 2.4 Dependency Verification

- [x] Backend (RPC + RLS) exists before any frontend that mutates state (Phases 4-5 precede 9-18).
- [x] Frontend for every backend capability (booking, waitlist, cancel, admin confirm/attendance/credit all have UI).
- [x] Migrations for all schema changes (Phases 2-5 are migration-only).
- [x] Tests: unit/inline per phase; full Playwright suite in Phase 21 covering all 16 criteria.
- [x] Documentation: `CLAUDE.md` lessons-learned appended per ANALYZE §13; privacy DRAFT copy in Phase 20.

## 3. Architecture Design

**Stack:** Next.js App Router (TypeScript, Tailwind) on Vercel (`main` = production) · Supabase Postgres + magic-link auth + RLS · Resend for transactional email (behind dry-run) · Vercel Cron → authenticated API routes.

**The central invariant — the database is the state authority:**

```
 Browser (player JWT)                    Server (service-role, cron/admin)
        |                                          |
        | supabase.rpc('create_booking', ...)      | supabase.rpc('confirm_booking'|'expire_booking')
        v                                          v
 +-----------------------------------------------------------------+
 |  SECURITY DEFINER plpgsql functions  (search_path='')           |
 |  create_booking / cancel_booking (owner-only, auth.uid())       |
 |  confirm_booking / expire_booking (admin-or-cron only)          |
 |  --- one transaction each: lock -> state check -> write -> event|
 +-----------------------------------------------------------------+
        |                 |                |                |
        v                 v                v                v
   bookings          credit_ledger      waitlist          events
   (RLS: own)        (append-only)      (RLS: own)     (no client access)
        ^
        |  game_roster_public (SECURITY DEFINER view: nickname + status only)
   anon read
```

**Concurrency model (ANALYZE §3):** `create_booking` takes transaction-scoped advisory locks in fixed order — **player lock first** (`pg_advisory_xact_lock(hashtextextended(player_id::text,0))`, serializes wallet redemption across games), **then game lock** (serializes capacity). Under the game lock it counts active bookings and inserts only if `count < capacity`; a defensive unique constraint on `(game_id, player_id) where status in (reserved,confirmed)` is the backstop. Under the player lock it re-reads `SUM(delta_czk)`, applies `min(balance, price)`, and writes the negative redemption row only if the resulting balance stays ≥ 0.

**Email seam (ANALYZE §2):** all transactional mail flows through `sendEmail()`; `EMAIL_DRY_RUN=on` logs instead of sending, so the whole system is buildable/testable before Resend DNS verifies. The Supabase magic-link email is **outside** this seam until M5 (Phase 22).

**Data-flow — booking a spot:** player taps Book on `/game/[id]` → (if unauth) magic link with `redirectTo` carrying game id + pending action → after `auth_completed` the app resumes the action → `create_booking` runs under the authenticated session → returns booking with VS → QR screen renders SPD string → `booking_created` event + "spot held" email queued. No pre-auth soft holds — the booking exists only when `create_booking` runs.

**Technology decisions:**
- **plpgsql RPCs over app-layer transactions** — the "same transaction" guarantee for state+event+ledger only holds inside the DB; app-assembled multi-query transitions cannot be trusted under concurrency.
- **Advisory locks over `SELECT ... FOR UPDATE`** — capacity/wallet are cross-row invariants (counts, sums), not single-row locks; advisory locks on hashed UUIDs give explicit, deadlock-ordered serialization.
- **Config-as-values policies** (`lib/policy.ts`, `policy_version='v1'`) — cancellation/nudge/expiry/reminder windows are data, not branches, so v2 is a config bump.
- **Centralized strings module** — enables CZ/RU later with zero UI churn; Phase 1 ships English values only.

## 4. Implementation Phases

### Implementation Order Principle

```
1. Contracts & Interfaces (strings, policy config, TS types, SPD/ics utils)
2. Database Models & Migrations (tables + RLS, then RPC functions)
3. Business Logic (RPCs) tested against interfaces
4. Backend Implementation (auth, cron, admin route handlers)
5. Frontend Implementation (player + admin surfaces)
6. Integration & E2E Tests (Playwright, all 16 criteria)
```

Phases below are ordered by the dependency graph in §1 and grouped by the spec §10 milestone gates: M1 schema + auth + fixtures/concurrency (Phases 1-7), M2 games + booking (8-11), M3 waitlist + cancellation + cron (12-15), M4 admin (16-19), M5 polish + dry-run (20-22). Each milestone ends in a human-verification gate (see the Phase Overview table and the STOP markers after Phases 7, 11, 15, 19, 22). Milestone detail is added per phase in the next generation step.

---

## Phase 1: Project scaffold + config seams + sendEmail dry-run

### Overview
Stand up the Next.js App Router project (TypeScript, Tailwind, volt-on-black theme tokens) and create the non-negotiable cross-cutting seams that every later phase depends on: the centralized English strings module, the versioned policy config, the `Europe/Prague` datetime formatter, the Supabase client factories (browser/server/service-role), and the `sendEmail()` module gated by `EMAIL_DRY_RUN`. This phase writes no business logic — it establishes the conventions (§2) so no later phase hardcodes a UI string, a policy window, a raw UTC render, or an unseamed email. It is the foundation the whole plan builds on.

### Prerequisites
- [ ] Supabase project provisioned (URL + anon + service-role keys available as env)
- [ ] Resend account created (API key; DNS may still be unverified — dry-run covers this)

### Deliverables
- [ ] Runnable Next.js app (`npm run dev` passes) with Tailwind volt-on-black theme
- [ ] `lib/strings.ts`, `lib/policy.ts`, `lib/format.ts`, `lib/supabase/*`, `lib/email/sendEmail.ts`, `.env.example`

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Service-role key leaks under `NEXT_PUBLIC_` | Low | High | Server-only client module; lint rule / review that no service-role env is `NEXT_PUBLIC_` |
| Design reference drift from `index.html` | Med | Med | Extract exact theme tokens (colors, fonts) into `tailwind.config` in this phase |

### Milestone 1.1: Project scaffold + volt-on-black theme

**What:** Stand up the Next.js App Router (TypeScript, Tailwind) project and port the `index.html` design reference into the landing page and Tailwind theme tokens. This gives every later phase a runnable app shell and the exact volt-on-black colors/fonts to build against, so no phase reinvents styling.

**Files:** `app/page.tsx` (C), `app/globals.css` (C), `tailwind.config.ts` (C)

**Size:** M - App Router scaffold plus faithful theme extraction across three coupled files.

**Steps:**
1. Initialize the Next.js App Router project (TypeScript, Tailwind, ESLint) and confirm `npm run dev` serves a page.
2. Extract the exact color, font, and spacing tokens from `/Users/oliverstaehelin/dev/hrajfotbalek/index.html` into `tailwind.config.ts`.
3. Recreate the volt-on-black base layer (background, text, accent) in `app/globals.css` from the reference tokens.
4. Port the landing markup into `app/page.tsx`, leaving a placeholder slot for the live next-game block wired in Phase 8.
5. Add a review note that no service-role env may be exposed under `NEXT_PUBLIC_`.

**Done when:**
- [ ] `npm run dev` serves the landing page matching the `index.html` volt-on-black reference on a mobile viewport
- [ ] Theme tokens (colors/fonts) resolve from `tailwind.config.ts`, not inline hex values
- [ ] Build passes, tests pass, committed

### Milestone 1.2: Cross-cutting config seams (strings, policy, format, clients, email)

**What:** Create the five non-negotiable seams every later phase depends on: centralized English strings, versioned policy constants, the `Europe/Prague` 24h formatter, Supabase client factories (browser/server/service-role), and the `sendEmail()` module gated by `EMAIL_DRY_RUN`. These establish the §2 conventions so no phase hardcodes a string, policy window, raw UTC render, or unseamed email.

**Files:** `lib/strings.ts` (C), `lib/policy.ts` (C), `lib/format.ts` (C), `lib/supabase/clients.ts` (C), `lib/email/sendEmail.ts` (C)

**Size:** M - Five small foundational modules plus the `.env.example` contract.

**Steps:**
1. Create `lib/strings.ts` with English-valued keys for the surfaces built in Phases 6-11 (no hardcoded UI strings elsewhere).
2. Create `lib/policy.ts` with named `policy_version='v1'` constants for cancellation, nudge (12h), expiry, and reminder (24h) windows per Section 5 policy notes.
3. Create `lib/format.ts` formatting `timestamptz` to `Europe/Prague` 24-hour display (e.g. "Thu 18:30"), never raw UTC.
4. Create `lib/supabase/clients.ts` exposing browser (anon), server (session), and service-role factories, keeping the service-role key server-only.
5. Create `lib/email/sendEmail.ts` as the single email seam that logs instead of sends when `EMAIL_DRY_RUN` is on.
6. Add `.env.example` documenting Supabase, Resend, `PAYMENT_IBAN`, `EMAIL_DRY_RUN`, and `CRON_SECRET` variables.

**Done when:**
- [ ] `sendEmail()` logs (does not send) with `EMAIL_DRY_RUN=on` and no service-role key is referenced client-side
- [ ] `lib/format.ts` renders a UTC timestamp as `Europe/Prague` 24h in a unit check
- [ ] Build passes, tests pass, committed

### Phase 1 Execution Summary

**Goal:** Establish a runnable themed app shell and the cross-cutting config/email/client seams every later phase builds on.

**Key Deliverables:**
- Runnable Next.js app with volt-on-black Tailwind theme matching `index.html`
- `lib/strings.ts`, `lib/policy.ts`, `lib/format.ts`, `lib/supabase/clients.ts`, `lib/email/sendEmail.ts`, `.env.example`

**Estimated Duration:** 2.5h

### Phase 1 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 1.1 - Project scaffold + volt-on-black theme | Pending | - |
| 1.2 - Cross-cutting config seams | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 2: DB migration 1 — players, games, events + RLS

### Overview
Create the first migration establishing the identity and event-log spine: `players` (with the shadow-player nullable `auth_user_id`/`email` and the safe-charset nickname), `games` (with the status column and `city`/`brand` stamps), and the append-only `events` catalog table. RLS is enabled deny-by-default in the same migration per §8: players read/update only their own row, published games are anon-readable, events have no client access. This phase creates no functions — it is pure schema so the RPC and auth phases have tables to target.

### Prerequisites
- [ ] Phase 1 completed (Supabase clients + migration tooling wired)

### Deliverables
- [ ] Migration creating `players`, `games`, `events` with columns per §3, RLS policies, and explicit `anon`/`authenticated` GRANTs where the spec permits reads (§5.4)
- [ ] Generated/updated TypeScript DB types

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| RLS too permissive on `players` (PII leak) | Med | High | Deny-by-default; policy scoped to `auth_user_id = auth.uid()`; assert in Phase 6/21 |
| Nickname charset not enforced at DB | Low | Med | CHECK constraint mirrors the app-layer regex (§3) |
| Missing GRANT → anon/authenticated reads return empty (auto-expose off), or over-broad GRANT leaks data | Med | Med | Explicit GRANTs scoped to spec-permitted reads, no wider than the RLS policy (§5.4); assert grant-present + isolation |

### Milestone 2.1: Migration 1 — players, games, events + RLS

**What:** Create the first migration establishing the identity and event-log spine — `players`, `games`, and `events` — with RLS enabled deny-by-default in the same migration. This gives the auth and RPC phases their target tables and locks in the PII isolation and anon-read boundaries before any function is written.

**Files:** `supabase/migrations/<ts>_players_games_events.sql` (C), `lib/types/database.ts` (C)

**Size:** M - Three tables with constraints and multiple RLS policies plus generated types.

**Steps:**
1. Create `players` per Section 5.1 with the nickname CHECK mirroring `[A-Za-z0-9 _-]{1,20}`, nullable `email`/`auth_user_id`, and the unique constraints in Section 5.3.
2. Create `games` per Section 5.1 with the status enum (draft/published/full/played/settled/cancelled) and `city`/`brand` defaults.
3. Create `events` per Section 5.1 with the `event_type` text, nullable FKs, `metadata` jsonb, and `policy_version`/`playbook_version` stamps.
4. Enable RLS in the same migration: players read/update own row via `auth_user_id = auth.uid()`, published games anon-readable, events no client access.
5. Add explicit `GRANT`s (auto-expose is off, so RLS policies alone return nothing): `GRANT SELECT` on published-readable `games` to `anon`; `GRANT SELECT, UPDATE` on own-row `players` to `authenticated`; **no** grant on `events`. Keep GRANT scope no wider than the RLS policy.
6. Add the `(event_type, created_at)` index and write the reverse-order `down`.
7. Generate `lib/types/database.ts` from the migrated schema.

**Done when:**
- [ ] Migration applies cleanly and its `down` drops all three tables in reverse dependency order
- [ ] RLS asserts: a non-owner session cannot read another player's row; events reject all client access
- [ ] GRANT asserts: `anon` can actually read a published game (proving the grant is present, not just the policy); `events` returns nothing to any client role
- [ ] Build passes, tests pass, committed

### Phase 2 Execution Summary

**Goal:** Ship the players/games/events schema with deny-by-default RLS as the identity and event-log spine.

**Key Deliverables:**
- Migration creating `players`, `games`, `events` with columns per §3 and RLS policies
- Generated `lib/types/database.ts`

**Estimated Duration:** 2.0h

### Phase 2 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 2.1 - Migration 1: players, games, events + RLS | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 3: DB migration 2 — bookings, credit_ledger, waitlist, VS seq, roster view + RLS

### Overview
Create the transactional core: `bookings` (full column set incl. `payment_code`, `credit_applied_czk`, `nudge_sent_at`, `expires_at`, `attendance`), the append-only `credit_ledger`, `waitlist` (unique on `(game_id, player_id)`), the VS Postgres sequence, and the `game_roster_public` `SECURITY DEFINER` view that projects only `nickname` + booking `status`. RLS is deny-by-default in the same migration: users read only their own booking/ledger/waitlist rows; the roster view is the sole anonymous read path and leaks no PII. This completes the schema before any RPC is written.

### Prerequisites
- [ ] Phase 2 completed (players, games exist for FKs)

### Deliverables
- [ ] Migration creating `bookings`, `credit_ledger`, `waitlist`, VS sequence, `game_roster_public` view + RLS + explicit GRANTs (anon SELECT on the view; authenticated SELECT on own-row tables, §5.4) + append-only enforcement
- [ ] Defensive unique constraint on `(game_id, player_id) where status in (reserved, confirmed)`

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Roster view leaks `player_id`/`email`/`phone` | Med | High | View selects only nickname+status; anon-leak test in Phase 21 (criterion 10) |
| `credit_ledger` mutable via client | Low | High | Revoke UPDATE/DELETE privileges; RLS append-only |

### Milestone 3.1: Migration 2 — bookings, credit_ledger, waitlist, VS seq, roster view + RLS

**What:** Create the transactional core schema — `bookings`, append-only `credit_ledger`, `waitlist`, the VS sequence, and the `game_roster_public` SECURITY DEFINER view — with deny-by-default RLS in the same migration. This completes the schema so the Phase 4/5 RPCs have every table, constraint, and sequence to target, and establishes the only PII-safe anonymous roster path.

**Files:** `supabase/migrations/<ts>_bookings_ledger_waitlist.sql` (C), `lib/types/database.ts` (C)

**Size:** M - Three tables, a sequence, a SECURITY DEFINER view, partial unique constraints, and append-only privileges.

**Steps:**
1. Create `bookings` per Section 5.1 with the full column set and the Section 5.3 indexes: the partial unique `(game_id, player_id) where status in (reserved,confirmed)`, `(status, expires_at)`, and the VS pending index.
2. Create the VS Postgres sequence (`26` prefix + 8-digit zero-pad) per Section 4, never reused.
3. Create `credit_ledger` per Section 5.1 and revoke UPDATE/DELETE to enforce append-only.
4. Create `waitlist` per Section 5.1 with unique `(game_id, player_id)`.
5. Create `game_roster_public` as a SECURITY DEFINER view projecting only `game_id`, `nickname`, and booking `status` per Section 5.1, and `GRANT SELECT` on it to `anon` (auto-expose is off — without the grant the view is unreadable).
6. Enable RLS in the same migration (own-row reads for bookings/ledger/waitlist) and add explicit `GRANT SELECT` on those three tables to `authenticated`; add no client grant on the base tables beyond what the own-row policies permit, and keep `credit_ledger` UPDATE/DELETE revoked. Write the reverse-order `down`.
7. Regenerate `lib/types/database.ts`.

**Done when:**
- [ ] Migration applies; `credit_ledger` rejects client UPDATE/DELETE
- [ ] Anon read of `game_roster_public` returns nickname+status only — never `player_id`/`email`/`phone` (and the anon SELECT grant makes the view actually readable, not empty)
- [ ] `authenticated` can read its own `bookings`/`credit_ledger`/`waitlist` rows via the grant + own-row policy; another player's rows return nothing
- [ ] Build passes, tests pass, committed

### Phase 3 Execution Summary

**Goal:** Ship the transactional-core schema (bookings/ledger/waitlist/VS/roster view) with RLS and append-only enforcement.

**Key Deliverables:**
- Migration creating `bookings`, `credit_ledger`, `waitlist`, VS sequence, `game_roster_public` view + RLS
- Defensive partial unique constraint on `(game_id, player_id) where status in (reserved, confirmed)`

**Estimated Duration:** 2.5h

### Phase 3 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 3.1 - Migration 2: bookings, ledger, waitlist, VS seq, roster view + RLS | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 4: Booking RPCs A — `create_booking` + `cancel_booking`

### Overview
Implement the two owner-only state-transition functions as `SECURITY DEFINER` plpgsql with hardened `search_path=''`, identity derived from `auth.uid()` (never client-supplied ids). `create_booking` acquires player-then-game advisory locks, enforces capacity under the game lock, auto-applies wallet credit under the player lock (rejecting any redemption that would go negative), handles the `from_waitlist_id` conversion, and writes `booking_created` (+`payment_confirmed` for instant-confirm) in one transaction. `cancel_booking` enforces the §5 window (game published/full AND before `starts_at`), issues cancellation credit for money applied, and fires `spot_released`. This is the highest-risk phase — concurrency correctness lives here.

### Prerequisites
- [ ] Phase 3 completed (all target tables, sequence, constraints exist)

### Deliverables
- [ ] Migration defining `create_booking` and `cancel_booking` with locking, credit logic, and same-transaction event writes
- [ ] Inline SQL assertions (or test script) proving capacity + credit invariants

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Lock-order deadlock | Med | High | Fixed order player→game everywhere; documented in function header |
| Double-spend of credit across concurrent games | Med | High | Player advisory lock + non-negative re-read guard (criterion 16) |
| Cross-user booking via forged id | Med | High | Owner check from `auth.uid()`; reject mismatch (criterion 15) |

### Milestone 4.1: `create_booking` — capacity + credit under advisory locks

**What:** Implement the owner-only `create_booking` SECURITY DEFINER function with hardened `search_path=''`, identity from `auth.uid()`, player-then-game advisory lock ordering, transactional capacity enforcement, wallet credit auto-application, and `from_waitlist_id` conversion — all writing `booking_created` (plus `payment_confirmed` for instant-confirm) in one transaction. This is the concurrency-critical heart of the system where double-booking and credit double-spend are prevented.

**Files:** `supabase/migrations/<ts>_booking_rpcs_a.sql` (C)

**Size:** L - Dual advisory locks, cross-row capacity and non-negative-balance invariants, credit redemption, waitlist conversion, and same-transaction event writes.

**Steps:**
1. Define `create_booking` per the Section 6.2 contract with `SET search_path=''`, schema-qualifying every reference, deriving the player from `auth.uid()` and rejecting client-supplied ids.
2. Acquire `pg_advisory_xact_lock(hashtextextended(player_id::text,0))` then the game-id lock in that fixed order per the Section 3 concurrency rule.
3. Under the game lock, count active (reserved+confirmed) bookings and insert only if count < capacity, backed by the partial unique constraint.
4. Under the player lock, re-read `SUM(delta_czk)`, apply `min(balance, price)`, and write the negative redemption row only if the resulting balance stays ≥ 0, else raise CREDIT_NEGATIVE_BLOCKED (Section 6.3).
5. Allocate the VS from the sequence for QR bookings; confirm instantly with no VS on full-credit or seed per Section 4.
6. Handle `from_waitlist_id`: set `converted_booking_id` and emit `waitlist_converted` in the same transaction.
7. Write `booking_created` (and `payment_confirmed` for instant-confirm), mapping friendly CAPACITY_FULL / DUPLICATE_ACTIVE_BOOKING errors per Section 6.3.

**Done when:**
- [ ] Concurrent bookings of the last spot yield exactly one winner (SQL assertion)
- [ ] Two concurrent credit-funded bookings by one player for different games redeem the wallet at most once and the ledger never goes negative
- [ ] A call passing another player's id is rejected inside the function
- [ ] Build passes, tests pass, committed

### Milestone 4.2: `cancel_booking` — window enforcement + credit issuance

**What:** Implement the owner-only `cancel_booking` SECURITY DEFINER function that enforces the Section 5 cancellation window (game `published`/`full` AND `now() < starts_at`), issues full wallet credit for any money actually applied, records `cancel_lead_hours`, and fires `spot_released` when it frees capacity in a non-cancelled game. This closes the player-side cancel path with the same transactional and identity guarantees as booking, and adds the SQL assertions proving the Phase 4 invariants.

**Files:** `supabase/migrations/<ts>_booking_rpcs_a.sql` (C), `supabase/tests/booking_rpcs_a.sql` (C)

**Size:** L - Window gating, conditional credit issuance across payment methods, spot-release logic, and the capacity/credit concurrency assertions.

**Steps:**
1. Define `cancel_booking` per the Section 6.2 contract with `search_path=''`, owner resolved from `auth.uid()`, rejecting non-owned bookings with INSUFFICIENT_PERMISSION.
2. Reject with CANCEL_WINDOW_CLOSED unless the game is `published`/`full` and `now() < starts_at` per Section 3/5.
3. Transition reserved/confirmed → cancelled and record `cancel_lead_hours` at cancel time.
4. Issue `cancellation_credit` for QR-paid/cash-paid/credit-applied amounts (none when no money was applied) and emit `booking_cancelled` + `credit_issued` in the same transaction.
5. Emit `spot_released` when the cancellation frees capacity in a non-cancelled game.
6. Write `supabase/tests/booking_rpcs_a.sql` asserting last-spot single-winner, no-negative-balance double-spend, cross-user rejection, and window rejection.

**Done when:**
- [ ] Cancel after `starts_at` (or wrong status) is rejected; cancel within window issues credit equal to money applied
- [ ] `booking_cancelled`, `credit_issued` (where applicable), and `spot_released` rows appear in the same transaction
- [ ] The assertion script passes for capacity, credit non-negativity, and authorization
- [ ] Build passes, tests pass, committed

### Phase 4 Execution Summary

**Goal:** Deliver the owner-only `create_booking`/`cancel_booking` RPCs with correct concurrency, credit, and window behavior.

**Key Deliverables:**
- Migration defining `create_booking` and `cancel_booking` with locking, credit logic, and same-transaction events
- Assertion script proving capacity, credit-non-negativity, and authorization invariants

**Estimated Duration:** 3.5h

### Phase 4 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 4.1 - `create_booking`: capacity + credit under advisory locks | Pending | - |
| 4.2 - `cancel_booking`: window enforcement + credit issuance | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 5: Booking RPCs B — `confirm_booking` + `expire_booking` + game transitions

### Overview
Implement the admin-or-cron-only functions and the game state-machine helpers. `confirm_booking(bookingId, confirmedBy)` (the single automation seam — indifferent to human vs future bank poller) moves `reserved → confirmed` and writes `payment_confirmed`. `expire_booking` (cron) moves lapsed `reserved → expired`, releasing the spot. Game transitions cover `publish` (draft→published, `game_published`), `settle`/mark-played, and `cancel_game` (bulk-cancel active bookings, credit applied money, clear waitlist, emit `game_cancelled`). All enforce admin/cron authorization inside the function; game-full/published toggles are driven automatically by capacity changes.

### Prerequisites
- [ ] Phase 3 completed

### Deliverables
- [ ] Migration defining `confirm_booking`, `expire_booking`, and game-state RPC(s) with authorization + event writes
- [ ] Capacity-driven `full ⇄ published` transition logic

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Non-admin invokes confirm/expire | Med | High | `auth.uid()`→admin check or service-role context (criterion 15) |
| Game cancel leaves orphaned waitlist/credits | Med | Med | Single-transaction fan-out; assert ledger + waitlist cleared |

### Milestone 5.1: `confirm_booking` + `expire_booking` (admin-or-cron)

**What:** Implement the two admin-or-cron-only SECURITY DEFINER functions. `confirm_booking(booking_id, confirmed_by)` — the single automation seam, indifferent to human vs future bank poller — moves `reserved → confirmed` and writes `payment_confirmed`; `expire_booking` moves lapsed `reserved → expired` and releases the spot. Both enforce admin/service-role authorization inside the function per Section 3.

**Files:** `supabase/migrations/<ts>_booking_rpcs_b.sql` (C)

**Size:** M - Two functions with authorization checks, state transitions, and same-transaction event writes.

**Steps:**
1. Define `confirm_booking` per the Section 6.2 contract with `search_path=''`, permitting only an admin `auth.uid()` or service-role context, else INSUFFICIENT_PERMISSION.
2. Transition `reserved → confirmed` and emit `payment_confirmed` in the same transaction.
3. Define `expire_booking` per the Section 6.2 contract, cron/service-role only, transitioning `reserved → expired` and emitting `booking_expired` + `spot_released`.
4. Reject any transition not present in the Section 3 booking state table.
5. Reference the credit-in-full-on-late-payment reconciliation policy (Section 4) so an expired booking is never reinstated.

**Done when:**
- [ ] A non-admin/non-cron caller is rejected by both functions
- [ ] `confirm_booking` writes `payment_confirmed`; `expire_booking` writes `booking_expired` + `spot_released`, each in one transaction
- [ ] Build passes, tests pass, committed

### Milestone 5.2: Game transitions — publish / settle / cancel_game

**What:** Implement the game state-machine RPCs and the capacity-driven `full ⇄ published` toggles. `publish` performs draft→published (`game_published`); settle/mark-played move a game toward `settled`; `cancel_game` bulk-cancels active bookings, credits applied money, clears the waitlist, and emits `game_cancelled` — all admin-only and transactional.

**Files:** `supabase/migrations/<ts>_booking_rpcs_b.sql` (C), `supabase/tests/booking_rpcs_b.sql` (C)

**Size:** M - Multiple transitions plus a transactional cancel fan-out and capacity-driven status toggles.

**Steps:**
1. Define the `publish` transition (draft→published) emitting `game_published`, admin-only per Section 3.
2. Drive `published ⇄ full` automatically from active-booking count vs capacity.
3. Define settle/mark-played per Section 3 (played reachable from published or full; then settled).
4. Define `cancel_game`: cancel all active bookings, issue `cancellation_credit` for applied money, clear waitlist, emit `game_cancelled` in one transaction.
5. Enforce the Section 3 edit rule that capacity can never drop below the active-booking count.
6. Write `supabase/tests/booking_rpcs_b.sql` asserting cancel_game leaves no orphaned waitlist rows and credits every paid booking.

**Done when:**
- [ ] `publish`, settle, and `cancel_game` enforce admin authorization and emit their events
- [ ] `cancel_game` credits all applied money and clears the waitlist in one transaction (assertion)
- [ ] Build passes, tests pass, committed

### Phase 5 Execution Summary

**Goal:** Deliver the admin-or-cron `confirm_booking`/`expire_booking` RPCs and the game-state transitions with capacity-driven toggles.

**Key Deliverables:**
- Migration defining `confirm_booking`, `expire_booking`, and game-state RPCs with authorization + event writes
- Capacity-driven `full ⇄ published` logic and `cancel_game` fan-out with assertions

**Estimated Duration:** 2.5h

### Phase 5 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 5.1 - `confirm_booking` + `expire_booking` (admin-or-cron) | Pending | - |
| 5.2 - Game transitions: publish / settle / cancel_game | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 6: Auth — magic link + shadow claim + `/login`

### Overview
Wire Supabase passwordless magic-link auth end-to-end: `/login` page, the auth callback route, session helpers/middleware, and the shadow-claim logic that links `auth_user_id` to an existing shadow `players` row on **exact email match** (emitting `player_claimed`, never duplicating). Signup captures the GDPR consent (required) + marketing opt-in (optional) and validates the nickname charset. Emit `account_created`, `auth_link_sent`, `auth_completed` events (the drop-off funnel). The magic-link `redirectTo` carries the target game id + pending action for deep-link resume. Auth email stays on Supabase's built-in sender (outside the dry-run seam) until M5.

### Prerequisites
- [ ] Phase 2 completed (players + events tables)

### Deliverables
- [ ] `/login` page, auth callback route, session middleware
- [ ] Shadow-claim on exact email match + signup validation + auth event writes

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Auto-claim mis-binds wrong player | Med | High | Exact-email-only; no-email shadows claimable via admin merge only (§8) |
| Session not verified server-side on protected routes | Med | High | Server-side session check in middleware, not hidden nav |

### Milestone 6.1: Magic-link login + server session

**What:** Wire the login half of Supabase passwordless auth: the `/login` page and its server action that requests the magic link (emitting `auth_link_sent`) with `redirectTo` carrying the target game id + pending action for Phase 9 deep-link resume, plus server-side session helpers/middleware so protected routes verify identity server-side rather than by hidden nav. The auth email stays on Supabase's built-in sender, outside the `sendEmail()`/dry-run seam, until M5.

**Files:** `app/login/page.tsx` (C), `app/login/actions.ts` (C), `lib/auth/session.ts` (C), `app/layout.tsx` (M)

**Size:** M - Login UI, link-request action with event, and session middleware across four files.

**Steps:**
1. Build `/login` (`app/login/page.tsx`) using `lib/strings.ts` copy with a magic-link request form.
2. Implement `app/login/actions.ts` to request the Supabase magic link with `redirectTo` carrying game id + pending action, and emit `auth_link_sent`.
3. Implement `lib/auth/session.ts` server helpers to read and verify the session for gating protected routes.
4. Wrap `app/layout.tsx` with the session context and enforce server-side verification.
5. Confirm the auth email is not routed through `sendEmail()` and is unaffected by `EMAIL_DRY_RUN`.

**Done when:**
- [ ] Requesting a link emits `auth_link_sent` with the game id + pending action in `redirectTo`
- [ ] A protected route rejects an unauthenticated session server-side (not just hidden nav)
- [ ] Build passes, tests pass, committed

### Milestone 6.2: Shadow claim + signup validation + auth events

**What:** Implement the `/auth/callback` route that completes the session (emitting `auth_completed`) and the shadow-claim logic that links `auth_user_id` to an existing shadow `players` row on exact email match (emitting `player_claimed`, never duplicating). Signup captures required GDPR consent + optional marketing opt-in and validates the nickname charset, emitting `account_created`.

**Files:** `app/auth/callback/route.ts` (C), `lib/auth/shadowClaim.ts` (C), `lib/strings.ts` (M)

**Size:** M - Callback handling, exact-match claim, signup validation, and three auth events.

**Steps:**
1. Implement `app/auth/callback/route.ts` to exchange the code, establish the session, and emit `auth_completed`.
2. Implement `lib/auth/shadowClaim.ts` to link `auth_user_id` to a shadow player only on exact email match, emitting `player_claimed` and never creating a duplicate.
3. On first-time signup, validate the nickname against `[A-Za-z0-9 _-]{1,20}` with a friendly inline error (NICKNAME_INVALID) and a taken-name message.
4. Capture required GDPR consent and optional marketing opt-in, then emit `account_created`.
5. Add the auth-related copy keys to `lib/strings.ts`.
6. Ensure an email-less shadow is never auto-claimed (admin merge only, Phase 18).

**Done when:**
- [ ] Exact email match links to the existing shadow row and emits `player_claimed` (no duplicate created)
- [ ] Invalid/duplicate nickname returns a friendly inline error, not a raw constraint error
- [ ] `account_created` and `auth_completed` events are written
- [ ] Build passes, tests pass, committed

### Phase 6 Execution Summary

**Goal:** Deliver end-to-end magic-link auth with exact-match shadow claim, signup validation, and the drop-off event pair.

**Key Deliverables:**
- `/login` page, `/auth/callback` route, server session middleware
- Shadow-claim on exact email match + signup validation + `auth_link_sent`/`auth_completed`/`account_created`/`player_claimed` events

**Estimated Duration:** 3.0h

### Phase 6 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 6.1 - Magic-link login + server session | Pending | - |
| 6.2 - Shadow claim + signup validation + auth events | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 7: Seed / fixture script v1

### Overview
Build the one-command seed script that populates a dev database with realistic data: sample players (incl. shadow + seed), games in each status (draft/published/full/played/settled/cancelled), bookings in each state, waitlist entries, and credit balances — so admin UI and E2E run against lifelike fixtures. The script must write state via the same RPCs where possible (or documented direct seeding for setup-only) so it exercises the real functions. It is extended at each later milestone but v1 must cover the M1/M2 surfaces. This phase also carries the two hardest acceptance tests as **required M1-gate checks** — concurrent last-spot booking (criterion 11) and concurrent credit redemption (criterion 16) — run against the Phase 4/5 RPCs and these fixtures, so concurrency correctness is proven at M1 before any player UI exists.

### Prerequisites
- [ ] Phase 4, 5 completed (RPCs exist to create realistic bookings and to exercise under concurrency)

### Deliverables
- [ ] `scripts/seed.ts` (one command) producing players/games/bookings/waitlist/credit fixtures
- [ ] Documented reset + reseed procedure
- [ ] `e2e/concurrency.spec.ts` proving criteria 11 & 16 (required at the M1 gate)

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Seed bypasses RPCs and creates impossible states | Med | Med | Route state transitions through RPCs; only base rows seeded directly |
| Flaky concurrency tests | Med | Med | Deterministic parallel-request harness; assert DB state, not timing |

### Milestone 7.1: Seed / fixture script v1

**What:** Build the one-command seed script that populates a dev database with realistic fixtures — shadow + seed + real players, games in every status, bookings in every state, waitlist entries, and credit balances — routing state transitions through the real Phase 4/5 RPCs where possible so it exercises the actual functions. This gives the admin UI and E2E suite lifelike data to run against and is extended at each later milestone.

**Files:** `scripts/seed.ts` (C), `scripts/fixtures.ts` (C)

**Size:** M - Multi-entity fixture generation spanning every status/state plus a reset procedure.

**Steps:**
1. Define fixture data in `scripts/fixtures.ts`: players (incl. shadow with/without email and seed), games in draft/published/full/played/settled/cancelled, and credit balances.
2. In `scripts/seed.ts`, insert base rows (players, games) directly and create bookings/waitlist/credit via the Phase 4/5 RPCs so states are reachable-only.
3. Cover bookings in each state (reserved/confirmed/cancelled/expired) and at least one waitlist entry on a full game.
4. Add a documented reset + reseed command (truncate in dependency order, then reseed).
5. Wire the seed and reset commands into `package.json` scripts.

**Done when:**
- [ ] Running the seed command populates players/games/bookings/waitlist/credit and exits zero
- [ ] A post-seed SQL scan shows a game in every status and a booking in every state
- [ ] Reset + reseed runs idempotently (a second run yields the same fixture counts)

### Milestone 7.2: Concurrency acceptance tests (criteria 11 & 16) — M1 gate

**What:** Write the two hardest acceptance tests as required M1-gate checks, run against the Phase 4/5 RPCs and the Milestone 7.1 fixtures: last-spot concurrent booking from two sessions yields exactly one confirmed booking (criterion 11), and two concurrent credit-funded bookings by one player for different games redeem the wallet at most once with the ledger never negative (criterion 16). Verifying concurrency at M1 — right after the RPCs exist — surfaces double-booking and credit double-spend defects before any player UI is built.

**Files:** `e2e/concurrency.spec.ts` (C)

**Size:** M - A deterministic parallel-request harness asserting DB state for the two concurrency criteria.

**Steps:**
1. Build `e2e/concurrency.spec.ts` with a deterministic parallel-request harness firing two simultaneous `create_booking` calls for the last spot and asserting exactly one confirmed booking (criterion 11).
2. Add the credit double-spend case: two concurrent credit-funded `create_booking` calls by one player for different games redeem the wallet at most once and the ledger `SUM(delta_czk)` never goes negative (criterion 16).
3. Assert DB state (booking rows, ledger sum), not timing.
4. Run against the Milestone 7.1 fixtures in `EMAIL_DRY_RUN=on`.

**Done when:**
- [ ] Concurrent last-spot booking yields exactly one confirmed booking (criterion 11)
- [ ] Two concurrent credit-funded bookings by one player redeem the wallet at most once and never drive the ledger negative (criterion 16)
- [ ] Build passes, tests pass, committed

### Phase 7 Execution Summary

**Goal:** Provide a one-command seed producing realistic fixtures across every game status and booking state via the real RPCs, and prove the two concurrency criteria (11, 16) as required M1-gate checks.

**Key Deliverables:**
- `scripts/seed.ts` + `scripts/fixtures.ts` producing players/games/bookings/waitlist/credit fixtures
- Documented reset + reseed procedure wired into `package.json`
- `e2e/concurrency.spec.ts` proving criteria 11 & 16 at the M1 gate

**Estimated Duration:** 3.0h

### Phase 7 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 7.1 - Seed / fixture script v1 | Pending | - |
| 7.2 - Concurrency acceptance tests (criteria 11 & 16) | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

### 🛑 HUMAN VERIFICATION GATE — M1 (spec §10: Schema + auth)

**STOP — do not proceed past this gate without explicit human confirmation.**

**Gate criteria (spec §10 M1):**
- Sign up on a phone; the player row is visible in Supabase.
- `auth_link_sent` / `auth_completed` events are present.
- A second test user cannot read the first user's rows via the anon API.
- Concurrency acceptance tests pass (moved into Phase 7): last-spot concurrent booking yields exactly one confirmed booking (criterion 11), and two concurrent credit-funded bookings by one player redeem the wallet at most once with the ledger never negative (criterion 16).

Phase 8 must not begin until a human has explicitly confirmed every criterion above.

---

## Phase 8: Games list + detail + live counter + public roster

### Overview
Build the anonymous-readable player browsing surfaces: `/games` (list of published games) and `/game/[id]` (detail with venue, `Europe/Prague` 24h time, live spots-left counter, and the public roster from `game_roster_public`). All datetime rendering goes through `lib/format.ts`; all strings through `lib/strings.ts`; `games.venue` is HTML-escaped at every render site (§8). The book / join-waitlist button is present and routes into the auth+booking flow (implemented next phase). This is the first read-only player-facing milestone slice.

### Prerequisites
- [ ] Phase 3 completed (roster view), Phase 6 completed (session for button state)

### Deliverables
- [ ] `/games` and `/game/[id]` pages with live counter + escaped roster
- [ ] Landing `/` live next-game block replacing hardcoded counter

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Raw UTC or venue XSS rendered | Med | High | `format.ts` for all times; escape venue at HTML/OG/ics sites |
| Stale counter after concurrent booking | Low | Med | Read live count from server on load; accept eventual refresh |

### Milestone 8.1: Games list + landing next-game block

**What:** Build `/games` (list of published games) and replace the hardcoded landing counter with a live next-game block. All datetime rendering goes through `lib/format.ts`, all strings through `lib/strings.ts`, and `games.venue` is HTML-escaped at render per Section 8. This is the first anonymous player-facing browsing surface.

**Files:** `app/games/page.tsx` (C), `components/GameCard.tsx` (C), `app/page.tsx` (M)

**Size:** M - Two list surfaces plus the landing block, all reading published games.

**Steps:**
1. Build `app/games/page.tsx` reading published games via the anon-readable games RLS policy (Section 8).
2. Build `components/GameCard.tsx` rendering venue (HTML-escaped), `Europe/Prague` 24h time via `lib/format.ts`, price, and spots-left.
3. Replace the hardcoded counter in `app/page.tsx` with a live next-game block reusing `GameCard`.
4. Source all labels from `lib/strings.ts`.
5. Confirm anonymous access renders the list without exposing non-published games.

**Done when:**
- [ ] `/games` lists only published games with Prague 24h times and escaped venue
- [ ] The landing next-game block reflects live data, not a hardcoded value
- [ ] Build passes, tests pass, committed

### Milestone 8.2: Game detail + live counter + public roster

**What:** Build `/game/[id]` with venue/time detail, a live spots-left counter, and the public roster sourced from `game_roster_public` (nickname + status only). The book / join-waitlist button is present and routes into the auth+booking flow implemented in Phase 9. This is the primary game surface players land on from WhatsApp links.

**Files:** `app/game/[id]/page.tsx` (C), `components/SpotsCounter.tsx` (C), `components/Roster.tsx` (C)

**Size:** M - Detail page, live counter, and PII-safe roster across three components.

**Steps:**
1. Build `app/game/[id]/page.tsx` reading the game and rendering venue (escaped) and Prague 24h time via `lib/format.ts`.
2. Build `components/SpotsCounter.tsx` reading the live active-booking count vs capacity on load.
3. Build `components/Roster.tsx` reading `game_roster_public` and rendering nickname + status only.
4. Add the book / join-waitlist button whose target routes into the Phase 9 flow.
5. Confirm the roster query never selects `player_id`/`email`/`phone`.

**Done when:**
- [ ] `/game/[id]` shows a live spots-left counter and a roster of nickname+status only
- [ ] Anonymous roster read exposes no `player_id`/`email`/`phone`
- [ ] Build passes, tests pass, committed

### Phase 8 Execution Summary

**Goal:** Ship the anonymous player browsing surfaces — games list, live landing block, and game detail with counter and PII-safe roster.

**Key Deliverables:**
- `/games` and `/game/[id]` pages with live counter + escaped roster
- Landing `/` live next-game block replacing the hardcoded counter

**Estimated Duration:** 3.0h

### Phase 8 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 8.1 - Games list + landing next-game block | Pending | - |
| 8.2 - Game detail + live counter + public roster | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 9: Booking flow UI + `create_booking` wiring + credit auto-apply

### Overview
Implement the player booking flow: payment-method choice (QR vs cash), invoking `create_booking` via `supabase.rpc()` under the authenticated session, and handling the credit auto-application outcome (partial credit reduces the amount due; full credit confirms instantly with no QR). Deep-link resume completes here — an unauthenticated Book tap round-trips through magic link and resumes automatically. Friendly inline errors for "spot already taken / still on waitlist" and duplicate active booking. No pre-auth soft holds; the booking exists only when the RPC runs.

### Prerequisites
- [ ] Phase 4 completed (`create_booking`), Phase 8 completed (game detail entry point)

### Deliverables
- [ ] Booking flow pages/actions calling `create_booking`
- [ ] Credit auto-apply UX (full vs partial) + friendly race/duplicate errors

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Client assembles a transition instead of calling RPC | Med | High | Only `supabase.rpc()` writes; review guard |
| Race loser sees raw error not friendly screen | Med | Med | Map RPC rejection to §5 "spot already taken" copy |

### Milestone 9.1: Payment-method choice + `create_booking` wiring

**What:** Implement the booking-flow entry: the payment-method choice (QR vs cash) and the server action that invokes `create_booking` via `supabase.rpc()` under the authenticated session. Writes go only through the RPC — no client-assembled transitions — and the book button on the game detail page routes here.

**Files:** `app/game/[id]/book/page.tsx` (C), `app/game/[id]/book/actions.ts` (C), `components/PaymentMethodChoice.tsx` (C), `app/game/[id]/page.tsx` (M)

**Size:** M - Booking page, RPC-calling action, method choice, and detail-page wiring.

**Steps:**
1. Build `components/PaymentMethodChoice.tsx` offering QR vs cash per Section 4.
2. Build `app/game/[id]/book/page.tsx` gated by an authenticated session.
3. Implement `app/game/[id]/book/actions.ts` calling `create_booking` per the Section 6.2 contract via `supabase.rpc()` with the user's JWT — never a direct table write.
4. Wire the book button in `app/game/[id]/page.tsx` to this flow.
5. Return the booking result (VS + amount_due, or instant-confirmed) for the Phase 10 confirmation screen.

**Done when:**
- [ ] Booking a spot calls `create_booking` and persists via the RPC only (no direct client insert)
- [ ] The QR-vs-cash choice is passed to the RPC and reflected on the result
- [ ] Build passes, tests pass, committed

### Milestone 9.2: Deep-link resume + credit auto-apply UX + friendly errors

**What:** Complete deep-link resume (an unauthenticated Book tap round-trips through the magic link and resumes automatically) and the credit auto-application UX — partial credit reduces the amount due, full credit confirms instantly with no QR. Map RPC rejections to friendly copy (spot already taken / duplicate active booking).

**Files:** `lib/booking/resume.ts` (C), `components/BookingError.tsx` (C), `lib/strings.ts` (M)

**Size:** M - Resume logic, credit-outcome UX branching, and error mapping.

**Steps:**
1. Implement `lib/booking/resume.ts` to read the game id + pending action from the post-auth redirect and resume `create_booking` automatically.
2. Branch the UX on the RPC result: full-credit → instant confirmation (no QR); partial → reduced amount_due shown.
3. Build `components/BookingError.tsx` mapping CAPACITY_FULL to "spot already taken, still on waitlist" and DUPLICATE_ACTIVE_BOOKING per Section 6.3.
4. Add the friendly-error and credit-outcome copy to `lib/strings.ts`.
5. Ensure no pre-auth soft hold — the booking exists only when the RPC runs under the authenticated session.

**Done when:**
- [ ] An unauthenticated Book tap resumes the booking automatically after magic-link completion
- [ ] Full-credit confirms with no QR; partial credit shows a reduced amount due
- [ ] A capacity race loser sees the friendly "spot already taken" screen, not a raw error
- [ ] Build passes, tests pass, committed

### Phase 9 Execution Summary

**Goal:** Deliver the player booking flow wired to `create_booking`, with deep-link resume, credit auto-apply UX, and friendly race/duplicate errors.

**Key Deliverables:**
- Booking flow pages/actions calling `create_booking` via `supabase.rpc()`
- Deep-link resume + credit auto-apply UX (full vs partial) + friendly error mapping

**Estimated Duration:** 3.0h

### Phase 9 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 9.1 - Payment-method choice + `create_booking` wiring | Pending | - |
| 9.2 - Deep-link resume + credit auto-apply UX + friendly errors | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 10: QR/SPD render + `.ics` + Open Graph tags + confirmation

### Overview
Render the payment and sharing artifacts. Build `lib/payments/spd.ts` (SPD 1.0 string `SPD*1.0*ACC:<IBAN>*AM:<amount>.00*CC:CZK*X-VS:<VS>*MSG:<sanitized nickname>` with `*`/control/non-ASCII stripping and 60-char cap) rendered as a scannable QR plus text fallback (account, amount, VS). Add `lib/calendar/ics.ts` for the `.ics` download on confirmation + email (venue location, `starts_at`, 90-min default). Add Open Graph meta on `/game/[id]` and `/` (venue, time, spots-left, volt-on-black share image) for WhatsApp preview cards. All venue/nickname interpolation is sanitized/escaped.

### Prerequisites
- [ ] Phase 9 completed (booking produces VS + amount due)

### Deliverables
- [ ] SPD QR + text fallback on payment screen; `.ics` link on confirmation
- [ ] OG meta tags on `/game/[id]` and `/`

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Nickname breaks SPD framing | Med | High | Strip `*`/control/non-ASCII + cap 60 (§4); unit test payload |
| QR fails in a Czech banking app | Med | High | Validate against SPD 1.0 spec; M2 gate scans real app |

### Milestone 10.1: SPD QR + text fallback + confirmation screen

**What:** Build the payment rendering: `lib/payments/spd.ts` producing the exact SPD 1.0 string with the nickname sanitized (strip `*`/control/non-ASCII, cap 60) per Section 4, rendered as a scannable QR plus a text fallback (account, amount, VS), and the booking confirmation screen. This is the surface a player pays from in a Czech banking app.

**Files:** `lib/payments/spd.ts` (C), `components/QrPayment.tsx` (C), `app/game/[id]/book/confirmation/page.tsx` (C)

**Size:** M - SPD builder with sanitizer, QR rendering, and confirmation page.

**Steps:**
1. Implement `lib/payments/spd.ts` building `SPD*1.0*ACC:<IBAN>*AM:<amount>.00*CC:CZK*X-VS:<VS>*MSG:<nickname>` per Section 4 with `PAYMENT_IBAN` from env.
2. Sanitize the `MSG` nickname: strip `*`, control, and non-ASCII characters and cap at 60 chars so framing can never break.
3. Compute the amount as `price_czk − credit_applied_czk`; skip the QR entirely when credit covers the full price.
4. Build `components/QrPayment.tsx` rendering the SPD string as a QR plus a plain-text fallback (account number, amount, VS).
5. Build `app/game/[id]/book/confirmation/page.tsx` showing the QR/text or the instant-confirmed state.
6. Add a unit test for the SPD payload and the nickname sanitizer.

**Done when:**
- [ ] The SPD string matches the Section 4 format and a malicious nickname cannot break framing (unit test)
- [ ] The confirmation screen shows the QR + text fallback, or the instant-confirmed state with no QR
- [ ] Build passes, tests pass, committed

### Milestone 10.2: `.ics` download + Open Graph tags

**What:** Add `lib/calendar/ics.ts` and an `.ics` download route for the confirmation screen/email (venue location, `starts_at`, 90-min default), and Open Graph meta on `/game/[id]` and `/` (venue, time, spots-left, volt-on-black share image) for WhatsApp preview cards. Venue is escaped at every render site — HTML, OG `content`, and `.ics` fields — per Section 8.

**Files:** `lib/calendar/ics.ts` (C), `app/game/[id]/ics/route.ts` (C), `lib/og/shareImage.tsx` (C), `app/game/[id]/page.tsx` (M)

**Size:** M - ICS generator, download route, OG image, and metadata wiring.

**Steps:**
1. Implement `lib/calendar/ics.ts` generating an event with venue as location (escaped), `starts_at`, and a 90-minute default duration.
2. Build `app/game/[id]/ics/route.ts` serving the `.ics` download.
3. Build `lib/og/shareImage.tsx` producing the volt-on-black share image (venue, time, spots-left).
4. Add `generateMetadata` OG tags to `app/game/[id]/page.tsx` and the landing `/`, escaping venue in every `content`.
5. Link the `.ics` on the confirmation screen.

**Done when:**
- [ ] The `.ics` downloads and opens in a phone calendar with correct venue/time/90-min duration
- [ ] `/game/[id]` OG tags render a preview card when the link is pasted into WhatsApp
- [ ] Venue is escaped in HTML, OG content, and `.ics` fields
- [ ] Build passes, tests pass, committed

### Phase 10 Execution Summary

**Goal:** Render the payment and sharing artifacts — SPD QR + text fallback, `.ics`, and Open Graph cards — with sanitized/escaped interpolation.

**Key Deliverables:**
- SPD QR + text fallback on the payment screen; `.ics` link on confirmation
- OG meta tags on `/game/[id]` and `/`

**Estimated Duration:** 3.0h

### Phase 10 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 10.1 - SPD QR + text fallback + confirmation screen | Pending | - |
| 10.2 - `.ics` download + Open Graph tags | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 11: Account page — my bookings, credit, self-cancel, deletion mailto

### Overview
Build `/account`: the player's bookings (with status + payment badges), current credit balance (`SUM(delta_czk)`), profile, a self-cancel button that invokes `cancel_booking` (subject to the §5 window enforced in the RPC), and the account-deletion `mailto` link (no self-serve deletion UI in Phase 1). Cancellation credit appears in the ledger and is surfaced in the balance. This closes the M2 player loop and gives the cancel path a UI before the M3 cron/email work.

### Prerequisites
- [ ] Phase 4 completed (`cancel_booking`), Phase 6 completed (session)

### Deliverables
- [ ] `/account` with bookings, balance, self-cancel wiring, deletion mailto
- [ ] Cancel outside the §5 window is blocked with friendly copy

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cancel after kickoff succeeds | Low | High | RPC enforces window; UI mirrors but DB is authority |
| Balance computed client-side and drifts | Low | Med | Read balance server-side from ledger sum |

### Milestone 11.1: Account page — bookings, credit balance, deletion mailto

**What:** Build `/account` showing the player's bookings with status + payment badges, the current credit balance (`SUM(delta_czk)` read server-side), profile, and the account-deletion `mailto` link (no self-serve deletion UI in Phase 1). This gives the player visibility into their loop before the M3 cron/email work.

**Files:** `app/account/page.tsx` (C), `components/BookingList.tsx` (C), `components/CreditBalance.tsx` (C)

**Size:** M - Account page, bookings list with badges, and balance component.

**Steps:**
1. Build `app/account/page.tsx` gated by an authenticated session, reading the player's own rows (own-row RLS).
2. Build `components/BookingList.tsx` rendering bookings with status + payment badges (paid/reserved/cash/seed).
3. Build `components/CreditBalance.tsx` reading the balance as `SUM(delta_czk)` server-side, never client-computed.
4. Add the account-deletion `mailto` link per Section 8 (anonymization on request, no self-serve UI).
5. Source all labels from `lib/strings.ts`.

**Done when:**
- [ ] `/account` shows the player's own bookings with correct payment badges and a server-computed balance
- [ ] The deletion `mailto` link is present and no self-serve deletion UI exists
- [ ] Build passes, tests pass, committed

### Milestone 11.2: Self-cancel wiring

**What:** Wire the self-cancel button to invoke `cancel_booking` via `supabase.rpc()`, subject to the Section 5 window enforced in the RPC, and surface the resulting cancellation credit in the balance. A cancel outside the window is blocked with friendly copy while the DB remains the authority.

**Files:** `app/account/actions.ts` (C), `lib/strings.ts` (M)

**Size:** S - A single RPC-calling action plus error copy.

**Steps:**
1. Implement `app/account/actions.ts` calling `cancel_booking` per the Section 6.2 contract via `supabase.rpc()`.
2. On success, reflect the issued cancellation credit in the balance display.
3. Map a CANCEL_WINDOW_CLOSED rejection to friendly copy in `lib/strings.ts`, mirroring the RPC window without duplicating authority.
4. Disable the cancel affordance after kickoff while relying on the RPC as the enforcement point.

**Done when:**
- [ ] Cancelling within the window issues credit that appears in the balance
- [ ] Cancel after kickoff is blocked with friendly copy (the RPC is the authority)
- [ ] Build passes, tests pass, committed

### Phase 11 Execution Summary

**Goal:** Close the M2 player loop with an account page for bookings, credit balance, self-cancel, and deletion request.

**Key Deliverables:**
- `/account` with bookings, balance, self-cancel wiring, deletion mailto
- Cancel outside the §5 window blocked with friendly copy

**Estimated Duration:** 2.5h

### Phase 11 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 11.1 - Account page: bookings, credit balance, deletion mailto | Pending | - |
| 11.2 - Self-cancel wiring | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

### 🛑 HUMAN VERIFICATION GATE — M2 (spec §10: Games + booking)

**STOP — do not proceed past this gate without explicit human confirmation.**

**Gate criteria (spec §10 M2):**
- Two real users book a test game end-to-end on phones.
- The QR scans correctly in a Czech banking app.
- A game link pasted into WhatsApp shows a proper preview card.
- The VS sequence increments.
- Concurrent booking of the last spot leaves exactly one winner.

Phase 12 must not begin until a human has explicitly confirmed every criterion above.

---

## Phase 12: Transactional email templates + event wiring

### Overview
Implement all transactional email templates (English, via `sendEmail()`): spot-held/pay-with-QR (on `booking_created`), payment-confirmed (on `payment_confirmed`), scarcity nudge, expiry notice, waitlist spot-open, cancellation+credit receipt, game-cancelled, 24h reminder. Wire each to its trigger event so instant-confirmed bookings get only the confirmation email. All run in dry-run by default (logs, not sends). Venue/nickname escaped in HTML bodies; `.ics` attached where §9 specifies. This makes the M3 lifecycle observable before cron drives it.

### Prerequisites
- [ ] Phase 1 (sendEmail seam), Phase 4/5 (events that trigger mail)

### Deliverables
- [ ] Email templates + a dispatch layer mapping event → template
- [ ] Dry-run logging verified for every template

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Instant-confirm sends both held + confirmed | Med | Med | Dispatch keyed on event type; seed/E2E asserts single email |
| Unescaped venue in HTML email | Low | Med | Escape at template render (§8) |

### Milestone 12.1: Transactional email templates (all nine, dry-run)

**What:** Build every transactional email template (English, HTML with venue/nickname escaped per Section 8): spot-held/pay-with-QR, payment-confirmed, scarcity nudge, expiry notice, waitlist spot-open, cancellation+credit receipt, game-cancelled notice, and 24h reminder. Copy lives in `lib/strings.ts`. These render through `sendEmail()` in dry-run so the whole M3 lifecycle is observable before cron drives it.

**Files:** `lib/email/templates/bookingEmails.tsx` (C), `lib/email/templates/lifecycleEmails.tsx` (C), `lib/email/templates/waitlistEmail.tsx` (C), `lib/email/templates/cancellationEmails.tsx` (C), `lib/strings.ts` (M)

**Size:** M - Nine email bodies across four files plus centralized copy, each escaping free text and some attaching `.ics`.

**Steps:**
1. Build `bookingEmails.tsx` with the spot-held/pay-with-QR body (VS + SPD + `.ics`, on `booking_created`) and the payment-confirmed body (+`.ics`, on `payment_confirmed`) per Section 9.
2. Build `lifecycleEmails.tsx` grouping the three cron-triggered notices — scarcity nudge ("pay within 12h or lose the spot", Section 5), booking-expired notice, and 24h reminder (Section 5) — as exported components sharing one layout.
3. Build `waitlistEmail.tsx` (waitlist spot-open) per Section 9.
4. Build `cancellationEmails.tsx` with the cancellation+credit receipt and the game-cancelled notice per Section 9.
5. HTML-escape `games.venue` and nickname at every template render site per Section 8.
6. Attach the `.ics` (Phase 10) on the spot-held and payment-confirmed templates.
7. Add every subject/body string to `lib/strings.ts` (English values, no hardcoded copy).

**Done when:**
- [ ] Each of the nine emails renders in dry-run with correct copy and escaped venue/nickname
- [ ] Spot-held and payment-confirmed carry the `.ics` attachment
- [ ] Build passes, tests pass, committed

### Milestone 12.2: Event → template dispatch layer

**What:** Build the dispatch layer that maps each trigger event to its template so instant-confirmed bookings (seed, full-credit) receive only the payment-confirmed email, never the spot-held one. Route every send through `sendEmail()` so dry-run logging covers the whole set.

**Files:** `lib/email/dispatch.ts` (C), `lib/email/sendEmail.ts` (M)

**Size:** M - Event-keyed dispatch map plus the render/escape wiring into the seam.

**Steps:**
1. Implement `lib/email/dispatch.ts` mapping `booking_created`→spot-held, `payment_confirmed`→payment-confirmed, `nudge_sent`→nudge, `booking_expired`→expiry, `waitlist_notified`→waitlist-open, `booking_cancelled`→cancellation, `game_cancelled`→game-cancelled, `reminder_sent`→reminder per Section 9.
2. Suppress the spot-held email when the booking is instant-confirmed (seed/full-credit), sending only payment-confirmed.
3. Extend `lib/email/sendEmail.ts` to render a chosen template to escaped HTML and honor `EMAIL_DRY_RUN` (log, not send).
4. Confirm every dispatch path passes through the dry-run seam.
5. Add a dispatch unit check asserting one email per instant-confirm.

**Done when:**
- [ ] An instant-confirmed booking dispatches only payment-confirmed, never spot-held
- [ ] Every event in the Section 9 mapping resolves to exactly one template in dry-run
- [ ] Build passes, tests pass, committed

### Phase 12 Execution Summary

**Goal:** Deliver all nine transactional email templates and an event-keyed dispatch layer, observable in dry-run.

**Key Deliverables:**
- Nine email templates (escaped venue/nickname, `.ics` where specified)
- Event→template dispatch with single-email instant-confirm handling, all in dry-run

**Estimated Duration:** 3.0h

### Phase 12 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 12.1 - Transactional email templates (all nine, dry-run) | Pending | - |
| 12.2 - Event → template dispatch layer | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 13: Waitlist join + conversion

### Overview
Implement the waitlist: one-tap join on full games (`waitlist_joined`, unique `(game_id, player_id)`) and conversion when a spot opens — the player converts by calling `create_booking` with `from_waitlist_id`, which sets `converted_booking_id` and emits `waitlist_converted` in the same transaction (RPC already built in Phase 4). The join button and the conversion entry point (from the waitlist notification email/screen) are wired here; the race between multiple notified players is settled by `create_booking`'s capacity check — losers get the friendly "spot already taken, still on the waitlist" screen.

### Prerequisites
- [ ] Phase 4 (`create_booking` with `from_waitlist_id`), Phase 8 (game detail)

### Deliverables
- [ ] Waitlist join UI + `waitlist_joined` write
- [ ] Conversion flow via `create_booking(from_waitlist_id)` with race handling

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Two players convert the same freed spot | Med | High | Capacity check in RPC; exactly one winner (criterion 11) |
| `notified_at` treated as suppression flag | Low | Med | It records last-notified; re-notify on each release (§5) |

### Milestone 13.1: Waitlist join on full games

**What:** Implement one-tap waitlist join on full games — a server action writing the `waitlist` row (unique `(game_id, player_id)`) and emitting `waitlist_joined` — surfaced by a join button that replaces Book when a game is full. This is the entry point that feeds the conversion race when a spot later opens.

**Files:** `components/WaitlistButton.tsx` (C), `app/game/[id]/waitlist/actions.ts` (C), `app/game/[id]/page.tsx` (M)

**Size:** M - Join button, the join action with its event, and detail-page wiring.

**Steps:**
1. Build `components/WaitlistButton.tsx` shown only when the game status is `full`, using `lib/strings.ts` copy.
2. Implement `app/game/[id]/waitlist/actions.ts` inserting the `waitlist` row and emitting `waitlist_joined`, relying on the unique `(game_id, player_id)` constraint (Section 5.3) to dedupe.
3. Wire the button into `app/game/[id]/page.tsx`, swapping Book for Join-waitlist when the game is full.
4. Return a friendly already-joined state when the unique constraint rejects a second join.
5. Gate the action behind an authenticated session.

**Done when:**
- [ ] Joining a full game creates one `waitlist` row and emits `waitlist_joined`
- [ ] A second join by the same player is deduped by the unique constraint, not duplicated
- [ ] Build passes, tests pass, committed

### Milestone 13.2: Waitlist conversion via `create_booking(from_waitlist_id)`

**What:** Wire conversion from the waitlist notification: the player converts by calling `create_booking` with `from_waitlist_id`, which sets `converted_booking_id` and emits `waitlist_converted` in one transaction (RPC from Phase 4). The race between multiple notified players is settled by the RPC's capacity check — losers get the friendly "spot already taken, still on the waitlist" screen.

**Files:** `lib/booking/waitlistConvert.ts` (C), `components/WaitlistConvert.tsx` (C), `lib/strings.ts` (M)

**Size:** M - Conversion wiring, the notification-entry component, and race copy.

**Steps:**
1. Implement `lib/booking/waitlistConvert.ts` calling `create_booking` with `from_waitlist_id` per the Section 6.2 contract via `supabase.rpc()`.
2. Build `components/WaitlistConvert.tsx` as the entry point reached from the waitlist spot-open email/screen.
3. Map a CAPACITY_FULL rejection to the "spot already taken, you're still on the waitlist" copy per Section 5/6.3.
4. Confirm `notified_at` is treated as last-notified, not a suppression flag (re-notify on each release).
5. Add the race and conversion copy to `lib/strings.ts`.

**Done when:**
- [ ] A waitlisted player converts via `create_booking(from_waitlist_id)`, setting `converted_booking_id` and emitting `waitlist_converted`
- [ ] Two players racing one freed spot yield exactly one winner; the loser sees the friendly still-on-waitlist screen (criterion 11)
- [ ] Build passes, tests pass, committed

### Phase 13 Execution Summary

**Goal:** Deliver waitlist join on full games and race-safe conversion via `create_booking(from_waitlist_id)`.

**Key Deliverables:**
- Waitlist join UI + `waitlist_joined` write with unique-constraint dedupe
- Conversion flow with exactly-one-winner race handling (criterion 11)

**Estimated Duration:** 2.5h

### Phase 13 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 13.1 - Waitlist join on full games | Pending | - |
| 13.2 - Waitlist conversion via `create_booking(from_waitlist_id)` | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 14: Game cancellation flow (admin) + credit fan-out

### Overview
Wire the admin game-cancellation action to the `cancel_game` RPC (Phase 5): all active bookings cancelled, applied money credited to wallets, waitlist cleared, `game_cancelled` emitted, and every affected player sent the game-cancelled notice + cancellation/credit receipt. This is a thin admin trigger over the transactional RPC plus the email fan-out from Phase 12. It exists as its own phase because it spans admin action → bulk state change → multi-recipient email and must be verified end-to-end independently.

### Prerequisites
- [ ] Phase 5 (`cancel_game`), Phase 12 (game-cancelled + credit emails)

### Deliverables
- [ ] Admin cancel-game action invoking the RPC
- [ ] Email fan-out to all affected players with credit receipts

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Partial fan-out on failure mid-loop | Med | Med | State change is transactional in RPC; emails idempotent/retryable |

### Milestone 14.1: Admin cancel-game trigger over `cancel_game`

**What:** Wire the admin game-cancellation action to the `cancel_game` RPC (Phase 5): a confirm-guarded button invoking the RPC, which cancels all active bookings, credits applied money, clears the waitlist, and emits `game_cancelled` in one transaction. This is a thin admin trigger over the transactional RPC.

**Files:** `components/admin/CancelGameButton.tsx` (C), `app/admin/games/[id]/cancel/actions.ts` (C)

**Size:** S - A confirm-guarded button and a single RPC-calling action.

**Steps:**
1. Build `components/admin/CancelGameButton.tsx` with a confirmation guard, using `lib/strings.ts` copy.
2. Implement `app/admin/games/[id]/cancel/actions.ts` invoking `cancel_game` per Section 6.2 via `supabase.rpc()` with the admin/service-role context.
3. Surface the RPC result (bookings cancelled, credits issued, waitlist cleared) back to the admin.
4. Reject the action for non-admin sessions, relying on the RPC's inside-function authorization.

**Done when:**
- [ ] Cancelling a game invokes `cancel_game` and reflects the cancelled/credited/cleared counts
- [ ] A non-admin caller is rejected (the RPC is the authority)
- [ ] Build passes, tests pass, committed

### Milestone 14.2: Email fan-out to affected players

**What:** Fan out the game-cancelled notice and the cancellation+credit receipt (Phase 12 templates) to every affected player when `game_cancelled` fires, so no one is left uninformed after a bulk cancellation. Sends run through the dry-run seam and are idempotent/retryable.

**Files:** `lib/email/dispatch.ts` (M), `lib/strings.ts` (M)

**Size:** S - Fan-out wiring on `game_cancelled` plus confirmation copy.

**Steps:**
1. Extend `lib/email/dispatch.ts` to fan out the game-cancelled notice to all affected players on `game_cancelled`.
2. Send the cancellation+credit receipt to players whose money was credited (paired with `credit_issued`).
3. Make the fan-out idempotent/retryable so a re-run sends no duplicates.
4. Add the cancel-confirmation and notice copy to `lib/strings.ts`.

**Done when:**
- [ ] Every affected player receives the game-cancelled notice (dry-run logged), and credited players also get the receipt
- [ ] A re-run of the fan-out produces no duplicate sends
- [ ] Build passes, tests pass, committed

### Phase 14 Execution Summary

**Goal:** Deliver the admin cancel-game trigger over `cancel_game` with a credit-receipt email fan-out to all affected players.

**Key Deliverables:**
- Admin cancel-game action invoking the RPC transactionally
- Idempotent email fan-out with credit receipts to affected players

**Estimated Duration:** 2.0h

### Phase 14 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 14.1 - Admin cancel-game trigger over `cancel_game` | Pending | - |
| 14.2 - Email fan-out to affected players | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 15: Cron jobs — nudge, expiry, reminder (idempotent)

### Overview
Implement the three Vercel Cron routes gated by `CRON_SECRET`, each calling the relevant RPCs with the service-role client and each strictly idempotent (double-run produces no duplicate emails/events). Nudge (every 30 min): full games with waitlist ≥1 → one nudge per eligible unpaid reserved booking, set `nudge_sent_at` + `expires_at = now()+12h`, send scarcity email. Expiry sweep (every 15 min): `expires_at < now()` reserved → `expire_booking` → `spot_released` → waitlist notifications. Reminder (every 30 min): 24h-before, one per booking. Idempotency is enforced by the `*_sent_at` guards and one-event-per-transition invariant.

### Prerequisites
- [ ] Phase 5 (`expire_booking`), Phase 12 (emails), Phase 13 (waitlist notify)

### Deliverables
- [ ] Three cron route handlers with `CRON_SECRET` gate + idempotency guards
- [ ] Waitlist-notify fan-out on spot release

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Double-run sends duplicate emails | Med | High | `nudge_sent_at`/`reminder_sent_at` guards; one nudge ever (criterion 12) |
| Unauthenticated cron route hit | Med | High | `CRON_SECRET` header check on every route |

### Milestone 15.1: Cron auth + nudge + expiry sweeps

**What:** Build the `CRON_SECRET`-gated cron guard and the nudge and expiry Vercel Cron routes. Nudge (every 30 min) finds full games with waitlist ≥1 and sends one scarcity email per eligible unpaid reserved booking, setting `nudge_sent_at` + `expires_at = now()+12h`. Expiry (every 15 min) sweeps `expires_at < now()` reserved bookings through `expire_booking`, releasing spots and firing waitlist notifications. Both are idempotent per Section 7.

**Files:** `lib/cron/guard.ts` (C), `app/api/cron/nudge/route.ts` (C), `app/api/cron/expiry/route.ts` (C), `vercel.json` (C), `lib/email/dispatch.ts` (M)

**Size:** L - A secret gate, two idempotent sweep routes calling RPCs with the service-role client, and the waitlist-notify fan-out.

**Steps:**
1. Implement `lib/cron/guard.ts` rejecting any request without a valid `CRON_SECRET` header with CRON_UNAUTHORIZED (Section 6.3).
2. Build `app/api/cron/nudge/route.ts` selecting full games with waitlist ≥1 and, for each unpaid reserved booking with `nudge_sent_at` null, setting `nudge_sent_at` + `expires_at = now()+12h` and dispatching the nudge email (one per booking, ever).
3. Build `app/api/cron/expiry/route.ts` selecting reserved bookings with `expires_at < now()` (using the `(status, expires_at)` index) and calling `expire_booking` with the service-role client per booking, driving `spot_released`.
4. Extend `lib/email/dispatch.ts` to fan out waitlist spot-open notifications to all active waitlisted players on release, updating `notified_at`.
5. Register the nudge (30 min), expiry (15 min), and reminder (30 min) schedules in `vercel.json` per Section 7.
6. Guard both routes with `lib/cron/guard.ts`.
7. Make both idempotent: the `nudge_sent_at` guard and one-event-per-transition invariant mean a double-run sends nothing extra.

**Done when:**
- [ ] A request without a valid `CRON_SECRET` is rejected by both routes
- [ ] Nudge sends at most one email per eligible booking and expiry releases lapsed spots with waitlist notifications
- [ ] A back-to-back double-run produces no duplicate emails or events (criterion 12)
- [ ] Build passes, tests pass, committed

### Milestone 15.2: Reminder sweep

**What:** Build the reminder Vercel Cron route (every 30 min) that sends the 24h-before reminder to each active booking exactly once, guarded by `reminder_sent_at`. It reuses the `CRON_SECRET` gate and the Phase 12 reminder template, and is idempotent per Section 7.

**Files:** `app/api/cron/reminder/route.ts` (C)

**Size:** S - One idempotent sweep route reusing the guard and reminder template.

**Steps:**
1. Build `app/api/cron/reminder/route.ts` selecting active bookings whose game starts within 24h and `reminder_sent_at` is null.
2. Dispatch the reminder email and set `reminder_sent_at`, emitting `reminder_sent` (one per booking, ever).
3. Guard the route with `lib/cron/guard.ts` (its schedule is registered in `vercel.json` from M15.1).
4. Confirm a double-run sends no duplicate reminders via the `reminder_sent_at` guard.

**Done when:**
- [ ] Each active booking receives exactly one 24h reminder with `reminder_sent` emitted
- [ ] A double-run produces no duplicate reminder emails or events (criterion 12)
- [ ] Build passes, tests pass, committed

### Phase 15 Execution Summary

**Goal:** Ship the three `CRON_SECRET`-gated, idempotent cron sweeps — nudge, expiry (with waitlist notify), and reminder.

**Key Deliverables:**
- Three cron route handlers with `CRON_SECRET` gate + idempotency guards
- Waitlist-notify fan-out on spot release

**Estimated Duration:** 3.0h

### Phase 15 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 15.1 - Cron auth + nudge + expiry sweeps | Pending | - |
| 15.2 - Reminder sweep | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

### 🛑 HUMAN VERIFICATION GATE — M3 (spec §10: Waitlist + cancellation loop + cron)

**STOP — do not proceed past this gate without explicit human confirmation.**

**Gate criteria (spec §10 M3):**
- Cancel a confirmed booking → credit appears in the ledger → the spot releases → waitlist emails fire (or dry-run logs) → a waitlisted player converts.
- Zero human touches between cancel and conversion.

Phase 16 must not begin until a human has explicitly confirmed every criterion above.

---

# --- Part 2: Admin Panel + Polish & Verification (Phases 16-22) ---

> **Document split note:** This plan exceeds the 20,000-token single-part budget (L project, 22 phases). Part 1 (Phases 1-15) covers M1-M3: foundation, player surfaces, and the cancellation/waitlist/cron lifecycle. Part 2 (below) covers M4 (admin panel) and M5 (polish, E2E, dry-run cutover). Both parts were generated in this session and reside in this single file; phase numbering is continuous. Part 2 depends on Part 1 exactly as declared in the Phase Overview table's "Depends On" column.

---

## Phase 16: Admin gating + games CRUD (create/edit/publish/cancel)

### Overview
Build the `/admin` shell gated by server-verified `players.is_admin` (not hidden nav) and the games management surface: create (saves as `draft`), explicit publish (`draft → published`), edit (enforcing §3 — capacity can't drop below active bookings; price changes apply to future bookings only), and cancel (routes to Phase 14 flow). `is_admin` is never grantable in-app (§8) — the surface is gated by the flag, never sets it. This opens the M4 admin milestone.

### Prerequisites
- [ ] Phase 5 (game transitions), Phase 6 (admin session)

### Deliverables
- [ ] `/admin` gating + games create/edit/publish/cancel UI wired to RPCs
- [ ] Edit validation: capacity floor + price-lock on existing bookings

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Non-admin reaches admin routes | Med | High | Server-side `is_admin` check on every admin route (criterion via E2E) |
| Capacity reduced below active count | Med | Med | Reject in RPC + UI validation (§3) |

### Milestone 16.1: Admin gating (server-verified `is_admin`)

**What:** Build the `/admin` shell gated by a server-verified `players.is_admin` check (not hidden nav): a layout that rejects non-admins server-side and a reusable `requireAdmin` helper. `is_admin` is never grantable in-app (Section 8) — this surface is gated by the flag, never sets it.

**Files:** `app/admin/layout.tsx` (C), `lib/auth/requireAdmin.ts` (C)

**Size:** S - A gating layout and the server-side admin-check helper.

**Steps:**
1. Implement `lib/auth/requireAdmin.ts` resolving the session player and verifying `is_admin` server-side, redirecting/403-ing non-admins.
2. Build `app/admin/layout.tsx` calling `requireAdmin` so every nested admin route is gated server-side, not by hidden nav.
3. Confirm no code path can set `is_admin` (dashboard-only elevation per Section 8).
4. Source admin-shell labels from `lib/strings.ts`.

**Done when:**
- [ ] A non-admin session is rejected from every `/admin` route server-side, not merely hidden
- [ ] No in-app path can grant `is_admin`
- [ ] Build passes, tests pass, committed

### Milestone 16.2: Games CRUD (create / edit / publish / cancel)

**What:** Build the games management surface: create (saves as `draft`), explicit publish (`draft → published`), edit (enforcing Section 3 — capacity can't drop below active bookings, price changes apply to future bookings only), and cancel (routing to the Phase 14 flow). All state changes go through the Phase 5 game-transition RPCs.

**Files:** `app/admin/games/page.tsx` (C), `app/admin/games/new/page.tsx` (C), `app/admin/games/[id]/edit/page.tsx` (C), `app/admin/games/actions.ts` (C), `lib/strings.ts` (M)

**Size:** M - List, create, and edit surfaces plus the transition-wiring action and copy.

**Steps:**
1. Build `app/admin/games/page.tsx` listing all games with status.
2. Build `app/admin/games/new/page.tsx` creating a game saved as `draft`.
3. Build `app/admin/games/[id]/edit/page.tsx` for venue/time/capacity/price edits.
4. Implement `app/admin/games/actions.ts` wiring create, `publish` (draft→published, `game_published`), edit, and cancel to the Phase 5 RPCs via `supabase.rpc()`.
5. Enforce the Section 3 edit rules: reject a capacity below the active-booking count; lock `price_czk` on existing bookings so a new price applies only to future ones.
6. Add the games-CRUD copy to `lib/strings.ts`.

**Done when:**
- [ ] Create saves a `draft`; an explicit publish performs draft→published and emits `game_published`
- [ ] An edit lowering capacity below the active-booking count is rejected; a price change does not alter existing bookings
- [ ] Build passes, tests pass, committed

### Phase 16 Execution Summary

**Goal:** Open the admin milestone with server-verified `is_admin` gating and full games CRUD wired to the transition RPCs.

**Key Deliverables:**
- `/admin` gating + games create/edit/publish/cancel UI wired to RPCs
- Edit validation: capacity floor + price-lock on existing bookings

**Estimated Duration:** 3.0h

### Phase 16 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 16.1 - Admin gating (server-verified `is_admin`) | Pending | - |
| 16.2 - Games CRUD (create / edit / publish / cancel) | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 17: Admin payments (confirm, roster badges) + add shadow player

### Overview
Build the reconciliation surface — the VS-sorted pending list with one-tap ✓ Paid invoking `confirm_booking` (target ≤5s per confirmation incl. page load) — and the per-game roster with payment-status badges (paid / reserved / cash / seed). Add the "Add player manually" flow that creates a shadow player + booking in one action (≤10s, `admin_booking_created`). This is the only reconciliation UI in Phase 1 (no separate queue); over/underpayment and unmatched handling follow the §4 policy (manual credit grant lives in Phase 18).

### Prerequisites
- [ ] Phase 5 (`confirm_booking`), Phase 16 (admin shell + roster)

### Deliverables
- [ ] VS-sorted pending list + one-tap ✓ Paid + badge roster
- [ ] Add-shadow-player-and-booking flow

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Confirm slower than 5s target | Low | Med | Minimal payload, optimistic UI, indexed pending query |
| Shadow player duplicates existing email | Med | Med | Check email before create; steer to merge (Phase 18) |

### Milestone 17.1: VS-sorted confirm + roster payment badges

**What:** Build the only Phase 1 reconciliation surface — the per-game roster with payment-status badges (paid / reserved / cash / seed) and the VS-sorted pending list with one-tap ✓ Paid invoking `confirm_booking` (target ≤5s per confirmation incl. page load). Over/underpayment follow the Section 4 policy.

**Files:** `app/admin/games/[id]/page.tsx` (C), `components/admin/PaymentBadge.tsx` (C), `app/admin/games/[id]/actions.ts` (C), `lib/strings.ts` (M)

**Size:** M - Roster page, badge component, the confirm action, and copy.

**Steps:**
1. Build `app/admin/games/[id]/page.tsx` rendering the roster and the pending bookings sorted by VS (using the Section 5.3 pending index).
2. Build `components/admin/PaymentBadge.tsx` distinguishing paid / reserved / cash / seed.
3. Implement `app/admin/games/[id]/actions.ts` with a one-tap ✓ Paid calling `confirm_booking` per Section 6.2 via `supabase.rpc()`.
4. Keep the confirm payload minimal so a confirmation completes in ≤5s including page load (Section 4).
5. Handle overpayment (confirm + `credit_issued` for the difference) and underpayment (stays reserved) per the Section 4 policy.
6. Add the reconciliation copy to `lib/strings.ts`.

**Done when:**
- [ ] The pending list is VS-sorted and one-tap ✓ Paid confirms via `confirm_booking` in ≤5s
- [ ] The roster shows correct paid / reserved / cash / seed badges (criterion 3)
- [ ] Build passes, tests pass, committed

### Milestone 17.2: Add shadow player + booking in one flow

**What:** Build the "Add player manually" flow that creates a shadow player + booking in one action (≤10s, `admin_booking_created`), for WhatsApp signups who have never logged in. It checks the email against existing players first and steers duplicates to the Phase 18 merge tool.

**Files:** `app/admin/games/[id]/add-player/page.tsx` (C), `app/admin/games/[id]/add-player/actions.ts` (C)

**Size:** S - A single add-player form and its create-shadow-and-book action.

**Steps:**
1. Build `app/admin/games/[id]/add-player/page.tsx` capturing nickname (and optional email) with the Section 3 charset validation.
2. Implement `app/admin/games/[id]/add-player/actions.ts` creating the shadow `players` row and the booking in one flow, emitting `admin_booking_created`.
3. Check the email against existing players first; on a match, steer the admin to the Phase 18 merge tool rather than duplicating.
4. Keep the flow to ≤10s per Section 9.

**Done when:**
- [ ] Adding a player creates a shadow player + booking in one action in ≤10s and emits `admin_booking_created` (criterion 4)
- [ ] A duplicate email is steered to merge, not duplicated
- [ ] Build passes, tests pass, committed

### Phase 17 Execution Summary

**Goal:** Deliver the VS-sorted payment reconciliation surface with roster badges and the one-action add-shadow-player flow.

**Key Deliverables:**
- VS-sorted pending list + one-tap ✓ Paid + badge roster
- Add-shadow-player-and-booking flow (≤10s)

**Estimated Duration:** 3.0h

### Phase 17 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 17.1 - VS-sorted confirm + roster payment badges | Pending | - |
| 17.2 - Add shadow player + booking in one flow | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 18: Admin attendance/settle + credit grants + shadow merge

### Overview
Build the closing admin operations: attendance marking (present / no-show) that drives a game to `settled` — resolving every unpaid `reserved` booking (cash-confirm on pitch or no_show/cancel) so none survives into `settled`, including under-capacity games marked `played` directly from `published`; the player list with balances and manual credit grants (`admin_grant`, and the §4 unmatched-payment resolution logging `payment_unmatched`); and the shadow-player merge tool (the only path to claim an email-less shadow or fix a mis-bind). This completes the admin milestone's data-integrity operations.

### Prerequisites
- [ ] Phase 5 (attendance/settle transitions), Phase 16 (admin shell)

### Deliverables
- [ ] Attendance marking → settle with reserved-booking resolution
- [ ] Manual credit grants + shadow-player merge tool

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Reserved booking survives into settled | Med | High | Settle blocks until all reserved resolved (criterion 8) |
| Merge loses history/ledger | Med | High | Repoint FKs in transaction; retain events/ledger keyed to surviving id |

### Milestone 18.1: Attendance marking → settle

**What:** Build attendance marking (present / no-show) that drives a game to `settled`, resolving every unpaid `reserved` booking (cash-confirm on pitch via `confirm_booking`, or no_show/cancel) so none survives into `settled` — including under-capacity games marked `played` directly from `published`. Uses the Phase 5 transitions.

**Files:** `app/admin/games/[id]/attendance/page.tsx` (C), `app/admin/games/[id]/attendance/actions.ts` (C)

**Size:** M - Attendance UI and the mark/settle action resolving reserved bookings.

**Steps:**
1. Build `app/admin/games/[id]/attendance/page.tsx` listing bookings with present / no-show controls.
2. Implement `app/admin/games/[id]/attendance/actions.ts` writing `attendance` and emitting `attendance_marked`, then transitioning the game to `settled` via the Phase 5 RPC.
3. Resolve every unpaid `reserved` booking at settle: cash-confirm via `confirm_booking` or no_show/cancel — block settle until none remain (Section 9).
4. Support marking an under-capacity game `played` directly from `published` (Section 3).

**Done when:**
- [ ] A game reaches `settled` with every unpaid `reserved` booking resolved and none surviving (criterion 8)
- [ ] An under-capacity game can be marked `played` directly from `published`
- [ ] Build passes, tests pass, committed

### Milestone 18.2: Credit grants + shadow-player merge

**What:** Build the player list with balances and manual credit grants (`admin_grant`, plus the Section 4 unmatched-payment resolution logging `payment_unmatched`), and the shadow-player merge tool — the only path to claim an email-less shadow or fix a mis-bind, repointing FKs in a transaction while retaining events/ledger.

**Files:** `app/admin/players/page.tsx` (C), `app/admin/players/actions.ts` (C), `app/admin/players/merge/page.tsx` (C), `app/admin/players/merge/actions.ts` (C), `lib/strings.ts` (M)

**Size:** M - Player list, grant action, and the merge surface with its transactional repoint.

**Steps:**
1. Build `app/admin/players/page.tsx` listing players with `SUM(delta_czk)` balances.
2. Implement `app/admin/players/actions.ts` writing a manual credit grant (`admin_grant`) to `credit_ledger` and logging `payment_unmatched` for the Section 4 unmatched-payment resolution.
3. Build `app/admin/players/merge/page.tsx` selecting a shadow row and a surviving player.
4. Implement `app/admin/players/merge/actions.ts` repointing bookings/waitlist/ledger/events FKs to the surviving id in one transaction and retaining history.
5. Restrict merge to the admin path only (email-less shadows are never auto-claimed, Section 8).
6. Add the grants/merge copy to `lib/strings.ts`.

**Done when:**
- [ ] A manual grant appears in the ledger and updates the player's balance; an unmatched payment logs `payment_unmatched`
- [ ] Merging repoints all FKs in one transaction, retaining events/ledger keyed to the surviving id
- [ ] Build passes, tests pass, committed

### Phase 18 Execution Summary

**Goal:** Complete the admin data-integrity operations: attendance→settle resolution, manual credit grants, and shadow-player merge.

**Key Deliverables:**
- Attendance marking → settle with reserved-booking resolution (criterion 8)
- Manual credit grants + transactional shadow-player merge tool

**Estimated Duration:** 3.5h

### Phase 18 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 18.1 - Attendance marking → settle | Pending | - |
| 18.2 - Credit grants + shadow-player merge | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 19: Admin stats page (`/admin/stats`)

### Overview
Build the read-only `/admin/stats` page: signup→first-booking→attendance funnel, booking-to-payment conversion, no-show rate, waitlist depth per upcoming game, credit outstanding, and magic-link drop-off — all as direct SQL over `events` + tables, no new infrastructure. This validates the "every metric is a SQL query, not a project" thesis (§1) and gives the M4 gate its measurable surface. Waitlist depth per game is the expansion-trigger sensor.

### Prerequisites
- [ ] Phase 16 (admin shell); meaningful data from earlier phases / seed

### Deliverables
- [ ] `/admin/stats` read-only page with the six metric groups
- [ ] Documented SQL for each metric over `events`/tables

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Slow queries on events scan | Low | Med | Index event_type/created_at; simple aggregates only |

### Milestone 19.1: `/admin/stats` read-only metrics over events

**What:** Build the read-only `/admin/stats` page rendering six metric groups — signup→first-booking→attendance funnel, booking-to-payment conversion, no-show rate, waitlist depth per upcoming game, credit outstanding, and magic-link drop-off — all as direct SQL over `events` + tables, no new infrastructure. This validates the "every metric is a SQL query, not a project" thesis (Section 1).

**Files:** `app/admin/stats/page.tsx` (C), `lib/stats/queries.ts` (C), `components/admin/StatCard.tsx` (C)

**Size:** M - Stats page, the six metric queries, and the display component.

**Steps:**
1. Implement `lib/stats/queries.ts` with the six aggregate queries over `events`/tables, using the `(event_type, created_at)` index (Section 5.3): the signup→first-booking→attendance funnel, booking-to-payment conversion, no-show rate, waitlist depth per upcoming game, credit outstanding (`SUM(delta_czk)`), and `auth_link_sent`→`auth_completed` drop-off.
2. Build `components/admin/StatCard.tsx` for a metric tile.
3. Build `app/admin/stats/page.tsx` (gated by the Phase 16 admin layout) rendering the six groups read-only.
4. Keep all queries to simple aggregates so an events scan stays fast.
5. Surface waitlist depth per game prominently as the expansion-trigger sensor (Section 6).

**Done when:**
- [ ] `/admin/stats` renders all six metric groups from direct SQL over `events`/tables
- [ ] The funnel and drop-off figures reflect seeded events correctly
- [ ] Build passes, tests pass, committed

### Phase 19 Execution Summary

**Goal:** Ship the read-only `/admin/stats` page computing all six metric groups as direct SQL over events and tables.

**Key Deliverables:**
- `/admin/stats` read-only page with the six metric groups
- Documented SQL for each metric over `events`/tables

**Estimated Duration:** 2.5h

### Phase 19 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 19.1 - `/admin/stats` read-only metrics over events | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

### 🛑 HUMAN VERIFICATION GATE — M4 (spec §10: Admin panel)

**STOP — do not proceed past this gate without explicit human confirmation.**

**Gate criteria (spec §10 M4):**
- Run a fictional game lifecycle — create, fill with shadow + real players, confirm payments, mark attendance, settle — in under 5 minutes of admin time.
- The stats page reflects the fictional game's events correctly.

Phase 20 must not begin until a human has explicitly confirmed every criterion above.

---

## Phase 20: PWA basics + design/strings/privacy polish

### Overview
Ship the M5 non-code and copy polish: PWA manifest + icons + theme color so "Add to Home Screen" yields a clean icon/splash (no offline/service-worker logic), a full pass over `lib/strings.ts` for English copy quality, design-reference conformance against `index.html` on real mobile devices, and the `/privacy` page with clearly-marked DRAFT placeholder text (final legal copy dropped by a human). This is largely artifact/verification work rather than new logic.

### Prerequisites
- [ ] Phase 10 (share images/theme), Phase 11 (player surfaces to polish)

### Deliverables
- [ ] PWA manifest + icons + theme color; installable to home screen
- [ ] English copy pass + design conformance + `/privacy` DRAFT page

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Home-screen icon/splash broken | Low | Low | Verify manifest + icon sizes on a real phone install |
| Final legal text accidentally generated | Low | Med | DRAFT marker; human supplies final copy (§8) |

### Milestone 20.1: PWA manifest + icons + theme color

**What:** Ship the PWA basics so "Add to Home Screen" yields a clean icon and splash: a web manifest, home-screen icons, and the theme color — no offline logic or service worker (Section 6). This is verified by installing to a real phone home screen, not by unit tests.

**Files:** `app/manifest.ts` (C), `public/icons/icon-192.png` (C), `public/icons/icon-512.png` (C), `public/apple-touch-icon.png` (C), `app/layout.tsx` (M)

**Size:** M - Manifest, three icon assets, and the theme-color metadata.

**Steps:**
1. Implement `app/manifest.ts` with name, start URL, display `standalone`, background/theme color, and icon references.
2. Add the 192px and 512px maskable icons and the Apple touch icon in the volt-on-black style.
3. Add the theme-color and apple-touch-icon metadata to `app/layout.tsx`.
4. Confirm no service worker or offline logic is introduced (Section 6/12).

**Done when:**
- [ ] Installing the app to a real phone home screen shows the correct icon and splash (artifact check)
- [ ] The manifest validates and references the 192/512 icons and theme color
- [ ] No service worker/offline logic is present (artifact check)

### Milestone 20.2: English copy pass + design conformance

**What:** Do a full quality pass over `lib/strings.ts` for English copy and verify design-reference conformance against `index.html` on real mobile devices — the volt-on-black aesthetic matched, not reinterpreted (Section 2). This is artifact/verification work, confirmed by side-by-side review on a phone.

**Files:** `lib/strings.ts` (M), `app/page.tsx` (M)

**Size:** M - A copy sweep and a design-conformance pass across the player surfaces.

**Steps:**
1. Review every key in `lib/strings.ts` for English copy quality and consistency (no hardcoded strings elsewhere).
2. Compare each player surface against `/Users/oliverstaehelin/dev/hrajfotbalek/index.html` on a real mobile viewport and correct drift in `app/page.tsx`.
3. Verify colors/fonts/spacing resolve from the theme tokens, matching the reference.
4. Confirm mobile-first layout holds on a real phone.

**Done when:**
- [ ] A side-by-side review on a real phone shows the app matches the `index.html` volt-on-black reference (artifact check)
- [ ] Every user-facing string comes from `lib/strings.ts` with quality English copy
- [ ] Mobile-first layout verified on a real device (artifact check)

### Milestone 20.3: `/privacy` DRAFT page

**What:** Build the `/privacy` page with clearly-marked DRAFT placeholder text (final legal copy is dropped in by a human at M5) per Section 8 — no generated final legal text. Verified by confirming the DRAFT marker and the signup/account links resolve.

**Files:** `app/privacy/page.tsx` (C)

**Size:** S - A single DRAFT privacy page linked from signup/account.

**Steps:**
1. Build `app/privacy/page.tsx` with placeholder copy clearly marked DRAFT (Section 8).
2. Do not generate final legal text — leave the human-supplied slot obvious.
3. Confirm the signup consent link and the account deletion-request context point to `/privacy`.

**Done when:**
- [ ] `/privacy` renders clearly-marked DRAFT placeholder text, with no final legal copy generated (artifact check)
- [ ] The signup consent link resolves to `/privacy` (artifact check)
- [ ] No regressions in existing functionality

### Phase 20 Execution Summary

**Goal:** Deliver the M5 non-code polish — PWA install artifacts, English copy + design conformance, and the DRAFT privacy page.

**Key Deliverables:**
- PWA manifest + icons + theme color; installable to home screen
- English copy pass + design conformance + `/privacy` DRAFT page

**Estimated Duration:** 2.5h

### Phase 20 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 20.1 - PWA manifest + icons + theme color | Pending | - |
| 20.2 - English copy pass + design conformance | Pending | - |
| 20.3 - `/privacy` DRAFT page | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 21: E2E Playwright suite (16 criteria)

### Overview
Build the Playwright suite covering the remaining ANALYZE §11 acceptance criteria — criteria 11 and 16 (concurrent last-spot booking and concurrent credit redemption) are verified earlier at the M1 gate in Phase 7 and are not repeated here. User-visible paths get UI tests; data criteria (events per action, ledger non-negativity, RLS isolation, cross-user RPC rejection) assert via API/SQL. Runs against the seed fixtures in dry-run email mode. Together with Phase 7's concurrency specs this completes Playwright coverage of all 16 criteria; this is the M5 verification backbone.

### Prerequisites
- [ ] Phase 15 (full lifecycle), Phase 18 (admin operations)

### Deliverables
- [ ] Playwright specs for the remaining 14 criteria (UI + API/SQL assertions); criteria 11 & 16 covered at the M1 gate (Phase 7)
- [ ] Data, RLS, cross-user RPC, and cron-idempotency assertions

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Magic-link auth blocks E2E | Med | Med | Test hook / seeded session for authenticated flows |

### Milestone 21.1: Playwright harness + user-path specs

**What:** Stand up the Playwright suite (config + a seeded-session helper so magic-link auth doesn't block E2E) and the user-visible-path specs: book→QR, credit auto-apply, full-game waitlist join, cancel→credit→release→convert, and the admin lifecycle (confirm, add shadow, attendance→settle). Runs against the Phase 7 seed fixtures in `EMAIL_DRY_RUN=on`.

**Files:** `playwright.config.ts` (C), `e2e/helpers/session.ts` (C), `e2e/booking.spec.ts` (C), `e2e/waitlist.spec.ts` (C), `e2e/admin.spec.ts` (C), `package.json` (M)

**Size:** L - Test config, an auth harness, three UI-path spec files, and the test scripts.

**Steps:**
1. Implement `playwright.config.ts` running against the seed fixtures in dry-run email mode (Section 7.5).
2. Implement `e2e/helpers/session.ts` seeding an authenticated session so magic-link auth doesn't block flows.
3. Write `e2e/booking.spec.ts` covering book→QR in <60s for an authenticated player and credit auto-apply full/partial (criteria 1, 7).
4. Write `e2e/waitlist.spec.ts` covering full-game waitlist join and cancel→credit→release→convert untouched by human hands (criteria 2, 5).
5. Write `e2e/admin.spec.ts` covering confirm ≤5s + badges, add-shadow ≤10s, and attendance→settle (criteria 3, 4, 8, 13).
6. Add the E2E scripts to `package.json`.

**Done when:**
- [ ] Book→QR, waitlist, cancel→credit→release→convert, and the admin lifecycle specs pass in dry-run
- [ ] The seeded-session helper lets authenticated flows run without magic-link round-trips
- [ ] Build passes, tests pass, committed

### Milestone 21.2: Data, RLS & idempotency specs

**What:** Write the data-assertion specs that assert via API/SQL rather than the UI: every event-catalog row per action, ledger non-negativity, cron idempotency, RLS cross-user isolation and anon roster projection, and cross-user RPC rejection. The two concurrency criteria (11, 16) are verified at the M1 gate in Phase 7 and are not repeated here.

**Files:** `e2e/data.spec.ts` (C)

**Size:** S - One API/SQL-asserting spec file for the data, RLS, and idempotency criteria.

**Steps:**
1. In `e2e/data.spec.ts`, assert RLS isolation: a logged-in player cannot read another player's data, anon `game_roster_public` exposes only nickname+status, and cross-user/non-admin RPC calls are rejected (criteria 10, 15).
2. In `e2e/data.spec.ts`, assert every catalog action writes its event row (criterion 9) and cron double-run produces no duplicate emails/events (criterion 12).
3. Rely on Phase 7's `e2e/concurrency.spec.ts` for criteria 11 & 16 — do not duplicate the concurrency harness here.

**Done when:**
- [ ] RLS, cross-user RPC, event-catalog, and cron-idempotency criteria all assert via API/SQL (criteria 9, 10, 12, 15)
- [ ] Build passes, tests pass, committed

### Phase 21 Execution Summary

**Goal:** Deliver the Playwright suite covering the §11 acceptance criteria that remain after the M1 gate (criteria 11 & 16 verified in Phase 7), in dry-run.

**Key Deliverables:**
- Playwright specs for the remaining 14 §11 criteria (UI + API/SQL assertions)
- Data, RLS, cross-user RPC, and cron-idempotency assertions (criteria 11 & 16 covered at M1/Phase 7)

**Estimated Duration:** 3.5h

### Phase 21 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 21.1 - Playwright harness + user-path specs | Pending | - |
| 21.2 - Data, RLS & idempotency specs | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

## Phase 22: Dry-run cutover — SMTP→Resend, `EMAIL_DRY_RUN=off`, acceptance

### Overview
Perform the M5 production cutover once DNS is verified: switch Supabase SMTP from the built-in sender to Resend, flip `EMAIL_DRY_RUN` off (the only change needed — everything was built against dry-run), and run a real game end-to-end in parallel with the WhatsApp process as the final acceptance gate. This is a config/ops phase with minimal code change, gated by the full acceptance checklist (§11). Lessons learned are appended to `CLAUDE.md` (§13).

### Prerequisites
- [ ] Phase 21 (all criteria pass in dry-run); Resend DNS verified

### Deliverables
- [ ] Supabase SMTP → Resend; `EMAIL_DRY_RUN=off`; real emails delivering
- [ ] Acceptance checklist run against a real dry-run game

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Resend DNS still unverified at cutover | Med | Med | Keep dry-run until verified; flag flip is the only change |
| Auth email regresses after SMTP switch | Med | High | Verify magic-link delivery on a real phone post-switch |

### Milestone 22.1: Supabase SMTP → Resend + `EMAIL_DRY_RUN=off`

**What:** Perform the production email cutover once DNS is verified: switch Supabase SMTP from the built-in sender to Resend and flip `EMAIL_DRY_RUN` off — the only change needed, since everything was built against dry-run (Section 2/8). Verified by real email delivery and magic-link delivery on a phone.

**Files:** `supabase/config.toml` (M), `.env.example` (M)

**Size:** S - The SMTP provider switch and the dry-run flag flip, both config.

**Steps:**
1. Switch Supabase SMTP from the built-in sender to Resend in `supabase/config.toml` per Section 8.
2. Document `EMAIL_DRY_RUN=off` and the Resend SMTP credentials in `.env.example` for production.
3. Keep the flip gated on verified Resend DNS (Section 2 — dry-run until verified).
4. Confirm the magic-link email now routes through Resend alongside `EMAIL_DRY_RUN=off`.

**Done when:**
- [ ] A transactional email is delivered for real (not dry-run logged) after the flag flip (artifact check)
- [ ] Magic-link delivery is verified on a real phone post-switch (artifact check)
- [ ] The change is limited to config (SMTP + flag), with no logic change

### Milestone 22.2: Live-send path verification

**What:** Verify the `sendEmail()` live-send branch behaves correctly with `EMAIL_DRY_RUN=off` — real sends for every template, no dry-run logging — and default the flag safely for production. This confirms the seam built in Phase 1 flips cleanly with no code churn.

**Files:** `lib/email/sendEmail.ts` (M)

**Size:** S - Confirm and default the live-send branch of the email seam.

**Steps:**
1. Confirm `lib/email/sendEmail.ts` takes the live-send branch when `EMAIL_DRY_RUN` is off and logs when on.
2. Default the flag conservatively so a missing value never silently sends in a non-production context.
3. Send one live email per template family and confirm delivery.

**Done when:**
- [ ] Every template family delivers a real email with the flag off (artifact check)
- [ ] A missing/on flag still logs rather than sends (artifact check)
- [ ] No dry-run logging remains for real sends in production

### Milestone 22.3: Real dry-run game acceptance + `CLAUDE.md` lessons

**What:** Run a real game end-to-end in parallel with the WhatsApp process as the final acceptance gate (Section 10 M5 / Section 11 checklist), and append the Phase 1 lessons learned to `CLAUDE.md` (Section 13) so future sessions start smarter.

**Files:** `CLAUDE.md` (C)

**Size:** S - The acceptance run and the lessons-learned write-up.

**Steps:**
1. Create a real game and run the §11 acceptance checklist end-to-end (book→QR on a phone, WhatsApp preview card, `.ics` opening in a phone calendar, concurrency winner) in parallel with the WhatsApp process.
2. Verify magic-link and transactional emails deliver on real phones.
3. Confirm every §11 criterion passes against the real dry-run game.
4. Append the Phase 1 lessons learned to `CLAUDE.md` per Section 13.

**Done when:**
- [ ] A real game runs end-to-end and every §11 acceptance criterion passes (artifact check)
- [ ] Magic-link and transactional email delivery confirmed on real phones (artifact check)
- [ ] Lessons learned appended to `CLAUDE.md`

### Phase 22 Execution Summary

**Goal:** Perform the M5 production cutover — SMTP→Resend, `EMAIL_DRY_RUN=off` — and pass the real-game acceptance gate.

**Key Deliverables:**
- Supabase SMTP → Resend; `EMAIL_DRY_RUN=off`; real emails delivering
- Acceptance checklist run against a real dry-run game + `CLAUDE.md` lessons

**Estimated Duration:** 1.5h

### Phase 22 Summary

| Milestone | Status | Commit Hash |
|-----------|--------|-------------|
| 22.1 - Supabase SMTP → Resend + `EMAIL_DRY_RUN=off` | Pending | - |
| 22.2 - Live-send path verification | Pending | - |
| 22.3 - Real dry-run game acceptance + `CLAUDE.md` lessons | Pending | - |

### Phase Completion Criteria
- [ ] All milestones completed
- [ ] Integration tests for phase functionality (or artifact verification for non-code phases)
- [ ] No regressions in existing functionality

---

### 🛑 HUMAN VERIFICATION GATE — M5 (spec §10: Polish + dry run)

**STOP — do not proceed past this gate without explicit human confirmation.**

**Gate criteria (spec §10 M5):** the full §11 acceptance checklist passes — all 16 acceptance criteria, verified by Playwright E2E (user-visible paths) and API/SQL assertions (events, ledger, RLS, concurrency), plus:
- `EMAIL_DRY_RUN` off and Supabase SMTP switched from the built-in sender to Resend, with real transactional-email and magic-link delivery confirmed on a phone.
- A real game created and run end-to-end in parallel with the WhatsApp process.

Phase 1 is complete only after a human has explicitly confirmed the full acceptance checklist.

---

## 5. Database Schema

> Detail level: greenfield — field names + types included. The plan is the primary design source; the implementer generates Postgres/Prisma-equivalent conventions (timestamps, defaults) from these definitions.

### 5.1 Entity Definitions

**players** — Durable player identity, decoupled from auth. Shadow players exist before any login.
- Relations: `auth.users` (N:1 optional via `auth_user_id`), bookings/credit_ledger/waitlist (1:N)
- Fields: `id` (UUID, PK), `nickname` (text, unique, required, safe charset ≤20), `email` (text, unique, nullable — null for email-less shadows), `phone` (text, nullable), `auth_user_id` (UUID FK→auth.users, nullable — null = shadow), `is_admin` (bool, default false), `is_seed` (bool, default false), `marketing_opt_in` (bool, default false), `created_at` (timestamptz)
- Constraints: nickname CHECK mirrors app regex `[A-Za-z0-9 _-]{1,20}`
- Notes: deletion = anonymization (nickname → `deleted-player-<id>`, email/phone → null); row retained so events/ledger stay keyed.

**games** — A scheduled pickup game and its status machine.
- Relations: bookings/waitlist (1:N)
- Fields: `id` (UUID, PK), `venue` (text — escaped at every render), `starts_at` (timestamptz), `capacity` (int), `price_czk` (int), `status` (enum: draft/published/full/played/settled/cancelled), `city` (text default 'prague'), `brand` (text default 'hrajfotbal'), `created_at` (timestamptz)
- Notes: capacity can never drop below active booking count; price changes never affect existing bookings.

**bookings** — Every spot is a state transition.
- Relations: games (N:1), players (N:1)
- Fields: `id` (UUID, PK), `game_id` (FK), `player_id` (FK), `status` (enum: reserved/confirmed/cancelled/expired), `payment_method` (enum: qr/cash/credit/seed_free), `payment_code` (numeric VS, unique, nullable — QR only), `price_czk` (int, locked at booking), `credit_applied_czk` (int default 0), `is_seed` (bool), `booked_by_admin` (bool), `attendance` (enum: null/present/no_show), `nudge_sent_at` (timestamptz null), `reminder_sent_at` (timestamptz null), `expires_at` (timestamptz null), `cancel_lead_hours` (numeric null), `created_at`
- Indexes: `(game_id, player_id) where status in (reserved,confirmed)` unique; `(status, expires_at)` for expiry sweep; VS index for pending sort
- Notes: written only by RPCs.

**credit_ledger** — Append-only wallet. Balance = `SUM(delta_czk)`, never negative.
- Relations: players (N:1), bookings (N:1 nullable)
- Fields: `id` (UUID, PK), `player_id` (FK), `delta_czk` (int — negative for redemptions), `reason` (enum: cancellation_credit/admin_grant/redemption/adjustment), `booking_id` (nullable FK), `created_at`
- Notes: no UPDATE/DELETE (privileges revoked); redemptions written under player advisory lock.

**waitlist** — FCFS interest in a full game.
- Relations: games (N:1), players (N:1)
- Fields: `id` (UUID, PK), `game_id` (FK), `player_id` (FK), `joined_at`, `notified_at` (nullable — last notified, not a suppression flag), `converted_booking_id` (nullable FK)
- Constraints: unique `(game_id, player_id)`

**events** — Append-only log; every metric is a query over this.
- Fields: `id` (UUID, PK), `event_type` (text — from the §3 catalog), `player_id`/`game_id`/`booking_id` (nullable FKs), `metadata` (jsonb), `city`, `brand`, `playbook_version` (text default 'v1'), `policy_version` (text default 'v1'), `created_at`
- Notes: no client access; written in the same transaction as its state change.

**game_roster_public** (view) — The only anonymous roster read.
- Projection: `game_id`, `nickname`, booking `status` — nothing else
- Notes: `SECURITY DEFINER` view/function bypassing row-owner RLS; must never expose `player_id`/`email`/`phone`.

### 5.2 Relationships
- players 1:N bookings, credit_ledger, waitlist, events
- games 1:N bookings, waitlist, events
- bookings 1:N credit_ledger (via `booking_id`), 1:1 waitlist (via `converted_booking_id`)
- auth.users 1:1 players (via `auth_user_id`, optional)

### 5.3 Indexes & Constraints

| Table | Index/Constraint | Columns | Purpose |
|-------|-----------------|---------|---------|
| bookings | unique (partial) | (game_id, player_id) where status in (reserved,confirmed) | One active booking per player per game |
| bookings | idx expiry | (status, expires_at) | Expiry sweep query |
| bookings | idx pending | (game_id, payment_code) | VS-sorted pending confirm list |
| waitlist | unique | (game_id, player_id) | One waitlist entry per player per game |
| players | unique | nickname; email (partial, non-null) | Identity uniqueness |
| credit_ledger | privilege | revoke UPDATE/DELETE | Append-only integrity |
| events | idx | (event_type, created_at) | Stats aggregation |

### 5.4 Migration Strategy
- Naming: `YYYYMMDDHHMMSS_description.sql`; RLS enabled in the same migration that creates each table (§13).
- **Explicit GRANTs required.** The Supabase project has "automatically expose new tables" **disabled** and automatic RLS **enabled**, so a permissive RLS policy alone returns nothing — the `anon`/`authenticated` roles have no table privilege by default. Every migration must include explicit `GRANT`s to `anon`/`authenticated` **only where the spec permits reads** (published games + `game_roster_public` → `anon` SELECT; own-row `players`/`bookings`/`credit_ledger`/`waitlist` → `authenticated` SELECT, plus UPDATE on `players` own row). `events` gets no client grant; `credit_ledger` keeps UPDATE/DELETE revoked (append-only). GRANT scope must never exceed the RLS policy — RLS remains the row-level filter; GRANTs only open the table to the role at all.
- Each migration ships a working `down` (drop objects in reverse dependency order).
- No production data to migrate (greenfield); seed script handles dev data.

## 6. API Design

The app has **no conventional REST write API** — all state changes are `supabase.rpc()` calls to plpgsql functions. HTTP route handlers exist only for auth callback and cron.

### 6.1 Endpoints Overview

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| RPC | `create_booking` | Book/convert a spot (owner) | Player JWT |
| RPC | `cancel_booking` | Cancel own booking (window-gated) | Player JWT |
| RPC | `confirm_booking` | Mark paid (admin/bank poller) | Admin JWT / service-role |
| RPC | `expire_booking` | Expire lapsed reservation | Service-role (cron) |
| RPC | game transitions | publish / settle / cancel_game | Admin JWT / service-role |
| GET | `/auth/callback` | Magic-link callback + shadow claim | Supabase session |
| GET | `/api/cron/nudge` | Scarcity nudge sweep | `CRON_SECRET` |
| GET | `/api/cron/expiry` | Expiry sweep + waitlist notify | `CRON_SECRET` |
| GET | `/api/cron/reminder` | 24h reminder sweep | `CRON_SECRET` |
| read | `game_roster_public` | Anonymous roster | anon |

### 6.2 Key Contracts

**create_booking:** `game_id` (UUID), `payment_method` (qr/cash), `from_waitlist_id` (UUID, optional) → booking row `{ id, status, payment_code (VS), price_czk, credit_applied_czk, amount_due }`. Identity from `auth.uid()`; full-credit path returns `confirmed` with no VS.
**cancel_booking:** `booking_id` (UUID) → `{ id, status: cancelled, credit_issued_czk }`. Rejects unless game published/full AND `now() < starts_at`.
**confirm_booking:** `booking_id` (UUID), `confirmed_by` (UUID) → `{ id, status: confirmed }`. Admin-or-cron authorization inside function.
**expire_booking:** `booking_id` (UUID) → `{ id, status: expired }`. Cron/service-role only.
**game transitions:** `game_id` (+ edits) → updated game; `cancel_game` fans out cancellations/credits/waitlist-clear.

**Design decisions:**
- **RPC-only writes** — the state+event+ledger "same transaction" guarantee only holds inside the DB; no client-assembled transitions, ever.
- **Identity from session, never client id** — `create_booking`/`cancel_booking` owner-only via `auth.uid()`; `confirm`/`expire` admin-or-cron. Service-role grants *reach*, not permission; authorization is inside each function.
- **Advisory-lock ordering** — player lock then game lock, everywhere, hashing UUIDs via `hashtextextended(id::text, 0)`.
- **Cron auth via header secret** — no external job runner; `CRON_SECRET` gates every cron route.
- **Anon reads via SECURITY DEFINER view only** — the single PII-safe roster path.

### 6.3 Error Codes

| Code | HTTP/RPC | Description |
|------|----------|-------------|
| CAPACITY_FULL | RPC raise | Game at capacity — friendly "spot already taken" |
| DUPLICATE_ACTIVE_BOOKING | RPC raise | Player already has an active booking for the game |
| CANCEL_WINDOW_CLOSED | RPC raise | Cancellation after kickoff / wrong game status |
| INSUFFICIENT_PERMISSION | RPC raise | Non-owner / non-admin invocation rejected |
| CREDIT_NEGATIVE_BLOCKED | RPC raise | Redemption would drive balance below zero |
| CRON_UNAUTHORIZED | 401 | Missing/invalid `CRON_SECRET` |
| NICKNAME_INVALID | 400 | Charset/length/duplicate at signup |

## 7. Testing Strategy

### 7.1 Test Pyramid
```
        /\        E2E (Playwright) — 16 acceptance criteria
       /--\
      /----\      Integration — RPC functions vs real DB, RLS, cron idempotency
     /------\
    /--------\    Unit — SPD builder, ics, strings, formatters, sanitizers
    ------------
```

### 7.2 Unit Tests
- `lib/payments/spd.ts` (nickname sanitize, field cap, framing), `lib/calendar/ics.ts`, `lib/format.ts` (Prague 24h), nickname validator.
- Mock no external services — these are pure functions.

### 7.3 Integration Tests
- RPC functions against a real test DB: capacity under concurrency, credit non-negativity, owner/admin authorization, cancellation window, waitlist conversion.
- Cron idempotency: double-run yields no duplicate emails/events.
- RLS: cross-user read isolation; anon roster projection.

### 7.4 E2E Tests
- All §11 criteria with user-visible paths (book→QR, waitlist, cancel→credit→release, admin lifecycle, WhatsApp preview, `.ics`).
- Data criteria (events, ledger, RLS, cross-user RPC, concurrency) asserted via API/SQL in-test, not by eyeballing.

### 7.5 Test Data
- `scripts/seed.ts` fixtures: shadow + seed + real players, games in every status, bookings in every state, waitlist entries, credit balances.
- E2E runs in `EMAIL_DRY_RUN=on`; assert dry-run logs for email criteria.

## 8. Risk Assessment

| Risk | Probability | Impact | Mitigation | Owner |
|------|-------------|--------|------------|-------|
| Credit double-spend across concurrent games | Med | High | Player advisory lock + non-negative re-read (Phase 4) | Backend |
| Last-spot double-booking | Med | High | Game lock + partial unique constraint (Phase 4) | Backend |
| PII leak via roster/RLS | Med | High | SECURITY DEFINER view, deny-by-default RLS, anon-leak test | Backend |
| Definer privilege escalation | Med | High | `search_path=''` + schema-qualified refs in every RPC | Backend |
| Cron non-idempotency → duplicate emails | Med | Med | `*_sent_at` guards, one-event-per-transition | Backend |
| SPD/QR fails in real banking app | Med | High | Spec-conformant builder, M2 gate scans real app | Frontend |
| Resend DNS unverified at launch | Med | Med | Dry-run seam; flip flag is the only cutover change | Ops |
| Nickname XSS/SPD injection | Low | High | Safe-charset at signup + escape at render (Phases 1/6/10) | Full-stack |
| Shadow-claim mis-bind | Med | Med | Exact-email-only auto-claim; admin merge for the rest | Backend |
| Manual ops steps (Supabase project/keys/redirect URLs, Vercel env + cron activation, SMTP switch) not done or misconfigured | Med | High | Pre-gate manual-ops checklist per milestone (documented steps + verification before each gate) | Oliver |

## 9. Rollback Strategy

### 9.1 Database Rollback
- Every migration ships a working `down` (drop RPCs/views/tables/constraints in reverse dependency order).
- Test each `down` locally before push; greenfield means no prod data to preserve in Phase 1.

### 9.2 Code Rollback
- `main` = production on Vercel; roll back by reverting the deploy (Vercel instant rollback) or `git revert`.
- `EMAIL_DRY_RUN` is the primary feature flag — flipping it back on immediately halts real sends without a deploy.

### 9.3 Emergency Procedures
- If a cron misfires: revoke `CRON_SECRET` (disables all cron routes) while investigating.
- If a bad deploy ships: Vercel rollback to previous production build; RPC/schema changes are additive-first where possible.
- Communication: single-operator Phase 1 — log incident + fix in `CLAUDE.md` lessons-learned.

## 10. Appendix

### 10.1 Glossary

| Term | Definition |
|------|------------|
| Shadow player | A `players` row with null `auth_user_id` created by admin before the person logs in |
| Claim | Linking a shadow player to an auth user on exact email match (`player_claimed`) |
| VS | Variable symbol — unique numeric payment reference, `26` + 8-digit sequence |
| SPD | Czech "Short Payment Descriptor" 1.0 QR payment string standard |
| Nudge | One-time "pay within 12h or lose the spot" email when a full game has a waitlist |
| Seed player | `is_seed` player: price 0, `seed_free`, confirmed instantly |
| Dry-run | `EMAIL_DRY_RUN=on` — emails logged, not sent, until DNS verifies |
| Settle | Terminal game state after attendance marking completes |

### 10.2 References
- Analysis: `~/.letco/planning-workspace/bc44383f-eb7c-4123-b825-fac267876691/LETCO_ANALYZE.md`
- Design reference: `/Users/oliverstaehelin/dev/hrajfotbalek/index.html` (volt-on-black; match, don't reinterpret)
- Spec source: `letco-prompt-hrajfotbal-phase1-v2.md`
