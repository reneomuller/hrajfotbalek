# REQUESTS — every request the owner has made, and where it stands

**Standing practice from round 10 (2026-08-20).** One numbered row per request.
Every round updates this file, and **every end report closes by quoting this
file's OPEN and BUILT-DORMANT rows verbatim** — the point is that nothing the
owner asked for can go quiet.

## How to read a status

| Status | Means |
|---|---|
| `SHIPPED round-N` | Built, on `main`, and live on production unless the row says otherwise |
| `BUILT-DORMANT-ON-<step>` | The code is shipped and tested. It renders nothing, or does nothing, until the named step is taken **by the owner**. It is not waiting on this repo |
| `PARTIAL` | Part of the ask is live; the row names the part that is not |
| `OPEN` | Not built, not declined, not blocked on the owner. Work still owed |
| `DECLINED-because …` | Refused with reasoning. The reason is in the row so the next session does not re-propose it |

Two rules for whoever edits this next:

1. **A row is never deleted.** A request that turns out to be wrong becomes
   `DECLINED-because` with the reason; a request that gets superseded says so
   and points at the row that supersedes it.
2. **`BUILT-DORMANT` is not a synonym for `done`.** The owner still has a step
   to take, and the report has to say what it is. If a dormant row's step is
   ever taken, the row becomes `SHIPPED round-N` on the round that verifies it.

---

## 1. The three refusals that predate the redesign

Recorded in `SCOPE.md` §1 as contract v1.3 rulings. They are here so this file
is the single index and so nobody re-derives them from the design brief, which
is the input that produced the contract rather than its output.

