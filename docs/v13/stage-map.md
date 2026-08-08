# Stage ownership — every screen under exactly one stage

Eight stages, 0–7. Every wireframe screen and every ruling-P gap screen belongs
to exactly one of them, and each stage is bound to the command that decides
whether it is done.

> **`UI_WIREFRAME.json` does not exist.** The plan's acceptance criterion names
> it, and it is not in the repository, not in any Letco planning workspace, and
> not anywhere on this machine — only the single id `SCR-APP-CHROME` is ever
> cited, in `DESIGN_SYSTEM_V1.3.md` §1.7. The fifteen screens are instead
> enumerated in prose, identically, in two places:
> `LETCO_IMPLEMENTATION.md:483` and this plan's own Phase 5 item 2. **That
> enumeration is what this file maps**, and it is reproduced verbatim in §1 so
> the substitution is visible rather than assumed.
>
> **A related defect, since it will bite every phase that follows a Design
> Reference.** `EXECUTION_PLAN_V13.md`'s "correction 1" repointed all 174
> references from `~/.letco/planning-workspace/3ef1c35c-…` to `c42403ae-…`, on
> the stated grounds that the first "has never existed on this machine". Both
> halves are wrong: `c42403ae` does **not** exist, and `3ef1c35c` **does** —
> it holds `DESIGN_SYSTEM_V1.3.md` (byte-identical to the repo copy),
> `LETCO_IMPLEMENTATION.md`, `LETCO_REQ_INVENTORY.md`,
> `LETCO_TEST_SCENARIOS.md` and `REDESIGN_V1.3_FIGMA_REQUEST.md`, which is
> every file the plan cites. The correction broke references that resolved.
> **Read Design References at `3ef1c35c-fef9-4c3e-a6b8-9055d0268d4a`.** Note
> also that the inventory is `LETCO_REQ_INVENTORY.md`, not the `.json` the plan
> names.

---

## 0. The eight stages

Contents are `DESIGN_SYSTEM_V1.3.md` §5, which is kept identical to
`LETCO_ANALYZE.md` §6.

**The analysis table stops at Stage 6.** Stage 7 — the auth restyle — is the
eighth, and it exists in the design system's table but not in the analysis's.
A plan that counts stages from the analysis alone finds seven and leaves login,
signup, set password and the sign-in-link failure screen unowned.

| Stage | What it is | Gate |
|---|---|---|
| **0** | Token table + all call-site migrations. No screen is redesigned, but **every screen changes appearance**. Global chrome restyled | `test:unit`; strips of every screen at 390px and desktop, EN and CS; axe |
| **1** | Canonical game card, games list, 8-box day strip | `test:e2e` list specs + strips |
| **2** | Game detail rebuild, seven-state claim bar, organizer locked state | `test:e2e`, one spec per bar state |
| **3** | Nav with Home in and My Games out, profile display/edit | `test:e2e` incl. `/my-games` still resolving; axe |
| **4** | Pass tiers, wallet in batches, top-up QR | `test:e2e` + **`test:integration` ledger check** |
| **5** | Home reorder, hero ≥25% shorter, FAQ window from `lib/policy.ts` | `test:unit` (i18n walk) + strips EN/CS/RU |
| **6** | Payment choice, claim confirmation, waitlist convert and join, cancel dialog | `test:e2e` asserting on server renders or the database |
| **7** | Auth restyled: login, signup, set password, sign-in-link failure | `test:e2e` auth specs (one cached session per player) + axe |

**Stage 0 lands before any screen-redesign commit.** It is the stage that
answers the actual complaint — *"messy and hard to navigate, not a very clean
UI or pleasant UX"* — and every later stage builds surfaces on top of its
token table. A screen redesigned before Stage 0 is a screen redesigned against
nine greys, nine hairlines, six radii and four font families, and it gets done
twice.

---

## 1. The fifteen screens, each under one stage

The enumeration, verbatim: *global chrome, home, games list, game detail, claim
confirmation, cancel booking, pass, profile, waitlist, auth, 404/error, payment
choice, My games, top-up QR, terms and privacy*.

| # | Screen | Stage | Treatment |
|---:|---|:---:|---|
| 1 | Global chrome | **0** | Redesign — header, footer, nav pill shell, language menu with flags, toast in success **and** error variants |
| 2 | 404 | **0** | **Inherit-only**, strip check |
| 3 | Terms | **0** | **Inherit-only**, strip check |
| 4 | Privacy | **0** | **Inherit-only**, strip check |
| 5 | Games list | **1** | Redesign |
| 6 | Game detail | **2** | Redesign |
| 7 | Profile | **3** | Redesign |
| 8 | My games | **3** | Redesign |
| 9 | Pass | **4** | Redesign |
| 10 | Top-up QR | **4** | Redesign |
| 11 | Home | **5** | Redesign |
| 12 | Payment choice | **6** | Redesign |
| 13 | Claim confirmation | **6** | Redesign |
| 14 | Cancel booking | **6** | Redesign |
| 15 | Waitlist | **6** | Redesign |
| 16 | Auth (login, signup, set password) | **7** | Redesign |

