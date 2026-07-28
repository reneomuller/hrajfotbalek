# Phase 2 — Stage 1: Analysis

**Contract:** `letco-prompt-hrajsport-phase2-v1.md` v1.1.1 (`main`, `2bc1285`)
**Date:** 2026-07-28
**Scope:** frozen at v1.1.1. Anything noticed en route goes to `POLISH.md`, not here.

---

## 1. Method and evidence base

This analysis is written against the code and the live schema, not against the
contract's description of them. What was inspected:

| Source | What was read |
|---|---|
| Code | `app/**` (47 route/action files), `lib/**` (48 modules), `components/**` (40), `e2e/**` |
| Live schema | Column lists for `players` / `games` / `venues`, all five enum types, table and column grants for `anon` / `authenticated` / `service_role`, `storage.buckets` |
| Live data | Row counts (all transactional tables at zero; 4 players, 3 admins, 7 venues) |
| Migrations | All 20, in order; next number is **21** |
| Tests | 260 unit, 16 SQL suites, 28 E2E specs |

Every finding below carries the evidence that produced it. Where the contract
and the codebase disagree, the codebase wins and the disagreement is recorded.

---

## 2. Current-state findings

### F1 — Signup today is *profile completion*, not account creation

The single most consequential finding, and it inverts the order of the flow the
contract describes.

Today: a visitor enters an email at `/login` → Supabase sends a magic link →
the callback (`app/auth/callback/route.ts`) or the OTP action establishes a
session → `completePostAuth()` records the funnel event and attempts the shadow
claim → `destinationAfterAuth()` sees no player row and sends them to
`/signup`, which collects **nickname + GDPR + marketing** and calls
`complete_signup`. **The credential exists before the profile does.**

Contract §3.1: one form collecting email, nickname, password, country, skill,
phone, TOS, marketing — *then* verification. **The profile exists before the
credential is verified.**

Consequences the plan must carry:

- `/signup` changes meaning entirely. It is currently reachable only *with* a
  session and *without* a player row; afterwards it is reachable signed-out.
- `supabase.auth.signUp({ email, password })` becomes the account-creation
  call. The profile fields cannot be written until that returns a user id.
- `destinationAfterAuth()`'s "no player row → /signup" branch must survive
  anyway: existing passwordless players (§3.2) still arrive credential-first,
  and so does any shadow player claiming an identity.
- Two distinct routes end at "you have a session and a profile", and they must
  converge on the same post-auth path or the shadow claim silently stops
  running for one of them.

### F2 — `complete_signup` cannot gain parameters without dropping a function

`complete_signup(p_nickname text, p_gdpr_consent boolean, p_marketing_opt_in
boolean default false)` writes the player row, reads the email from
`auth.users`, and emits `account_created`.

§3.1 needs it to also write `country`, `skill_level`, `tos_accepted_at`,
`tos_version`. Postgres cannot `create or replace` a function into a different
parameter list — that is a `drop` plus a `create`, which is **a destructive
migration**, which §1 forbids without an explicit gate sign-off naming it.

Three ways out, to be chosen in Stage 2 rather than at build time:
1. A **new function** (`complete_signup_v2`) with the full parameter list; the
   old one is left in place, unused, and dropped in a later gated migration.
2. A **companion RPC** (`set_player_profile`) called immediately after the
   existing one, keeping signup a two-statement transaction from the client's
   point of view — which weakens the single-transaction guarantee that v2.5 §3
   exists to protect.
3. Add the columns with defaults and have the existing function write nothing
   to them, with a separate profile step — same weakening as (2).

Option 1 is the only one that keeps profile creation atomic. It costs a
deliberately orphaned function until a gated cleanup.

### F3 — `games.venue` (text, NOT NULL) still exists beside `venue_id`

Migration 15 added `venues` and `venue_id` (nullable); the original
`games.venue` text column was never removed and is still `NOT NULL`. Every game
insert must still populate it. Both are readable by `anon`.

This is inherited debt, not Phase 2 scope, but every migration touching `games`
in Phase 2 has to keep feeding the legacy column, and the plan must say so once
rather than rediscovering it three times.

### F4 — `anon` holds a table-wide `SELECT` on `games` (confirms §5.1)

Verified against the live schema: `grant select on public.games to anon,
authenticated`, expanding to every column including `notes`, `format`,
`surface`, `venue`, `venue_id`. A table-level grant covers columns added in the
future, so an `organizer_phone` column on `games` would be world-readable the
moment the migration ran. **The contract's §5.1 design (separate table, no
client grants, `SECURITY DEFINER` read gated on the caller's booking) is not
belt-and-braces — it is the only correct implementation.**

