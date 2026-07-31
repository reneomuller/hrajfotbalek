# hrajsport.cz Phase 2 — Execution Plan

<!-- FORMAT_VERSION: 2.0 -->

> **Version:** 1.0.0
> **Created:** 2026-07-28
> **Contract:** `letco-prompt-hrajsport-phase2-v1.md` v1.1.1
> **Inputs:** `PHASE2_ANALYZE.md`, `PHASE2_IMPLEMENTATION.md`
> **Estimated duration:** ~34 hours (2 040 minutes) across 22 phases
> **Scope:** frozen at v1.1.1. Discoveries go to `POLISH.md`, never into this plan.

---

## Standing rules for every phase

Inherited from the Phase 2 contract §1 and the Phase 1 contract v2.5. These are
not repeated per phase; they are conditions of every phase.

- **Production is live.** Feature branches only; `main` deploys on push.
- **Migrations are additive.** Any `drop` requires a human gate sign-off naming it.
- **RPC-only writes.** `SECURITY DEFINER`, `search_path=''`, schema-qualified, identity from the session — never from an argument.
- **RLS on in the creating migration**, grants stated explicitly. A missing grant returns empty, not an error.
- **`reset-platform.mjs` is never run against production. No session flips production `EMAIL_DRY_RUN`.**
- **Every player-facing string ships with its Czech and Russian in the same phase** (F8) — otherwise `npm run test:unit` fails.
- **Every phase ends green:** `tsc` clean, unit tests, relevant SQL suites, relevant E2E.
- Every game insert keeps populating the legacy `games.venue` NOT NULL column (F3).

---

## Progress tracking

The three 🛑 **GATE** rows are contract §10 gates. They are **mandatory halt
points for any execution session**, not checklist items.

| Phase | Gate | Status | Started | Completed | Notes |
|-------|------|--------|---------|-----------|-------|
| 0. Environment: local Supabase stack | G1 | **Complete** | 2026-07-28 | 2026-07-28 | `ee48b93`. Stack on PG 17.6 (= production); 20 migrations replay clean; `.env.test.local` split + local-only guard; `reuseExistingServer` hole closed; 28/28 E2E |
| 1. Migration 21+22: profile columns, `skill_level`, `credit_reason.topup` | G1 | **Complete** | 2026-07-28 | 2026-07-28 | Enum shipped as **22**, not 23 — `complete_signup_v2` moves to 23. `player_profile_columns.sql` 25/25; 17/17 suites |
| 2. `complete_signup_v2` + SQL suite | G1 | **Complete** | 2026-07-31 | 2026-07-31 | Migration 23. Two consents (GDPR + TOS) kept separate — see the phase note. `complete_signup_v2.sql` 28/28; 18/18 suites |
| 3. Signup rebuilt: password account creation | G1 | Not started | - | - | |
| 4. `/terms` + terms content | G1 | **Complete** | 2026-08-01 | 2026-08-01 | Real copy delivered: EN + CZ, version 1.0. RU deliberately absent — English shown with a notice. **`/privacy` copy still owed** |
| 5. Login rework + existing-account migration | G1 | Not started | - | - | R1 |
| 6. Account: change password, change email | G1 | Not started | - | - | |
| 7. Storage bucket + profile photos | G1 | Not started | - | - | |
| 8. `credit_topups` + `create_topup` / `confirm_topup` + SQL suite | G1 | Not started | - | - | R3 |
| 9. Top-up UI + QR + admin confirm + receipt email | G1 | Not started | - | - | |
| 10. Account history | G1 | Not started | - | - | |
| 11. G1 E2E specs + screenshot strips | G1 | Not started | - | - | |
| **🛑 GATE G1 — Auth + profile** | **G1** | **Not verified** | - | - | **STOP** |
| 12. Migrations 27+28: duration, skill levels, organizer contacts | G2 | Not started | - | - | R2 |
| 13. Admin game form: organizer, duration, skill | G2 | Not started | - | - | |
| 14. Duration rendered everywhere | G2 | Not started | - | - | |
| 15. Skill badges + organizer display gating | G2 | Not started | - | - | |
| 16. Venue photo panel + copy-link share + toasts | G2 | Not started | - | - | |
| 17. `site_settings` + home page rework | G2 | Not started | - | - | |
| 18. Admin player detail + manage/edit merge | G2 | Not started | - | - | R9 |
| 19. Stats rework | G2 | Not started | - | - | R7 |
| 20. G2 E2E specs + screenshot strips | G2 | Not started | - | - | |
| **🛑 GATE G2 — Games + content** | **G2** | **Not verified** | - | - | **STOP** |
| 21. `/football` rewrites + origin-derived surfaces | G3 | Not started | - | - | |
| 22. Cutover + cron cadence restore | G3 | Not started | - | - | Human-executed; R8 |
| **🛑 GATE G3 — Cutover** | **G3** | **Not verified** | - | - | **STOP** |

