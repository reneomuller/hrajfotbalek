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

## Every request the owner has made is in `docs/REQUESTS.md`

One numbered row each, with a status: shipped, built-but-dormant, partial, open
or declined-with-the-reason. **Every round updates it, and every end report
closes by quoting its OPEN and BUILT-DORMANT rows verbatim.**

It exists because things the owner asked for keep ending up *shipped and
invisible* — Google sign-in and the pass-tier links still wait on a step only
he can take, and a feature that is finished and dormant looks exactly like a
feature that was never built. The `BUILT-DORMANT-ON-<step>` status names the
step.

**A DORMANT OR OPEN ROW IS NEVER ECHOED; IT IS RE-VERIFIED BEFORE IT IS
PRINTED** (round 12). "Still blocked" copied from last round is a claim about
the past wearing the present's clothes. Checking found two rows that had
silently come true: the Stripe booking link had been set in Vercel, and the
cover-photo migration had been applied — both reported as blocked the round
before. Verify a variable with `vercel env ls production`, a migration by
querying the live catalog, and a grant by evaluating it on production under a
real identity.

The other thing it prevents is a request being asked a fifth time. `/admin`
against `p14` was, which is what produced the file.

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

**A Server Component may not set a cookie, and the payment page learned it the
expensive way.** `cookies().set()` throws `Cookies can only be modified in a
Server Action or Route Handler` — so a cookie write belongs in an action or a
route, never in a render. Round 26 moved `rememberPendingPurchase` into
`/payment/checkout`, which is a page, because under pay-first the id worth
stashing is the Stripe SESSION id and that only exists after the session is
created — during the render. **Every single-game checkout 500'd on production
while the pass rail worked perfectly**, because the pass stash is written by
`app/pass/actions.ts`, a Server Action. `pendingPurchaseCookie.ts` states the
rule in its own doc comment; the code that broke it was written the same day.
The fix deleted the stash rather than relocating it: Stripe substitutes the
session id into `return_url`, so the return page is handed the exact identifier
by Stripe itself.

**When a runtime failure has no log, look in the database for how far the
request got.** `vercel logs` carries only a few minutes and held nothing but
cron. Two `cs_live_` rows sat in `checkout_sessions` at status `open` — created
and registered, then nothing — which pinned the throw to the line after
`open_checkout` without reproducing anything.

**Not using a column is not the same as not selecting it.** Round 26 stopped
READING `is_pending` and left both roster selects asking for it, then handed
over a cleanup script that drops it. Running that script would have made
PostgREST error on both reads — and both call sites answer an error with
`return []`, so **every lineup on the site would have rendered empty**,
silently. Same family as the missing-GRANT trap: a read that returns empty
looks like missing data, not like a missing column. **A column drop and the
selects that name it must ship in one change**, and the order is then DEPLOY
FIRST, THEN MIGRATE — the opposite of an additive migration.

**`app_capabilities()` IS RESTATED IN FULL BY EVERY MIGRATION THAT TOUCHES IT,
so applying migrations OUT OF DATE ORDER silently drops flags.** Found on
2026-09-13: production returned `adminRemoveCover: true` and **no `venueMapUrl`
at all**, while `venues.map_url` and both four-argument venue writers were
present and correct. Round 31's `20260913100000` had been applied FIRST and
round 30's `20260912100000` second, and the older file's list overwrote the
newer one. Nothing read that flag, so nothing broke — the next one will, and the
only way to notice is to diff the live jsonb against the newest file. **Every
new migration's list must be a superset of what is LIVE, not of what the
previous file says**, which means probing before writing it.

**A GLYPH WHOSE SHAPE IS THE MESSAGE MAY NOT BE LEFT TO FONT FALLBACK.** The
dropdown cue shipped as `▾` (U+25BE) and rendered as a small blob on this
product's type stack — several fallback faces draw that codepoint tiny and
nearly round, so the universal "this opens" cue read as a dot. Draw it: an
inline SVG is the same two vectors everywhere. The same applies to `▾` on the
admin venue disclosure, which is next in line. **And assert it by decoding, not
by markup** — "there is an SVG" would have passed for the character too; count
lit pixels per row and require the top to carry more than the bottom.

