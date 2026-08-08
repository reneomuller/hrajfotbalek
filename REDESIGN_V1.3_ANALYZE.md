# Front-end redesign v1.3 — analysis input

**Role:** the document to upload to Letco as `analyze` for the v1.3 redesign.
**Supersedes:** the raw design brief currently held as `analyze` v2.
**Contract:** `letco-prompt-hrajsport-phase2-v1.md` v1.3 (`8ffe390`), rulings A–P
**Design spec:** `DESIGN_SYSTEM_V1.3.md`
**Date:** 2026-08-07
**Scope:** front-end only. Everything needing new backend capability is in §2 and is *not* this round.

---

## 0. Why this replaces the brief that is currently uploaded

The pipeline's `analyze` document is Oliver's raw design brief — the input that
*produced* contract v1.3, not the output of adjudicating it. In between, five
rulings amended v1.2 decisions made five days earlier, **three brief
instructions were refused outright**, and **seven items were quarantined** as
needing backend capability.

A plan generated from the brief alone will faithfully rebuild decisions that
were overruled, and will schedule work that was explicitly deferred. §1 and §2
below are the difference. **Where the brief and the contract disagree, the
contract wins** — that is what this document records.

---

## 1. Refusals — the brief asked, the contract declined

These are not oversights. Each was considered and refused with reasoning, and
the reasoning is kept because someone will make the same request again.

| The brief asked for | Ruling | What ships instead | Why the refusal |
|---|---|---|---|
| *"Exactly one level per game, never two"* | **I** | Level renders from whatever set the game carries, and comes **off the list cards** entirely — it stays on the detail | `allowed_skill_levels` is a set because a game legitimately admits two adjacent levels. "Never two" is a data-model change wearing a card rule's clothing. Removing the badge from the row also kills the second chip style beside the format pill, which was half of ruling D's problem |
| *"Max 1 week ahead — no dates beyond that anywhere, including the All Games view"* | **H** | The **strip** caps at 8 boxes. The **list stays complete and chronological** | Hiding games from the list is the exact defect v1.1.6 C diagnosed — it was the actual cause of the "skill badges do not render" report. A game eleven days out that no surface will show is a game that cannot be booked |
| *"Delete game — no record"* (accidental creation) | **O** | Cancellation is recorded; refunds go back **in kind** (credit to credit, cash to cash) | An event log with a hole in it is worse than an admin-visible cancelled game. Additive-only is not suspended for convenience |

**Consequence for planning:** any requirement derived from the three left-hand
cells is invalid. If one appears in an implementation plan, the plan was built
from the wrong source document.

---

## 2. Quarantined — real, but not this round (contract §12a)

Each needs new backend capability. Their UI is deliberately **not** designed: a
front-end round that drags a schema change behind it stops being a front-end
round. Each gets its own contract when taken up.

| Item | What it actually needs |
|---|---|
| Pitches under venues (Pitch 1, 2, 3…) | A new entity, an FK on `games`, admin CRUD, and a decision about what a pitch inherits |
| Phone mandatory at signup | A migration, a backfill decision for existing null-phone players, and a re-consent question |
| Organizer role management (dropdown, add, promote) | A role model the product does not have — organizers are a contact record, not an account type |
| Stripe checkout | A payment provider, which v1.1 §11 puts out of Phase 2 entirely. Bank QR + admin confirm remains the payment system |
| Admin bulk credit issuance on cancellation | May already exist inside the cancellation loop; needs reading before it is specified |
| Admin user search, ban, delete | Search is cheap; ban is a new account state with consequences for bookings already held |
| In-app notifications surface | There is no notification store; email is the channel |

**Not quarantined:** ruling F's repricing. The two 200 CZK games are edited
through the existing admin form — data, not schema.

---

## 3. Amendments to v1.2, which was five days old

Recorded as amendments rather than edits, on the same footing as v1.1.4's
reversal of the two-doors ruling. The earlier reasoning was sound about the
problem it was solving.

