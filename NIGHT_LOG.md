# NIGHT_LOG

A per-round record of what actually happened, written for whoever picks this up
next. It is not a changelog — the commits are that. It is the shape of the
round: what was asked, what shipped, what did not, and what was found on the
way that nobody asked about.

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