**THE PLAYER SAYS "CREDITS"; ONLY THE DATABASE AND THE ADMIN SAY "WALLET".**
Round 34 made this a law with two tests, and enforcing it found the word in
**twenty** English keys and thirteen to fifteen in each of Czech, Russian and
Ukrainian — the cancel copy, the top-up page, the pass lede, the toast, the
FAQ, the Stripe line item and three email templates. `credit_ledger` keeps its
name and so does `admin.balanceLabel`. The two tests are deliberately both:
`lib/i18n/__tests__/vocabulary.test.ts` walks every KEY, including ones only an
error path renders; `e2e/vocabulary.spec.ts` crawls eight pages in four locales,
because a table walk cannot see a word hardcoded into a component. **When one
concept has two names, delete the second KEY rather than retranslating it** —
`addGuests.payCredit` is gone and the panel renders `booking.payWithCredit`, so
the two surfaces cannot drift without somebody deliberately adding a key back.

**A SURFACE HAS NO ASPECT IF ITS HEIGHT IS CONTENT-DEPENDENT, and three rounds
of crop fixes died on that.** The venue photograph feeds the games-list card
AND the detail hero. The card is a fixed 159px tall, so its aspect moves only
with the viewport. **The hero is padding plus CONTENT** — a venue name that may
wrap, badges that may not be there — so two games on the SAME deploy at the
SAME width render 390x235 (1.658) and 390x208 (1.875). Every round measured one
game's hero, got one number, pinned the crop constant to it, and the next
fixture rendered differently, which is why each fix "worked" and the product was
still wrong. **Before pinning a crop to a surface, measure it on more than one
row of real data.** The crop is now pinned to the CARD (`1600x740`), and the
hero is asserted only to be NARROWER than the frame — the property that means
`object-cover` trims its sides and never the goalposts.

**And a crop test that compares two constants can never fail for the reason you
care about.** `crop-frames.spec.ts` compared the constant to a rendered box and
passed for three rounds while the wrong surface was being measured.
`e2e/crop-truth.spec.ts` imports no constant at all: it frames a marked image,
reads colours out of the crop window, saves, and reads colours out of the card
as served. Keep that shape for anything claiming what-you-see-is-what-you-get.

**A form that closes itself on submit hides its own error.** `ChangeNameForm`
called `setOpen(false)` in `onSubmit`, so a refused rename unmounted before the
action answered and the admin saw nothing — not the old name, not a reason.
Close on the SERVER's next render, or do not close at all.

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

## A migration's verification block may not write a row

**Effective 2026-09-12, after it cost a production cleanup.** A migration
asserts that the SHAPE it created exists — objects in `pg_proc`, columns,
constraints, grants, capability flags, and the RESULT of any backfill the
migration itself performs. It never inserts a fixture, never updates a row it
did not come to change, and never calls an RPC that writes.

**Behaviour is drilled in `supabase/tests/`, and that is not a style
preference.** `run.mjs` wraps every suite in `begin; … rollback;` BY DESIGN, so
a committing drill is structurally impossible there. A migration has no such
wrapper: `scripts/apply-migration.mjs` COMMITS.

**What happened.** Rounds 26–29 each ended with a behavioural drill — build a
fixture, exercise the new RPCs, assert the outcome. Every one was validated
inside a hand-written `begin; … rollback;`, so the fixtures vanished on every
test run and the pattern looked safe for four rounds. On 2026-09-12 round 29's
drill was applied to production and committed. It left:

* a venue and two games named `auto settle probe`
* two bookings against a **real player** — the drill picks the oldest
  signed-up account, which is the owner's
* a real **"You were marked as a no-show"** notification in his bell, because
  the drill called `mark_attendance`, which notifies
* two games' worth of inflated `games_played` and hours on his public profile
* 150 CZK of phantom money owed, inflating the admin's outstanding figure from
  1,780 to 1,930
* a `played` game the nightly sweep would have reported as needing attention
  **every night for ever** — permanent false news in the one channel built to
  mean "a human should look at this"

Two worse ones were still dormant when this was found and were rewritten before
they could be applied: round 28's public-profile drill **overwrote a live
player's `country`, `skill_level` and `positions` and then set them to NULL**,
and its ledger drill called `grant_credit` three times for real — +500, −200,
+10 — moving 310 CZK into a live wallet with real ledger rows.

**The tell, for next time:** if a verification block declares a variable to hold
a fixture id, it is a drill and it is in the wrong file.

## `.env.local` is production, and six runners read it

`SUPABASE_DB_URL` in `.env.local` points at the live database. Six things in
this repo read that file, and every one of them is a way to touch production
by accident:

`playwright.config.ts` · `supabase/tests/run.mjs` · `scripts/seed.ts` ·
`scripts/reset-platform.mjs` · the `scripts/*.check.ts` integration suite ·
`scripts/apply-migration.mjs`

