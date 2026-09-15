# NIGHT_LOG

A per-round record of what actually happened, written for whoever picks this up
next. It is not a changelog — the commits are that. It is the shape of the
round: what was asked, what shipped, what did not, and what was found on the
way that nobody asked about.

---

## Round 35 v2 — 2026-09-15/16

Nine items, three of which arrived mid-round. All nine done. The pre-launch
ruling — unpublished site, test data, no ceremony — is what made most of them
short.

### The lead: the price was in four places, and one was a CHECK constraint

The owner asked for one source and an audit for a second copy. There were three
besides it. The declared source, the SQL function, an unused `TOPUP_PRESETS =
[150, 300, 450]`, and `pass_tiers_credited_rule` — a CHECK spelling 150 as a
literal, which I had looked straight at the round before and left alone. A
literal in a constraint is the worst kind: it does not fail when the price
moves, it fails the next time somebody inserts, naming a constraint rather than
a price.

### And the thing I have to lead the report with

Item 5 was reported as "the admin count is entirely stale — updates on NEITHER
bookings NOR guests". It was not stale. **It was zero, and I shipped it.** Round
35 v1 routed all three admin counts through an RPC created by a migration the
owner had not applied, and the error path returned an empty map. Deployed hours
before the report. Same family as the missing-GRANT trap: a read that comes back
empty looks like missing data rather than a missing function. It now falls back
to the arithmetic rather than to nothing.

### Three things the suites caught that I would not have

**The conformance suite refused my first delete fix.** v1.3's rule is that no
function anywhere hard-deletes a booking, asserted by scanning `prosrc`. My fix
deleted the cancelled rows by hand — to do something the database was already
doing, since every foreign key pointing at `games` cascades. The extra half came
out and the verification now asserts its absence.

**A guard against a vacuous assertion became vacuous.** `v13_conformance/schema_b`
checked that admin-grant rows exist so the assertion above it is not empty; the
wallet reset emptied the ledger. It now creates its own row, which is the lesson
it was written to teach.

**And `crop-truth` had been reading pixels next to a ring.** It compared a
screenshot of the crop window against the card; the window carries a `ring-2`
over a dimmed copy of the same photograph, so samples near the edge landed on
whichever of the three a device pixel decided. It accused a correct product of
the exact bug it exists to catch. The proof now rests on the card's pixels
against sentinels 150px thick.

### The environment fought back, and some of that was mine

Docker died four times. The cause was a container from an unrelated project
(`twenty-server-1`) that publishes port 3000 and is restored on every Docker
start — so Playwright could not bind, and my `kill` on whatever held 3000 was
killing Docker itself. Stopped for the run and **restarted afterwards**. Worth
knowing before assuming the repo is at fault.

### Suites

Unit 763/763 · SQL 47/47 · lint 0 errors · tsc clean. E2E result and the
deployment id are in the round's final commit message. `pgtap` had to be
reinstalled after the local stack was rebuilt — `create extension pgtap` — which
is a local-stack fact rather than a repo one.

### Still owed by the owner

Rows 184, 188, **261** (the 28 unsettled Stripe sessions — still the one thing
that needs a human) and **296** (the top-up rows that now disagree with an empty
ledger). Round 35 v2's four migrations were applied by me on a one-time
authorization; the Oliver-applies rule stands.

---

## Round 35 — 2026-09-15

A ruling and two items that arrived mid-round. All three done.

### The ruling was four lines and its consequences were not

"1 credit = 1 game = 1 seat, regardless of `price_czk`." The debit change is
three statements. What it forced took the rest of the round:

**Partial credit in crowns stopped existing**, and with it a state four SQL
suites were built around. A seat is covered by a whole credit or not at all, so
a one-seat booking with any credit is fully paid — the "applied credit, money
still owed" case can only happen on a PARTY now. Two of those suites had to
become parties of two. None of them was re-expected; each was reshaped to the
state it exists to test.

**"Can this wallet pay" turned out to be asked in three places**, two of them in
crowns: the RPC everybody knew about, the disabled radio, and a round-23 POST
guard. On a 180 CZK game a wallet holding four credits was told "Not enough
credit" for a party the RPC would have accepted. The e2e caught it as a
TIMEOUT rather than a wrong number, because the refusal renders somewhere
nothing was asserting on.

