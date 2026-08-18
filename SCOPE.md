# SCOPE — the boundary of the v1.3 round

Check this file before designing a surface.

Everything below was **decided**, not overlooked. Three requests were refused
with reasoning; seven items are real work that needs backend capability this
round does not build; eleven more are outside Phase 2 entirely. Each is
recorded with the reason it is where it is, because the value of a boundary is
that it holds against the second person to propose the same thing.

---

## 0. Which document wins

**Contract v1.3 (`8ffe390`, rulings A–P) is authoritative over the raw design
brief.** Where they disagree, the contract wins.

This is not a formality. The brief is the *input* that produced the contract;
in between, five rulings amended v1.2 decisions made five days earlier, three
brief instructions were refused outright, and seven items were quarantined. A
plan built from the brief alone will faithfully rebuild decisions that were
overruled and schedule work that was explicitly deferred — which is exactly
what happened once already, and is why `REDESIGN_V1.3_ANALYZE.md` exists.

If a requirement traces back to one of the three left-hand cells in §1 below,
it was derived from the wrong source document.

---

## 1. Refused — the brief asked, the contract declined

| The brief asked for | Ruling | What ships instead | Why refused |
|---|---|---|---|
| *"Exactly one level per game, never two"* | **I** | Level renders from whatever set the game carries, and comes **off the list cards** entirely — it stays on the detail | `games.allowed_skill_levels` is a set because a game legitimately admits two adjacent levels. "Never two" is a data-model change wearing a card rule's clothing. Removing the badge from the row also kills the second chip style beside the format pill, which was half of ruling D's problem |
| *"Max 1 week ahead — no dates beyond that anywhere, including the All Games view"* | **H** | The **strip** caps at 8 boxes. The **list stays complete and chronological** | Hiding games from the list is the exact defect v1.1.6 C diagnosed — it was the actual cause of the "skill badges do not render" report. A game eleven days out that no surface will show is a game that cannot be booked |
| *"Delete game — no record"* (accidental creation) | **O** | Cancellation is recorded **additively**; the game becomes `cancelled` and stays visible to admin | An event log with a hole in it is worse than an admin-visible cancelled game. Additive-only is not suspended for convenience |

### The refund half of ruling O, stated exactly

Ruling O says refunds go back **in kind** — credit to credit, cash to cash.
**Only the credit half exists, and the cash half is quarantined** (§2).

`lib/policy.ts` sets `cancellation.refundAs: "credit"`, and migration
`20260720120000_rpc_cancel_booking.sql` puts it plainly: *there is no
cash-refund path anywhere in* the system. Money never leaves — that was a
Phase 1 design decision, not an omission here.

So a cash payer who cancels receives **wallet credit**, and the copy says so:
`booking.refundCash` is deleted rather than translated into three languages,
and `booking.refundToWallet` replaces it because it is honest to that player.
Anyone reading "in kind" and building a cash-out path is building the
quarantined half.

---

## 2. Quarantined — real, but not this round (contract §12a)

Each needs new backend capability. Their UI is deliberately **not** designed: a
front-end round that drags a schema change behind it stops being a front-end
round. Each gets its own contract when it is taken up.

| Item | What it actually needs |
|---|---|
| Pitches under venues (Pitch 1, 2, 3…) | A new entity, an FK on `games`, admin CRUD, and a decision about what a pitch inherits from its venue |
| Phone mandatory at signup | A migration, a backfill decision for existing null-phone players, and a re-consent question |
| Organizer role management (dropdown, add, promote) | A role model the product does not have — organizers are a contact record, not an account type |
| Stripe checkout | A payment provider, which v1.1 §11 puts out of Phase 2 entirely. Bank QR + admin confirm remains the payment system |
| Admin bulk credit issuance on cancellation | May already exist inside the cancellation loop; needs reading before it is specified |
| Admin user search, ban, delete | Search is cheap; **ban is a new account state** with consequences for bookings already held |
| In-app notifications surface | There is no notification store; email is the channel |
| **"Unless your spot is filled"** — refunding a late cancellation once somebody else takes the spot | A way to attribute a later booking to the spot a particular cancellation freed. Nothing records that: `spot_released` and the next `booking_created` are two independent events, and on a game with several cancellations there is no fact saying which one the new booking answers. It also needs a decision about WHEN the refund fires (at the replacement booking, or at kickoff once the seat is confirmed filled) and what happens if the replacement then cancels too. Deferred by the owner, 2026-08-19, alongside the 10-hour cutoff that ships without it |