The first five route through `lib/env/testDatabase.ts`, which refuses any
non-local host. **The sixth did not, and on 2026-08-10 it applied a migration
to production while being run as a local validation step.** It printed
`APPLIED` and named no host, so nothing in the output contradicted the
assumption that it was local. The migration was additive and reviewed and no
row changed, which is luck rather than design.

It now prints `TARGET <host>` before doing anything and refuses a non-local
database unless the invocation says `--production`. A FLAG, not an environment
variable: a variable exported once in a shell outlives the intention that set
it, and implicitness is what failed. The host rule is restated in the script
rather than imported — it is plain `.mjs` with no TypeScript loader — so
`LOCAL_HOSTS` there and in `lib/env/testDatabase.ts` **must change together**.

The guard has unit tests in `lib/env/__tests__/`, not under `scripts/`, because
the unit config excludes `scripts/**`.

**Before running anything that writes, check which database it resolves.** The
rule is mechanical rather than remembered, and that is the point.

## Migrations applied to production

The repo has held migrations that production did not, three times, and each
time the symptom looked like a broken feature rather than a missing schema:
`SETTING_KEY_UNKNOWN` read as "that setting does not exist", a stale
`pass_tiers` row read as a phantom 1-credit tier, and an absent
`set_venue_amenities` read as "we could not save that" because PostgREST
answers a missing function with a 404.

**Reconciled 2026-08-10** — all three are applied and verified on production:

| Migration | Status |
|---|---|
| `20260802200000_setting_games_per_week` | Applied, verified |
| `20260802190000_pass_tiers_from_five` | Applied, verified |
| `20260802210000_venue_amenities` | Applied 2026-08-10 |

**~~Outstanding, and it is DDL — round 12's~~ — APPLIED and verified
2026-08-21.** `create_booking` is at six arguments on production.

**~~Outstanding, and it is round 23's — but NOTHING BREAKS WITHOUT IT.~~ —
APPLIED and verified 2026-09-06**, by probing the objects rather than the
filename: `players_met` and `public_player_profile` are both in `pg_proc` and
`app_capabilities()` returns `playersMet: true`, so the new tile is on.

```
node scripts/apply-migration.mjs \
  supabase/migrations/20260830100000_players_met.sql --production
```

~~It will read **zero for everyone** until somebody marks games played — 25
games on production have kicked off and are still `published` (ledger row 165).
The number will be honest; it will just be zero.~~ **AND IT NO LONGER READS
ZERO.** The played sweep cleared the backlog: **zero** kicked-off-but-published
games remain and 33 are `played`, so of sixteen players sampled on 2026-09-06
six carry a non-zero count, the highest being 3.

**Round 11's is applied and verified** (guests and parties), as is round 9's
cover-key migration — both re-checked against the live catalog on 2026-08-20
rather than carried forward on last round's word.

**~~Outstanding, and it is DATA rather than DDL~~ — DONE, verified
2026-09-06.** The venue separator moved from an em-dash to a bullet in the
fixtures and production has followed: **zero** rows carry the em-dash, and 7
venues plus 33 games carry the bullet. The statements are kept because they are
the shape any later fixtures-versus-production drift takes, not because
anything is owed:

```
update public.venues set name = replace(name, ' — ', ' • ') where name like '% — %';
update public.games  set venue = replace(venue, ' — ', ' • ') where venue like '% — %';
```

**Outstanding, round 34's one — additive, safe in either order against round
33's.** It drops and recreates `checkout_outcome` (the return type gains a
column) and widens the event catalog by one.

```
node scripts/apply-migration.mjs \
  supabase/migrations/20260914100000_cancel_guests.sql --production
```

**AND IT CHANGES HOW `app_capabilities()` ANSWERS, which closes the trap above.**
Every flag for an object the migration does not ITSELF create is now an
existence probe against `pg_proc` / `information_schema` rather than a hardcoded
`true`. Carrying the list forward by hand fixes the out-of-order case and leaves
a worse one — a later file claiming `playerNumbers: true` on a database where
that migration has not been applied, which is a flag lying about a column, and
both admin reads answer a missing column by rendering nothing. **Write new flags
the same way: assert only what this file creates, probe everything else.**

**~~Outstanding, round 33's two.~~ APPLIED and verified 2026-09-14** — probed by
their objects, not their filenames: `players.player_number` exists,
`admin_set_display_name` and `max_party_guests` are in `pg_proc`, and the three
flags are true. `venueMapUrl` came back with them.

