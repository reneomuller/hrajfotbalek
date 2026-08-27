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

---

# Night of 2026-08-26 → 27 — ROUND 20, the audit night

**This entry is on `audit/uiux-2026-08` and nowhere else.** The round was
read-only for main and it stayed that way: main opened and closed at
`5565a212c2fae3e0d2200fabcaa8dbdf04ca7208`, verified three ways in §8 of
`docs/audit-2026-08/AUDIT_REPORT.md`. Nothing deployed, no migration applied,
production browsed and never acted on.

## What exists now

`docs/audit-2026-08/` — the report, 76 captures in `screens/`, raw measurements
in `measures.json` / `pass2.json` / `pass3.json`, before/after strips in
`prepared/`. Eighteen findings, a consistency matrix, a benchmark section, six
proposals, one ruling challenge, and ten prepared commits that are a shelf to
cherry-pick from rather than a branch to merge.

## The three things the night taught, in the order they hurt

**A probe measures what you pointed it at, not what you meant.** F14 claimed
the amenity checkboxes were 13px. They are — the `<input>` is. The `<label>`
wrapping it is the hit area, it already carries `min-h-11`, and it measures 44.
Half the finding was a false positive that survived because the number was real
and the *element* was wrong. Re-running the same probe against labels found the
true defect three screens away: skill checkboxes at 19.5px. **When a measured
finding names a control, measure the thing a finger lands on.**

**A comment claiming an intention is not evidence the intention shipped.** F1
went into the report as "the code contradicts its own recorded intent", quoting
`DayPicker`. I had not read `resolveSelectedDay`, forty lines away, which argues
the *opposite* with a good reason — a stale shared link. Two recorded
intentions disagreed and only one was implemented. The finding is a ruling
challenge now, and the fix honours both by separating the cases the count
conflated. **Read the other end of the behaviour before writing "this
contradicts itself".**

**`loading.tsx` commits the HTTP status before the page body runs.** F10's
`notFound()` cannot change a 200 on a route that streams a skeleton — and
neither can moving the call into `generateMetadata`, which is awaited before
the stream opens but did not change the status here either. Measured both ways.
The finding splits: the screen is fixed, the status needs a decision about the
skeleton that is the owner's to make. **A status-code finding on a streaming
route is two findings.**

## What a later session should know

- **The ten prepared commits are a shelf, not a queue.** Each message opens
  with its finding ID so `git cherry-pick <sha>` explains itself in the target
  branch. Suites were green on the branch with all ten applied (unit 620/620,
  e2e 291/0/4 skipped, lint + `tsc` + `next build` clean) — that is a statement
  about the ten together, so cherry-picking a subset is re-verified, not
  assumed.
- **The other seven findings are deliberately not prepared.** F2 (dates), F7
  (button treatments), F8 (type scale), F9 (headings), F11 (card recipes), F16
  (skeletons), F18 (borders) are each large, or taste-dependent, or would
  collide with anything else in flight. Shipping them as "small isolated wins"
  would have misrepresented what they are.
- **F2 is the biggest single thing in the report and it wants a decision, not a
  patch.** `DISPLAY_LOCALE = "en-GB"` is hardcoded across 29 call sites while
  `lib/games/days.ts` localises properly four pixels away, so a Czech player
  reads "Tue 25 Aug" beside "Út 25 srp". A `players.locale` column would fix it
  and localise the emails as a side effect — which is a schema change, which is
  Phase 2.