**And it makes 270 CZK inert on production** — one wallet of 50, two remainders
of 110. Already unspendable as a whole game; now unspendable as a part of one.
Measured rather than estimated, and it is row 283 for the owner to rule on.

### The fixture that paid for itself

`round24.spec.ts` books a hold it needs to stay UNPAID, and round 29 made it
assert that precondition in the fixture rather than let six tests fail later on
a status mismatch. Under the ruling 150 credit on a 200 CZK game stopped being
a partial payment and became a paid seat, and the suite said so in one line
with the reason in the message. Six tests would otherwise have failed looking
like the played sweep misbehaving.

### The admin miss was three sites, not two

The owner named the upcoming-games view and the capacity readout. The audit
found `dashboard.ts` doing the same thing with a query of its own. All three
counted booking rows; a party of three read as 1 while the player page said 3.
They now go through `game_seats_taken_many`, which wraps the authority instead
of mirroring it.

### Suites

Unit 758/758 · SQL 45/45 ALL PASS · lint 0 errors · tsc clean. E2E result and
the deployment id are in the round's final commit message.

### Still owed by the owner

Rows 184, 188, **261** (the 28 unsettled Stripe sessions — still the one that
needs a human), 275, **283** (the 270 CZK) and **291**. Commands in
`docs/REQUESTS.md` §6.

---

## Round 34 — 2026-09-14

Four items. All four shipped. Two things worth knowing and one thing worth
ruling on.

### Item 2 was twenty times bigger than the surface that reported it

The owner named one button: "Pay from wallet", on the add-guests panel. Writing
the law-test first and running it red found the word in **20 English keys** and
13-15 in each of the three overlays — the cancel reassurance, the cancel
confirm, the top-up page and title, the pass lede, the bookingCancelled toast,
the FAQ, the Stripe checkout line item and three email templates. One surface
said "Redeem credit", another "Pay from wallet", a third "back in your wallet".

**The fix for the reported button was to DELETE its key.** `addGuests.payCredit`
is gone; the panel renders `booking.payWithCredit`, the booking page's own. Two
keys for one act is two things to translate and two chances to drift, and they
had already drifted — which is how the round started.

**"Mobile wallet" turned out to be a different word wearing the same spelling.**
The FAQ and the pass page meant Apple Pay and Google Pay. Carving an exception
into the law would have weakened it; naming the two services is more concrete
than the phrase it replaces and leaves the rule absolute.

### The capability substrate now probes instead of asserting

Round 33 found that `app_capabilities()` is restated in full by every migration
that touches it, so an out-of-order apply silently drops flags. Carrying the
list forward by hand fixes that and creates a worse failure: this round's file
would have claimed `playerNumbers: true` on a database where round 33's
migration is not applied — a flag lying about a column, and both admin reads
answer a missing column by rendering nothing.

So every flag for an object a migration does not ITSELF create is now an
existence probe. It cannot lie and it cannot be dropped. The practical effect
for the owner: round 34's migration is safe to apply before round 33's.

### One thing for Oliver to rule on, and it is in the brief

Item 4 says both "allowed only before the 8-hour cutoff" AND "Rules identical to
self-cancellation … after the cutoff the control disappears/disables exactly
like self-cancel". **Those are two different products**, because self-cancel
does not disappear after the cutoff — `cancel_booking`'s own comment says
"Cancelling is still permitted right up to kickoff; only the refund is gated."

I built the identical-to-self-cancel reading: the control stays to kickoff and
the sentence under it turns from a promise into a warning. One condition on one
line flips it. Row 272.

### And one decision about money, made rather than hidden

A partial guest refund lands in the unexpiring pool instead of being mirrored
back to the batch it came from. `cancel_booking` mirrors because a full refund
has an unambiguous batch; a partial one does not — the ledger records that
credit was spent on a booking, never which seat it bought. The chosen rule is
never worse for the player than the alternative, which is the right way to break
a tie about somebody else's money. Row 271.

### The "flake" from round 33 was a spec asserting on a loading skeleton

`cutover.spec.ts` failed in both rounds' full runs on `/football/games` and
passed in isolation every time. Round 33 called it flake and re-ran.

