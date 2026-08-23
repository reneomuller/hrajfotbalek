# NIGHT LOG — round 16 (overnight, 2026-08-22 → 23)

Twenty-two numbered items plus an improvement mandate. This file is the
handover if the context window runs out mid-round; the end report is the
deliverable.

## Where things stand

**All twenty-two done and pushed**, plus the improvement pass.

**Checkpoint deploys:** `dpl_Ha7agJXGvcLhjLaDRKGTFQGoAUMT` (items 1–10, 20) and
`dpl_41dTPnP2TGyQ8s8cHHVGnmVApfSB` (11–21). The final one is in the end report.

**Item 5 was done twice**, and the second time is the one that counts. The
first change removed `AvailabilityCard`'s three-face summary; the duplication
the owner described — an avatar stack directly above the named list, same card
— was inside `PlayersList` and survived. Found by screenshotting the page, not
by reading the diff.

## Migrations written tonight, NONE applied to production

The owner cannot apply tonight. All three are validated against local inside a
transaction and rolled back, then applied to LOCAL so the suite exercises them.

| File | What it is |
|---|---|
| `20260823100000_players_updated_at` | Item 2 — the photo-URL cache buster that never moved |
| `20260823110000_policy_v3_eight_hours` | Item 6 — refund cutoff 10h → 8h, and the number becomes readable |
| `20260823120000_round16_actions` | Items 11, 13, 17, 18, 19 — seven functions, four event types |

**The code tolerates all three being absent**, and that is not a claim — it is
how the code is built:

- item 2 reads `updated_at ?? created_at`, so a pre-migration database behaves
  exactly as it does today
- item 6 reads `cancellation_refund_cutoff_hours()` and falls back to
  `lib/policy.ts`'s 10, which is what a pre-v3 database actually enforces
- items 11/13/17/18/19 are gated on `app_capabilities()`, a function the
  migration itself creates — absent means every control stays hidden

## Things found rather than fixed on request

- **The seed could not reset** (round 15's fix held, but strays reappeared from
  interrupted runs — the fix collects them now).
- **Editing files while the e2e suite runs produces torn reads.** One cutover
  failure was traced to it. Do not edit during a run.
- **`PASS_REFERENCE_PRICE_CZK` lived in a module that opens a DB client**, so a
  client component importing it dragged `next/headers` across the boundary.
  `tsc`, `eslint` and `next build` were all clean; e2e caught it in a browser
  console. It lives in a leaf now.
- **The detail card ignored `games.pitch_name`** while list cards honoured it,
  so the two surfaces could disagree about a pitch's name.

## What a later session should know

- **Do not edit files while the e2e suite runs.** A `cutover` failure was
  traced to a torn read of a page being rewritten mid-run. It looks exactly
  like a real regression.
- **`app_capabilities()` is the pattern to reuse** for anything that needs a
  migration the owner cannot apply yet. The migration creates the function, so
  its absence switches the feature off — no flag, nothing to set, nothing to
  forget, and applying it turns the feature on with no deploy.
- **Round 16's three migrations are queued and nothing else is.** The end
  report's morning block is the authority; `docs/REQUESTS.md` §6 carries the
  same commands.