---

## Phase 0 — Environment: local Supabase stack

**Goal:** a seeded local database that `npm run seed` and `npm run test:e2e` succeed against, with no path by which a test runner can reach production.
**Depends on:** Docker Desktop, installed and running (confirmed 2026-07-28, E1 ruled **option A**).
**Blocks:** every phase carrying an E2E criterion — which is most of them.
**Duration:** 120 min of session time, plus one first-run image pull.

Runbook detail lives in `PHASE2_ENVIRONMENT.md` §4. This phase is the code and
configuration work that makes the local stack usable; the steps that are purely
Oliver's are marked in that document.

### 0.1 — Start the stack and pin its Postgres major

`npx supabase start` brings up Postgres, Auth, Storage, Studio and Inbucket on
the ports already set in `supabase/config.toml` (API 54321, DB 54322, Studio
54323, Inbucket 54324, Storage 54327).

**Resolved at execution: `config.toml` already pins `major_version = 17`** (line
42), and the stack came up on **17.6** — the same patch as production. An
earlier draft of this section claimed the key was absent; that was a truncated
grep, not a missing key, and the correction is recorded here rather than
quietly dropped. Nothing to pin. The check itself stays in the acceptance
criteria: a local stack on a different major would validate migrations against
the wrong planner and the wrong enum semantics, and the `credit_reason.topup`
sequencing in Phase 1 is reasoned from Postgres 17 behaviour.

### 0.2 — Teach the test tooling to prefer the local stack

`playwright.config.ts` reads **`.env.local` by literal filename**
(`loadEnvLocal()` at line 29, `path.resolve(process.cwd(), ".env.local")`), and
throws at config time if it is missing. That file holds production credentials.
As it stands there is no way to point the suite at the local stack without
overwriting them, which is the single most dangerous shape this environment
could take.

The change:

- `loadEnvLocal()` prefers **`.env.test.local`** when it exists and falls back
  to `.env.local` otherwise, reporting in its error message which file it looked
  for. Local-stack credentials go in `.env.test.local`; production credentials
  stay in `.env.local`, untouched.
- `.env.test.local` is gitignored.
- **A production guard at config time:** if the resolved Supabase URL contains
  the production project ref, the config **throws** rather than running. A suite
  that creates and destroys data must not be one stray file away from doing it
  to real players. This is cheap, and it is the guard that would have made
  option B acceptable — there is no reason to skip it just because we chose A.
- `npm run seed` and `npm run test:integration` resolve their env file the same
  way, so "which database am I about to seed" has one answer, not three.

### 0.3 — Schema, seed, baseline

`npx supabase db reset` applies all 20 migrations from scratch against the local
database — which also proves, for the first time, that the migration set is
replayable end to end rather than only incrementally applied. Then `npm run
seed`, then the suite.

**Acceptance criteria**
- [ ] [REQ-ENV-001] `npx supabase status` reports every service running, and the Postgres major matches production's 17 (pinned in `config.toml` if it did not)
- [ ] [REQ-ENV-001] `npx supabase db reset` applies all 20 migrations cleanly from empty — a replay failure here is a real finding, not an environment quirk
- [ ] [REQ-ENV-001] `npm run seed` succeeds against the local stack
- [ ] [REQ-ENV-001] `npm run test:e2e` is green against it — **28/28**, the Phase 1 baseline; anything less is the environment, not the product
- [ ] [REQ-ENV-002] `.env.test.local` holds the local credentials, is gitignored, and `.env.local` is byte-for-byte unchanged
- [ ] [REQ-ENV-002] The config guard throws when handed a production Supabase URL — asserted by a unit test, not by trying it
- [ ] The Playwright suite's `EMAIL_DRY_RUN=on` forcing still holds against the local stack, so Inbucket receives auth mail and `sendEmail()` still logs rather than sends
- [ ] Toolchain versions in `PHASE2_ENVIRONMENT.md` §2 re-confirmed on this machine

