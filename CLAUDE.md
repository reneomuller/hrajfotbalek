# CLAUDE.md — how this codebase works, and what it cost to learn

Phase 1 of Hraj Fotbal: a booking platform for pickup football in Prague, built
to replace a WhatsApp thread. Next.js App Router + Supabase (Postgres, RLS,
plpgsql RPCs) + Resend. Volt-on-black, mobile-first, three languages.

This file is for the next session. It is not a tour of the code — it is the
handful of rules that are load-bearing and the mistakes that were expensive.

## Before designing a surface, read `SCOPE.md`

`SCOPE.md` is the boundary of the v1.3 round: three requests refused with
reasoning, seven items quarantined behind backend capability they do not have,
eleven more out of scope for Phase 2, and the rule that this is a front-end
round — no new entity, no new foreign key, no new account state, no schema
migration.

It exists because the failure it prevents has already happened once. The
pipeline's `analyze` document is the raw design brief, which is the *input*
that produced contract v1.3 rather than the output of adjudicating it. A plan
generated from the brief alone faithfully rebuilds decisions that were
overruled and schedules work that was explicitly deferred, and nothing about
the result looks wrong — it looks like a thorough plan. **Contract v1.3
(`8ffe390`, rulings A–P) wins wherever the two disagree.**

The specific trap most likely to catch a later session: ruling O says a
cancellation refunds **in kind**, and only the credit half exists. `refundAs`
is `"credit"` and there is no cash-refund path anywhere in the system. Reading
"in kind" as a specification produces a cash-out feature that the quarantine
explicitly defers.

## The rules that are not negotiable

**Every state transition is a `SECURITY DEFINER` plpgsql RPC** with
`search_path = ''` and schema-qualified references. There are zero direct
client writes to any state-bearing table, and `service_role` deliberately has
no UPDATE on `bookings` — the E2E suite discovered this the hard way when it
tried to fake an elapsed grace window and got a silent permission error.
Authorization lives *inside* the function, not in the route that calls it: a
route guard is skipped by anyone using curl.

**Copy lives in `lib/strings.ts`.** No user-visible string appears in a
component. Czech and Russian are partial overlays merged onto the English table
(`lib/i18n/`), so a missing translation renders English rather than a blank —
and a test walks every player-facing key to catch the ones that were forgotten.

**Colour, type and spacing come from `tailwind.config.ts`.** No inline hex in
`app/` or `components/`. The OG card and the PWA icons read the token table at
build time rather than repeating the values, so a theme change moves them too.

**Money is Czech in every language.** CZK, `QR platba`, `variabilní symbol`.
The player is about to open a Czech banking app and the words have to match it;
a translated reference field is a payment that arrives unmatched, which is the
one failure here that costs manual reconciliation to undo.

**Policy windows are values in `lib/policy.ts`, never branches.** A v2 policy
is a bump to that file plus a new `policy_version` stamp.

## Lessons, in the order they hurt

**The magic link is the least reliable part of the system, and it always will
be.** PKCE stores its verifier in a cookie scoped to the browser that requested
the link. Mail apps — WhatsApp, Instagram, several Android clients — open links
in an embedded browser with a different cookie jar, so the exchange dies with
"code verifier not found in storage" on a link that looks perfectly normal.
Two mitigations shipped: the callback accepts `token_hash` (stateless) as well
as `code`, and `/login` offers a six-digit code via `verifyOtp`. Both need the
Supabase email template to emit the right placeholder — see
`AUTH_EMAIL_TEMPLATE.md`. If login "randomly" fails for one person, this is why.

**Supabase's redirect allow-list fails silently.** A `emailRedirectTo` that is
not allow-listed does not error; it redirects to the project Site URL instead,
where nothing exchanges the credential. The user ends up authenticated at the
auth server holding no session cookie. `NEXT_PUBLIC_SITE_URL` and the dashboard
entry must agree exactly.

**Supabase grants nothing by default here.** Auto-expose is off and auto-RLS is
on, so a migration that creates a table and forgets to `GRANT` to `anon` /
`authenticated` produces reads that return empty rather than erroring — which
looks like missing data, not a missing grant. Every migration that permits a
read must say so explicitly.

**`aclitem` lowercase `d` is DELETE; uppercase `D` is TRUNCATE.** An ACL
reading `service_role=Dxtm` looks like it includes DELETE. It does not. This
cost a debugging session on the seed reset.

**A `count(*)` probe can pass without running the thing it probes.** The shared
SQL test helper wrapped a call in `with _p as (…) select count(*) from _p`.
`count(*)` never reads a column, so the planner pruned a non-volatile function
call out of the plan and the privilege check never ran — the probe reported
success where a direct call was denied. `count(_p::text)` forces evaluation.
Wrapping the cast in a subquery is *not* enough; the pruning moves up a level.

**Client-state success markers do not survive `revalidatePath`.** Anything
rendered from a `useActionState` result (`confirm-result`, `settle-done`,
`game-form-saved`) can be unmounted by the re-render before it can be observed.
Assert on what the server renders next, or on the database.

**Server actions are cancelled by navigation.** `click()` returns as soon as
the form is submitted; navigating immediately afterwards aborts the in-flight
action. Wait for the effect before moving on.

**A null `venue_id` made games unsaveable.** Every game created before the
`venues` table carried a null `venue_id`, so the admin edit form's picker
opened unset and the save was rejected before any RPC ran, while React's form
reset put the typed values back — which read as "the form silently does
nothing". Backfilled in migration 19.

**The event catalog is one CHECK, and it is easy to forget.** `events.event_type`
is constrained by `events_event_type_catalog`, a single `check (event_type in
(...))`. Any migration that emits a NEW event type has to widen it in the same
migration, and forgetting fails at the first *write* — not at the migration —
so the error names a constraint that has nothing to do with the feature. It has
been missed once already (migration 24 added the photo events and omitted the
top-up ones, so the first `create_topup` failed on the catalog). Postgres cannot
extend a CHECK in place: drop and re-add, restating the list in full. That
drop/re-add is **pre-approved** (2026-08-01) as long as the new list is a strict
superset.

## Testing

Four suites, and they answer different questions:

- `npm run test:unit` — pure functions, no credentials, no network.
- `node supabase/tests/run.mjs` — SQL assertion suites: RLS, constraints, RPC
  authorization. Each wraps itself in `begin; … rollback;`.
- `npm run test:e2e` — Playwright against the real stack with the seeded
  database and `EMAIL_DRY_RUN` forced on. Specs build a disposable game and
  tear it down; they never mutate the seed tableau, because a suite that
  depends on how often it has been run fails in ways that cannot be reproduced.
- `npm run test:integration` — `scripts/*.check.ts` against the live database.

The E2E suite caches one session per player per run. Un-cached, it exhausts
Supabase's sign-in rate limit partway through and every remaining spec fails
with "Request rate limit reached", which reads exactly like a broken product.

## Things that look like omissions and are decisions

- **No service worker, no offline logic.** A stale cached roster is worse than
  a spinner.
- **No `ends_at` column.** `policy.game.durationMinutes` is display-only;
  nothing transitions on it. Revisit when a game of a different length is
  actually scheduled.
- **Emails are English only.** There is no per-player language in the database
  — the locale is a cookie, which is a fact about a browser, not a person.
  Doing it properly needs a `players.locale` column.
- **Waitlist is notify-all FCFS.** Everyone is told at once and the race is
  settled by `create_booking`'s capacity check. Ordered-priority is a v2
  candidate, to be revisited with real data.
- **The privacy page is a marked DRAFT.** Generated legal text that reads as
  finished is worse than an obvious placeholder, because it gets shipped.