| Ruling | Amends | Change |
|---|---|---|
| **D** | v1.2 C | The capacity bar is **deleted**. The spots-left ladder itself survives unchanged — it simply appears once, on the figure |
| **E** | v1.2 §5.6a | `View game →` is deleted; **the whole card is the tap target**. v1.2's real content was "there is one claim button in the product", and that is untouched: a card is a link, not a claim |
| **G** | v1.2 B and H | The claim bar **never disappears** — five states, price on the left in every one. v1.2 put price in the info card precisely because the bar could vanish; removing the vanishing removes the reason |
| **H** | v1.2 A | Strip caps at 8 boxes (was a rolling fortnight extended to reach the furthest game) |
| **K** | v1.2 K | Tab bar gains **Home**, loses My Games. `/my-games` **survives as a route** — what is reversed is the tab, not the extraction |

---

## 4. Current state

**Already built (design side).** The §1 token layer exists in Figma:
`https://www.figma.com/design/0lKWK6pRonKNbmFDglzoR7` — 5 collections, 65
variables, 9 text styles, 1 effect style, across a Cover and a Foundations page.
Every semantic variable's description names the retired tokens it absorbs, so
the migration map is machine-readable from the file. The Components page is
empty; §2 and §3 are not drawn. See `REDESIGN_V1.3_FIGMA_REQUEST.md`.

**Not started (code side).** Nothing in `app/`, `components/` or
`tailwind.config.ts` has changed. Stage 0 has not begun.

---

## 5. Change surface — measured, not estimated

Counts are `grep` over `app/` + `components/` on `feat/phase-21-football-rewrites`.

### F1 — The token collapse touches 83 of 144 files. It is not a config edit.

| Retiring family | Usages | Files |
|---|---:|---:|
| Greys (`chalk`, `muted-dim`, `subtle`, `hint`, `dim`, `footer-dim`) | 34 | 24 |
| Hairlines (six of nine) | 40 | 27 |
| Radii (`chip`, `badge`, `cta`, `panel`) | 51 | 41 |
| `font-condensed` | 117 | 64 |
| Translucent surfaces (`surface-card*`, `surface-panel`, `surface-overlay`) | — | 43 |
| `shadow-volt-glow` | — | 4 |
| **Distinct files touched** | | **83 of 144** |

The contract frames ruling A as "one change, before any screen… every surface
inherits it without being rebuilt." That is true of the *token table*; it is not
true of the *call sites*. **58% of the front end needs an edit** before any
screen is redesigned. This is the single largest scheduling fact in the round
and the stage estimate should be built from it.

### F2 — `font-mono` is 189 usages, but only ~12 are payment-related.

Ruling B removes mono from player-facing UI entirely, keeping it only for the
variabilní symbol. Of 189 `font-mono` occurrences, roughly 12 lines mention
variable symbol / VS / payment / QR. **The other ~177 are decorative** and must
move to `sans`. This is the largest single-token migration in the round, and it
is easy to under-scope because the contract sentence describing it is short.

### F3 — `font-condensed` is 117 usages across 64 files.

Barlow Condensed leaves player-facing UI. No token replaces it — every call site
becomes `font-sans`, which changes metrics (Barlow Condensed is narrow; Manrope
is not). **Line-length and wrapping regressions are expected**, particularly in
nav labels, chips and table-like rows. Visual verification is required, not just
a compile.

### F4 — Three tokens have zero call sites and can be deleted for free.

`hint`, `hairline-panel`, `rounded-panel` exist only in `tailwind.config.ts`.
They cost nothing to remove and are evidence for ruling A's thesis: the table
was a sampling of a reference, not a system.

### F5 — `hairline-volt` survives by name but changes value.

Current `hairline-volt` is `rgba(200,255,0,.18)`. The surviving v1.3 token keeps
the short name and takes `.30` — today's `hairline-volt-strong`. **A port that
preserves the old value is a silent, plausible-looking regression**: the code
compiles, the token exists, and selected states are simply too faint. Call this
out in the implementation plan.

### F6 — `surface` and `surface-raised` change value, not just opacity.

Config: `#0A0A0A` / `#0D0D0D`. v1.3: `#0F0F0F` / `#161616`, opaque, replacing the
`rgba(15,15,15,.66)` family. v1.1.2 §8 made panels *more* opaque because the
background was winning; taking them solid finishes that argument rather than
re-tuning it a third time. 43 files reference the translucent tokens.