**Files:** `playwright.config.ts`, `vitest.integration.config.ts`, `scripts/seed.ts` (env resolution only), `supabase/config.toml` (only if the major needs pinning), `.gitignore`, `PHASE2_ENVIRONMENT.md`

**Explicitly not in this phase:** no product code, no migration, no schema change. If `db reset` surfaces a replay problem in the existing 20 migrations, that is reported at the Phase 0 boundary and fixed under its own decision — not absorbed silently here.

---

## Phase 1 — Migration 21 + 23: profile columns, `skill_level`, `credit_reason.topup`

**Goal:** additive schema for the profile fields and the top-up ledger reason.
**Depends on:** 0. **Duration:** 60 min.

Two migrations, deliberately separate: `alter type … add value` cannot be used
in the transaction that adds it (F6), so `credit_reason.topup` ships alone and
ahead of Phase 8, which uses it.

**Acceptance criteria**
- [ ] [REQ-AUTH-007] `players` gains `country`, `skill_level`, `tos_accepted_at`, `tos_version`, `photo_path` — all nullable, no UPDATE grants added (F11)
- [ ] New enum `skill_level (beginner|intermediate|advanced)`
- [ ] [REQ-TOPUP-011] `credit_reason` gains `topup` in its own migration
- [ ] [REQ-SEC-002] Grants stated explicitly; existing RLS unaffected
- [ ] Rollback files exist for both
- [ ] SQL suite asserts the new columns are readable by their owner and not writable by `authenticated`

**Files:** `supabase/migrations/2026…_player_profile_columns.sql`, `…_credit_reason_topup.sql`, matching rollbacks, `supabase/tests/player_profile_columns.sql`

---

## Phase 2 — `complete_signup_v2` + SQL suite

**Goal:** one transaction that creates the profile with consent, country and skill.
**Depends on:** 1. **Duration:** 90 min.

Per F2/R4 this is a **new function**, not a replacement: Postgres cannot
`create or replace` into a different parameter list, and dropping the old one is
a destructive migration. `complete_signup` stays in place, orphaned, and its
removal is a later gated item.

**Acceptance criteria**
- [x] [REQ-AUTH-005] Nickname charset and case-insensitive uniqueness enforced in the function
- [x] [REQ-AUTH-009] TOS required; `tos_accepted_at` and `tos_version` stamped
- [x] Country validated as ISO 3166-1 alpha-2; skill required
- [x] Player row + `account_created` written in one transaction
- [x] Named errors: `NICKNAME_INVALID`, `NICKNAME_TAKEN`, `CONSENT_REQUIRED`, `TOS_REQUIRED`, `TOS_VERSION_REQUIRED`, `COUNTRY_INVALID`, `SKILL_REQUIRED`
- [x] [REQ-SEC-001] Identity from `auth.uid()`; no session → refused
- [x] SQL suite green using the strict `count(_p::text)` probe

