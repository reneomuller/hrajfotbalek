# NIGHT_LOG

A per-round record of what actually happened, written for whoever picks this up
next. It is not a changelog — the commits are that. It is the shape of the
round: what was asked, what shipped, what did not, and what was found on the
way that nobody asked about.

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

### Still owed by the owner

Rows 184, 188, 232, 241 and **258** (round 33's two migrations). Commands in
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