It waited for a heading reading "Upcoming games". **The games page has had no
such heading since round 23**, which removed it deliberately; the only place
that string still renders as an `<h1>` is the Suspense fallback. The assertion
passed while the server was slow enough to paint a skeleton and failed once it
was warm — a test that could not tell the product working from the product
missing. It now asserts `game-list`.

**Two wrong fixes went in before the diagnosis and both are worth remembering.**
`networkidle` hangs on that route, because the list streams and the network
never goes idle. And the edit that replaced the comment block deleted the
`page.goto` with it — caught only by instrumenting the run and reading
`url about:blank`. The answer was one `console.log` of the page's body text
away the whole time, and I theorised twice before printing it.

### Suites

Unit 754/754 (20 new) · SQL 44/44 ALL PASS (23 new assertions) · lint 0 errors ·
tsc clean · build clean. E2E result and the deployment id are in the round's
final commit message.

### Still owed by the owner

Rows 184, 188, **261** (the 28 unsettled Stripe sessions — still the one that
needs a human) and **275**. Commands in `docs/REQUESTS.md` §6.

**Row 258 came off**: round 33's two migrations are applied, probed by their
objects on 2026-09-14. The party dropdown is live to thirteen, every player is
numbered and the rename control is on the admin profile — and `venueMapUrl` is
back in the capability set, which is round 260's repair landing with them.

---

## Round 33 — 2026-09-13

Four items. All four shipped.

### Item 4 was a diagnosis, not a fourth attempt at the same constant

Three rounds had "fixed" the venue crop and it was still wrong, and the reason
turned out to be that **nobody had measured both surfaces**. The photograph
feeds the games-list card AND the detail hero, and live on production at two
widths:

```
           390px            430px
  card     344x159 = 2.167  384x159 = 2.419
  hero     390x235 = 1.658  430x235 = 1.828
```

Then the finding that explains the whole saga: **the hero has no stable aspect
at all.** Two games on the same deploy at the same width render 1.658 and
1.875, because the band is `pt-36 pb-5` plus CONTENT — a venue name that may
wrap, badges that may not be there. So each previous round measured one game's
hero, got one number, pinned the constant to it, and the next fixture rendered
differently. The constant it was pinned at, 1.875, matched nothing on either
surface at any width.

Pinned to the **card**: fixed 159px height, the surface the owner named, and
the wider of the two — so every other surface trims the frame's sides rather
than its top and bottom, which was the round-30 complaint.

**The proof names no constant.** `e2e/crop-truth.spec.ts` imports nothing from
`lib/storage/avatar.ts`. It builds a marked image, frames it, reads colours out
of the crop window, saves, and reads colours out of the card as served. If the
constant were wrong the two would disagree — which is what constant-versus-
constant checking could never do, and is why three rounds of it passed while
the product was wrong. The negative control was run: restoring 800 makes the
card's top edge read `rgb(136,29,99)` where the crop window showed cyan.

### The thing to know about the party ceiling

It was in **two** places in SQL and the round-11 comment said so in as many
words — "moving the ceiling means editing both, in one commit". That is a rule
that works exactly until somebody misses one. It is now
`public.max_party_guests()`.

The migration **rewrites what is installed** rather than restating 240 lines of
commented plpgsql: it reads `pg_get_functiondef`, substitutes one token, and
raises if the token is not there. `prosrc` keeps comments, so the round trip
loses nothing, and production's function is what gets edited rather than the
repo's idea of it.

### Two bugs the specs found, both worth the shape they cost

**A form that closes on submit hides its own error.** The first `ChangeNameForm`
called `setOpen(false)` in `onSubmit`, so a refused rename unmounted before the
action answered and the admin saw nothing at all. Same family as the
`revalidatePath` marker lesson: assert on what the server renders next.

**A small integer is not a needle.** The spec proving the player number reaches
no player-facing surface first looked for "2" in the page text and found it in
"Friday 2 October". It now moves the number to `987654` for the duration and
puts it back.

### What is NOT done, stated rather than implied

- `player_number` is hidden by SURFACE, not by grant. `players_select_own` lets
  a player read their own row through the API, number included. Closing that
  means revoking a table-wide `select` and re-granting a column list, which is
  a large change to a grant every roster path depends on. Row 254.
- The crop is pinned at the 390px reference. At 430px the card is 2.419 and
  takes a sliver off the frame's top and bottom instead. That is what pinning a
  fixed aspect to a fluid box costs, and it is stated rather than hidden.