### F7 — `games.spotsLeft` needs plural forms the string table cannot express.

CS needs `1 místo` / `2–4 místa` / `5+ míst`; RU needs `1 место` / `2–4 места` /
`5+ мест`. `lib/strings.ts` is flat. **This is the one string in the v1.3 set
that needs a plural helper**, and the design spec calls it out precisely so it
is not discovered at implementation time. `npm run test:unit` walks every
player-facing key and will fail if CS/RU land in a later commit than EN.

### F8 — Ruling F's repricing is data, and it has a verification cost.

Two games at 200 CZK are edited to 150 through the admin form. No schema change.
But `pass_tiers` has carried `credited_czk = games * 150` as a CHECK since
migration 32, so the peg is not new — it is being surfaced. Verify the two edits
against the ledger, not against the games list.

### F9 — Ruling P's gap screens are not a cleanup pass.

Empty states, loading skeletons, the post-claim confirmation and player-side
cancellation each land in the stage that owns their surface. An empty state
designed away from the list it belongs to is designed twice, and the second one
is the one that ships.

---

## 6. Build stages (design spec §5)

Stage 0 first, always. It is the stage that answers the actual complaint.

| Stage | Contents | Verifiable by |
|---|---|---|
| **0** | Tokens and primitives only. No screen changes | Strips — every existing screen inherits |
| **1** | Canonical game card, games list, 8-box strip, list empty + loading | TEST-2xx + strips |
| **2** | Game detail rebuild, five-state claim bar, organizer locked state | E2E per state |
| **3** | Nav: Home in, My Games into Profile, profile display/edit | E2E |
| **4** | Pass + wallet in credits, repricing to 150 | SQL + E2E |
| **5** | Home reorder + all copy, CS/RU | Unit (i18n walk) + strips |
| **6** | Claim confirmation, cancel + refund-in-kind, remaining empty states | E2E |

---

## 7. Verification

Four suites answer different questions (CLAUDE.md):

- `npm run test:unit` — pure functions; **the i18n walk that catches a missing CS/RU key**
- `node supabase/tests/run.mjs` — RLS, constraints, RPC authorization
- `npm run test:e2e` — Playwright against the seeded database, `EMAIL_DRY_RUN` forced on
- `npm run test:integration` — `scripts/*.check.ts` against the live database

Plus the **UX iteration loop** (contract §8): Playwright screenshot strips at
phone width, Oliver returns batch verdicts, sessions apply. This is the primary
verification for Stages 0 and 5, where the change is visual and no assertion
captures it.

Two standing traps from Phase 1 that this round will hit:

- **Client-state success markers do not survive `revalidatePath`.** Assert on what the server renders next, or on the database.
- **The E2E suite caches one session per player per run.** Un-cached, it exhausts Supabase's sign-in rate limit partway through and every remaining spec fails with "Request rate limit reached", which reads exactly like a broken product.

---

## 8. Questions surfaced, not resolved

1. **Does Stage 0 ship behind the `/football` namespace or ahead of it?** Phase 21 shipped the football namespace inert and Phase 22 is the cutover. A token change touching 83 files interleaved with a route cutover is two risky changes in one diff. Recommend Stage 0 lands first, on the existing production URL, per contract §9's "nothing in this section happens before the cutover gate".
2. **Is the `body` weight range 400–600 one token or two?** §1.4 gives `body` as "sans 400–600" and §2.1 requires `body-lg` at 700 while §1.4 defines `body-lg` as 600. The Figma layer resolved this as two documented weight variants of existing steps. Code should mirror that rather than inventing scale steps.
3. **What replaces `condensed` metrics in the nav?** Ruling B sends nav labels to sentence-case sans at `small` (13px). Barlow Condensed fits more characters per pixel. `nav.pass` → `Permanentka` (CS) is 11 characters in a four-item bar at 390px. Needs a drawn check before Stage 3, not after.
4. **No `players.locale` column, so emails stay English** (contract §11). Unchanged by v1.3, restated because the redesign touches every other player-facing surface and the asymmetry will look like an omission.