| # | Request | Status |
|---|---|---|
| 1 | Exactly one skill level per game, never two | `DECLINED-because` `games.allowed_skill_levels` is a set on purpose — a game legitimately admits two adjacent levels. "Never two" is a data-model change wearing a card rule's clothing. Ruling I |
| 2 | Max one week ahead — no dates beyond that anywhere, the All Games view included | `DECLINED-because` hiding games from the list is the exact defect v1.1.6 C diagnosed. The **strip** caps at 8 boxes; the **list stays complete**. A game eleven days out that no surface shows cannot be booked. Ruling H |
| 3 | Delete a game outright, no record | `DECLINED-because` an event log with a hole in it is worse than an admin-visible cancelled game. Cancellation is additive; the game becomes `cancelled` and stays visible to admin. Ruling O |
| 4 | Cash-to-cash refunds (the second half of ruling O's "refund in kind") | `OPEN`, and quarantined — money has never left this system. `lib/policy.ts` sets `refundAs: "credit"` and there is no cash-refund path anywhere. **The trap:** reading "in kind" as a specification produces a cash-out feature the quarantine defers |
| 5 | "Non-refundable after 10hrs **unless you fill spot**" | `DECLINED-because` nothing records which cancellation a later booking answers — `spot_released` and `booking_created` are independent events. The clause was struck 2026-08-19 so the string table would not carry a promise no code can keep. The flat 10-hour rule shipped without it |

---

## 2. Quarantined in `SCOPE.md` §2 — and what has since been built

Eight items were quarantined behind backend capability. **Five have since been
requested again and built**, which is the interesting half of this table: the
quarantine held until the owner lifted it, item by item.

| # | Request | Status |
|---|---|---|
| 6 | Per-game pitch names, typed at creation and reused from a dropdown | `SHIPPED round-9` — migration 41 applied (local + production, verified round 9 item 1). Free-text field with a `pitch_name_suggestions` datalist; every typed name is remembered, no save flag. Renders on the game detail. See row 51a for the label-language ruling |
| 7 | In-app notifications surface | `SHIPPED round-7` (item 5) — `notifications` table, bell in the header, admin compose. Migration applied and verified |
| 8 | Phone mandatory at signup | `SHIPPED round-7` (item 8) |
| 9 | Stripe checkout | `BUILT-DORMANT-ON-setting the Stripe env vars in Vercel`. Hosted Payment Links, not an integration: `NEXT_PUBLIC_STRIPE_PAYMENT_URL` (per-game) and `NEXT_PUBLIC_STRIPE_PASS_URLS` (a JSON map of tier → link). Both unset today, so the online option renders as a gated placeholder and credits + cash work as they always have. Reconciliation is manual by design |
| 10 | Admin user search | `SHIPPED round-7` (item 9) — the admin player detail page |
| 11 | Admin ban / delete a player | `OPEN`, still quarantined — **ban is a new account state**, with consequences for bookings already held. Search was the cheap half and shipped; this is not |
| 12 | Pitches as an entity under venues (Pitch 1, 2, 3…) | `OPEN`, still quarantined — a new entity, an FK on `games`, admin CRUD, and a decision about what a pitch inherits from its venue. Row 6 is the front-end answer that avoided all of it |
| 13 | Organizer role management (dropdown, add, promote) | `OPEN`, still quarantined — organizers are a contact record, not an account type. It needs a role model the product does not have |
| 14 | Admin bulk credit issuance on cancellation | `OPEN` — may already exist inside the cancellation loop; needs reading before it is specified. Nobody has read it yet |

---

## 3. The redesign rounds

### Rounds 0–2 (night run, `staging/v13`)

| # | Request | Status |
|---|---|---|
| 15 | Rulings R1–R9, branch law, the pitch photograph | `SHIPPED round-0` |
| 16 | Chrome: nav, header, ADMIN badge, avatar | `SHIPPED round-1` |
| 17 | The list card over the pitch photograph | `SHIPPED round-2` |
| 18 | List density — how many whole cards above the fold | `SHIPPED round-3` as **two**, ratified by the owner after the run reported it could not reach three. R10 |
| 19 | Make the card outline thicker | `SHIPPED round-3`. It had silently not rendered for two rounds: Chrome snaps `border-[1.5px]` to the device grid and **reports it as 1px**, so the spec asserting 1px agreed with the bug. Everything is `border-2`. R11 |
| 20 | Nav bar: flush band or inset cells | `SHIPPED round-3` — **the frames win**, the owner's second reversal on this element. The band is flush and full-bleed; the cells take a 12px inset with a 6px gap. R12 |

### Rounds 3–6 (overnight run, merged and deployed)

| # | Request | Status |
|---|---|---|
| 21 | Home + Games per `p01`, `p02` | `SHIPPED round-3` |
| 22 | Game detail per `p03`, including R6(b)'s header-band photo fade | `SHIPPED round-4` — one header band for every game, replacing two. R13 |
| 23 | Auth restyle per `p08`, `p09` | `SHIPPED round-5` |
| 24 | Profile per `p10`, `p11` | `SHIPPED round-6` |
| 25 | `p08`'s "Continue with Google" | See row 27 — round 5 declined to paint a dead button (R15); round 7 built the flow behind a flag |
| 26 | Forgot-password: do not invent a design for a screen with no frame | `SHIPPED round-5` as "leave it working, restyle only the box". Superseded by row 47, which built the screen in the product's own shell rather than from a frame |

### Round 7 (twelve items, supervised)

| # | Request | Status |
|---|---|---|
| 27 | Google sign-in | `BUILT-DORMANT-ON-setting NEXT_PUBLIC_GOOGLE_AUTH=1 and configuring Google OAuth in Supabase`. The flow ships; `components/auth/GoogleAuthBlock.tsx` returns null while the flag is unset, and a spec fails if anyone renders it unconditionally |
| 28 | Change email | `SHIPPED round-7` |
| 29 | Game-pill photo fade | `SHIPPED round-7` |
| 30 | Admin frames (`p14`–`p19`) mapping check | `SHIPPED round-7` (item 0) — and it found the audit wrong: `p15` is add-player, `p16` is the new-venue block **inside** `/admin/games/new`, `p19` is `/admin/stats`, `p12` is home's community section. Only `p13` was genuinely new |
| 31 | New game flow, financials page, admin player detail | `SHIPPED round-7` |
| 32 | Payment UI: three options | `SHIPPED round-7` (item 11) — three options with the online one gated. See row 9 |
| 33 | Pass purchase links, one env var, JSON map of tier → link | `BUILT-DORMANT-ON-pasting the JSON map into Vercel` — `NEXT_PUBLIC_STRIPE_PASS_URLS`. The template with every real tier identifier as a key was printed for the owner in the round 7 report |
| 34 | Stripe redirect params — `client_reference_id` and `prefilled_email` on every outgoing link | `SHIPPED round-7` (item 16), asserted on the outgoing URL. Dormant in effect, because row 9's links are unset |

### Round 8 (fourteen items)

| # | Request | Status |
|---|---|---|
| 35 | Seed prices to 150 CZK | `PARTIAL` — the seed and scaffold are corrected and `docs/ops/reprice-games-150.sql` exists, self-guarding and dry-run first. **It matches zero production rows today**, so nothing is owed unless a 200 CZK game appears. Ruling F |
| 36 | The `p14` dashboard | `SHIPPED round-8`, and **rebuilt in round 10** — see row 49 |
| 37 | Financials CSV export | `SHIPPED round-8` (item 3) |
| 38 | Detail-page header photo sliver, list-card fade boundary, badge pills | `SHIPPED round-8`. The fade work uncovered R19: Tailwind gradient stops are on a **5% scale** — `via-52%`, `to-72%` and `to-92%` generate **nothing**, and three surfaces had shipped with no stop positions at all |
| 39 | Organizer contact over WhatsApp | `SHIPPED round-8`, and made private in round 9 — the number was in the page source. See row 43 |
| 40 | "Your next game" box, profile banner, three payment options | `SHIPPED round-8` |
| 41 | **Fidelity pass — several surfaces "barely resemble their frames", `p14` named** | `PARTIAL` at round 8 (R20), **closed for `p14` in round 10** — see row 49. The finding was that "different feel" lived in surface treatment, label colour and one type step, not in missing elements |

### Round 9 (eight items)

| # | Request | Status |
|---|---|---|
| 42 | Verify the three migrations are applied | `SHIPPED round-9` — notifications, profile_cover and pitch_name confirmed on local **and** production |
| 43 | WhatsApp privacy: the organizer's number must not be in the page source | `SHIPPED round-9` — `/api/wa/[gameId]` 302s to `wa.me` with the digits and the prefilled text built server-side, `cache-control: no-store`, 404 when there is no number |
| 44 | Badges: record the `p03` size divergence as deliberate | `SHIPPED round-9` — R21. The `size` prop is **removed** rather than defaulted, so no call site can quietly reintroduce per-instance sizing |
| 45 | Extend the profile cover and **measure** the contrast | `SHIPPED round-9` (item 4) — extended to 245px. Measuring is what caught the bug: the absolute cover was painting over `ProfileStats`, max luminance 37 across the stats band, numerals not on screen. The same stacking class as the round-6 nickname bug |
| 46 | Merge the admin game pages; remove the drafts section | `SHIPPED round-9` |
| 47 | Forgot password, built | `SHIPPED round-9` (item 8) — `/login/reset` in the product's own shell. No design invented, because there is still no frame |
| 48 | **Apply `20260820160000_cover_key_and_grants.sql` to production** | `BUILT-DORMANT-ON-the owner running the migration`. Applied locally and verified; **not** applied to production. Until it is, a cover upload on production **saves a row but not the image**. The command is in every end report and is repeated at the bottom of this file |

### Round 10 (three items)

| # | Request | Status |
|---|---|---|
| 49 | **`/admin` = `p14`, uncapped — the fifth time this has been asked** | `SHIPPED round-10` (item 1). Side-by-side at 390px, iterated until the comparison stopped producing findings. Pinned by `e2e/strips-admin-dashboard.spec.ts`, which is the first spec this page has ever had — round 8's version could drift because nothing failed when it did. Residual divergences are listed in §4 below |
| 50 | This file | `SHIPPED round-10` (item 2) |
| 51 | The pitch-name admin form label stays English | `SHIPPED round-10` (item 3) — see §5 |
| 52 | *Not a request — a finding raised by row 49, filed here because R23 promises it a row.* `page-title` is probably one step too loud product-wide | `OPEN`, and it is the owner's call. Every frame measured — `p02`, `p05`, `p10`, `p11`, `p18` as well as all four admin ones — draws its page title at a **23.4px cap**. `page-title` renders 28.2; `title` renders 21.3. R17 added the step on the reading that our titles were "a third smaller than the design", and the pixels disagree. Correcting it moves **nineteen headings** across home, games, auth, pass and profile — surfaces nobody asked about in round 10, which is why admin was fixed alone. R23 |

---

## 4. `p14`: what still differs, and why each one is not code

Round 10's brief was to iterate until the divergence list was empty **except
items physically impossible without a new frame**. It is. What remains:

| Divergence | Why it is not buildable from this frame |
|---|---|
| Rows carry a sequential number, `#62`…`#67` | `games` has no sequential id and nothing in the schema orders games that way. A surrogate display number is a schema decision, not a paint one |
| The organizer reads `Gabriel +668` | A name plus a three-digit fragment. `organizer_phone` exists, but the frame does not say what the number is — last three digits, an extension, a placeholder — and inventing a meaning puts a wrong fact in an admin list |
| Revenue reads `$12,350` | **Money is Czech in every language** (CLAUDE.md). The frame's dollars are a mock artefact; ours reads `750 CZK` |
| The frame shows six upcoming rows, ours shows five | Seed data. The query takes six |
| Ours has a site footer; the frame ends at the nav pill | Not admin-specific: **none of the nineteen frames draws the footer.** A global chrome question, not a `p14` one |
| The header shows an avatar and a flag where the frame draws a person glyph and `EN ▾` | Round-1 chrome, already reviewed, shared by every page |

---

## 5. Rulings recorded without code

| # | Ruling | Recorded |
|---|---|---|
| 51a | **The pitch-name admin form label stays English.** The admin panel is English-only by standing rule; carving admin into the i18n overlays is **declined as disproportionate** — it is a surface only the owner and organizers see, and `lib/i18n/__tests__/i18n.test.ts` actively forbids translating outside the player-facing sections. Player-facing pitch-name rendering — the data join that puts the name on the game detail — is unaffected and stays as built | Round 10, item 3 |

---

## 6. Standing owner actions

**One command is outstanding.** It is row 48, and it is repeated here because a
dormant row at the bottom of a table is a row that gets skimmed:

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260820160000_cover_key_and_grants.sql --production
```

Until it runs, **a profile cover uploaded on production saves a database row
and no image.** The `--production` flag is deliberate and cannot be replaced by
an environment variable — see CLAUDE.md on why implicitness is what failed.

**Three environment variables are unset**, and each holds a shipped feature
dormant: `NEXT_PUBLIC_GOOGLE_AUTH` (row 27),
`NEXT_PUBLIC_STRIPE_PAYMENT_URL` (row 9), `NEXT_PUBLIC_STRIPE_PASS_URLS`
(row 33).

**One data statement is outstanding** and needs no migration file — the venue
separator moved from an em-dash to a bullet in the fixtures and production rows
still carry the old one. It is in CLAUDE.md under "Migrations applied to
production".