### Suites

Unit 734/734 · SQL 43/43 ALL PASS · lint 0 errors · tsc clean. E2E result and
the deployment id are in the round's final commit message.

One pre-existing SQL assertion had to move with the ceiling:
`guests_and_parties.sql` asserted four guests on a game seating two is refused
as oversize. The naive fix — 4 becomes 14 — would have made it **pass for the
wrong reason**, `CAPACITY_FULL` on a pitch that seats two, while its label
claimed the opposite. It now books `max_party_guests() + 1` on a pitch of
twenty.

### Two things found by re-verifying the ledger instead of echoing it

**Rows 232 and 241 had silently come true.** Both were recorded as blocked; both
migrations are on production, probed by the OBJECT rather than the filename.
That is the second round running in which checking found a dormant row already
applied.

**And checking row 241 properly turned up something else.** `venues.map_url` is
there and both writers carry the new argument — but `app_capabilities()` returns
**no `venueMapUrl` at all**. The two were applied out of DATE order: round 31's
`20260913100000` first, round 30's `20260912100000` second, and the older file
restates the flag list in full, so it overwrote the newer one. Nothing reads
that flag, so nothing broke. The next one will. Row 260.

**`checkout_sessions` is no longer empty and not one row has settled.** 28
`cs_live_` sessions, all `open`, 2026-09-06 to 2026-09-12 — and in the same ten
days the product made eight bookings, none of them a card payment. Either 28
abandonments or a rail that takes money and never settles it. Row 261; the
Stripe dashboard answers it and nothing on this side can.

### Still owed by the owner