### F5 — No storage buckets exist

`storage.buckets` is empty. Profile photos (§4) start from nothing: bucket
creation, a public-read / own-object-write policy pair on `storage.objects`,
size and MIME limits at the bucket, and a `players.photo_path` column. None of
it can be inherited from an existing pattern in this repo.

### F6 — Enums lack every value Phase 2 needs

Live: `attendance_status`, `booking_status`, `credit_reason`
(`cancellation_credit | admin_grant | redemption | adjustment`), `game_status`,
`payment_method`. Phase 2 needs `credit_reason.topup` (§4.1) and a new
`skill_level` type. The `topup` addition must ship in its own migration ahead of
the one that uses it — `alter type … add value` cannot be used in the same
transaction that adds it.

### F7 — The stats module has no time dimension at all

`lib/stats/queries.ts` counts events with `countEvents(eventType)` and
`countDistinctPlayers(eventType)` over the whole table. §7's "filterable day /
week / month" is therefore **not a parameter added to existing queries** — every
metric needs a date-bounded rewrite. Three functions get deleted
(`getWaitlistDepth`, `getCreditOutstanding`, `getDropOff`), one survives
(`getNoShowRate`), and four are new (fill rate, confirmed revenue, new vs
returning, cancellations). Treat §7 as a rewrite of the module, not an edit.

### F8 — Every new player-facing string needs Czech and Russian, or the suite fails

`lib/i18n/__tests__/i18n.test.ts` walks the `PLAYER_FACING` sections and asserts
each key's Czech and Russian value **differs from English**. A new key added to
`lib/strings.ts` in a player-facing section fails that test until both overlays
carry a real translation.

Phase 2 adds a lot of player-facing copy: the signup form (country, skill, TOS,
password rules), password login and reset, the six FAQ entries, the top-up flow,
profile and history, toasts, duration and skill badges. **Translation is not a
polish step at the end; it is part of every phase that adds a string**, and the
contract does not mention it. The FAQ copy in §6 is given in English only, so
its Czech and Russian are owed by a human — the same way privacy and terms copy
is owed.

### F9 — E2E is blocked until a non-production database exists

`e2e/helpers/session.ts` mints sessions with `signInWithPassword` against the
seeded users in `scripts/fixtures.ts`. Those users were purged from production
on 2026-07-28. `.env.local` points every tool in the repo, Playwright included,
at production. **No E2E spec can run anywhere today.** This is §1.1 prerequisite
#1 and it gates every phase that carries an E2E assertion, which is most of them.

### F10 — The dry-run seam is the only safe way to touch email

`EMAIL_DRY_RUN` is off in production (§1). `sendEmail()` fails safe on a missing
value. Phase 2 adds one template (top-up receipt, §4) and three Supabase-side
auth templates (§3.1). The in-app template is testable locally behind the seam;
**the three auth templates are not testable anywhere except by sending real mail
to a real address**, because Supabase renders them, not us. That asymmetry
decides where they sit in the plan: at a gate, verified by a human on a phone.

### F11 — `players` is read-restricted per column already

`authenticated` holds `SELECT` on `players` columns and `UPDATE` on exactly
three (`nickname`, `phone`, `marketing_opt_in`). New columns (`country`,
`skill_level`, `tos_*`, `photo_path`) inherit `SELECT` but **no** `UPDATE`,
which is correct: they are written by RPCs. The plan must not "fix" this by
granting UPDATE.

### F12 — Admin surfaces are page-per-action, and §7 merges two of them

`app/admin/games/[id]/` has `page.tsx` (manage), `edit/`, `add-player/`,
`attendance/`, `cancel/`. §7's "Manage merges into Edit" collapses those into
one surface. This is a routing and layout change touching five files and their
E2E specs, and it is the change most likely to break `e2e/admin.spec.ts`, which
navigates by URL.

---

## 3. Change surface, by contract goal