**Phase note — two consents, kept separate.** Contract §3.1 lists a TOS checkbox
and no GDPR checkbox; v2.5 §8 requires a GDPR consent checkbox and Phase 2 is
silent on removing it, so under §1 ("where this document is silent, v2.5
governs") both are required. They are also different acts — agreeing to the
rules of a booking service is not consenting to the processing of personal data
— and v1's own comment records why bundling them makes the consent non-specific
and therefore invalid. `complete_signup_v2` therefore takes `p_gdpr_consent` and
`p_tos_accepted` separately, with distinct errors, and Phase 3's form will show
**two checkboxes**. Flagged for a ruling: collapsing them into one is a legal
call, not an engineering one.

**Also added beyond the plan:** `TOS_VERSION_REQUIRED`. A TOS acceptance that
does not say which revision was shown is not auditable, and the column CHECK
from migration 21 would have rejected it as a raw constraint violation rather
than a named error.

**Files:** migration + rollback, `supabase/tests/complete_signup_v2.sql`

---

## Phase 3 — Signup rebuilt: password account creation

**Goal:** `/signup` becomes account creation, signed-out, in the contract's field order.
**Depends on:** 2. **Duration:** 150 min.

This inverts the current flow (F1): today `/signup` is post-auth profile
completion. The rebuilt page calls `signUp({email, password})`, then writes the
profile once a user id exists. `destinationAfterAuth()`'s "no player row →
/signup" branch **stays**, because OTP-first arrivals and shadow claims still
produce that state (Q2).

**Acceptance criteria**
- [ ] [REQ-AUTH-001] Two distinct signed-out entries, "Log in" and "Sign up"
- [ ] [REQ-AUTH-002] Fields in contract order; phone optional; reminders opt-in writes `marketing_opt_in`
- [ ] [REQ-AUTH-003] Account created before the profile write; a failed profile write leaves a recoverable state, not an orphan
- [ ] [REQ-AUTH-006] Verification sent once at signup
- [ ] [REQ-AUTH-008] Country list scrollable with type-to-jump
- [ ] [REQ-AUTH-015] Post-auth path shared with the link and code entries — shadow claim and resume both still run
- [ ] [REQ-I18N-001] Every new string carries `cs` and `ru`
- [ ] TEST-201, TEST-205, TEST-206 pass

**Files:** `app/signup/*`, `lib/auth/*`, `lib/strings.ts`, `lib/i18n/cs.ts`, `lib/i18n/ru.ts`

---

## Phase 4 — `/terms` + `content/terms.md`

**Goal:** the terms page ships; the text is owed by a human.
**Depends on:** 3. **Duration:** 45 min.

**Acceptance criteria**
- [ ] [REQ-AUTH-010] `/terms` renders markdown from `content/terms.md`
- [ ] [REQ-I18N-002] A clearly marked placeholder ships; **no generated legal copy**
- [ ] The signup TOS checkbox links to it
- [ ] `tos_version` written at signup matches the version the page declares

**Files:** `app/terms/page.tsx`, `content/terms.md`, `lib/strings.ts`

---

## Phase 5 — Login rework + existing-account migration

**Goal:** password is the primary login; nobody is stranded.
**Depends on:** 3. **Duration:** 150 min. **Risk:** R1 — the highest in Phase 2.

**Acceptance criteria**
- [ ] [REQ-AUTH-011] Email + password with an explicit submit button
- [ ] [REQ-AUTH-012] The Phase 1 OTP path is relabelled "Forgot password / no password yet" and lands on set-password
- [ ] [REQ-AUTH-013] An existing passwordless account completes the migration exactly once and is never asked again
- [ ] [REQ-AUTH-014] Sessions persist until explicit sign-out; no "remember me"
- [ ] The OTP path remains functional throughout — it is the rollback for R1
- [ ] TEST-203, TEST-204 pass

**Files:** `app/login/*`, `lib/auth/*`, strings + overlays

---

## Phase 6 — Account: change password, change email

**Goal:** both controls, above the delete-account mailto.
**Depends on:** 5. **Duration:** 90 min.

**Acceptance criteria**
- [ ] [REQ-AUTH-016] Change password requires the current password
- [ ] [REQ-AUTH-017] Change email confirms from **both** old and new addresses; the UI says so plainly before submission
- [ ] Neither control is reachable without a session
- [ ] TEST-207, TEST-208 pass

**Files:** `app/account/*`, strings + overlays

---

## Phase 7 — Storage bucket + profile photos

**Goal:** photo upload, render, admin removal, and deletion on anonymization.
**Depends on:** 1. **Duration:** 150 min.

No pattern exists in this repo to copy (F5). `storage.objects` policies are a
separate policy surface from table RLS and get the same deny-by-default care.

**Acceptance criteria**
- [ ] [REQ-PROF-001] Bucket is public-read, authenticated-write of own object only
- [ ] [REQ-PROF-002] 2 MB and jpeg/png/webp enforced **at the bucket**
- [ ] [REQ-PROF-003] Client crops to square before upload
- [ ] [REQ-PROF-004] Initials avatar remains the fallback everywhere
- [ ] [REQ-PROF-005] Admin removal clears `photo_path` and emits `profile_photo_removed`
- [ ] [REQ-PROF-006] Anonymization deletes the storage object and clears the reference
- [ ] TEST-209, TEST-210, TEST-211, TEST-212 pass

**Files:** migration + rollback, `app/account/*`, `app/admin/players/*`, `components/`, `lib/storage/*`

---

## Phase 8 — `credit_topups` + RPCs + SQL suite

**Goal:** the money path, proven in SQL before any UI exists.
**Depends on:** 1. **Duration:** 150 min. **Risk:** R3.

**Acceptance criteria**
- [ ] [REQ-TOPUP-001] Table with RLS deny-by-default; owner reads own rows; no client writes
- [ ] [REQ-TOPUP-002] `'27'`-prefixed sequence; no collision with booking `'26'`; never reused
- [ ] [REQ-TOPUP-003] Bounds 50–2000 enforced **in the function**
- [ ] [REQ-TOPUP-004] `create_topup` owner-only, emits `topup_requested`
- [ ] [REQ-TOPUP-006] `confirm_topup` admin-or-service-role only, signature mirrors `confirm_booking`
- [ ] [REQ-TOPUP-007] Credited amount = received amount; null means requested amount
- [ ] [REQ-TOPUP-008] Ledger + status + event in one transaction
- [ ] [REQ-TOPUP-009] Confirming a non-pending top-up is rejected
- [ ] [REQ-TOPUP-012] Pending top-ups contribute nothing to the balance
- [ ] SQL suite covers all of the above, including cross-user rejection

**Files:** migrations + rollbacks, `supabase/tests/topups.sql`

---

## Phase 9 — Top-up UI + QR + admin confirm + receipt email

**Goal:** the player-facing and admin-facing halves of the top-up.
**Depends on:** 8. **Duration:** 150 min.

**Acceptance criteria**
- [ ] [REQ-TOPUP-005] SPD QR renders with the top-up VS, plus the text fallback
- [ ] Presets 150 / 300 / 450 with free entry
- [ ] Admin confirmation follows the one-tap pattern, with the optional received amount
- [ ] [REQ-TOPUP-010] Receipt email (amount, new balance, VS) through `sendEmail()`, dry-run locally
- [ ] [REQ-TOPUP-013] Credit spends through the existing auto-apply rails, unchanged
- [ ] [REQ-I18N-001] Strings in three languages; money vocabulary stays Czech
- [ ] TEST-213, TEST-214, TEST-215, TEST-216, TEST-217 pass

**Files:** `app/account/topup/*`, `app/admin/…`, `lib/email/templates/topupEmails.ts`, `lib/email/dispatch.ts`, strings + overlays

---

## Phase 10 — Account history

**Goal:** games played, past games, upcoming bookings.
**Depends on:** 7. **Duration:** 90 min.

**Acceptance criteria**
- [ ] [REQ-PROF-007] Count, past games with venue/date/attendance, upcoming bookings regrouped from the existing surface
- [ ] Reads stay owner-scoped under RLS; no new grants
- [ ] Strings in three languages

**Files:** `app/account/page.tsx`, `lib/booking/queries.ts`, strings + overlays

---

## Phase 11 — G1 E2E specs + screenshot strips

**Goal:** the G1 journeys automated against the dev database.
**Depends on:** 3–10. **Duration:** 150 min.

**Acceptance criteria**
- [ ] TEST-201 … TEST-217 implemented as Playwright specs
- [ ] Specs build and tear down their own data; the seed tableau is not mutated
- [ ] [REQ-UX-003] Phone-width screenshot strips for signup, login, set-password, account, top-up
- [ ] Whole suite green against the dev database

**Files:** `e2e/auth.spec.ts`, `e2e/profile.spec.ts`, `e2e/topup.spec.ts`, `e2e/helpers/*`

---

## 🛑 GATE G1 — Auth + profile

**This is a mandatory halt point, not a checklist.**

Contract §10 G1: a brand-new user signs up with a password on a real phone
(country, skill, TOS); an existing passwordless user is migrated through
OTP → set-password; password change works; an email change is confirmed from
both addresses; a profile photo uploads, renders, and is gone from storage after
an anonymization; a top-up flows end to end (request → QR → admin confirm →
balance + receipt email). **No existing player locked out.**

Settings verified explicitly, because they are not code:
- [ ] Password minimum is 8 on the hosted project (REQ-AUTH-004)
- [ ] All three auth email templates received on a real phone, each showing a working link and a readable code where required (REQ-AUTH-018)

Questions to answer here: **Q1** (shadow claim through password signup),
**Q2** (half-finished signup state).

**STOP — do not proceed past this gate without explicit human confirmation.**

---

## Phase 12 — Migrations 27 + 28: duration, skill levels, organizer contacts

**Goal:** the game-shape schema, with the organizer phone made unreachable by design.
**Depends on:** G1. **Duration:** 120 min. **Risk:** R2.

**Acceptance criteria**
- [ ] [REQ-GAME-006] `games.duration_minutes` nullable
- [ ] [REQ-GAME-009] `games.allowed_skill_levels` nullable enum array
- [ ] [REQ-GAME-016] **(v1.1.2)** `games.subs_per_team` nullable int, with a sanity CHECK (0–20). Descriptive only — no RPC reads it, and `create_booking`'s capacity check is untouched
- [ ] [REQ-GAME-002] `game_organizer_contacts` with RLS and **no `anon`/`authenticated` grants at all**
- [ ] [REQ-GAME-003] `game_organizer_public` exposes the name for published games
- [ ] [REQ-GAME-004] `game_organizer_phone()` returns the phone only to a caller with an active booking; null otherwise, never an error
- [ ] [REQ-GAME-005] SQL assertions prove `anon` cannot reach the phone by any route, and neither can a booking-less player
- [ ] Rollbacks exist

**Files:** migrations + rollbacks, `supabase/tests/game_organizer_contacts.sql`

---

## Phase 13 — Admin game form: organizer, duration, skill

**Goal:** the create/edit inputs.
**Depends on:** 12. **Duration:** 120 min.

**Acceptance criteria**
- [ ] [REQ-GAME-001] Organizer name required, defaulting to the creating admin's nickname; phone optional
- [ ] [REQ-GAME-006] Duration free numeric, bounded 30–180, defaulting to 60, validated server-side
- [ ] [REQ-GAME-009] Skill selector offers All levels (default) or one/two specific levels
- [ ] [REQ-GAME-016] **(v1.1.2)** Optional substitutes input (`subs_per_team`), validated server-side, left null when not supplied
- [ ] [REQ-GAME-017] **(v1.1.2)** Format is entered by the admin and stored verbatim. Nothing in the form, the RPC or any render site derives it from capacity — asserted by a test that saves a 12-capacity game with format `5v5` and reads back `5v5`
- [ ] [REQ-GAME-015] Legacy `games.venue` still populated
- [ ] Capacity-below-active-bookings and price-locking rules from v2.5 unchanged

**Files:** `app/admin/games/*`, `components/admin/GameForm.tsx`, `lib/admin/gameForm.ts`, strings

---

## Phase 14 — Duration rendered everywhere

**Goal:** one duration, four surfaces, no drift.
**Depends on:** 13. **Duration:** 90 min.

**Acceptance criteria**
- [ ] [REQ-GAME-007] Cards and detail render the range
- [ ] [REQ-GAME-008] `.ics` `DTEND`, schema.org `endDate` and the in-progress label all read the per-game value with the policy constant as null-fallback
- [ ] TEST-219, TEST-220 pass
- [ ] Unit tests cover the fallback at each site

**Files:** `lib/calendar/ics.ts`, `lib/games/schemaOrg.ts`, `components/GameCard.tsx`, `app/game/[id]/page.tsx`, `lib/format.ts`

---

## Phase 15 — Skill badges + organizer display gating

**Goal:** the display half of §5.1 and §5.3.
**Depends on:** 12, 13. **Duration:** 90 min.

**Acceptance criteria**
- [ ] [REQ-GAME-009] All-levels games render **no badge anywhere**
- [ ] [REQ-GAME-010] Restricted games render badges on card and detail
- [ ] [REQ-GAME-011] Booking is never blocked by skill
- [ ] Organizer name renders publicly; the phone renders only for a caller with an active booking
- [ ] [REQ-GAME-017] **(v1.1.2)** Format renders verbatim on card, detail and above the map; `subs_per_team` renders beside it as `6v6 · 2 subs per team` when set, and nothing when null
- [ ] [REQ-GAME-018] **(v1.1.2)** `/game/[id]` is state-aware: a holder of a `reserved`/`confirmed` booking sees their payment state and cancel action and **no** claim CTA; a non-holder sees the claim CTA only while spots remain; a full game still offers the waitlist. Determined server-side from the caller's own booking, never from a nickname match
- [ ] TEST-218, TEST-221, TEST-232, TEST-233 pass
- [ ] Strings in three languages

**Files:** `components/game/*`, `app/game/[id]/page.tsx`, strings + overlays

---

## Phase 16 — Venue photo panel + copy-link share + toasts

**Goal:** the venue panel, the share pair, and the toast component everything else will use.
**Depends on:** G1. **Duration:** 120 min.

**Acceptance criteria**
- [ ] [REQ-GAME-012] Photo panel uses the venue's `image_path`; traced-map assets remain in the repo, unused
- [ ] [REQ-GAME-013] No photo → name + "Open map", no empty frame
- [ ] [REQ-GAME-014] Copy link primary, WhatsApp secondary
- [ ] [REQ-UX-001] One shared toast component, volt-on-black, auto-dismiss
- [ ] [REQ-UX-002] Toasts wired for booking created, sign-in, cancellation + credit, top-up confirmed, link copied
- [ ] [REQ-UX-004] **(v1.1.2)** Translucent surfaces are ~20% more opaque, changed in `tailwind.config.ts` rather than in components — one token edit, no per-component overrides, volt-on-black palette unchanged
- [ ] [REQ-GAME-019] **(v1.1.2)** The mobile games list is calendar-density: **at least three games visible at once at Pixel-7 width**, asserted in the screenshot strip and by a spec, not by eye. The venue-photo swap alone does not discharge this
- [ ] TEST-222, TEST-223, TEST-234 pass

**Files:** `components/VenueMapPanel.tsx` → photo panel, `components/game/ShareButton.tsx`, `components/Toast.tsx`, `VENUES.md` (v2 recipe), strings + overlays

---

## Phase 17 — `site_settings` + home page rework

**Goal:** the stats strip, the FAQ, the three-panel community section.
**Depends on:** 16. **Duration:** 150 min.

**Acceptance criteria**
- [ ] [REQ-HOME-003] Single-row table with **explicit `anon` + `authenticated` SELECT grant** — verified by an anonymous read, not assumed
- [ ] [REQ-HOME-004] Admin-only `set_site_setting` RPC; each change emits an event
- [ ] [REQ-HOME-001] How-it-works strip above fold-two with the equipment line
- [ ] [REQ-HOME-002] Games-per-week computed from published games over the trailing 7 days
- [ ] [REQ-HOME-005] Three equal panels
- [ ] [REQ-HOME-006] Player of the Month falls back to the initials avatar
- [ ] [REQ-HOME-007] The six FAQ entries render as specified — **in three languages** (F8); Czech and Russian FAQ copy is a human deliverable
- [ ] TEST-224, TEST-225 pass

**Files:** migration + rollback, `app/page.tsx`, `components/`, `app/admin/…`, strings + overlays

---

## Phase 18 — Admin player detail + manage/edit merge

**Goal:** the operational admin surfaces.
**Depends on:** G1. **Duration:** 150 min. **Risk:** R9.

**Acceptance criteria**
- [ ] [REQ-ADMIN-001] Player detail shows photo, nickname, email, country, skill, balance, games played, per-game list, no-show count
- [ ] [REQ-ADMIN-002] No-show marking on player detail and on the game roster, both through `mark_attendance`
- [ ] [REQ-ADMIN-003] One game-editing surface carrying add-player, roster, ✓ Paid, attendance, cancel
- [ ] `e2e/admin.spec.ts` updated **in this phase**, not after — it navigates by URL
- [ ] TEST-226 passes

**Files:** `app/admin/players/[id]/*`, `app/admin/games/[id]/*`, `e2e/admin.spec.ts`

---

## Phase 19 — Stats rework

**Goal:** the metrics that get looked at, with a time dimension.
**Depends on:** G1. **Duration:** 150 min. **Risk:** R7.

Per F7 this is a rewrite of `lib/stats/queries.ts`, not an edit: no existing
query has a date bound.

**Acceptance criteria**
- [ ] [REQ-ADMIN-004] Credits-outstanding, magic-link drop-off and waitlist depth removed
- [ ] [REQ-ADMIN-005] No-show rate kept; fill rate, confirmed revenue, new vs returning, cancellations added — each matching the SQL definition in `PHASE2_IMPLEMENTATION.md` §B.4
- [ ] [REQ-ADMIN-006] Day / week / month filter on every metric
- [ ] [REQ-ADMIN-007] No new tracking machinery
- [ ] Unit tests cover the date-window maths
- [ ] TEST-227 passes against a hand-computed week

**Files:** `lib/stats/queries.ts`, `app/admin/stats/page.tsx`, `components/admin/StatCard.tsx`

---

## Phase 20 — G2 E2E specs + screenshot strips

**Goal:** the G2 journeys automated.
**Depends on:** 12–19. **Duration:** 120 min.

**Acceptance criteria**
- [ ] TEST-218 … TEST-227 implemented
- [ ] [REQ-GAME-005] The organizer-phone assertion runs as both SQL and E2E — one proves the grant, the other proves the page
- [ ] Screenshot strips for game detail, home, admin edit, admin stats
- [ ] Whole suite green

**Files:** `e2e/games.spec.ts`, `e2e/home.spec.ts`, `e2e/admin.spec.ts`

---

## 🛑 GATE G2 — Games + content

**This is a mandatory halt point, not a checklist.**

Contract §10 G2: a game created with organizer/duration/skill restriction
renders correctly everywhere (badge only when restricted, phone only to booked
players **and not retrievable by anon through any route**); venue photo panel and
Open-map fallback verified; home page carries the new strip, FAQ and three-panel
community section; stats rework verified against a known week of data; toasts
observed. Duration verified in the `.ics` and the structured data, not only on
screen.

Questions to answer here: **Q3** (site-settings audit trail), **Q4** (how many
venue photos before the panel ships).

**STOP — do not proceed past this gate without explicit human confirmation.**

---

## Phase 21 — `/football` rewrites + origin-derived surfaces

**Goal:** everything the cutover needs, verified on the current origin.
**Depends on:** G2. **Duration:** 120 min.

Nothing in §9 touches production DNS in this phase. This is the code half only.

**Acceptance criteria**
- [ ] [REQ-CUT-001] Rewrites map `/football/*` onto existing routes; no route files move
- [ ] [REQ-CUT-002] `/` redirects to `/football` on the new host only
- [ ] [REQ-CUT-004] OG `metadataBase`, share-link builder, `.ics` URL and `emailRedirectTo` all derive from `NEXT_PUBLIC_SITE_URL`
- [ ] [REQ-CUT-006] The wordmark inside `/football` stays HRAJ FOTBAL
- [ ] Verified on a branch preview, both path shapes resolving

**Files:** `next.config.ts`, `lib/site.ts`, `lib/games/share.ts`, `app/**/opengraph-image.tsx`, `app/game/[id]/ics/route.ts`

---

## Phase 22 — Cutover + cron cadence restore

**Goal:** the domain move and the return to native cron. **Human-executed.**
**Depends on:** 21. **Duration:** 90 min of human time. **Risk:** R8.

**Acceptance criteria**
- [ ] hrajsport.cz attached in Vercel; `NEXT_PUBLIC_SITE_URL` updated
- [ ] [REQ-CUT-005] Supabase Site URL and redirect allow-list carry **both** origins during transition — an unlisted redirect fails silently, which is the Phase 1 lesson that cost the most
- [ ] [REQ-CUT-003] The old origin 301-redirects; a previously shared link resolves
- [ ] [REQ-CUT-007] `vercel.json` restored to expiry 15 min, nudge and reminder 30 min
- [ ] [REQ-CUT-008] A **native execution is verified** — a fired run with its matching `booking_expired` / `nudge_sent` / `reminder_sent` rows — **before** the cron-job.org jobs are disabled
- [ ] `LAUNCH.md` updated to record the external scheduler as historical rather than deleting it
- [ ] TEST-228 … TEST-231 pass

**Files:** `vercel.json`, `LAUNCH.md`, Vercel and Supabase dashboards (human)

---

## 🛑 GATE G3 — Cutover

**This is a mandatory halt point, not a checklist.**

Contract §10 G3: the full checklist on a phone at hrajsport.cz/football; the old
URL redirects; auth round-trips on the new origin via **both** the link and the
code paths; one real game booked post-cutover; the native cron cadences restored
and one execution verified before the external jobs retire. **Vercel Pro must be
active by this gate.**

Question to answer here: **Q5** (301 permanence for already-shared links).

Passing this gate is what makes Phase 2 done.

**STOP — do not proceed past this gate without explicit human confirmation.**

---

## Human deliverables, tracked here so they are not discovered late

| Item | Needed by | Owner |
|---|---|---|
| Dev database provisioned (Docker or second project) | Phase 0 | Oliver |
| Hosted password minimum set to 8 | G1 | Oliver |
| Three auth email templates authored in the dashboard | G1 | Oliver |
| `content/terms.md` real copy | G1 (page ships earlier with a placeholder) | Oliver |
| Venue photographs | Phase 16 / G2 | Oliver |
| FAQ copy in Czech and Russian | Phase 17 / G2 | Oliver |
| Player-of-the-Month choice | Phase 17 | Oliver |
| Vercel Pro active | G3 | Oliver |
| hrajsport.cz DNS + Vercel attachment | Phase 22 | Oliver |