When a UI failure looks inexplicable and the code reads correctly, check this
list before debugging the component.

## A modal must be portalled, or the nav pill eats it

`z-50` is not an absolute rank. It is a rank WITHIN a stacking context, and
most page shells here are `<main className="relative z-10">` — which caps
everything inside them below the chrome that lives at the document root. The
nav pill is `fixed z-40` there, the claim bar `z-30`.

So the cancel dialog rendered at `z-50`, looked correct in a screenshot, and
was **unreachable**: `elementFromPoint` at the confirm button's centre returned
a nav-pill list item, and Playwright waited out its timeout on an element that
was visible, enabled and permanently covered.

**Any modal, dialog, sheet or popover renders through `createPortal` into
`document.body`.** Not for tidiness — it is the only thing that lets its
z-index compete with the chrome on equal terms. `components/CancelBookingForm.tsx`
is the worked example.

Diagnose this class with `document.elementFromPoint(x, y)` at the control's
centre rather than by reading the CSS: the answer names the element actually
on top.

## A SPEC THAT PASSES ON A SUSPENSE FALLBACK IS A SPEC THAT PROVES NOTHING

`cutover.spec.ts` waited for a heading reading "Upcoming games" on
`/football/games`. **The games page has had no such heading since round 23**,
which removed it on purpose; the only place that string still renders as an
`<h1>` is `GameCardSkeleton`, the Suspense fallback. So the assertion passed
only while the server was slow enough to paint a skeleton — and failed once it
was warm. It failed in two consecutive rounds' full runs, passed in isolation
every time, and round 33 wrote it off as flake.

**This is the `count(*)` trap in a different costume**: the probe reported
success without the thing it probed ever happening. Assert on something the
REAL page renders — `game-list`, not the fallback's heading.

Two wrong fixes went in before the diagnosis, and both are worth knowing.
**`waitUntil: "networkidle"` on that route hangs until the test times out** —
the list streams, so the network never goes idle. And the edit that rewrote the
comment block deleted the `page.goto` with it, which only an instrumented run
caught: `url about:blank`, a test asserting against a blank page. **When a spec
fails only in a full run and passes alone, print what the page actually
contains before theorising** — the answer was in one line of `body` text.

## The seed drifts, and the admin spec is the canary

`admin.spec.ts` "the player detail page shows history and marks a no-show"
fails after a long run of suites, times out with **no page actions in its
trace**, and passes again immediately after `npm run seed`. It has done this
twice.

It is not the harness and not the product: the specs create and destroy their
own data but the seed tableau accumulates state across many runs, and that spec
reads it. **When it fails, re-seed before investigating anything else.** A
trace with no page actions at all is the tell — the hang is in the scaffold's
direct-postgres helper, before the browser is ever asked to do anything.

## Strips are never generated and never committed

**THE OWNER'S STANDING RULE, effective round 27. It is absolute and it is not a
matter of judgement.** No strip generation, no strip persistence, no strip
commits — not at the end of a round, not "regenerated by the final suite", not
because the change was visual. Strips exist in future only when Oliver asks for
a specific one, by name.

**No spec may write an image into a tracked directory.** Nothing does now: the
103 `screenshot({ path: … })` calls that used to are gone, and
`docs/**/strips/`, `screenshots/`, `test-results/` and `playwright-report/` are
gitignored so a new one cannot quietly reintroduce the habit.

**The pixel-decoding specs stay, and they never touch the disk at all.**
Luminance floors, outline visibility and overflow geometry are real assertions
and several bugs were found only by them — the cover painting over the stats
numerals, the badge with almost no lit pixels. They work from an in-memory
buffer:

```ts
const png = PNG.sync.read(await page.screenshot({ clip: box }));
```

That is stronger than capturing to a temp file and deleting it, because there
is no file to leak on a failure path. **Keep this shape.** If a future spec
genuinely needs a file, it writes under `test-results/` — gitignored — and
deletes it on pass.

**No spec reads a committed baseline image**, and none should start. Every
decode computes from a fresh capture, so there are no baselines to maintain,
diff, or accidentally bless.

Why the rule exists: the strips were 227 tracked PNGs and about 350MB of
working tree, regenerated nearly in full every round because a screenshot is
never byte-identical twice. Each round therefore added its own copy of almost
every image to history — which is why `.git` reached 5.7GB, why a push takes
tens of minutes, and why two production deploys aborted mid-upload.

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