| Goal | Migrations | New RPCs | New UI | Highest risk |
|---|---|---|---|---|
| §3 Auth rework | `players` columns; `complete_signup_v2` | 1 | `/signup` rebuilt, `/login` rebuilt, set-password, `/terms` | Locking out the 4 real accounts |
| §4 Profile | `credit_topups`, `topup` enum, `photo_path`, storage bucket + policies, VS sequence | `create_topup`, `confirm_topup` | top-up flow, photo upload, history | Money: a top-up confirmed twice, or credited at the wrong amount |
| §5 Games | `duration_minutes`, `allowed_skill_levels`, `game_organizer_contacts` | `game_organizer_phone` + admin writes | organizer/duration/skill inputs, venue photo panel | Organizer phone leaking to `anon` |
| §6 Home | `site_settings` | `set_site_setting` | stats strip, FAQ, three panels | Missing `anon` grant → silently empty |
| §7 Admin | — | — | player detail, merged edit, stats rework | E2E specs navigating by URL |
| §8 UX | — | — | toast component | — |
| §9 Cutover | — | — | rewrites | Supabase redirect allow-list failing silently |

---

## 4. Risk register

| # | Risk | Severity | Mitigation (belongs in the plan, not in someone's head) |
|---|---|---|---|
| R1 | **A real player is locked out by the auth rework.** Four accounts exist; three are admins. A broken migration path means the organizer cannot run a game. | Critical | The OTP→set-password path ships and is verified *before* password login becomes the default entry. G1 tests migration on a real account. Rollback = the OTP path, which is untouched Phase 1 code. |
| R2 | **Organizer phone leaks.** A column on `games` is public the instant it exists. | Critical | §5.1 design is mandatory; an anon-cannot-reach-it SQL assertion ships in the same migration, not the same phase. |
| R3 | **Top-up credited twice, or at the wrong amount.** Money the product honours. | Critical | `confirm_topup` is idempotent on status, writes the ledger and the status in one transaction, and is covered by a SQL suite before any UI exists. |
| R4 | **A destructive migration ships without sign-off**, violating §1. `complete_signup`'s signature change is the near-miss. | High | F2 option 1 (new function, old one orphaned). Any `drop` reaching a migration file is a gate item named in the plan. |
| R5 | **E2E rots for the whole phase** because the dev database never materialises. | High | Environment stage is item #1 and blocks G1 work; no phase carrying an E2E criterion starts before it is green. |
| R6 | **Translation debt accumulates** and surfaces as a failing suite at the end. | Medium | Every phase adding a player-facing string carries its CZ/RU in the same phase. FAQ copy is a human deliverable, named as such. |
| R7 | **Stats rework silently changes meaning.** "Fill rate" and "revenue" are new definitions, not new queries. | Medium | Each metric's definition written into the plan as SQL before the UI is built, and verified against a known week at G2. |
| R8 | **The cutover breaks auth on the new origin.** The Phase 1 lesson: an unlisted redirect fails silently. | High | §9's origin checklist is a gate item with the allow-list named explicitly; the old URL stays listed during transition. |
| R9 | **Admin surface merge breaks E2E navigation.** | Low | `e2e/admin.spec.ts` updated in the same phase as the merge, not after. |

---

## 5. Questions surfaced, not resolved

Per the Phase 1 contract's standing instruction, these are raised rather than
invented. None blocks Stage 2; each has a natural gate.

- **Q1 (G1).** Does a player who signs up with a password still get the shadow
  claim on exact email match? The contract says the post-auth path is shared;
  the claim currently runs from `completePostAuth`, which password signup would
  reach only if it routes through the same callback. Assumed yes, and planned
  that way — confirm at G1.
- **Q2 (G1).** What happens to a half-finished signup — account created in
  `auth.users`, profile write failed? Today's flow cannot produce that state.
  The proposed flow can. Plan assumes: the user lands on `/signup` with a
  session and no player row, i.e. exactly the state `destinationAfterAuth()`
  already handles.
- **Q3 (G2).** `site_settings` "Active players" is a hand-maintained number.
  Does it need an audit trail beyond the event, e.g. who set it and when, shown
  in admin? Plan assumes the event is enough.
- **Q4 (G2).** Venue photos are a human deliverable (§5.4). How many venues need
  one before the panel ships — all seven, or does the name-plus-button fallback
  carry launch? Plan assumes the fallback carries it.
- **Q5 (G3).** Does `/football` become canonical for OG cards and `.ics` URLs
  immediately at cutover, or do already-shared links keep resolving to the old
  paths indefinitely? Plan assumes 301 forever, no expiry.

---

## 6. Out of analysis

Explicitly untouched, per §11: ordered waitlist, skill-enforced booking,
translated transactional email (`players.locale` stays in `POLISH.md`), push
notifications, a staging database, payment-provider integration, any second
sport's content. Also untouched: the `games.venue` legacy column (F3) and the
`complete_signup` orphan (F2/R4), both of which need a gated destructive
migration and neither of which blocks anything.