Sixteen rows for fifteen enumerated screens: *terms and privacy* is one item in
the enumeration and two screens in the product, and they are listed separately
because each gets its own strip.

### The two splits that a single-owner rule forces

**`404/error` is not one screen.** The enumeration joins them; the stage table
separates them, and it is right to:

- **404** — Stage 0, inherit-only. It is a generic not-found page and it
  inherits the token layer like everything else.
- **`/auth/error`** — Stage **7**, redesigned. The sign-in-link failure screen
  with resend / wrong-address / use-a-code is auth work, listed explicitly in
  Stage 7's contents. It is the screen a player lands on when a magic link
  fails, and it is the one surface in the product whose whole job is recovery.

Assigning both to one stage would either leave the recovery routes undesigned
or drag a generic 404 into the auth stage.

**"Waitlist" spans two stages, and only one of them owns a screen.**

- **Stage 2** owns the waitlist *state on the claim bar* — read-only, no leave
  control, because leaving a waitlist is quarantined. That is a state of the
  game detail screen, not a screen.
- **Stage 6** owns the waitlist *screens*: convert, and the join confirmation.

So the screen is Stage 6's; the bar state is Stage 2's. Recorded because
"waitlist" appearing in two stages' contents reads like a conflict and is not.

---

## 2. Ruling P's gap screens — owned, not collected

Empty states, loading skeletons, the post-claim confirmation and player-side
cancellation each land in the stage that owns their surface. **There is no
later stage that collects them.** An empty state designed away from the list it
belongs to is designed twice, and the second one is the one that ships (F9).

| Gap screen | Stage | Surface it belongs to |
|---|:---:|---|
| List empty state | **1** | Games list |
| List loading state | **1** | Games list |
| Detail skeleton, with the claim bar's height reserved | **2** | Game detail |
| Zero lineup | **2** | Game detail |
| Absent waitlist block | **2** | Game detail |
| My games empty state | **3** | My games |
| My games loading state | **3** | My games |
| Zero balance | **4** | Pass / wallet |
| Expiring-soon state | **4** | Pass / wallet |
| Upcoming at zero, one, two | **5** | Home |
| Post-claim confirmation | **6** | Claim confirmation |
| Player-side cancellation | **6** | Cancel booking |

The detail skeleton **reserves the claim bar's height**. A skeleton that omits
it shifts the whole page when the bar arrives, which is the layout shift the
skeleton existed to prevent.

---

## 3. The two exit conditions a stage table invites you to defer

Restated here because a table of contents-per-stage makes both look like
someone else's problem.

1. **CS and RU ship in the same commit as EN, in every stage.** The i18n walk
   is not Stage 5's gate — it is every stage's gate. `npm run test:unit` walks
   every player-facing key, so a stage that lands EN alone fails the unit suite
   in the stage that lands it, not later.
2. **Every stage ships its surfaces' empty, loading, error and pending
   states.** §2 above is the list; a stage is not done when its happy path
   renders.

---

## 4. Gate commands, per stage

| Stage | Command | Also |
|:---:|---|---|
| 0 | `npm run test:unit` | strips at 390px + desktop, EN and CS; axe |
| 1 | `npm run test:e2e` (list specs) | strips |
| 2 | `npm run test:e2e` | one spec per claim-bar state (seven) |
| 3 | `npm run test:e2e` | `/my-games` still resolves; axe |
| 4 | `npm run test:e2e` **and** `npm run test:integration` | ledger check |
| 5 | `npm run test:unit` (i18n walk) | strips EN/CS/RU |
| 6 | `npm run test:e2e` | assertions on server renders or the database, never on client-state markers |
| 7 | `npm run test:e2e` (auth specs) | one cached session per player; axe |

Stage 6's qualifier is not stylistic. Client-state success markers do not
survive `revalidatePath` — anything rendered from a `useActionState` result can
be unmounted by the re-render before a spec can observe it. Stage 6 is the
stage most exposed to that, because every surface it owns is a
form-submit-then-confirm flow.

Stage 4 is the only stage needing `test:integration`, because it is the only
one whose correctness is a property of the ledger rather than of a rendering.