**Cash-to-cash refunds** are the eighth, carried in §1 above because they are
half of a ruling rather than a standalone request.

**THE COPY MUST NOT PROMISE THE FILLED-SPOT REFUND.** The 10-hour cutoff ships
as a flat rule — inside the window, the spot is released and no credit is
issued. The owner's original wording was "non-refundable after 10hrs unless you
fill spot"; the clause was struck on 2026-08-19 precisely because the string
table would have carried a promise no code could keep, and the person who
discovers that is a player who cancelled expecting their money back.

**Not quarantined:** ruling F's repricing. The two 200 CZK games are edited
through the existing admin form — data, not schema.

---

## 3. Out of scope for Phase 2 — eleven exclusions

1. **The waitlist is notify-all FCFS, unordered.** Everyone is told at once and
   the race is settled by `create_booking`'s capacity check. Ordered priority
   is a v2 candidate, to be revisited with real data rather than guessed at now.
2. **No booking enforcement by skill level.** `allowed_skill_levels` is
   displayed and is not a gate; capacity remains the sole booking limit.
3. **Emails are English only, and this is a decision.** There is no
   `players.locale` column. The locale is a cookie — a fact about a browser,
   not about a person — so the only thing a "translated" email could key off is
   which browser last touched the site, which is wrong often enough to be worse
   than English. Doing it properly needs that column, and the column is a
   migration, which §4 puts outside this round. Recorded here so it reads as a
   deferred decision with a named blocker rather than as forgotten work.
4. **No push notifications.** No service worker either — a stale cached roster
   is worse than a spinner.
5. **No separate staging database.** The non-production stack is local
   (`.env.test.local`, `lib/env/testDatabase.ts`); a third hosted environment
   was considered and not taken (`PHASE2_ENVIRONMENT.md` §1).
6. **No payment provider.** Bank QR plus admin confirmation is the payment
   system for this round.
7. **No second sport's content.** The namespace work exists; the content does
   not follow it this round.
8. **Initials avatars on rosters are correct behaviour**, not a bug, until the
   roster-view widening ships. Reporting them as missing photos is reporting
   the design.
9. **No balance filtering to close the transient expired-credit window.**
   Balance stays the unfiltered `SUM(delta_czk)`. The window is bounded by the
   sweep interval; closing it with a predicate in the balance query would put
   an expiry rule in every reader and make them disagree the moment one is
   missed.
10. **No minimum venue photo count.** A venue with no photo renders its
    fallback, which is a designed state.
11. **The quarantine itself** (§2) is out of scope — including designing the UI
    for any of it. A drawn screen is a commitment to the capability behind it.

---

## 4. The front-end scope rule

This round is a front-end round. Concretely:

- **No new entity.**
- **No new foreign key.**
- **No new account state.**
- **No schema migration.**

The conformance phases (6–14) probe the schema and are permitted to emit a
*conditional additive* migration where a probe fails — that is a repair to make
the database match the contract it already claims, not new modelling. Anything
that adds a concept belongs to its own contract.

---

## 5. How work lands

- **All work happens on feature branches. Never directly on `main`.**
- **`scripts/reset-platform.mjs` is never run against production again.** It
  reads `.env.local`, which holds production database credentials.

---

## Related

- `REDESIGN_V1.3_ANALYZE.md` — the refusals, quarantine and amendments in full,
  with the reasoning this file summarises
- `DESIGN_SYSTEM_V1.3.md` — the token table and the build-stage map
- `CLAUDE.md` — the load-bearing rules of the codebase itself