Rows 184, 188 and **258** (round 33's two migrations). Commands in
`docs/REQUESTS.md` §6.

---

## Round 28 — 2026-09-09

Twelve items. **Nine shipped, two found already shipped and verified, two not
attempted** — the window ran out before the venue pair could be done properly.

| # | Item | Outcome |
|---|---|---|
| 1 | Cookie consent | **SHIPPED** — EN/CS/RU/UK, portalled, revisitable |
| 2 | Stripe card-only | **SHIPPED** (code half); dashboard half is row 216 |
| 3 | Roster clickability | **ALREADY SHIPPED** — verified, no code changed |
| 4 | Public profile scope | **SHIPPED** + migration; flag set is partial (row 212) |
| 5 | Admin player actions | **PARTIAL** — (b) and (c) done; (a) not done |
| 6 | Admin players list slimmed | **SHIPPED** |
| 7 | Admin games sorting | **SHIPPED** |
| 8 | Venue Google-Maps link | **NOT ATTEMPTED** — window |
| 9 | Date localization | **SHIPPED** for the named surfaces; sweep is row 209 |
| 10 | Crop uploader for venues | **NOT ATTEMPTED** — window |
| 11 | Venue photo full-bleed | **ALREADY SHIPPED** — verified, no code changed |
| 12 | Ledger | **SHIPPED** — rows 206-218 |

### Two items were already true

Item 3's roster links have existed since round 14 and are asserted by
`public-profile.spec.ts`. Item 11's venue photo already reaches y=0, because
the game detail's `<main>` carries no top padding at all. Both were reported as
found rather than reimplemented — writing a second implementation of something
that works is how a codebase grows two of everything.

### What item 5 did not get

**(a) — edit/remove banner, photo and name from the admin player page.** The
photo removal already exists (`RemovePhotoButton`); the banner and the name do
not. This needed storage-rule changes for admin paths, which is the part that
wanted care rather than speed, and it is the piece most likely to be got
subtly wrong under time pressure. Not started rather than half-started.

### The two the round did not reach

Items 8 and 10, and both for the same reason: they are real work with real
edges. Resolving a `maps.app.goo.gl` link means a server-side redirect follow
with a timeout, a URL allow-list so the resolver cannot be pointed at an
internal host, and a parse that **says so plainly instead of guessing** — the
item's own instruction and the part that makes it more than a fetch. A
half-resolved link that silently stores the wrong pitch is worse than no link.

### Things worth knowing

**The note for a credit movement had been in the wrong table since round 7.**
`grant_credit` wrote it into the event stream, not the ledger row — so the
explanation and the money were joinable only by player and timestamp. Found
while adding removal, fixed in the same migration.

**A verification block failed and blamed the function it was testing.** The
probe read back "the most recent ledger row" with `order by created_at desc
limit 1`, and `now()` is TRANSACTION time — every row in one `DO` block shares
a timestamp, so `limit 1` picked an arbitrary one. Keyed on the amount instead.
Worth remembering for every future verification block in this repo.

**`create or replace` cannot drop a parameter default.** Restating
`grant_credit` without its three defaults failed with "cannot remove parameter
defaults from existing function". The defaults are part of the signature.

### Suites

Unit 679/679 · SQL 33/33 · lint 0 errors · tsc clean. E2E and the deployment id
are in the round's final commit.

---

## Round 27 — 2026-09-06

Six items plus close-out. All six attempted; five shipped whole, one shipped
whole with its verification deferred to the owner's drive.

| # | Item | Outcome |
|---|---|---|
| 1 | Outage: single-game embedded checkout | **SHIPPED** — diagnosed, fixed, plus two adjacent defects and the owner's credit rule as a spec |
| 2 | Add guests after booking | **SHIPPED** — migration validated rolled back, capability-gated, handed over |
| 3 | Profile banner full-bleed | **SHIPPED** |
| 4 | Profile section order (2nd flip) | **SHIPPED** with lineage |
| 5 | "Badges" → "Accomplishments" | **SHIPPED**, key renamed with the value |
| 6 | Close-out staging | **SHIPPED** — (a) had already landed, (b) shipped as a migration, (c) drive re-printed |

### The outage, and how it was found

Single-game checkout 500'd on production while the pass rail worked. The
contrast was the diagnosis: `rememberPendingPurchase` sets a cookie, Next
refuses that in a render, and round 26 had moved the call into
`/payment/checkout` — a Server Component — because under pay-first the id worth
stashing only exists after the session is created, which happens during the
render. The pass stash is written by a Server Action and was never affected.

`pendingPurchaseCookie.ts` states the rule in its own doc comment. The code
that broke it was written eight hours earlier in the same repository.

**The evidence was in the database, not a log.** `vercel logs` only carries a
few minutes of traffic and held nothing but cron. Two `cs_live_` sessions sat
in `checkout_sessions` at status `open` — created and registered, then the
throw. That is exactly how far the path gets, and it pinned the failure to the
line after `open_checkout`.

**One false lead, recorded so nobody repeats it:** the served HTML contains
`Čeká na platbu`, which looks like round 25's deleted `seatAwaitingPayment`. It
is `account.badgeReserved`, a different key that happens to share the Czech
wording. Deployment identity came from the API record's `githubCommitSha`
instead.

### The finding nobody asked for

Round 26's `docs/ops/round26-schema-cleanup.sql` **would have emptied every
lineup on the site.** `lib/games/queries.ts` still SELECTed `is_pending` in
both roster reads — round 26 stopped using the column and never stopped asking
for it. Dropping it under the deployed code makes PostgREST error, and both
call sites read `if (error || !data) return []`. Silent, no error page, nothing
in a log.

The round-26 end report had flagged the script as "outside the migration
history" and recommended pairing it with one test edit. That was the right
instinct and an underestimate: it needed the two selects, four column-boundary
suites, and a dead server action as well. It is a migration now.

### Ordering, which is not last round's

Round 26's migration was "apply promptly after the deploy". Round 27's cleanup
is the opposite — **deploy first, then migrate** — because only the new code
has stopped asking for the column it drops. Both directions are in the ledger
at row 203 and in `docs/REQUESTS.md` §6.

### Suites

Unit 649/649 · SQL 33/33 ALL PASS · lint 0 errors · tsc clean · build clean.
E2E result and the deployment id are in the round's final commit message.

Three unit failures appeared mid-round and were correct: the i18n completeness
test caught `games.addGuests.pick` (`+{n}`) as untranslated in all three
overlays. It is a numeral in every language, so it joined
`INTENTIONALLY_UNTRANSLATED` and the duplicate was removed from the overlays
rather than three identical strings going into the native-review batch.

### Still owed by the owner

Rows 184 (the unsettleable holds), 188 (link retirement, staged behind the
drive) and 203 (two migrations). The verification drive is re-printed in
`docs/REQUESTS.md` §6 and updated for the fixed flow.
