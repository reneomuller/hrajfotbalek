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

**A DORMANT OR OPEN ROW IS NEVER ECHOED. It is re-verified against reality
before it is printed** (standing rule, round 12). "Still dormant" copied from
last round's report is a claim about the past wearing the present's clothes —
and round 12 found two rows that had silently become true: the booking link had
been set in Vercel and the cover migration had been applied. Both had been
reported as blocked the round before.

What counts as verifying, by kind of row:

| Blocked on | Verify by |
|---|---|
| A Vercel environment variable | `npx vercel env ls production` — the name and its creation time |
| A production migration | Query the live catalog for the object it creates |
| A storage or grant change | Evaluate the predicate on production under a real identity, and drive one real round trip |

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
| 9 | Stripe checkout — the per-game booking link | **`SHIPPED round-12`**, and it was the OWNER who unblocked it. `NEXT_PUBLIC_STRIPE_PAYMENT_URL` is **set in Vercel production**, created 2026-08-20 — verified with `vercel env ls production`, not assumed. Every deploy since carries it, so the online option is live rather than a gated placeholder. Round 12 item 5 then closed the hole this opened: an online booking used to hold its seats before Stripe had seen any money. See row 58 **LIVE-PROVEN 2026-08-29 (round 23, item 6):** the env var being set was never the same claim as money moving, and money has now moved. `credit_topups` `af7f2877-e7c5-45ab-84a6-1155927ff2ed` — pass_games 5, amount 700 CZK, VS `2700000011`, `stripe_session_id` **`cs_live_a1ca8Fe9eqfsjhAQRS4e51OVTQqtb8QruvoDmqwPdVq8CwyiEzWUkx0qxx`**, created 2026-08-29T16:06:18Z, **confirmed 16:06:42Z with `confirmed_by` NULL** — twenty-four seconds, and NULL means no human touched it. The matching `credit_ledger` row is +750 CZK, reason `topup`, at the same instant, expiring 2026-09-29. **`cs_live_`, not `cs_test_`.** The link that carried it is a PASS link rather than the per-game booking link, and that distinction is kept rather than blurred — see row 131. |
| 10 | Admin user search | `SHIPPED round-7` (item 9) — the admin player detail page |
| 11 | Admin ban / delete a player | `OPEN`, still quarantined — **ban is a new account state**, with consequences for bookings already held. Search was the cheap half and shipped; this is not |
| 12 | Pitches as an entity under venues (Pitch 1, 2, 3…) | `OPEN`, still quarantined — a new entity, an FK on `games`, admin CRUD, and a decision about what a pitch inherits from its venue. Row 6 is the front-end answer that avoided all of it |
| 13 | Organizer role management (dropdown, add, promote) | `OPEN`, still quarantined — organizers are a contact record, not an account type. It needs a role model the product does not have |
| 14 | Admin bulk credit issuance on cancellation | **`ALREADY SHIPPED`** — read on 2026-08-21 rather than carried forward a fourth time. `cancel_game` (`20260720130000_booking_rpcs_b.sql`) loops every live booking on the game, computes the credit by the SAME rule as `cancel_booking` — a confirmed booking returns `price_czk`, a reserved one returns only `credit_applied_czk` — and writes a `credit_ledger` row plus a `credit_issued` event per player before flipping the game to `cancelled` and clearing the waitlist. It is bulk, it is atomic, and it has existed since the original booking RPCs. ~~`OPEN` — may already exist inside the cancellation loop; needs reading before it is specified. Nobody has read it yet.~~ |

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
| 27 | Google sign-in | **`LIVE` — the owner turned it on (confirmed round 30).** `NEXT_PUBLIC_GOOGLE_AUTH` is set and the Google provider is configured in Supabase, so `GoogleAuthBlock` renders and sign-in with Google creates an account. **What is NOT yet confirmed is LINKING** — a player who signed up with a magic link and later signs in with Google on the same address. Supabase links by verified email when the provider asserts one, but nobody has driven it end to end; until somebody does, treat a duplicate account as possible. ~~**`DECLINED` by the owner (round 23, item 6)**~~ ~~and the code is dormant BY DESIGN rather than blocked~~ — the decision reversed, which is exactly what the row predicted would cost one variable and no code round. ~~**`DECLINED` by the owner (round 23, item 6)**~~, and the code is dormant BY DESIGN rather than blocked. The flow ships and is tested; `components/auth/GoogleAuthBlock.tsx` returns null while `NEXT_PUBLIC_GOOGLE_AUTH` is unset, and a spec fails if anyone renders it unconditionally. **It stops being an owed thing.** It cost nothing to leave in place — the gate is a flag, not a branch — and if the decision reverses it is one variable plus a Supabase provider, with no code round. ~~`BUILT-DORMANT-ON-setting NEXT_PUBLIC_GOOGLE_AUTH=1 and configuring Google OAuth in Supabase`.~~ |
| 28 | Change email | `SHIPPED round-7` |
| 29 | Game-pill photo fade | `SHIPPED round-7` |
| 30 | Admin frames (`p14`–`p19`) mapping check | `SHIPPED round-7` (item 0) — and it found the audit wrong: `p15` is add-player, `p16` is the new-venue block **inside** `/admin/games/new`, `p19` is `/admin/stats`, `p12` is home's community section. Only `p13` was genuinely new |
| 31 | New game flow, financials page, admin player detail | `SHIPPED round-7` |
| 32 | Payment UI: three options | `SHIPPED round-7` (item 11) — three options with the online one gated. See row 9 |
| 33 | Pass purchase links, one env var, JSON map of tier → link | **`SHIPPED`, and the OWNER did it** — `NEXT_PUBLIC_STRIPE_PASS_URLS` appeared in `vercel env ls production` on 2026-08-29, and the proof it works is not the variable's presence but a completed purchase through it: `credit_topups` `af7f2877-e7c5-45ab-84a6-1155927ff2ed` — pass_games 5, amount 700 CZK, VS `2700000011`, `stripe_session_id` **`cs_live_a1ca8Fe9eqfsjhAQRS4e51OVTQqtb8QruvoDmqwPdVq8CwyiEzWUkx0qxx`**, created 2026-08-29T16:06:18Z, **confirmed 16:06:42Z with `confirmed_by` NULL** — twenty-four seconds, and NULL means no human touched it. The matching `credit_ledger` row is +750 CZK, reason `topup`, at the same instant, expiring 2026-09-29. **`cs_live_`, not `cs_test_`.** This row was `BUILT-DORMANT` for eleven rounds and it is the one that unblocked the rest. ~~`BUILT-DORMANT-ON-pasting the JSON map into Vercel`.~~ |
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
| 48 | **Apply `20260820160000_cover_key_and_grants.sql` to production** | **`SHIPPED round-12`**, verified against production rather than assumed. Three checks, all on the live database: `set_cover_photo` derives the `.cover.` key, so the migration IS applied; the `profile_photos_owner_insert` policy matches `players/<id>.%`, and evaluating it under a real player's `auth.uid()` admits `players/<id>.cover.png` — where the OLD `-cover.` key does not, which was exactly the round-9 bug; and a real upload → public read → delete round trip returned 200 / `image/png` / 70 bytes, with the test object removed |

### Round 10 (three items)

| # | Request | Status |
|---|---|---|
| 49 | **`/admin` = `p14`, uncapped — the fifth time this has been asked** | `SHIPPED round-10` (item 1). Side-by-side at 390px, iterated until the comparison stopped producing findings. Pinned by `e2e/strips-admin-dashboard.spec.ts`, which is the first spec this page has ever had — round 8's version could drift because nothing failed when it did. Residual divergences are listed in §4 below |
| 50 | This file | `SHIPPED round-10` (item 2) |
| 51 | The pitch-name admin form label stays English | `SHIPPED round-10` (item 3) — see §5 |
| 52 | *A finding raised by row 49.* `page-title` is one step too loud product-wide | **`SHIPPED round-12`** (item 1) — **accepted by the owner and corrected.** `page-title` is `clamp(27px,7vw,36px)`: 27.3px at 390, a 23.5px cap, the frames' number. R17 is reversed on pixel evidence and recorded struck-through as R28; nineteen headings moved together and admin went back to `page-title` from the `title` round 10 settled for. ~~`OPEN`, and it is the owner's call. Every frame measured — `p02`, `p05`, `p10`, `p11`, `p18` as well as all four admin ones — draws its page title at a **23.4px cap**. `page-title` renders 28.2; `title` renders 21.3. R17 added the step on the reading that our titles were "a third smaller than the design", and the pixels disagree. Correcting it moves **nineteen headings** across home, games, auth, pass and profile — surfaces nobody asked about in round 10, which is why admin was fixed alone.~~ R23, R28 |

### Round 11 (one feature, two halves)

| # | Request | Status |
|---|---|---|
| 53 | **Admin guests replace shadow players** — remove the shadow-creation and merge flows from the UI; admin adds and removes simple auto-named guests that consume capacity | `SHIPPED round-11` (A). Guests are a count on the game, not a `players` row: `players_nickname_key` is unique on `lower(nickname)`, so "Guest 1" could exist once in the whole database. `merge_players` and `claim_shadow_player` survive as RPCs with no UI — the first is the only repair for a split identity that already exists, the second is how a pre-round-11 shadow is claimed at sign-in |
| 54 | Existing shadow players must keep rendering as guests, with no data loss | `SHIPPED round-11`. **No backfill and no row touched.** A shadow IS `players.auth_user_id is null`, and the roster view projects that as `is_guest`, so they became guests by definition rather than by migration — and they keep their own names. One that is later claimed gains an auth user and stops being a guest, which is correct |
| 55 | **Party booking (+1/+2/+3)** — one booking, N+1 seats, guest avatars at the end of the row | `SHIPPED round-11` (B). `bookings.guest_count`; `price_czk` is the whole party's, which is what lets the variable symbol, the credit application, the confirmation email and `cancel_booking` work untouched. The ceiling is `policy.booking.maxPartyGuests` **and** a constant inside `create_booking_internal` — the second policy window that lives in two places, for the same reason the cancellation cutoff does |
| 56 | Party payment: credits only when the balance covers all N+1, cash as today, online with an explicit "set quantity to N" line | `SHIPPED round-11`. The credit rule is DERIVED rather than corrected after the fact: growing the party past the wallet un-checks the option in the same render, because an effect would fix it one frame late and that frame is the one where Confirm is pressable. The quantity line exists because a Stripe Payment Link carries a fixed quantity of one and no parameter presets it |
| 57 | **Apply `20260821100000_guests_and_parties.sql` to production** | **`SHIPPED round-11`**, applied by the owner and verified on the live catalog before that round's deploy: both `guest_count` columns, `game_seats_taken`, `set_game_guests`, the seven-column roster view, the `anon` read grant, the widened event catalog, and `create_booking` at exactly five arguments with no four-argument overload left shadowing it |

### Round 12 (five items)

| # | Request | Status |
|---|---|---|
| 58 | **Correct `page-title` to the frames' measured cap, product-wide** | `SHIPPED round-12` (item 1) — closes row 52. R28 |
| 59 | **Branding (a): the header keeps only the logo mark** | `SHIPPED round-12`. The wordmark text is gone from beside the monogram; the `aria-label` on the link is now the only thing naming it. The share card and the landing footer's signature are untouched — item 2a is about the mark+text pair as site identity, and neither is that pair |
| 60 | **Branding (b): the hero's display line is `HRAJ FOTBAL.` in every language** | `SHIPPED round-12`. It renders from `t.brand`, a section the i18n test forbids the overlays from touching, so it is **structurally** untranslatable rather than translatable-with-an-exemption. `landing.heroLine1` is deleted from all three tables; `heroLine2` still localizes. **This resolves the Cyrillic-hero question** — a Latin line takes Anton in Russian too, asserted directly on `fontFamily`. R29 |
| 61 | **Ledger live-verification as a standing rule** | `SHIPPED round-12` (item 3) — written into this file's preamble, with what counts as verifying per kind of blocker. It immediately found two rows that had silently come true |
| 62 | **Test substrate: pgTAP, and the two red security assertions** | `SHIPPED round-12` (item 4). The SQL suite is 33/33 for the first time. pgTAP had never been installed, so `notifications.sql` had never run; it lives in the `tap` schema because `public` would have broken the conformance suite. The two red assertions were STALE, not a hole — migration `20260810120000` granted those columns deliberately, and production was checked before the test was changed |
| 63 | **Close the online-payment back-arrow hole** | `SHIPPED round-12` (item 5). Online bookings hold their seats for thirty minutes rather than forever; a signed webhook settles them; a stale pending stops holding seats with no cron. Cash and credit are untouched. See rows 64 and 65 for what is still owed |
| 64 | **Apply `20260821200000_online_payment_pending.sql` to production** | **`SHIPPED round-12`** — applied by the owner and **re-verified against the live catalog on 2026-08-21**, not carried forward on his word: `online_payment_window()`, `retry_online_payment(uuid)`, `booking_holds_seat(booking_status, timestamptz)`, `confirm_online_payment(uuid, text, integer)`, and `bookings` carrying `payment_pending_at` / `payment_attention_at` / `payment_attention_reason`. `create_booking` is at **six** arguments ending `p_online boolean`, which is the one that mattered — the deployed code calls it that way and the five-argument version would have rejected every online booking. ~~`BUILT-DORMANT-ON-the owner running the migration`.~~ |
| 65 | **Set `STRIPE_WEBHOOK_SECRET` in Vercel** | **`SHIPPED`, and the OWNER did it** — set 2026-08-21, found on the re-verification rather than reported. **Verified twice on 2026-08-23:** present in `vercel env ls production`, and `POST /api/stripe/webhook` on the live deployment now answers **400** to an unsigned request instead of 503 — which is the endpoint working: it refuses what it cannot verify and no longer refuses everything. ~~`BUILT-DORMANT-ON-adding the endpoint in Stripe and pasting the signing secret into Vercel`.~~ **AND IT HAS NOW ACTUALLY FIRED (round 23, item 6).** Answering 400 to an unsigned request proved the endpoint refuses what it cannot verify; it did not prove it can confirm what it can. It can: `credit_topups` `af7f2877-e7c5-45ab-84a6-1155927ff2ed` — pass_games 5, amount 700 CZK, VS `2700000011`, `stripe_session_id` **`cs_live_a1ca8Fe9eqfsjhAQRS4e51OVTQqtb8QruvoDmqwPdVq8CwyiEzWUkx0qxx`**, created 2026-08-29T16:06:18Z, **confirmed 16:06:42Z with `confirmed_by` NULL** — twenty-four seconds, and NULL means no human touched it. The matching `credit_ledger` row is +750 CZK, reason `topup`, at the same instant, expiring 2026-09-29. **`cs_live_`, not `cs_test_`.** |

### Round 13 (31 items, sections A–E)

**SECTION A was carried from round 12 as "never delivered". It HAD been** — the
commits are `01e2d84`, `7c2902c`, `eb14bac`, `726ac74` and the deploy was
`dpl_GvdqTD2NgvtpfyL8fVUtAc6tGwT2`, Ready at 04:05 on 2026-08-21. The
observation almost certainly predates it. Rows 58–63 stand as shipped; what
round 13 added is item 2's reversal and a re-verification of item 3.

| # | Request | Status |
|---|---|---|
| 66 | **(2) The hero slogan TRANSLATES again** — R29 struck | `SHIPPED round-13`. The header still keeps the mark alone, so the brand name is now written nowhere in the chrome — the roundel is the name. The Russian display-face fallback returns, accepted under the sentence-boundary break rule and asserted so nobody "fixes" it with a face that cannot set Cyrillic. R30 |
| 67 | **(6) Remove all QR** | `SHIPPED round-13`. The renderer, the `/account/topup` flow and its `[id]` screen, the code on the confirmation, the "Pay by QR" jump. **The RAIL is untouched** (R3): `payment_method = 'qr'`, `payment_code` and the 26-series sequence stay, because live bookings carry them |
| 68 | **(7) Pass rail → Stripe links** | `SHIPPED round-13`, dormant on row 33. `begin_pass_purchase` records a pending purchase, its id travels as `client_reference_id`, and `confirm_online_purchase` dispatches a reference to a booking OR a purchase. **A tier NEVER falls back to the single-game link** — tier prices are discounted, so that charges the undiscounted price even at the right quantity. Unconfigured tiers render "Coming soon" and the action refuses before writing |
| 69 | **(8) Admin top-ups deleted** | `SHIPPED round-13`. The screen, its export and its nav chip. Deprecation SQL for the server functions is **handed over, not run** — `docs/ops/deprecate-qr-topup-rail.sql`, with an audit query, an explicit do-not-drop list and a pending-purchase check |
| 70 | **(9) "Credit applied −150 CZK" removed** | `SHIPPED round-13` |
| 71 | **(10) An unmistakable confirmed state** | `SHIPPED round-13`. It was an 11px eyebrow — the same treatment the product gives the word "Availability" — on the one screen whose job is saying the thing worked |
| 72 | **(11) The FAQ, four Q&As, claims verified** | `SHIPPED round-13`. The waitlist promise is **TRUE**: `notify_waitlist` stamps and emits in one transaction and `notifyWaitlistForGame` mails everyone, driven from both paths that free a spot. See row 79 for the gap it does NOT cover |
| 73 | **(12) "All welcome" line removed** | `SHIPPED round-13` |
| 74 | **(13) Game-form helper texts cut** | `SHIPPED round-13`. Fourteen hints to one clause each; what survived is only what a label cannot carry |
| 75 | **(14) Game information above What's included, modernized** | `SHIPPED round-13`. The ordering was already right; the card had **no heading at all**, so the one block that answers "what is this game" was the only one a reader could not name |
| 76 | **(15) Pass "How it works", verbatim** | `SHIPPED round-13`, three languages, and the "150 CZK a game" line beneath it gone |
| 77 | **(16) Games tab loses its title** | `SHIPPED round-13`. The `<h1>` goes rather than being hidden — the day group heads the list and is the real outline |
| 78 | **(17) "Your next game" is a banner** | `SHIPPED round-13`, reversing round 8 item 9. That reversal's DRIFT argument was right and is not revived; what it did not weigh was ~240px spent telling a player something they already know |
| 79 | **(18) Contact popup + admin edit** | `SHIPPED round-13`, dormant on row 82. Portalled per the modal law and asserted with `elementFromPoint`. Values in `site_settings`, edited in /admin, no deploy. An empty phone list shows no phone |
| 80 | **(19) Telegram tile** | `SHIPPED round-13`, wired and live. The row had to be rebalanced and the Instagram label became the platform name — a copy change nobody asked for, made because the third tile overflowed the panel |
| 81 | **(20) Dashboard sections; games list shortened** | `SHIPPED round-13`. `/admin/games` was 137px a row and is 67. The dashboard's OWN rows stayed at p14's 64 |
| 82 | **(21) One button per game** | `SHIPPED round-13`. Round 9 merged the destinations, so "Edit" reached the same page as "Manage" via a redirect |
| 83 | **(22) ADMIN badge out of the header** | `SHIPPED round-13`. The assertion INVERTS so it cannot come back from the frame |
| 84 | **(23) Credit-redemption bug** | `PARTIAL` — **does not reproduce**, and rows 84a–84c record what was checked. A regression spec and a calling-contract guard shipped. See §7 |
| 85 | **(24) Venue management** | `SHIPPED round-13`, dormant on row 88. `/admin/venues` with create, rename, map link, pitch name, photo and both amenity sets. The venue's photo now backs its games on the CARD as well as the band, reversing REQ-GAME-019 — see R31 for why that premise moved |
| 86 | **(25) Admin guests on the game card** | `ALREADY SHIPPED round-11`. `components/admin/GuestControl.tsx` has been on `/admin/games/[id]` since guests existed. Verified, not rebuilt |
| 87 | **(26) Shadow claim removed** | `SHIPPED round-13`. `claim_shadow_player`'s removal SQL is handed over with the query that counts how many claimable rows remain. `merge_players` stays as the undocumented repair — **this row is its documentation** |
| 88 | **Apply round 13's three migrations to production** | **`SHIPPED`, and the OWNER did it** — found on the 2026-08-23 re-verification, not reported. All three probed for the object they create: `begin_pass_purchase`, `confirm_online_purchase` and `admin_update_venue` are all in `pg_proc`. ~~`BUILT-DORMANT-ON-the owner running them`.~~ |
| 89 | *Gap found while verifying row 72.* The waitlist notifies by EMAIL only; the bell does not carry it | **`SCHEMA SHIPPED round-24`** (item 2), **the waitlist consumer is not built and is now cheap.** The row was `OPEN` for twelve rounds on one sentence — "the notifications store is a broadcast with no per-player recipient, so wiring the waitlist into it is a schema change rather than a cheap join". That schema change is done: `notifications.recipient_id` (nullable, so every existing broadcast is untouched), `booking_id`, and `kind` for per-reader translation, plus `notify_player()` and a `my_notifications` that filters. **The first consumer is the no-show warning** (row 173). What is now a cheap follow-up rather than a schema round: waitlist pings in the bell, and a targeted cancellation notice to the players of one game. Neither is built this round and neither is claimed. The FAQ still says "emailed", correctly, until one of them is |
| 90 | *Deferred from row 85.* Per-game amenity OVERRIDES | **`DECLINED round-14`** (item 2) — *"this answers row 90: no per-game override; strike the question"*. A game inherits its venue's presets and that is the whole model; the design question the row held open (does an empty override mean "nothing provided" or "inherit"?) is moot because there is no override to be empty. ~~`OPEN`. Needs a nullable per-game column and a merge-on-read rule.~~ |
| 91 | **(R14-1) Drafts fully dead** | `SHIPPED round-14`. The unfinished-games panel is gone from `/admin/games/new` and nothing in the product produces or offers a draft. `game_status` keeps the value and `publish_game` keeps its event — the CONCEPT is retired, not the column, because a row that still exists must still render. **Production holds 0 draft rows**, counted on the live database rather than assumed; `docs/ops/delete-draft-games.sql` is handed over anyway, for the day one appears |
| 92 | **(R14-2) Game creation inherits the venue** | `SHIPPED round-14`. `?venue=new` is gone from the new-game form: venues are created at `/admin/venues` and the form only PICKS one. Pitch-name free text stays. This is what struck row 90 |
| 93 | **(R14-3) The profile banner could not be changed** | `SHIPPED round-14`, and it was a real bug rather than discoverability. `PhotoUpload` hard-coded `relative` on its wrapper; the cover passes `absolute right-gutter top-2`, and Tailwind emits `.absolute` before `.relative`, so `relative` won — the offsets then applied to an in-flow element and put the control at **x = −22**, off the left edge of a 390px screen. The wrapper is now positioned only for the avatar, and the control is volt-on-`border-2` so it reads as a control |
| 94 | **(R14-4) Games-page date headers** | `SHIPPED round-14` |
| 95 | **(R14-5) Bigger calendar chips** | `SHIPPED round-14`, and it **reverses the calendar-width ruling**. Chips go from `flex-1` at ~38px to a fixed `w-14`, and the row scrolls. The old rule was "scrolling calendars hide days"; it was buying visibility with a tap target under the 44px floor everything else here respects. The spec's property changes from *fits* to REACHABLE |
| 96 | **(R14-6) Games-page layout** | `SHIPPED round-14` |
| 97 | **(R14-7) Pass page: an active green Purchase pill** | `SHIPPED round-14`, dormant on row 33. The pill is live-looking and live-behaving; with `NEXT_PUBLIC_STRIPE_PASS_URLS` unset it explains itself rather than dead-ending |
| 98 | **(R14-8) Admin lands on the dashboard** | `SHIPPED round-14` |
| 99 | **(R14-9) Admin players list says CREDITS, not Wallet** | `SHIPPED round-14` |
| 100 | **(R14-10) The "600 CZK left" line is gone from the profile overview** | `SHIPPED round-14`. Credits are credits; the CZK gloss contradicted the v1.3 ruling that a balance is displayed in games |
| 101 | **(R14-11) The notify box is off game creation** | `SHIPPED round-14`. It survives post-publish, where the offer is true |
| 102 | **(R14-12) Game information above Organizer, restyled** | `SHIPPED round-14`. A labelled `<dl>` fact list — When / Where / Format / Level — rather than a second card |
| 103 | **(R14-13) Public player profiles** | `SHIPPED round-14`, dormant on row 105. **The quarantine is lifted with the owner's exact scope and no more:** picture, banner, the three stats, badges. No contact, no history, no credits. Guests stay unclickable, `linkProfiles` defaults to **false** so a roster opts in, and `/player/[nickname]` is `noindex`. Keyed by nickname so the public roster never gains a player id. **The spec asserting ABSENCES caught a leak a selector check would have passed** — `ProfileCover` tested whether the cover COLUMN exists, not whether the viewer owns the row, and put a file picker on strangers' banners |
| 104 | **(R14-14) "Your next game" restyled** | `SHIPPED round-14`. **Reverses round 13 item 17's banner ruling** at the owner's instruction: it keeps its place on the games page and takes the row anatomy of Profile → My games |
| 105 | **Apply `20260821240000_public_player_profile.sql` to production** | **`SHIPPED`, and the OWNER did it.** `public_player_profile` is in `pg_proc` and `GET /player/oliver` on the live site answers **200** — it answered 404 for everyone last round. ~~`BUILT-DORMANT-ON-the owner running it`.~~ |
| 106 | **(R15-1) The Stripe return page** | `SHIPPED round-15`, dormant on rows 65 and 88. `/payment/return` is the one URL all six Payment Links come back to. It finds the purchase three ways in order — a cookie written by the server action that minted the id, then this player's most recent purchase that actually went to Stripe within the hour, then an honest empty state — and polls until the webhook settles it. **It never claims success before the webhook says so**: Stripe's redirect lands in the browser and the confirmation lands on the server, and the browser's leg carries no proof |
| 107 | **(R15-2) The credits-added page** | `SHIPPED round-15`. `/pass/credits-added` — the pass sibling of the booking confirmation. The count is read from the LEDGER, not from the purchase, so a player who already held credit sees their real balance. It reads nothing from `?topup=`, which is what lets it also be the landing for a future in-app credit grant |
| 108 | **Set the return URL on all six Payment Links** | **`DONE`, on the owner's report plus a corroborating row** — and the two halves are kept apart because one of them is not probeable from here. **What is probeable:** the purchase completed and credited — `credit_topups` `af7f2877-e7c5-45ab-84a6-1155927ff2ed` — pass_games 5, amount 700 CZK, VS `2700000011`, `stripe_session_id` **`cs_live_a1ca8Fe9eqfsjhAQRS4e51OVTQqtb8QruvoDmqwPdVq8CwyiEzWUkx0qxx`**, created 2026-08-29T16:06:18Z, **confirmed 16:06:42Z with `confirmed_by` NULL** — twenty-four seconds, and NULL means no human touched it. The matching `credit_ledger` row is +750 CZK, reason `topup`, at the same instant, expiring 2026-09-29. **`cs_live_`, not `cs_test_`.** **What is not:** whether the browser was sent back to `/payment/return` afterwards, which lives in the Stripe dashboard and is the owner's word. Nothing breaks either way: the WEBHOOK settles the credits and what a player loses without the return URL is being TOLD. ~~`BUILT-DORMANT-ON-the owner pasting one URL into six Stripe links`.~~ |
| 109 | *Found while writing row 108.* The pass-tier template named tiers that do not exist | **`CORRECTED round-15`**. Row 33's template was `{"1","5","10","15","20"}`; the live table holds `{5, 8, 12, 15, 20}`. Pasting it would have left the 8- and 12-game tiers permanently unsellable and two keys matching nothing — quietly, because an unmapped tier says "Coming soon" rather than selling wrong. Fixed in §7 against the live table |
| 110 | **(R16-1) "Create as draft" on the game form** | `SHIPPED round-16`. Round 9 made creation publish and round 14 removed the draft concept; neither touched the BUTTON, so for two rounds the last words before the press described a workflow that did not exist. **Nothing could have caught it** — the i18n test asks whether a key has a translation, and this one had three, all faithfully wrong. The spec now reads the rendered words on the form's chrome |
| 111 | **(R16-2) A replaced profile photo did not appear** | `SHIPPED round-16`, dormant on row 117 for the durable half. The object key never varies and the cache-buster was `players.created_at`, which never varies either — so a replacement wrote new bytes behind a byte-identical URL. Reproduced with decoded pixels (magenta, then yellow, still magenta) before anything was touched |
| 112 | **(R16-3) The public profile's name and face were invisible** | `SHIPPED round-16`. `ProfileCover` is `absolute` and the identity row was not, so the cover's scrims painted over it. **`elementFromPoint` passes against this bug** — the cover is `pointer-events-none`, so hit-testing walks past the scrims and painting does not. The spec measures luma instead |
| 113 | **(R16-4) "Game information" appeared twice** | `SHIPPED round-16`. Two contract sections (§5.2 facts, §5.7 practical) that read as different KINDS of thing until round 14 restyled the top one into a fact list — at which point they became two lists about one game, 400px apart. Duration and the arrival line moved up; the two rotation lines went with the section and are **not** replaced, see §8 |
| 114 | **(R16-5) Players rendered twice on the game detail** | `SHIPPED round-16`. p03's three-face summary above the full roster, and round 14 item 13 made both clickable — two links to one profile 300px apart. The list wins; the list CARD keeps its stack, because there the faces are the only answer rather than a second one |
| 115 | **(R16-6) Cancellation cutoff 10h → 8h (policy v3)** | `SHIPPED round-16`, dormant on row 118. **No copy changed in any language** — every sentence already interpolates `{hours}`, which is the "policy windows are values, never branches" rule collecting its debt. What changed is where the number comes FROM: `cancellation_refund_cutoff_hours()` reads the constant `cancel_booking` enforces, so the UI cannot contradict it |
| 116 | **(R16-7 … R16-20) The remaining eighteen items** | `SHIPPED round-16`. Day headings (7), the next-game card (8), the All chip (9), the surface badge (10), leave a waitlist (11), the waitlist in My games (12), Clear all (13), Settings folded into Overview (14), the banner cropper (15), the two admin summary sections (16), Remove player (17), admin delete (18), cancel with a reason (19), price prefill and the pitch-name reversal (20). Items 11, 13, 17, 18 and 19 are dormant on row 119 |
| 117 | **Apply `20260823100000_players_updated_at.sql`** | **`SHIPPED`, and the OWNER applied it** — verified 2026-08-25 by probing the objects, not the filenames. ~~`BUILT-DORMANT-ON-the owner running it`.~~ |
| 118 | **Apply `20260823110000_policy_v3_eight_hours.sql`** | **`SHIPPED`, and the OWNER applied it** — verified 2026-08-25 by probing the objects, not the filenames. ~~`BUILT-DORMANT-ON-the owner running it`.~~ |
| 119 | **Apply `20260823120000_round16_actions.sql`** | **`SHIPPED`, and the OWNER applied it** — verified 2026-08-25 by probing the objects, not the filenames. ~~`BUILT-DORMANT-ON-the owner running it`.~~ |
| 120 | *Found while doing R16-10.* One upcoming game has no surface recorded | **`RESOLVED`** — re-verified 2026-08-25: no upcoming game carries `surface: null`. Either the owner set Strašnice's or the fixture has since been played; the form requires a surface now, so it cannot recur |
| 121 | *Found while doing R16-20.* The detail card ignored the game's own pitch name | **`FIXED round-16`**. It read `venueRow.pitch_name` while list cards resolved `effectivePitchName`, so a game carrying its own name showed one name on the list and another on its detail. `effectivePitchName`'s own docstring said the two "must agree"; the detail was calling neither |
| 122 | *Found while doing R16-20.* A pure constant lived in a module that opens a database client | **`FIXED round-16`**. `PASS_REFERENCE_PRICE_CZK` was exported from `lib/pass/queries.ts`, so a CLIENT component importing it dragged `next/headers` across the boundary and broke the page at runtime. `tsc`, `eslint` and `next build` were all clean — the e2e run caught it in a browser console |
| 123 | **(R17-1) The delete controls could not be found** | `SHIPPED round-17`. The capability gate was never the problem — all three round-16 migrations are applied and `app_capabilities()` answers 200 with every flag true. Both halves were mine: round 16 nested game-delete inside `canCancel`, so played, settled and cancelled games showed none (measured: 3 of 6 statuses), and the venue row stripped its disclosure marker in round 13 and put nothing back, so nobody could tell it opened |
| 124 | **(R17-2) Game boxes blended into the background** | `SHIPPED round-17`. `surface` on `ink` is five points of luminance — findable with a colour picker, not with a phone in daylight. `.game-box` takes `.lifted`'s stroke (`hairline-strong`, .14) and keeps the card's own fill, because the scrim's contrast floor was measured against it. **Reverses ruling C for game boxes only**: C was written when the card was flat, and a shape with a photograph under a fade-to-page scrim needs a boundary more, not less. Chips keep C |
| 125 | **(R17-3) Profile section order** | `SHIPPED round-17`. Details above, badges at the bottom — below the account actions too, since those belong with the details they act on. The page runs wallet → who you are → what you can do about it → what you have earned |
| 126 | **(R17-4) The rotations, and the FAQ answering the wrong question** | `SHIPPED round-17`. The two rotation lines fold into the two answers each half belongs to. **And the FAQ has been shipping a mismatched answer since round 13:** "Do I need to be good?" was answered with the cancellation window, because `FaqPanel` substituted by INDEX and round 13 cut the list from six items to four. Round 16's contradiction check scanned that panel, found the hour count in the wrong answer, and reported agreement — see §8 |
| 127 | **(R17-5) The account actions move under Badges** | `SHIPPED round-17`. Final order: wallet → details → badges → sign out → change password → delete. Sign out LEADS that block rather than closing it — it is the one affirmative control there and is not a text link, so leaving it last would have put a bordered button below the destructive link the item says comes last. Deletion keeps its `mailto:` flow, which is the whole flow: it is implemented as anonymization and there is deliberately no self-serve path. **The nav pill was the risk** — `SecurityLinks` records that "Change my email" left this stack because the pill covered it — so the spec probes `elementFromPoint` with the page scrolled to the bottom |
| 128 | **(R18-1) Flag pair on the Telegram tile** | `SHIPPED round-18`. Drawn as SVG, not emoji: `🇺🇦` is two regional-indicator codepoints the FONT must ligature, and Windows ships no such glyphs — the owner's format would have rendered as the letters "UA / RU" for a large share of desktop visitors. The spec counts `<svg>` elements, because a text assertion passes on exactly the output the item exists to avoid |
| 129 | **(R18-2) Game language, and the pill on the card** | `SHIPPED round-18`, dormant on row 136. `games.language` is two values, each a PAIR — deliberately not `lib/i18n`'s `Locale`, which is what you READ and comes from a cookie. Surface left the list card for the detail: two secondary pills beside the format badge is one more than a 390px row carries, and the card kept the one that decides whether somebody taps |
| 130 | **(R18-3) The detail's Where row becomes Language** | `SHIPPED round-18`. The swap cost nothing — `GameHero` is already passed `venueDisplayName(venue, pitchName)`, so that row was the `<h1>` again eighty pixels lower. The filled pill is sized from `.badge-pill`'s own line box rather than a hardcoded 34px |
| 131 | **(R18-4) Remove cash payment** | **`SHIPPED round-23`** (item 7), and the lineage matters more than the outcome. Round 18 wrote the item with its OWN condition — a verified end-to-end online payment on production — checked it, found none, and **refused to ship**. Round 23 item 6 recorded the gate as OPEN on the pass-rail evidence; item 7 executed the removal on the owner's explicit authorization. **The gate's own terms were never met and are not being pretended to be:** zero bookings on production have ever carried a `stripe_session_id`, then or now. What is proven is the SHARED RAIL — the same Stripe Payment Link, the same webhook, the same `confirm_online_purchase` — on the pass half: `credit_topups` `af7f2877-e7c5-45ab-84a6-1155927ff2ed` — pass_games 5, amount 700 CZK, VS `2700000011`, `stripe_session_id` **`cs_live_a1ca8Fe9eqfsjhAQRS4e51OVTQqtb8QruvoDmqwPdVq8CwyiEzWUkx0qxx`**, created 2026-08-29T16:06:18Z, **confirmed 16:06:42Z with `confirmed_by` NULL** — twenty-four seconds, and NULL means no human touched it. The matching `credit_ledger` row is +750 CZK, reason `topup`, at the same instant, expiring 2026-09-29. **`cs_live_`, not `cs_test_`.** The owner accepted that as sufficient. The residual risk is that the booking half has a defect the pass half does not exercise, and it is his to take, written down here rather than left to be inferred. **MERGE_READINESS payment gate: CLOSED.** |
| 132 | **(R18-5) Admin games numbering** | `SHIPPED round-18`. A rendered row index, never stored: persisting one would mean deciding what happens on delete — renumber or leave a hole — and both are wrong for a number whose only job is to be countable on a screen. The spec asserts a contiguous 1..n, which only a rendered index can guarantee |
| 133 | **(R18-6) "Notes from organizer"** | `SHIPPED round-18` — **a rename, and the found reality is the finding.** The note was ALREADY its own card. What it was not was legible: its label read "Game information", the same words as the fact card's heading two hundred pixels above, set as a 10px eyebrow while every neighbour carries a `body-lg` heading |
| 134 | **(R18-7) The detail's photo crop** | `SHIPPED round-18`. Four variants rendered and compared before picking `object-[50%_30%]` at `pt-36`. Either lever alone falls short — shifting the crop inside a 53px band shows a different sliver, and a taller band still centred keeps discarding the horizon. Costs 32px of fold, spent knowingly |
| 135 | **(R18-8) Telegram contact for UA/RU games** | `SHIPPED round-18`, dormant on row 136. `/api/tg/<gameId>` mirrors the WhatsApp redirect so the number never reaches page source. **`t.me/+<number>` resolves only if that number is on Telegram and findable by phone** — unverifiable from here, and the failure is silent and off-site. Proposal in §9 |
| 136 | **Apply `20260826100000_game_language.sql`** | **`SHIPPED`, and the OWNER applied it** — found on the 2026-08-27 re-verification rather than reported, which is the whole reason this ledger re-probes instead of echoing. Verified three ways against the live catalog: `games.language` exists, `public.app_capabilities()` **evaluated on production returns `gameLanguage: true`** (the migration ships its own replacement of that function, so the flag cannot be true without it), and `games_format_format` now reads `^[0-9]{1,2}v[0-9]{1,2}(v[0-9]{1,2}){0,2}$` — production had been one migration behind on that since 2026-08-02 (row 137). The language dropdown is live and no deploy was needed to turn it on. ~~`BUILT-DORMANT-ON-the owner running it`. Verified absent 2026-08-26.~~ |
| 137 | **(R18-9) Non-standard formats and durations did not show** | `SHIPPED round-18`, half of it dormant on row 136. **TWO BUGS.** Production's `games_format_format` is still `^NvN$` because `20260802180000_format_three_way` was never applied there — so `6v6v6` was never SAVED, which is why it never showed. And `7v7v7v7` was refused by BOTH regexes, which capped at three groups. Separately, `duration_minutes` was in `GameCard`'s type, threaded from the query and drawn in the file's own ASCII sketch — and no element ever rendered it |
| 138 | **(R19-1) The flags form the pill** | `SHIPPED round-19`. **The bug measured first:** the card's flags rendered 16x8 and the detail's 26x30.19 — two sizes, the second a 2:1 drawing forced into a nearly-square half. Both causes were the same mistake, two constructions for one thing; there is one now, with no variant. `preserveAspectRatio="slice"` rather than stretch, `flex-1` halves rather than fixed widths, and the divider is `ink` because a white hairline vanishes on the white half of the Czech and Russian flags |
| 139 | **(R19-2) Telegram by username** | `SHIPPED round-19`, and **live since 2026-08-27** — row 141 applied. Ratifies the round-18 proposal, **corrected to username**. The phone form is REMOVED, not demoted — keeping it as a fallback would mean the product still sometimes sends players to Telegram's "user not found" page, which is the whole defect. A UA/RU game with no handle shows WhatsApp: contact is always possible, and no button goes nowhere |
| 140 | **(R19-3) Admin numbering counts from the oldest** | `SHIPPED round-19`. The list stays newest-first; only the numbering runs the other way. The reason is stability — numbering from the top changes every game's number the moment a new one is created, which makes "the third one" a different game each week |
| 141 | **Apply `20260826200000_organizer_telegram_handle.sql`** | **`SHIPPED`, and the OWNER applied it TODAY** — it was genuinely absent at 08:00 on 2026-08-27 and present at 17:15, probed both times. Verified four ways against the live catalog: `game_organizer_contacts.organizer_telegram` exists, `organizer_telegram_format` is on the table, `normalize_telegram_handle` is in `pg_proc`, `set_game_organizer` is at **four** arguments (the three-argument overload is gone, which is what the migration had to do), and `app_capabilities()` **evaluated on production returns `organizerTelegram: true`**. `appCapabilities()` is a per-request `cache`, not a process-level one, so the feature is live on the round-21 deployment with no further deploy. **AND ONE OF MY OWN PROBES WAS POINTED AT THE WRONG TABLE:** the morning check looked for `games.organizer_telegram`, which is not where this column has ever lived — it is on `game_organizer_contacts`. It agreed with the right answer by luck that morning. Same failure shape as F14 (row 151), on the same day. ~~`BUILT-DORMANT-ON-the owner running it`.~~ |
| 142 | **(R19-4) Duration off the game boxes** | `SHIPPED round-19`. Round 18 was right about the bug — the prop was threaded, typed and drawn in the card's own ASCII sketch with nothing rendering it — and wrong about the fix: "so render it" skipped whether the card should carry it. It is the third number on a row that already has a kick-off time and a spots figure. Renders on the detail only; the spec asserts absence on the box |
| 143 | **(R20) The overnight UI/UX audit itself** | `SHIPPED round-20`, and it lives on `audit/uiux-2026-08` rather than here — `docs/audit-2026-08/`: the report, 76 captures, the raw measurements (`measures.json`, `pass2.json`, `pass3.json`) and before/after strips. Eighteen findings, all measured from the rendered page rather than read off a stylesheet. **Main was untouched by that round and verified three ways** — hash, reflog, and merge-base equalling main's tip. Round 21 cherry-picked the ten prepared fixes; the audit documents were deliberately left on the branch |
| 144 | **(F1) An empty day chip filters instead of showing the whole board** | `SHIPPED round-21`. **Two recorded intentions disagreed and only one had shipped:** `DayPicker` promised an empty day shows the empty state, `resolveSelectedDay` accepted only days with games. The chip said *Today*, the URL said `?day=…`, twenty-three games rendered and **All** lit up. Fixed by testing membership in `tabs` instead of the count — a tap names a day the strip is drawing, a stale link names one that has fallen out of the window, and the count conflated them. Neither intention was traded away. R34 |
| 145 | **(F3) The Russian duration label stopped overprinting its value** | `SHIPPED round-21`. `ДЛИТЕЛЬНОСТЬ` needs 117px and the fact grid gave it a fixed 84px column with `overflow: visible`, so it drew over `60 минут`. `grid-cols-[minmax(84px,auto)_1fr]` — the column holds its size for every other label and yields for this one. A Russian-only defect, which is why nine rounds of English screenshots never showed it |
| 146 | **(F10) A missing game shows the product's own not-found screen** | `SHIPPED round-21`, **half of it, and the other half is ACCEPTED rather than open.** The screen is fixed: `notFound()` renders `app/not-found.tsx` in three languages instead of a fourth piece of bespoke copy. The **status stays 200** because `loading.tsx` streams the shell and commits it before anything can throw — measured through the body and through `generateMetadata`. Accepted with the premise stated: the skeleton beats a crawler's opinion while game pages are not an SEO surface. R35 |
| 147 | **(F4) Route and global error boundaries** | `SHIPPED round-21`. Thirty routes carried **zero** `error.tsx` — a render error blanked the app, against this repo's own written rule. `app/error.tsx` and `app/global-error.tsx`, each with a description, a retry and a way out |
| 148 | **(F5) Keyboard focus is visible** | `SHIPPED round-21`. Two `focus-visible` declarations existed product-wide; everything else fell back to a UA ring that does not read on near-black. One `:where(...)` rule — zero specificity, so any component that wants its own treatment still wins without `!important` |
| 149 | **(F17) The footer links reach the 44px floor** | `SHIPPED round-21`. 18.2px on all 33 pages — the most-repeated instance of the product breaking its own tap-target rule |
| 150 | **(F15) The header controls reach the 44px floor** | `SHIPPED round-21`. Language switcher, notification bell and the header's own button, all just under 44 and all on every page |
| 151 | **(F14 + F6) The admin form controls reach the floor — and one finding was WRONG** | `SHIPPED round-21`. **The withdrawal is the useful half:** F14 first claimed the amenity checkboxes were 13px. They are — the `<input>` is. The `<label>` wrapping an input **is** the hit area, it already carried `min-h-11`, and it measures 44. The probe was pointed at the wrong element and the number was real, which is how a false positive survives. Re-measuring labels found the true defect three screens away — **skill checkboxes at 19.5px** — fixed here along with F6's admin field heights |
| 152 | **(F12) One spelling of "pill"** | `SHIPPED round-21`. 23 files carried `rounded-full` where the token is `rounded-pill`; identical output, so no pixel moved. Two spellings of one concept is how a token quietly stops being the answer |
| 153 | **(F13) The admin nav says it continues** | `SHIPPED round-21`. The chip row scrolls at 390px with nothing to say so — a mask-image fade at the right edge below `md`, removed above it where the row fits |
| 154 | *Findings 2, 7, 8, 9 of the audit — the ones NOT prepared.* Dates render English everywhere; the primary action is drawn eleven ways; half of all type bypasses the scale; sixteen heading treatments | `OPEN`, and deliberately so. Each is large, taste-dependent, or both, and shipping them as "small isolated wins" would have misdescribed them. **F2 is the biggest single thing in the audit and wants a decision rather than a patch:** `DISPLAY_LOCALE = "en-GB"` is hardcoded at 29 call sites while `lib/games/days.ts` localises properly four pixels away, so a Czech player reads "Tue 25 Aug" beside "Út 25 srp". Doing it fully implies a `players.locale` column — which also unlocks localised emails, and is Phase 2 schema |
| 155 | *Findings 11, 16, 18 of the audit — small, but not isolated.* Thirteen card recipes; two `loading.tsx` for thirty routes; borders drawn in surface colours rather than hairline tokens | `OPEN`. Each is a consolidation that touches many files at once, so it collides with anything else in flight — cheap on a quiet round, expensive on a busy one |
| 156 | **(R22-1) Ukrainian is wired into the locale system** | `SHIPPED round-22`. `uk` added to `LOCALES` and **nothing else touched by hand** — `tsc` then named the four places that had to follow, all of them `Record<Locale, …>`: the overlay map, the switcher's flags, `DATE_LOCALE`. That is what makes a fourth language a small change rather than a search. Czech default and the ladder above it untouched; a `uk-UA` browser gets Ukrainian from `Accept-Language`, asserted. Admin stays English, and the spec that forbids translating outside the player-facing sections now runs for uk too. **A dead second switcher was deleted** — `components/LanguageSwitcher.tsx` had no importers and carried its own three-flag map; adding a fourth flag to a file nothing renders is how a language ends up half-added. R36 |
| 157 | **(R22-2) The full Ukrainian overlay** | `SHIPPED round-22`, **and every string in it is a DRAFT** (row 160). 519 keys, exactly the set cs/ru cover. Translated from the ENGLISH source rather than from the Russian: going through Russian imports its word choices along with its grammar, and several are wrong in Ukrainian (`гаманець` not `кошелёк`, `матч`/`гра` splitting differently). The completeness spec runs for uk exactly as for cs/ru, so a missing key fails the suite; `INTENTIONALLY_UNTRANSLATED` gained one entry (`booking.partySummary`, row 158) and no exemption was widened to let Ukrainian through |
| 158 | **(R22-3) Counts agree with their nouns — in all four languages** | `SHIPPED round-22`, **and it is a CZECH AND RUSSIAN BUG FIX, not only a Ukrainian addition.** Four surfaces picked their noun with `n === 1`, an English two-form rule applied to three languages that each have a 2-4 form: spots left rendered `3 volných míst` / `3 місць вільно`, the roster `2 zápasů`, subs `1 náhradníci na tým`, party seats `2 míst`. Three of those numbers sit inside the range the surface spends most of its life in — a filling game's last day is exactly when it says "3 spots left". All four now resolve through `lib/i18n/plural.ts`, which asks `Intl.PluralRules`. **That file exists because the collapse had been written twice before it was written once** (`credits.ts` and `statLabel.ts` each had a copy); a fourth language was the moment a third would have appeared. Tested at 1, 3 and 5 in every language, plus the teens and 21/22 where CLDR disagrees with a modulus. R37 |
| 159 | **(R22-4) The Ukrainian overflow pass at 390px** | `SHIPPED round-22`. Five dense surfaces plus the booking flow, asserted rather than eyeballed — **because F3 is the reason the item exists**: a label drawing over its own value is invisible to a clipping check, since overflowing text is not clipped but painted on top of its neighbour. Two checks: every leaf text node's `scrollWidth` against its box, and every `<dl>` row's DRAWN label width against its value's left edge, which is F3's exact geometry. **Nothing in Ukrainian failed either.** The first run did catch the seed's hostile XSS-probe venue name overflowing a card by 83px in every language — that element carries `truncate`, so the ellipsis is the design, and the check now skips deliberate ellipsis. Strips: `docs/v22/strips/uk/` |
| 160 | **The native-review batch is now three languages deep, and it is OVERDUE** | `OPEN`, and it is the owner's to schedule — no amount of work in this repo can close it. **519 Ukrainian strings, none of them read by a Ukrainian speaker**, plus every Czech and Russian string ever flagged. The CS/RU count cannot be given exactly: a `DRAFT` marker names a start and not an end, so nobody can tell how many keys each of the 53 markers covers. **The practical instruction is therefore to read all three overlays rather than to hunt flags** — `lib/i18n/cs.ts`, `lib/i18n/ru.ts`, `lib/i18n/uk.ts`, about 1,550 strings between them. What is NOT in the batch and must not drift into it: the terms of service, which has no Russian and no Ukrainian on purpose — an unreviewed contract is legally operative in a way an unreviewed FAQ is not |
| 161 | *Found while wiring item 5c.* **Every Cyrillic display line in the product was rendering in a system font** | **`SHIPPED round-22`** — fixed the round it was found. Anton ships no Cyrillic, so a Russian or Ukrainian display line falls through the `display` stack, and that stack was `[Anton, sans-serif]`: the generic. `app/page.tsx` has claimed since round 13 that the Cyrillic hero "sets in the body face" and it did not — it set in whatever the phone had, with that font's metrics. It looks like a font rather than like a bug, which is why nine rounds of Russian screenshots went past it. `display` is now `[Anton, Onest, sans-serif]`; Onest carries `cyrillic` and `cyrillic-ext`, which is why it was chosen as the body face. Latin is untouched — Anton is still first and the fallback is per CHARACTER — and the spec asserts the ORDER, because a body face ahead of Anton would move every Latin display line in the product. R36c |
| 162 | *Found while converting the count strings.* `pass.equivalence` is dead copy | `OPEN`, and deliberately left. Nothing renders it. It was translated in cs and ru, and is now translated in uk as well, so the ledger records it rather than the round quietly deleting a string the owner may have a plan for. A dead key is a copy decision, not a plural bug |
| 163 | **(R23-1) "Players met" replaces the third stat on both profiles** | `SHIPPED round-23`, **dormant on row 169** until the migration lands. One SQL definition (`players_met`), called from two surfaces, so a number under your own face and the same face's public profile cannot disagree. Guests never count — a guest is a SEAT, not an identity (R24) — an explicit `no_show` on either side removes that game, and a NULL attendance does not, because it only means nobody has settled yet. **The item's premise was wrong in one place and the correction is the useful half:** no wallet balance has ever been on the public profile. `public_player_profile` has returned nickname, photo, cover and three stats since round 14, and the third was `venues` — the composite return type is exactly why there was never a seventh column to leak. What was replaced is "pitches played", on both pages; `venues` is still computed because the Explorer badge needs it. R38 |
| 164 | **(R23-2) The public profile's badges** | **`NOT A DEFECT — DIAGNOSED, and a real one found underneath.`** The reported symptom does not reproduce: measured on the live page, the grid sits at y=437, the cover ends at y=341, the tiles are opaque `rgb(15,15,15)`, `elementFromPoint` lands inside a badge and all five are in the DOM. **It is not the cover-stacking family**, which is where the item pointed first and correctly. What IS true is that every badge on that profile is LOCKED, and locked was `text-faint` on `surface` — **4.72:1, two hundredths over the AA floor**. Five near-floor grey blocks in a column read as a section that failed to load. The name moves to `muted` (6.81:1) and the glyph stays faint, so locked still looks locked. Asserted with decoded pixels, because `toBeVisible()` passed throughout. R39 |
| 165 | *Root cause found while diagnosing row 164.* **Nothing marks a game PLAYED, so every derived stat is zero for everybody** | **`SHIPPED round-24`, pending Oliver's apply** (item 1, rows 174 and 175). A game now advances to `played` at kickoff + duration + a two-hour buffer, swept hourly. **28 games on production are still `published` past their kickoff, the oldest 2026-08-02** — and they need no separate backfill script: the first sweep after the migration lands catches every one of them. The SQL is handed over anyway (§6) for an owner who would rather do it deliberately than discover it. **Nothing settles on its own and nothing pays anybody:** the sweep counts the credit ledger and the live bookings before and after its loop and aborts if either moved |
| 166 | **(R23-3) The wallet section, compacted** | `SHIPPED round-23`. It was two headed sections saying one thing — a `CREDIT BALANCE` eyebrow over a 40px figure, then a second heading reading "Your credit" over one chip. The heading is gone, the expiry moved INSIDE the balance card where it is a footnote on the number above it, and the box and its surrounding gaps came down with it. **Measured: 300px → 186px**, a 38% shorter section. Strips: `docs/v23/strips/credit-before.png`, `credit-after.png` |
| 167 | **(R23-4) The games move above how-it-works, and the hero's pill is REMOVED** | `SHIPPED round-23`. Open the site, see the games lined up; scroll to learn how it works. **The page had two buttons to the same place** and the first one asked somebody to leave a page they had not started reading — so "Find a game" is gone entirely and "All games" inherits its exact clothing (`rounded-pill`, `text-cta`, `font-extrabold`, `px-[26px] py-[15px]`). Asserted by position AND by there being exactly one link to `/games` in the page's own content. `landing.heroCta` was removed from all four language tables rather than left as dead copy. Nothing else on the page reordered |
| 168 | **(R23-5) Dashboard is the first admin chip** | `SHIPPED round-23`, **a recorded reversal of the p14 frame-order ruling**. The round-10 reading of the frame was correct and is out of date: `p14` predates the dashboard being the daily landing — round 13 put the unsettleable payments on it, round 14 pointed the account page's admin link at it. R31's rule applies exactly: a ruling records its premise, and the premise moved. **Fifth also put it under the audit's F13 scroll fade** at 390px, so the chip for the page opened every morning was the one half out of view. Volt-current behaviour untouched: `/admin` still matches exactly, so Dashboard lights only on the dashboard. R40 |
| 169 | **Apply `20260830100000_players_met.sql`** | **`SHIPPED`, and the OWNER applied it.** **Probed on production 2026-09-05, not taken on report:** `app_capabilities()` returns `playersMet`, `playedSweep` and `playerNotifications` all true; `players_met`, `advance_played_games` and `notify_player` are all in `pg_proc`; `notifications` carries `recipient_id`, `booking_id` and `kind`. **And the number is alive:** `public_player_profile('oliver')` returns 12 games played and 3 players met, where every figure read zero a week ago. ~~`BUILT-DORMANT-ON-the owner running it`.~~ |
| 170 | **(R23-7) Cash removed from the booking flow** | `SHIPPED round-23` — see row 131 for the gate's lineage. Gone from the booking form AND the waitlist conversion, refused server-side in both, because a removed radio is not a removed option. **The FAQ named cash in all four languages** until this round, which the item believed was already fixed. **The RAIL survives and must:** "Redeem credit" travels on it and **seven unpaid cash bookings on production** must stay settleable — asserted end to end, roster row to `confirmed`. What closed is the last way a NEW one could appear: `credit` with a wallet that does not cover would have created an unpaid booking on a product that no longer takes cash |
| 171 | *Consequence of row 170, recorded because it changes what the suite can test.* The E2E environment gained `NEXT_PUBLIC_STRIPE_PAYMENT_URL` | `SHIPPED round-23`. With cash gone, the only booking route that finishes on this origin is credit — `online` redirects to a payment page — so without the variable the suite could produce **no unpaid booking through the UI at all**, which is not the product that ships. Twelve call sites moved: the ones that need a completed booking fund a wallet and pay by credit; the ones that need an UNPAID booking drive the rail directly, which is the shape `booking.spec.ts` has used for QR since round 13 |
| 172 | **(R24-1) Games advance to PLAYED on a schedule** | `SHIPPED round-24`, **dormant on row 174**. Kickoff + duration + a two-hour buffer, hourly — the other four crons are daily, and a daily sweep would leave a Tuesday-evening game `published` until Wednesday morning, which is the same zero the item exists to remove. **THE READING CAME FIRST AND CHANGED THE BUILD:** `confirm_booking` has no game-status gate, which is why auto-advance does not strand unpaid holds and make `settle_game` impossible; `mark_attendance` has none either, so attendance stays editable; `cancel_booking` already refuses past kickoff. Settling stays an explicit admin act. R42 |
| 173 | **(R24-2) A no-show warns the player, in their own language** | `SHIPPED round-24`, **dormant on row 175**. Marking a player absent writes ONE addressed notification; re-marking writes nothing (only transitions speak); reversing **deletes** the warning and leaves a correction, because a retraction that leaves the accusation in the list is not a retraction. Firm but fair and it names no consequence the product cannot deliver — there is no ban, no strike count, no fee, and a warning that bluffs is one a regular learns to ignore. EN/CS/RU/UK, drafts to the batch (row 160). R43 |
| 174 | **Apply `20260901100000_advance_played_games.sql`** | **`SHIPPED`, and the OWNER applied it.** **The sweep has run and the backlog is gone:** 33 games are `played`, 3 `settled`, and **zero games remain kicked-off-but-published** — the 28 stale ones the round-24 report counted were all advanced, without the hand-run backfill, exactly as predicted. The daily 05:30 schedule is doing the work. ~~`BUILT-DORMANT`.~~ |
| 175 | **Apply `20260901110000_player_notifications.sql`** | **`SHIPPED`, and the OWNER applied it.** The addressed bell is live and **has already fired once in anger**: one `no_show_warning` notification exists on production, against three `attendance_marked` events. Broadcast rows are untouched, which is what the nullable recipient guaranteed. ~~`BUILT-DORMANT`.~~ |
| 176 | *Consequence of row 172.* **`cancel_game` no longer accepts a game that has already been played** | **`CLOSED round-25` — the owner's ruling: it stays shut.** Bulk-cancelling a game that has already happened is not a thing the product should offer, and the per-player remedy is sufficient: `admin_remove_booking` credits a confirmed booking and has no game-status gate. Recorded rather than deleted, so a later round meeting the closed door finds the decision instead of re-litigating it |
| 177 | **(R24-3) The upcoming-games heading joins its neighbours** | `SHIPPED round-24`. `community-title`, not `page-title`. The old reasoning compared it to `/games`'s heading — another page, where nothing sits beside it; round 23 moved the games up the home page and it now shares a column with JOIN OUR COMMUNITY and FAQ. Three headings on one page at two sizes read as one of them being a mistake. `/games` is untouched |
| 178 | **(R24-4) The hero-to-games gap halves** | `SHIPPED round-24`. 104px of stacked padding becomes 48. **It was TWO paddings, which is why neither looked wrong alone** — `pb-10` on the hero and `pt-nav` on the games block, each defensible, and nothing named their sum. The hero also lost its own CTA in round 23, so its bottom padding was sized for a button that is no longer there |
| 179 | **(R24-5) An unmistakable published state** | `SHIPPED round-24`. The admin sibling of the booking confirmation: same volt panel, same 2px border, same tick in a volt disc, same display face — a player who pays and an organizer who publishes are both being told the thing they just did worked. **Server-rendered from `?created=1`, not a toast**, which is what the item asked for and what CLAUDE.md's rule requires (a client-state success marker does not survive `revalidatePath`); the spec reloads the page to prove it. English, per the admin-is-English law |
| 180 | **(R24-6) The flag pair becomes two circles** | `SHIPPED round-24`, the **third** flag construction and the lineage is recorded in the component: round 18 shipped two different constructions at once (one distorted), round 19 unified them into a split capsule, round 24 separates them. Two languages are two things, and a divided capsule reads as one object showing two states. **Same vertical dimension** — pinned to the badge it sits beside and asserted against it — and both circles measured against each other, because round 18's bug was two flags meant to match that did not. R44 |
| 181 | **(R24-7) The duplicate Surface row is gone** | `SHIPPED round-24`. The game detail said the surface twice, four pixels apart: `CardBadges` renders it as a badge in the Format row, and a standalone `Surface` row said the same translated word underneath. **Verified before removing, in both shapes the card takes** — with a format (`6v6` + `Turf`) and without (`Grass` alone) — because the only question worth asking before deleting a fact is whether it survives somewhere else. The assertion inverts rather than disappearing: the badge must be present and the row must not |
| 182 | **(R25-1) An unpaid seat is never a named participant** | `SHIPPED round-25`, **dormant on row 186**. Reproduced on production data before anything was written: `booking_holds_seat()` decides whether a seat COUNTS, and `game_roster_public` was using it to decide whose NAME to publish — two different questions, one predicate, and only one answer was right. For thirty minutes an abandoner's nickname and photograph sat on a public page indistinguishable from somebody who had paid. `booking_is_named()` is the question that was missing. The seat still counts, the row says `Awaiting payment`, and nothing on it identifies anybody — not the name, not the photo, and **not the games-played chip**, which rendered `First game` beside the anonymous seat until a strip caught it. R45 |
| 183 | *The half of row 182 nobody had looked for.* **An abandoned checkout never expired, and blocked settling forever** | `SHIPPED round-25`, dormant on row 186. The seat frees itself on the clock because the predicate is time-based; the ROW stayed `reserved` — nothing transitions it, because the expiry sweep works on `expires_at`, which is set by the NUDGE, and a booking abandoned in its first thirty minutes is never nudged. **Production carried one for thirteen days**, on a game since played, and `settle_game` refuses while any reserved booking remains. `expire_pending_online_payments()` rides the existing expiry cron |
| 184 | *Found while reading row 183.* **Games that cannot be settled** | **`CLOSED — MOOTED round-29`**, not completed. The fiat backfill marks every past game `settled` as-is, so there is no longer such a thing as a game that cannot be settled: the blocking condition was `settle_game`'s guard, and `settle_game` is gone. **THE ELEVEN HOLDS REMAIN, AS INERT ROWS ON SETTLED GAMES**, and they remain VISIBLE AS MONEY OWED — the admin's outstanding figure filters on `bookings.status = 'reserved'` and excludes only CANCELLED games, so settling hid not one crown of the 1,780. `docs/ops/round26-unsettleable-games.sql` still works and is now **OPTIONAL**: running it tidies eleven rows and changes no number anybody reads. ~~`OPEN`, **and the cleanup is written and handed over**~~ — `docs/ops/round26-unsettleable-games.sql` (round 26, item 2). **Seven games, eleven `reserved` holds, 1,780 CZK, oldest 2026-08-01** — seven `cash` and four `qr`. Down from eight games: row 183's sweep expired the abandoned checkout that blocked the eighth. **Not one of the eleven has wallet credit applied** — checked on production, every `credit_applied_czk` is 0 — so removing a hold costs those players nothing and issues no credit, which is what makes this a tidy-up rather than a money decision. **It is not one decision, which is why it is not one script:** each row is either "they paid on the pitch and nobody pressed the button" (`confirm_booking`) or "they never paid" (`admin_remove_booking`), and only the owner knows which. **Round 26 stops the set growing** — pay-first creates no unpaid booking at all |
| 185 | **(R25-2) Embedded Stripe Checkout, both flows** | `SHIPPED round-25`, **dormant on row 187** (the two keys). Server-side Checkout Sessions with `ui_mode: 'embedded'`, rendered inside our own page shell — the player never leaves the origin. **The amount is computed server-side from the row that already exists**, which deletes the set-the-quantity-yourself instruction as a CONSTRAINT rather than as copy: quantity is always 1 and the line is the whole party price, so there is no field a buyer can edit downwards. Pass tiers price from `pass_tiers` through `begin_pass_purchase`, so a tier needs no per-tier link at all. **The webhook needed no changes and remains the sole settler** — an embedded session emits the same `checkout.session.completed` with the same `client_reference_id`, and the embedded UI reporting success is never treated as confirmation. R46 |
| 186 | **Apply `20260905100000_pending_seat_is_anonymous.sql`** | **`SHIPPED`, and the OWNER applied it.** Probed 2026-09-06: `app_capabilities()` returns `pendingSeatAnonymous`, the roster projects `is_pending`, and **the sweep did its work** — the two lingering pending bookings, including the thirteen-day one, are now `expired`. **It has since been superseded by row 193**: round 26 removed the state it was anonymising, so the column is always false and the cleanup script drops it. It was right for the eight days it ran. ~~`BUILT-DORMANT-ON-the owner running it`.~~ |
| 187 | **Set `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in Vercel** | **`SHIPPED`, and the OWNER did it** — both found in `vercel env ls production` on 2026-09-06, created twenty hours earlier, so embedded checkout is LIVE rather than gated. The pair is the whole condition: `embeddedCheckoutEnabled()` requires both, because a publishable key without a secret is a form that cannot create a session and a secret without a publishable key is a session nothing can render. **It is not yet proven by a payment, and the distinction matters here** — the variables' presence is what row 65 learned not to accept as proof. `checkout_sessions` is **empty**: not one real payment has crossed the embedded rail. The proof this row wants is one completed booking through the form, which is also row 188's precondition. Branding notes in §6. ~~`BUILT-DORMANT-ON-the owner pasting two keys and setting the branding`.~~ |
| 188 | *Queued by row 185, not done.* **Retire the link-based payment flow** | `OPEN`, and deliberately staged. `NEXT_PUBLIC_STRIPE_PAYMENT_URL` and `NEXT_PUBLIC_STRIPE_PASS_URLS` are **marked for retirement, not deleted**: they are the fallback that keeps the product sellable until embedded is verified live on production with a real payment. The order is the owner's — verify embedded, then remove the variables, then delete `lib/payments/stripeLinks.ts` and the six Payment Links in the Stripe dashboard |
| 189 | **(R25-3) The FAQ is the owner's four, verbatim** | `SHIPPED round-25`. Supplied finished, in his order, and not edited — the only work was checking the code still says what they say, which it does: the waitlist really does email everyone at once and settle the race on `create_booking`'s capacity check; a level badge really is a signal and not a gate; cash really is gone. EN plus CS/RU/UK drafts to the batch (row 160). The substitute rotation leaves with the rewrite and the keeper rotation survives in the owner's own words; `home.spec` narrows to what is still claimed rather than pinning copy he replaced |
| 190 | **(R25-4) The community panel takes the Game Pass banner's treatment** | `SHIPPED round-25`. Its literal classes — `border-hairline-volt` on `bg-volt/[.10]` — asserted against the banner itself so the two cannot drift into two spellings of one accent. The three social logos step 44px → 55px, a 25% increase and the only content change the item allowed. **A recorded reversal of the round-3 panel ruling**, whose premise was that this panel is "not a call to action": every tile in it is a link out, and since round 23 removed the hero's button it is the only invitation on the page |
| 191 | **HOTFIX 2026-09-05 — `ui_mode` renamed, and the type system could not tell us** | `SHIPPED`. API version 2026-08-26 renamed `embedded` to `embedded_page` (and `hosted` to `hosted_page`); `stripeClient()` pins that exact version, so the first real session creation answered `StripeInvalidRequestError` on `param: ui_mode` (`req_TfPOXMxZR56DAE`) and every checkout 500'd. **It compiled because the SDK's union ends in `OtherString`**, which widens it to `string` — deliberate, so a newer API value does not fail an older SDK's build, and the cost is that `tsc` cannot tell a valid value from a typo on the one field where being wrong takes payments offline. **The client half was checked and unchanged**: `@stripe/react-stripe-js@6` still takes `options.clientSecret`. **The missing check is now a test** — `uiMode.test.ts` reads the union out of the installed `.d.ts` and asserts our literal is a member, verified red-green. Nothing in four suites had ever called `sessions.create`, which is how a one-word error shipped green |
| 192 | **(R26-1) PAY FIRST — the booking is created by the payment** | `SHIPPED round-26`, **dormant on row 194**. The owner's ruling: no booking row exists until money has arrived. The Stripe session carries game, player and party size; the webhook creates the booking under the game's advisory lock. **The race is designed in two layers** — ACTIVE EXPIRY as the primary defence (a game that fills kills every other open form at Stripe, from all three rails: webhook, credit redemption, admin house guests) and the CREDIT PATH as the same-instant residual (full amount as credit, notification in the player's own language, admin needs-attention entry). **Seat counts never decrement for shoppers**, not as a rule but as a consequence: there is no row to count. R47 |
| 193 | *The machinery pay-first made dead.* **Pending states, the thirty-minute predicate, the online expiry sweep, `AwaitingPaymentPanel`, the anonymity rendering** | **`SHIPPED round-26` (code) and `SHIPPED round-27` (schema)** — ~~`OPEN` for the schema~~. It ships as a MIGRATION (`20260907110000`) paired with the two roster selects, four column-boundary suites and one dead action, because pasting the ops script would have emptied every lineup on the site — see row 204. ~~`docs/ops/round26-schema-cleanup.sql`, validated rolled back, handed over.~~ It accounts for row 186 being APPLIED: the roster view is recreated at seven columns and `booking_is_named` dropped. **Two things are deliberately KEPT**: `payment_pending_at`, the only record that a legacy booking came through the old rail — dropping a column to tidy is how an audit trail disappears — and `online_payment_window()`, because the pay-first rollback restores a `booking_holds_seat` body that calls it, and a rollback that fails on a missing function is not a rollback |
| 194 | **Apply `20260906100000_pay_first_booking.sql`** | **`SHIPPED`, and it is APPLIED** — probed on 2026-09-06 rather than carried forward: `checkout_sessions` exists, and `open_checkout`, `settle_checkout_session`, `checkouts_to_expire`, `mark_checkout_expired`, `checkout_outcome` and `recent_checkout` are all in `pg_proc`, with `app_capabilities()` returning `payFirstCheckout: true`. **The event-catalog trap was handled in the same migration** — `notifications_kind_catalog` reads `no_show_warning, no_show_cleared, checkout_game_full` on production, which is the CHECK CLAUDE.md records as already missed once. **The half-applied gap below never opened for long and is now closed**: schema and code agree, and `3470e7b` is the live deployment (Ready, aliased, verified by its `githubCommitSha`). ~~`BUILT-DORMANT-ON-the owner running it`.~~ Validated rolled back; the verification block builds a capacity-ONE game with two open checkouts, proves neither takes a seat, settles the first to `booked`, checks active expiry names the second, settles the second anyway and proves it was `credited` in full, told, queued for attention, and that **the game was not oversold** — then checks a redelivered webhook is a no-op. **Until it is applied the online option keeps the old shape**: `settle_checkout_session` does not exist, so the webhook falls through to `confirm_online_purchase` exactly as before, and `/payment/checkout` cannot register a session. **The deploy is safe either way; the two shapes must not be half-applied for long**, because the new checkout page creates no booking and the old webhook path expects one |
| 195 | *Recorded with row 192.* **`cancel_game` and the admin rails are untouched** | `SHIPPED round-26`. Cash-legacy bookings, admin-created bookings and every existing `reserved` row keep working exactly as they did — `booking_holds_seat` still counts them, the roster still names them, and the admin still settles them. Pay-first changes how an ONLINE booking comes into existence and nothing else |
| 196 | **(R27-1) OUTAGE — a Server Component may not set a cookie** | `SHIPPED round-27`. Single-game embedded checkout 500'd on production while the PASS rail worked perfectly, and that contrast was the whole diagnosis: same keys, same embedded machinery, different session-creation path. `rememberPendingPurchase` sets a cookie and Next refuses that in a render — **`pendingPurchaseCookie.ts` says so in its own doc comment** — but under pay-first the id worth stashing is the STRIPE SESSION id, which only exists after the session is created, which happens during a render. The pass stash is written by a Server Action and was never affected. **The evidence was in the register, not a log**: two `cs_live_` sessions, both `open`, created and registered before the throw — exactly how far the path gets. **The stash was not replaced, it was deleted**: Stripe substitutes the session id into `return_url`, so the return page is handed the exact identifier by Stripe itself, which also survives paying on a phone and returning on a laptop. The return page now takes the first candidate **the DATABASE recognises**, not the first that exists — both rails come back carrying a `session_id` and a pass session is not in the register, so reading its absence as "nothing to show" would have stranded every pass buyer on a spinner |
| 197 | *Found while fixing row 196.* **The "set the quantity on Stripe's page" instruction was still rendering** | `SHIPPED round-27`. True of a Payment Link, whose quantity the buyer really must change; FALSE of the embedded form, where the whole party price is one line of `quantity: 1` computed server-side. It now renders only on the link rail. An instruction to look for a control that is not there is worse than no instruction. Also fixed alongside: a session that could not be REGISTERED no longer renders a form, because that is a checkout whose payment lands as `unknown` |
| 198 | **(R27-1b) The owner's credit rule, as a spec rather than a trust** | `SHIPPED round-27`. **Choosing Online payment moves ZERO credit** — the wallet moves only on an explicit Redeem-credit. Asserted where money actually moves, `settle_checkout_session`, for a lone booking and for a party of two, with the wallet at 1,000 CZK both times and `credit_applied_czk` 0 on the resulting row. The party arithmetic left `/payment/checkout` for `lib/payments/partyAmount.ts` **so it could be asserted at all** — reaching it through the product needs a Stripe secret key no test environment has. price × (1 + guests), capped at the policy ceiling, garbage-in books the player alone; the `+2` case is named |
| 199 | **(R27-2) Add guests after booking** | `SHIPPED round-27`, **dormant on row 203**. A player with a paid booking picks +1/+2/+3 between the lineup and the share box, and pays the GUEST-ONLY amount by wallet (atomic, one transaction) or by embedded checkout (a second `kind` on the register carrying the target booking). **The architecture is round 26's, re-used rather than re-invented**: no seat is held by an intention, the webhook adds the guests under the game's advisory lock, and a game that fills first credits in full with a notification and an admin needs-attention entry. **Active expiry needed no change at all** — an add-guest session carries `game_id` like any other, so `checkouts_to_expire` already kills it. `<Name>'s Guest N` numbering continues for free, because guests are `guest_count` expanded by `generate_series` and the count simply got bigger. One arithmetic branch in the settler is the only difference between the kinds: a booking wants the player plus guests, an add-guest payment wants only the guests — getting that wrong bills somebody twice for their own seat. R48 |
| 200 | **(R27-3) The profile banner is full-bleed to the page's own top** | `SHIPPED round-27`. `top-0` was the top of a wrapper that begins BELOW the shell's `pt-24`, so the photograph started 96px down with flat ground above it and the fixed header floating over that — a wide card near the top rather than the page's surface. `-top-24` with the height absorbing the offset means **the bottom edge does not move**: the ramp still lands where the tab row begins and nothing below shifts. **No scrim was added for the header** and that is a decision: it is `bg-ink/[.86]` with `backdrop-blur-md`, heavier than anything the cover draws. The stats scrim DID move, 68% → 77%, because it is a percentage of a box that grew — leaving it would have started the darkening 30px early, a visible band across the identity row |
| 201 | **(R27-4) Accomplishments above the details — the SECOND flip of these two sections** | `SHIPPED round-27`, and **recorded with lineage because an unrecorded reversal gets reversed again**. Round 10 had accomplishments on top; **round 17 item 3 put details first** on the owner's "details above, badges at the bottom" and the argument that somebody fixing a phone number should not scroll past five tiles, four of them unearned; round 27 puts them back, on the owner's instruction. **Round 17's argument is not refuted** — the owner has weighed it. The half of round 17 that still holds is untouched: password, email and delete stay at the VERY bottom, directly under the details they act on. `profile.spec.ts` inverts rather than being deleted — an order test that survives a reordering was never testing anything |
| 202 | **(R27-5) "Badges" becomes "Accomplishments"** | `SHIPPED round-27`, the owner's word verbatim. **The KEY was renamed with the value** — `badgesTitle` rendering "Accomplishments" is the drift that makes a later session grep for the wrong word and conclude the rename never landed. The badges themselves keep their names: a badge is still the object, "Accomplishments" is what the section of them is called. One component carries the heading, so the public profile got it for free. CS/RU/UK drafted to row 160's batch. Admin unaffected, English-only law |
| 203 | **Apply round 27's two migrations** | `BUILT-DORMANT-ON-the owner running them`, **in this order, and the ORDER MATTERS DIFFERENTLY THAN LAST ROUND**. `20260907100000_add_guests_after_booking` is capability-gated — false is the OLD SHAPE, not a broken one, so it can be late with no cost. `20260907110000_pending_machinery_cleanup` is the opposite of round 26's case: **DEPLOY FIRST, THEN MIGRATE**, because it drops `is_pending` from the roster view and only the newly deployed code has stopped asking for it. Both validated rolled back against the local stack; the add-guests verification block is a real drill on a capacity-THREE pitch that exercises both endings |
| 204 | *The reason row 193 could not just be pasted.* **Round 26's cleanup script would have emptied every lineup on the site** | `SHIPPED round-27` (item 6b) — **and this is the round's most serious finding.** `lib/games/queries.ts` still SELECTed `is_pending` in both roster reads: round 26 stopped USING the column and never stopped ASKING for it. Dropping it under the deployed code makes PostgREST error on both selects, and both call sites read `if (error || !data) return []` — so **every lineup would have rendered EMPTY, silently, with no error page and nothing in a log**. That is the exact failure class CLAUDE.md names about grants: a read that returns empty looks like missing data, not like a missing column. The drop, the two selects, four column-boundary suites and one dead server action now move in ONE commit, as a migration in the history rather than an ops script outside it. ~~`docs/ops/round26-schema-cleanup.sql`~~ deleted |
| 205 | *Found while writing row 204.* **`app/game/[id]/pay/actions.ts` was unreachable dead code** | `SHIPPED round-27`, deleted. The retry-payment action lost its only caller when round 26 removed `AwaitingPaymentPanel`, and round 26's cleanup would have dropped `retry_online_payment` beneath it — turning dead code into a 404 on a live path if anything ever linked to it again. Its SQL assertions are not replaced and that is the honest outcome: there is no successor behaviour to point them at, because a booking that has not been paid for no longer exists. What remains is one assertion that the function is gone |
| 206 | **(R28-1) Cookie consent, and an honest account of what it gates** | `SHIPPED round-28`. Standard sheet, portalled per the modal law, bottom-aligned on every width, "Accept all" / "Only necessary", persisted in a cookie for six months, revisitable from the footer. **BOTH ANSWERS CURRENTLY PRODUCE THE SAME COOKIES, and the code says so where a later session reads it**: this product sets auth, locale and a payment-return stash, all strictly necessary, and there is no analytics to withhold. It ships anyway because **the gate has to exist before the first script that needs gating** — the failure it prevents is an analytics snippet going into the layout in some later round, because that is where scripts go, and reaching production having asked nobody. `consentAllows("analytics", choice)` is the door it must come through, and an UNANSWERED banner is not consent. Both buttons carry equal weight, which is a compliance property rather than a taste one. EN/CS/RU/UK; `consent` joined the i18n suite's player-facing list the same commit it was translated |
| 207 | **(R28-2) The checkout is pinned to card, and Link and Klarna are excluded by name** | `SHIPPED round-28`, **dormant on row 216** for the account-level half. `payment_method_types: ['card']` on every session — omitting it hands the decision to the account's automatic-payment-methods checkbox, which can turn either on for every session with no deploy. **Apple Pay and Google Pay still appear per device**, because they are wallet presentations OF the card method rather than method types; naming them is not how they are enabled and Stripe rejects them, which the spec asserts deliberately so nobody "fixes" it. Pinning is necessary and NOT sufficient — the dashboard toggles govern everything else, and Link has its own |
| 208 | **(R28-9) Dates render in the active UI language** | `SHIPPED round-28` for the surfaces the owner named; **the sweep is row 209**. `DISPLAY_LOCALE = "en-GB"` was a module constant read by every formatter in `lib/format.ts`, while `DATE_LOCALE` existed SEPARATELY in `lib/games/days.ts` — which is exactly why the day strip localised correctly and the line under it did not. One map now, in `lib/format.ts`, re-exported by `days.ts`, and every formatter takes an optional locale. **Money does not follow the UI language** and that is CLAUDE.md's rule: the player is about to open a Czech banking app and the figure has to match it. The spec asserts weekday and month rather than whole strings, because Intl output moves with ICU and a pinned string fails on a Node upgrade instead of on a regression |
| 209 | *The rest of finding F2, listed rather than half-fixed in silence.* **The remaining hardcoded-locale date sites** | `OPEN`, and it is now a mechanical sweep rather than a design question — the utility exists and takes a locale. What is NOT yet localised: the admin panel (English-only by law, so it is correct as it stands), `BookingList` / my-games, the booking and confirmation pages, `admin/stats`, the WhatsApp route, and `PlayerAttendanceRow`. A required parameter would have forced all of them into one commit, which is how a display change becomes a diff nobody can review. Row 154's F2 shrinks to this |
| 210 | **(R28-3) The roster rows already opened the public profile** | **`ALREADY SHIPPED`, verified rather than rebuilt.** `PlayersList` wraps avatar AND name in one `<Link>` to `/player/<nickname>` for every seat that is a real player, and `public-profile.spec.ts:81` asserts the link and clicks through it. Guests and pre-round-11 shadows correctly do NOT link — `public_player_profile` refuses both, so a link would be a 404 with a name on it. Round 16 removed the standalone avatar ROW, not the row's link. **No code changed**; reporting it as found rather than writing a second implementation of something that works |
| 211 | **(R28-4) The public profile shows country, position and level** | `SHIPPED round-28`, **dormant on row 215**. **Recorded as AMENDING the round-14 ruling, with lineage.** Round 14 item 13 drew this page deliberately narrow so a roster tap answers "who is this in the lineup" without publishing a profile nobody consented to; that reasoning is not refuted and still bounds the page — email, phone and join date stay out. What is added is three facts a player states about their FOOTBALL, and **nothing new is collected**: all three columns already exist and are already edited on the account page. **Unset renders nothing at all** — no "Not set", no placeholder — because the reader here is a stranger who cannot fix it, so the row would be a fact about our database rather than about the player |
| 212 | *The honest limit inside row 211.* **The country flag covers four countries and 245 have none** | `OPEN`, and stated rather than hidden. `components/flags/Flags.tsx` holds four hand-drawn inline SVGs and its header is the law: **not emoji**, because Windows ships no regional-indicator glyphs and a flag emoji renders as two letters in boxes for a large share of desktop visitors. That rules out the one-line codepoint trick that would cover all 249, and drawing the rest is its own round. So `CountryFlag` renders CZ/GB/RU/UA and **nothing** otherwise — the country's NAME is beside it in every case, so a player from Portugal reads "Portugal" and nobody reads a blank or a box. The four are the countries behind the product's four languages, which is where this crew comes from |
| 213 | **(R28-5b) Remove credit, and the ledger row finally says why** | `SHIPPED round-28`, **dormant on row 215**. **The note already existed and was in the wrong place**: `grant_credit` has taken a `p_note` since round 7 and wrote it into the `credit_issued` EVENT, so the explanation lived in the audit log while the movement lived in `credit_ledger` — and the one question anybody asks of a wallet is "why is this row here". Removal is **the same RPC with the sign flipped**, not a second write path: `grant_credit` already takes a signed delta and already floors at zero under the player's advisory lock. Reason is `adjustment`, not `admin_grant` — calling a removal a grant makes the ledger lie in the column a later reader sorts by. The amount is typed POSITIVE and negated server-side; a negative input is refused rather than interpreted. Note required in the form AND the action, because `required` is skipped by anything that is not a browser |
| 214 | **(R28-5c and R28-6) The player page is the actions surface; the list is a list** | `SHIPPED round-28`. Make/remove admin was ALREADY on the player detail page and is unchanged — what moved is the LIST's copy of it. `AdminRightsButton` and `GrantCreditForm` were inline on every row: the list answers "who is here and what do they owe", a scanning question over hundreds of rows, and every row carrying a promote button and a credit form meant hundreds of forms in one document and the two most consequential acts in the panel one mis-tap apart on a phone. Identity, credits and contact stay; the actions reduce to one "Edit profile" link |
| 215 | **Apply round 28's two migrations** | `BUILT-DORMANT-ON-the owner running them`. `20260909100000_public_profile_scope` widens the public composite (rows 211/212); `20260909110000_credit_ledger_note` adds `credit_ledger.note` and restates `grant_credit` to write it (row 213). **Both are capability-gated and safe to be late**: without the first the public fields come back absent and the facts block renders nothing, so the page is exactly what it was; without the second the ledger keeps its event-only memo and the remove-credit form reports the RPC's error. Both validated rolled back. **The order does not matter and neither is DEPLOY-FIRST** — unlike round 27's cleanup, both are additive |
| 216 | **Turn Link and Klarna off in the Stripe dashboard** | `BUILT-DORMANT-ON-the owner clicking through Settings → Payment methods`. Row 207 pinned the sessions THIS product creates; the account still decides what is offered anywhere else, and a future session created by any other path re-inherits the account defaults. Steps in §6 |
| 217 | **(R28-11) The venue photo already reaches the page's top** | **`ALREADY SHIPPED`, verified rather than changed.** The surface where a venue photo backs the top of a page is the game detail, whose `<main>` carries `pb-40` and **no top padding at all** — so `GameHero`'s `absolute inset-0` photo layer starts at the page's own y=0 and runs under the fixed header exactly as the profile banner now does after round 28 item 3's sibling work. There was no gap to close. The luminance and stacking specs over this area re-ran green |
| 218 | **(R28-8 and R28-10) The venue Google-Maps link, and the crop uploader for venue photos** | `OPEN — NOT ATTEMPTED THIS ROUND`, and stated rather than half-built. Both are real work with real edges: resolving a `maps.app.goo.gl` short link means a server-side redirect follow with a timeout, a URL allow-list so the resolver cannot be pointed at an internal host, and a parse that either finds coordinates or **says so plainly instead of guessing** — the item's own instruction, and the part that makes it more than a fetch. The crop uploader is a reuse of the profile-banner cropper at the venue imagery's aspect, which is mostly plumbing but touches the venue form's save path. The round ran out of window before either could be done properly, and a half-resolved link that silently stores the wrong pitch is worse than no link |
| 219 | **(R29) Auto-settle, and a one-time fiat backfill** | `SHIPPED round-29`, **dormant on row 221**. **A recorded reversal of round 24's guard, with lineage**: round 24 built the played sweep and drew a hard line — "SETTLING REMAINS AN EXPLICIT ADMIN ACT" — because a game could end with cash uncollected and only a person knew. **That premise expired**: cash left in round 23, and pay-first (round 26) means a rostered player has paid before the row exists. Round 24's reasoning is not refuted. **THE READ CAME FIRST AND IS WHY THIS WAS SAFE**: `settle_game` did an auth check, a lock, a `played`-only guard, a `reserved` count, ONE status UPDATE and ONE event — **no attendance, no credit, no forfeiture, no money, and no triggers on `games`**. Everything downstream reads `played` and `settled` identically |
| 220 | *The half of row 219 that could have gone wrong and did not.* **Round 24's money invariant survives and now guards MORE** | `SHIPPED round-29`. The sweep counts `credit_ledger` and live bookings before and after and rolls the entire run back if either moved — an invariant written to enforce "the sweep never settles", now guarding a sweep that DOES. It is the reason automating this is safe rather than brave: settling is one UPDATE and one event, so the counts must come out identical, and if a later round couples money to settlement the cron fails loudly instead of quietly paying people. **The reserved-rows check survives as a TRIPWIRE rather than a gate** — it SKIPS the game and reports its id rather than refusing, because a game nobody can close is a thing to look at, not a reason to abandon the rest of the sweep. Under pay-first it should never fire; the cron logs a non-empty skip list as news |
| 221 | **Apply `20260909120000_auto_settle.sql`** | `BUILT-DORMANT-ON-the owner running it`. **It carries the backfill, so applying it IS the backfill** — one statement, marking every past game `settled` as-is. On production that is **35 games** (36 `played`, one of which has not kicked off yet). Validated rolled back against the local stack, where it marked 45. **NOT deploy-first and not late-safe in the usual way**: the deployed code drops the settle button and the sweep's return shape changes, so the two halves want to land together. Applying it while the OLD deploy is live leaves a settle button whose RPC is gone; deploying without it leaves a sweep that returns an integer where the route reads a shape |
| 222 | *Recorded with row 219.* **What the backfill deliberately does NOT do** | `SHIPPED round-29`. No attendance is written or rewritten — unmarked stays unmarked, and the product reads unmarked as attended (the owner's rule), so writing it here would fabricate a record of who turned up. No money moves. No stats change, because nothing downstream distinguishes `played` from `settled`. `cancelled` games are excluded — already terminal, and settling one would overwrite somebody's decision. **One reporting number DOES move and it moves toward the truth**: the admin financials' "games settled in the period" goes from 3 to 38 on production, and the derived average-revenue-per-game stops dividing a year of revenue by three games |
| 223 | **INCIDENT 2026-09-12 — a migration's verification drill was applied to production and COMMITTED** | `CLOSED same day`, and the rule it produced is in CLAUDE.md. Rounds 26–29 each ended with a behavioural drill — build a fixture, exercise the RPCs, assert. Every one was validated inside a hand-written `begin; … rollback;`, so the fixtures vanished on every test and **the pattern looked safe for four rounds**. `scripts/apply-migration.mjs` COMMITS. Round 29's drill left on production: a venue and two games named `auto settle probe`, two bookings against **the owner's own account** (the drill picks the oldest signed-up player), a real **"You were marked as a no-show" notification in his bell**, two games of inflated `games_played` and hours, **150 CZK of phantom money owed** (1,780 → 1,930), and a `played` game the nightly sweep would have reported as needing attention **every night for ever**. Cleaned up the same day: 2 events, 2 games (cascading 2 bookings and the notification) and 1 venue deleted; stats back to 15 games, outstanding back to 11 holds / 1,780 CZK, skip list empty, bell clear |
| 224 | *The two that had not been applied yet, and were worse.* **Round 28's drills would have wiped a live profile and moved real money** | `CLOSED 2026-09-12`, found while fixing row 223 and rewritten **before** they could be applied. The public-profile drill **UPDATEd a real player's `country`, `skill_level` and `positions` and then set all three to NULL** — a wiped profile on a committing apply. The ledger drill called `grant_credit` three times for real (+500, −200, +10), **moving 310 CZK into a live wallet with real ledger rows**. Neither migration had been run; both are now shape-only. The near-miss is the reason this row exists separately from 223: the incident that happened was the cheap one |
| 225 | **THE RULE: a migration's verification block may not write a row** | `SHIPPED round-29 follow-up`, and it is structural rather than a habit. A migration asserts the SHAPE it created — objects, columns, constraints, grants, capability flags, and the RESULT of any backfill it performs — and never inserts, never updates a row it did not come to change, and never calls an RPC that writes. **Behaviour moves to `supabase/tests/`, where `run.mjs` wraps every suite in `begin; … rollback;` BY DESIGN and a committing drill is structurally impossible.** Four new suites carry the drills that were removed: `auto_settle`, `add_guests_after_booking`, `public_profile_scope`, `credit_ledger_note`. The SQL suite goes 33 → 37. **The tell for a future reader: if a verification block declares a variable to hold a fixture id, it is a drill and it is in the wrong file** |
| 226 | **Re-apply commands for rounds 27 and 28 (supersedes rows 203 and 215)** | `BUILT-DORMANT-ON-the owner running them`. The FOUR migrations still unapplied on production — confirmed by probing the objects, not the filenames: `checkout_sessions.kind` absent, `can_add_guests` absent, `credit_ledger.note` absent, `game_roster_public.is_pending` still present. **All four were rewritten on 2026-09-12 and re-validated end to end against a clean local stack; the versions Oliver was previously handed must not be run.** Order and the deploy-first rule for the cleanup are unchanged — see §6 |
| 227 | **(R30-1) The venue photo crops, and the band reads as a banner** | `SHIPPED round-30`. **The crop is the same layer the profile banner has** — `VenuePhotoUpload` is now a thin wrapper over `PhotoUpload`, which already owned the size limit, the type allow-list, the claim-the-path-first ordering, the cache-buster and the cropper. This file had its own copy of the first four and none of the fifth, which is exactly how it went a year without a crop. **The round-13 ruling is REVERSED with its reasoning corrected**: "no client-side crop, cropping to a square here would throw away the goalposts" was half right — nothing ever cropped to a square, that was the avatar's problem, and the conclusion drawn was that no crop was needed at all. What actually happened is `object-cover` took the middle of a portrait phone photo: sky and grass, no goal. Framed to the venue's own 16:9, not the banner's 3:1, which would slice the posts off. **CREATE now has the control too** — `admin_create_venue` returns the id, so the crop happens where the creating happened instead of two trips through the list |
| 228 | *The half of row 227 that was measured rather than assumed.* **The venue photo was never "covered by the nav" in the way it looked** | **`MEASURED round-30`, and the attempted fix was REVERTED the same day — see row 234.** Three measurements said the hero photo ALREADY reached y=0: `elementFromPoint`, a bounding-box read, and a luminance decode under the header — all within a few points of the PROFILE banner, under the same `bg-ink/[.86]` + `backdrop-blur-md`. Geometrically the two surfaces were identical and no amount of moving the layer up could have changed anything. **What differed was SIZE**: the band was 208px against the banner's 341px, and the fixed 67px header takes a fifth of one and a THIRD of the other — so what was left read as a strip the nav had eaten. Growing the band to 236px was tried and **reverted**: `games.spec.ts` guards it at 240px, and that guard is a RULING — the v1.2 hero was 280px and was deliberately replaced by a band, so a 300px band is not a bigger band, it is the hero coming back, LARGER than the thing the rule was written against. Reversing a standing ruling is not a side effect of a crop item |
| 229 | **(R30-2) Remove banner, beside Remove photo; the wallet pair centred** | `SHIPPED round-30`, **dormant on row 232**. A NEW function rather than a wider old one: `remove_profile_photo` is the admin's and is about the AVATAR, and `clear_cover_photo()` takes NO argument — it clears the CALLER's own, so an admin calling it would wipe theirs. The drill asserts precisely that. The event catalog is NOT widened: a removed banner is a `profile_photo_removed` carrying `kind: 'cover'`. Each button renders only when there is something to remove, so a player with a photo and no banner sees one control rather than one enabled and one dead |
| 230 | **(R30-3) Full day and month names, in four languages** | `SHIPPED round-30`. `ne 13 9` was the owner's own example of the failure and abbreviations were the cause — `short` degrades worst in exactly the languages that need it most. **The punctuation is INTL'S, not ours**, which is why this is one `format()` call rather than parts glued with spaces: `Sunday 13 September`, `Neděle 13. září` (the dot is required), `Воскресенье, 13 сентября` and `Неділя, 13 вересня` (comma, genitive month). Hand-assembling produces `neděle 13 září` — wrong, and plausible-looking. Only the leading capital is ours. The spec pins all four EXACTLY at a fixed Sunday and asserts the failure as an absence |
| 231 | **(R30-4) The Maps share link resolves — and the root cause was that it never existed** | `SHIPPED round-30`. **There was no resolver to be broken.** Round 28 listed it as item 8 and row 218 says `OPEN — NOT ATTEMPTED THIS ROUND`. The field is a plain text box whose contents go into a Maps query string, so pasting a short link made the QUERY the literal URL text and Maps searched for it as words — which reads as a broken feature rather than an absent one, and is why it was reported three times. **TWO TRANSPORTS, because the live service uses both**: checked against `maps.app.goo.gl` rather than assumed, it answered **200 with no `location` header** and 34 KB of HTML. The first draft handled only the 302 and would have failed a fourth time on the exact shape he uses. Allow-list not block-list, re-checked EVERY hop; `0,0` refused; unresolvable links say so in words; a place name still searches |
| 232 | ~~**Apply `20260912100000_admin_remove_cover.sql`**~~ | **`SHIPPED`, and the OWNER applied it** — found on 2026-09-13 by probing the OBJECT rather than the filename: `remove_profile_cover` is in `pg_proc` and `app_capabilities()` returns `adminRemoveCover: true`, so the Remove-banner control is LIVE. ~~`BUILT-DORMANT-ON-the owner running it`.~~ **This row was about to be echoed as still blocked**, which is the thing round 12's rule exists to stop |
| 233 | *Verified 2026-09-12, not echoed.* **All four of the owner's applies landed** | `CLOSED`. Probed for the OBJECTS rather than the filenames: `checkout_sessions.kind` present (round 27 add-guests), the public profile composite at **ten** columns (round 28 scope), `credit_ledger.note` present (round 28), and `is_pending` **gone** with the roster back to **seven** columns (round 27 cleanup). Rows 226, 203 and 215 close with it |
| 234 | ~~**OPEN — the venue photo's top edge needs ONE ruling from the owner**~~ **RESOLVED AS (c), and (c) was not on my list** | **`CLOSED round-30`, item 7.** I offered two options and the owner found the third: **the band stays exactly as ruled and the CROP FRAME was the problem all along.** Neither (a) nor (b) was needed — no ruling reversed, the 240px guard untouched, no new one-page header treatment. What made the photo look wrong was not how much of it showed but that it showed something the organizer never composed: the frame was 16:9 and the band renders 1.875:1, so `object-cover` took a slice off the top and bottom of every crop. ~~It is a genuine fork rather than work left undone.~~ The measurements (row 228) say the photo already reaches y=0 under the same header as the profile banner; what makes it read as "covered" is that only ~141px of a 208px band survives the 67px nav. **Two ways forward and they contradict different things:** (a) **let the band grow** — the honest fix for "not enough photo", but it reverses the v1.2/round-18 ruling that replaced a 280px hero with a band, and `games.spec.ts` guards it at 240px; (b) **make the header transparent over this surface** — which is what "merge into the top-nav cutoff" says literally, costs no ruling, and puts header text over a photograph, so it needs its own legibility scrim and would be a new treatment on one page. **Everything else in item 1 shipped**: the crop layer on CREATE and EDIT, which was the part with no ambiguity in it |
| 235 | **(R30-6) The location field takes pasted COORDINATES** | `SHIPPED round-30`. `50.0755, 14.4378` — what Maps puts on the clipboard on a long-press or right-click — is parsed directly, with NO network, and pins exactly there. Tried FIRST, before the link path and before search, because it is the most precise thing anybody can hand us and the cheapest to honour. **DETECTION IS BY SHAPE AND THE SHAPE IS STRICT: a decimal point is required in both halves.** `Praha 3, 130 00` is also two comma-separated numbers, and a looser pattern would silently turn an address into a pin in the Atlantic — the same class of failure this field already had once. Either hemisphere accepted; `0,0` and out-of-range refused, as on the URL path; normalised through `toMapQuery` so a pasted pair and a resolved link are stored in one format. Create and edit |
| 236 | **(R30-7) The crop frame IS the rendered surface's aspect** | `SHIPPED round-30`, and it is what resolved row 234. **Both frames had drifted and one badly.** Measured at the canonical 390px viewport: the venue band renders **390x208 (1.875)** and was cropped at 16:9 (1.778); the profile banner renders **390x341 (1.144)** and was cropped at **3:1**. The second is the serious one — a 3:1 strip in a 1.14:1 box under `object-cover` loses its SIDES, so a carefully framed banner showed its middle third. **Round 28 made the banner full-bleed and nothing moved the constant with it**, which is precisely the drift the new spec exists to catch: `e2e/crop-frames.spec.ts` measures what the browser paints and compares it to the constant the cropper draws from, so the next person who changes a band's height finds out there rather than from the owner. **390 is the reference and that is an honest limit** — both bands have a fixed height and take their width from the shell, so the aspect moves with the window; the product is mobile-first and that is where the photograph is looked at. A third assertion forbids collapsing the two constants into one, because a pitch band is a wide strip and a banner is nearly square |
| 237 | **(R30-8) The community panel returns to its neighbours' treatment** | `SHIPPED round-30` — **a reversal of a reversal, and the lineage is the point.** Redesign v2 round 3 gave it `.lifted` over a volt edge, on the reasoning that "a volt edge on a panel that is not selected, not focused and not a call to action spends the accent on furniture". **Round 25 item 4 overruled the PREMISE** — this IS a call to action, every tile is a link out, and it was the only invitation left once round 23 removed the hero's button — and borrowed the Game Pass banner's `border-hairline-volt bg-volt/[.10]`. **Round 30 is the owner's ruling: visual consistency wins.** Round 25's argument is not refuted and does not need to be: it was a claim about what the panel DOES, and the owner's is a claim about how the page READS — three side-by-side panels drawn two ways read as a mistake before they read as emphasis. Content and logos untouched; round 25's 55px logos stand. The round-25 spec inverts and now asserts against a SIBLING rather than the banner, for the same reason it asserted against the banner before: the claim is that these panels are drawn alike |
| 238 | **(R31-1) The player's map link shows the PLACE, not the numbers** | `SHIPPED round-31`, **dormant on row 241**. Round 30 stored coordinates, the pin landed exactly right, and Google then opened labelled `50.092534,14.475315` — a correct pin under a number is still a product that looks cheap. **The venue now keeps BOTH the source and the coordinates**: `map_url` holds the share link verbatim and the button opens THAT (Google's own place card, with the name, photographs and entrance); `map_query` keeps the coordinates for everything internal. Coordinates-only builds a Maps search of **name first, coordinates second** — name first is what makes Google label the place, coordinates first inverts it and the pin wins. Address entries are untouched |
| 239 | *Found while building row 238, and worse than the reported bug.* **The address line was printing URLs and coordinates to players** | `SHIPPED round-31`. `GameHero` rendered whatever was in `map_query` as the venue's street address. After round 30 that meant a coordinate pair; BEFORE round 30 it meant, for **two production venues**, a raw `https://maps.app.goo.gl/…` — shown to players as though it were an address. `venueAddressLine` now prints nothing for a URL, nothing for coordinates, and nothing for a query identical to the venue's own name. **The migration backfills those two rows** (URL moves to `map_url`, `map_query` cleared) and a CHECK stops a third ever arriving |
| 240 | *Caught by the drill, not by review.* **`create or replace` with an extra parameter makes an OVERLOAD, not a replacement** | `SHIPPED round-31`. Adding `p_map_url` to `admin_create_venue` left BOTH the three- and four-argument versions in the catalog, and a three-argument call then failed with `function admin_create_venue(unknown, unknown, unknown) is not unique` — because the new one's trailing default makes it an equally good candidate. **Every existing caller would have broken on an ambiguity nothing in the diff mentions**: the seed, the fixtures, PostgREST. The old signatures are dropped explicitly. Same family as round 28's "cannot remove parameter defaults": changing a function's parameter list is never just an edit |
| 241 | ~~**Apply `20260913100000_venue_map_url.sql`**~~ | **`SHIPPED`, and the OWNER applied it** — probed 2026-09-13: `venues.map_url` exists and BOTH writers carry the trailing argument (`admin_create_venue(text, text, text, text)`, `admin_update_venue(uuid, text, text, text, text)`). **The defect it was for is gone**: zero venues hold a URL in `map_query`, down from two. **Zero hold one in `map_url` either** — nobody has pasted a share link yet, which is row 233's acceptance tap and still the owner's to make. ~~`BUILT-DORMANT-ON-the owner running it`.~~ **See row 260 for what applying it out of order cost** |
| 242 | **(R31-2) The crop region is DRAWN** | `SHIPPED round-31`. Round 30 item 7 made the aspect correct; the frame was still `overflow-hidden`, so the only thing on screen WAS the crop and the person composing had nothing to judge it against — "Position your photo" asked for a decision and showed one half of the evidence. The same photograph now renders behind the frame at the same transform, offset by the reveal inset so it lines up to the pixel, dimmed to 30%. **The outline is volt over a dark ring**: volt because this is the one thing on the dialog being manipulated (the round-3 objection was to volt on FURNITURE), and the dark ring because a volt line on a bright photograph is low contrast — the same two-tone trick the claim bar uses over a photo. `ring` not `border`, because a border sits inside the box and would move the crop by two pixels. **Three readings, one truth**: `crop-visible.spec.ts` pins drawn-to-constant and decodes the dimming and the outline's legibility against a near-white image; `crop-frames.spec.ts` already pinned constant-to-rendered-band |
| 243 | **(R31-3) Admin speaks CREDITS, the ledger keeps CROWNS** | `SHIPPED round-31`. The admin panel was the one surface ignoring the ruling: a player read "3 credits" on their wallet while the organizer granting them typed `450` into a box marked CZK — two units for one thing, with the translation living in somebody's head. Grant and remove now take **whole credits**, converted once **in the action and not in a hidden form field**, because a pre-multiplied hidden number is one a hand-made POST can set to anything. The admin wallet tile, both forms' outcomes and the players list all read in credits. **`credit_ledger` is untouched and that is deliberate** — it predates the ruling, it is append-only, and every refund rule and every booking's `credit_applied_czk` is denominated in crowns; re-denominating a ledger to tidy a form is how accounting history gets rewritten. A local duplicate of the division in the players list is gone; one source |
| 244 | *The edge the owner expected to be empty.* **Three of four production wallets do NOT divide into whole credits** | `OPEN — informational, no action required`. Expected zero; found **three**: 4,460 CZK (29 credits + 110), 110 CZK (0 + 110) and 50 CZK (0 + 50), across 23 ledger rows that are not multiples of 150. All are arbitrary-CZK grants and adjustments made before the credits ruling existed. **The subtext path is therefore live, not theoretical**: the admin shows the floored credit count with the exact crowns beneath it rather than rounding a number the player cannot spend and the organizer cannot reconcile. Nothing is migrated — the ledger is accounting truth and 110 CZK really is 110 CZK. If the owner wants them tidied it is a decision about money, not a cleanup |
| 245 | **(R32-1) The venue adjuster IS the banner adjuster — and here is why it was not** | `SHIPPED round-32`. **`PhotoUpload` carried the same decision TWICE as two ternaries** — one choosing what to ENCODE, one choosing what the cropper DRAWS — and round 30 added a `venue` arm to the first and not the second. So a venue photo was composed in the **AVATAR's 1:1 window** and saved at the band's **1.875:1**: a wide strip taken out of the middle of a square the organizer had carefully filled. Same component, same portal, same drag — and a window shaped like neither the banner nor the band. The fix is `CROP_OUTPUT`, one record keyed by target that BOTH the encoder and the cropper read; a record cannot have a missing arm where a ternary falls through to whatever the `else` happens to be. **No redesign** — parity with the banner Oliver already approves was the bar, and the shared dim/outline were already shared |
| 246 | *Why the existing specs could not have caught row 245.* **`crop-frames.spec.ts` never opened the venue cropper** | `SHIPPED round-32`. It measured the COVER cropper and the two RENDERED bands — constant-to-band — and the venue's drawn WINDOW was the one reading nobody took. `cropper-parity.spec.ts` opens both flows with the same portrait photograph and asserts SAMENESS: dialog position, z-index, width, role, `aria-modal`, scrim colour, outline, dim opacity, revealed margin and the zoom control must all be equal, and the aspect must differ and match each surface's own constant. A named regression guard asserts the venue window is not square |
| 247 | **(R32-2) The ledger invariant, SCOPED to what it can truthfully cover** | `SHIPPED round-32`, **and the scope is a correction rather than a narrowing**. The ask was "every delta must be a multiple of 150". Checked against production first: **games are priced 150, 180 AND 200** (30, 6 and 8 fixtures), so a `redemption` on a 180 CZK game is -180 and a `cancellation_credit` returns +180 — both correct, neither a multiple. A blanket rule would fail the suite the next time somebody books a 180 CZK game with credit, and **a tripwire that fires on normal operation teaches everyone to ignore it**. So the invariant guards the path the ruling actually changed: `admin_grant` and `adjustment`, the two reasons a HUMAN mints. Production is clean against it today |
| 248 | *The two holes in row 247, named rather than buried.* **Scaffold rows and null-note rows are exempt** | `SHIPPED round-32`. `e2e/helpers/scaffold.ts` moves wallets to arbitrary balances through `grant_credit` to build edge cases — round 27 needed a player holding exactly 1,000 CZK to prove online payment spends none of it — so a rule judging them would fail on every database the e2e suite has touched, and the only way to satisfy it would be deleting the tests that prove the floor works. They are excluded by their own note. **Null-note rows are excluded on principle**: the admin form has required a note since round 7 and requires one again in round 31, in the form AND in the action, so a null-note admin row cannot have come from the product's admin path at all. **The guard is proven non-vacuous** — the suite mints a deliberate 260 CZK violation and asserts the count CHANGES, mints a legal 300 beside it and asserts it does not, and dates one before the cutoff to prove the exemption is by date rather than by luck |
| 249 | **(R33-4) The venue crop was pinned to the WRONG SURFACE for three rounds, and the measurement says why** | `SHIPPED round-33`, **and this is a diagnosis rather than a fourth attempt at the same constant**. The photograph feeds **TWO** surfaces and nobody had measured both. Live on production: the **card** is 344x159 = **2.167** at 390px and 384x159 = **2.419** at 430px; the **detail hero** is 390x235 = **1.658** and 430x235 = **1.828**. And the hero **HAS NO STABLE ASPECT AT ALL** — two games on the SAME deploy at the SAME width render **1.658** and **1.875**, because the band is `pt-36 pb-5` plus CONTENT, and the content is a venue name that may wrap and badges that may not be there. **That is why each round "fixed" it and it was still wrong**: each measured one game's hero, got one number, pinned the constant to it, and the next fixture rendered differently. The constant `1.875` matched nothing on either surface |
| 250 | **(R33-4b,c) The crop is pinned to the CARD, and what the hero does with it** | `SHIPPED round-33`. `1500x800` → **`1600x740` = 2.162**, the card's rendered aspect at the 390px reference. Three reasons that all point the same way: the card's height is **FIXED at 159px**, so its aspect moves only with the viewport rather than with the fixture; it is the surface the owner named; and it is the **WIDER** of the two, so every other surface cover-crops the frame's **SIDES** rather than its top and bottom — a pitch photograph survives losing its edges and does not survive losing the goalposts, which was the round-30 complaint. **WHAT THE HERO DOES**: `object-cover` scales the 2.162 frame to fill a 1.658–1.875 box, so it fills the height and loses a slice from each side. **Nothing is lost from the top or bottom on any surface.** The stated limit: at 430px the card is 2.419 and takes a sliver off the frame's top and bottom instead, which is what pinning a fixed aspect to a fluid box costs |
| 251 | **(R33-4d) The marked-image proof, which names no constant** | `SHIPPED round-33`. `e2e/crop-truth.spec.ts` builds an 1800x1000 image — cyan/magenta/yellow/white edge sentinels over an 8x10 colour grid — drags the cropper until it **clamps at the image's top** (a framing with an exact name rather than a measured one), screenshots the crop window, saves, and screenshots **the card as served**. Per edge: **TOP** framed `rgb(0,255,255)` / card `rgb(1,255,255)` — CYAN; **LEFT** `rgb(255,255,0)` / `rgb(255,255,0)` — YELLOW; **RIGHT** `rgb(255,255,255)` / `rgb(255,255,255)` — WHITE; **BOTTOM** `rgb(135,228,100)` / `rgb(136,228,99)` — grid row 9. **Zero magenta pixels reach the card**, magenta being the strip below the framed region. **The negative control was run**: restoring `800` makes the top edge read `rgb(136,29,99)` instead of cyan, so the proof can fail. It imports no crop constant at all |
| 252 | **(R33-1) Change name, ALWAYS visible** | `SHIPPED round-33`. `admin_set_display_name` is a new `SECURITY DEFINER` RPC, because `players_update_own` is an own-row policy and an admin editing somebody else's name cannot go through the table — and the column-scoped grant that lets a player rename themselves is exactly the grant that must not be widened. It **re-states** the format and uniqueness rules so the refusal names the field rather than `players_nickname_format`, and emits `player_renamed` carrying **both** names. The identity row on the player page is **no longer conditional**; the two image removals keep theirs, because an enabled button for an absent photo is a promise the page cannot keep. **A real bug the spec found**: the first version closed the form on submit, so a refused rename unmounted its own error and the admin saw nothing |
| 253 | **(R33-2) Every player carries a permanent number** | `SHIPPED round-33`, migration written and **handed over**. A **SEQUENCE**, not `max(n) + 1` and not a rendered ordinal: delete player 40 and the next signup is 41, because the gap is the record that somebody was there. Backfilled by `(created_at, id)` — **the tie-break matters**, the seed writes several rows inside one transaction where `now()` is identical for all of them. The assignment is a column **DEFAULT** rather than a line in each signup RPC, so it covers the insert path nobody has written yet. **Deliberately the opposite of the games list's ordinals**, which renumber freely: that surface answers "how many", this one answers "which one" across exports taken months apart |
| 254 | *The honest limit inside row 253.* **The number is hidden by SURFACE, not by grant** | `OPEN — informational, no action required`. `players_select_own` lets a player read their **own row** through the API, `player_number` included; making it unreadable would mean revoking the table-wide `select` and re-granting a column list, which is a large, brittle change to a grant every roster path depends on. What the owner asked for is that it never **renders**, and that is asserted directly: a spec moves a player's number to `987654`, then reads the public profile, the game roster, the games list and the player's own account page and requires the number to appear on none of them. The two public composites are separately asserted not to carry the column at all |
| 255 | **(R33-3) The party goes to thirteen, behind ONE dropdown** | `SHIPPED round-33`, migration written and **handed over**. `+1/+2/+3` stay as pills and the **fourth control** is a native `<select>` drawn as a pill with a chevron, listing `+4`…`+13`. **Native, and that is the whole reason it is short**: a custom listbox here would need a portal — both pickers render inside `main.relative.z-10` and would open **under the nav pill**, which is CLAUDE.md's modal law — plus roving focus, Escape, outside-click and a scroll lock, all of which the platform already has, and on a phone it opens the OS wheel. **Capacity still binds first**: six seats offers `+4` and `+5` and stops, four seats offers no dropdown at all. Pricing is unchanged — `N x price`, server-side |
| 256 | *What made row 255 a migration rather than a number.* **The party ceiling lived in TWO places in SQL** | `SHIPPED round-33`. `create_booking_internal` held `v_max_guests constant integer := 3` and `can_add_guests` held a bare `3 - guest_count`; the round-11 comment says in as many words that moving the ceiling means editing both in one commit, which is a rule that works exactly until somebody misses one. It is now **`public.max_party_guests()`**, which both read, so the next move is one function. **The migration rewrites what is INSTALLED rather than restating 240 lines of commented plpgsql** — it reads `pg_get_functiondef`, substitutes one token, and **raises** if the token it expects is not there, so it edits production's function rather than the repo's idea of it. `prosrc` keeps comments, so nothing is lost in the round trip |
| 257 | *The dependency inside row 255, gated rather than hoped for.* **The dropdown does not appear until the database will honour it** | `SHIPPED round-33`. `app_capabilities().partyUpToThirteen` gates the **booking-time** picker: until the migration lands it is exactly three pills, which is the old product working rather than a degraded one. A `PARTY_TOO_LARGE` delivered after the player has chosen how to pay is round 12's dead-path rule with money attached. The **add-guests** panel needs no flag — its options come from `can_add_guests()` itself, so they are already whatever the database will allow |
| 258 | ~~**Apply round 33's two migrations**~~ | **`SHIPPED`, and the OWNER applied them** — probed on 2026-09-14 by the objects rather than the filenames: `players.player_number` is a column, `admin_set_display_name` and `max_party_guests` are both in `pg_proc`, and `app_capabilities()` returns `playerNumbers`, `adminRenamePlayer` and `partyUpToThirteen` all true. **`venueMapUrl` is back too**, which is row 260's repair landing with them. So the party dropdown is live to thirteen, every player is numbered, and the rename control is on the admin profile. ~~`BUILT-DORMANT-ON-the owner running them`.~~ |
| 259 | *Found while widening the ceiling.* **One round-11 assertion was passing for the wrong reason** | `SHIPPED round-33`. `guests_and_parties.sql` asserted that four guests on a game seating **two** is refused as `PARTY_TOO_LARGE`. At thirteen it began failing with `CAPACITY_FULL` — and the naive fix, changing 4 to 14, would have made it **pass for the wrong reason** on the same tiny pitch, claiming the ceiling was enforced while capacity answered first. It now books `max_party_guests() + 1` on a pitch that seats twenty, so the refusal is the one the label names |
| 260 | *Found re-verifying row 241 rather than echoing it.* **Applying two migrations out of DATE order silently deleted a capability flag** | `SHIPPED round-33` (repaired). Production returned `adminRemoveCover: true` and **no `venueMapUrl` at all**, while `venues.map_url` and both four-argument writers were present and correct — so the migration was applied and its flag was not. **`app_capabilities()` is restated IN FULL by every migration that touches it**, and round 31's `20260913100000` was applied FIRST with round 30's `20260912100000` second, so the older file's list overwrote the newer one and took the flag with it. **Nothing reads that flag today, so nothing broke** — `lib/db/capabilities.ts` never carried it — and that is exactly why it went unnoticed. Round 33's two migrations restate the list as a superset of what is LIVE, which puts it back; CLAUDE.md now says to probe the live jsonb before writing the next one |
| 261 | *Found re-verifying row 187.* **`checkout_sessions` holds 28 LIVE Stripe sessions and NOT ONE has settled** | `OPEN — and it is the owner's thirty seconds in the Stripe dashboard, not mine`. Last round the table was **empty**; it now holds **28 rows, every one `cs_live_`, every one `status = 'open'`, kind `booking`**, from **2026-09-06 08:15** to **2026-09-12 17:19**. In the same ten days the product created **8 bookings and not one of them was a card payment** — four confirmed on credit, three cancelled on credit, one `qr` expired — and every `payment_confirmed` event in the window belongs to a credit redemption. **Two readings and this side cannot tell them apart**, exactly as row 185 could not: either 28 people opened the form and walked away, or **the embedded rail takes money and nothing settles it**, in which case there is real money unreconciled and seats that were paid for and never held. It is the same shape CLAUDE.md records from the round-27 outage — created and registered, then nothing. **Stripe → Payments for the week of 2026-09-06 answers it immediately**; Stripe → Developers → Webhooks → Recent deliveries answers the second half. Nothing here can, and neither making a real payment nor sending a signed webhook is a test |
| 262 | **(R34-1) The dropdown cue was a dot, and the fix is a drawn triangle** | `SHIPPED round-34`. Round 33 typed `▾` (U+25BE, BLACK DOWN-POINTING SMALL TRIANGLE) and left the shape to font fallback — several faces in this product's stack draw that codepoint tiny and nearly round, so the universal "this opens" cue read as a blob. **A glyph whose SHAPE is the whole message cannot be left to a font.** It is now an inline SVG, `currentColor` so it still takes the pill's selected/unselected treatment, and it is the same component on BOTH pickers. **Asserted by decoding, not by markup** — "there is an SVG" would have passed for the character too: the spec counts lit pixels per row and requires the top to carry more than twice the bottom, which a dot, a square and an upward triangle all fail |
| 263 | **(R34-2) "Wallet" is dead on player surfaces — and it was in twenty places, not one** | `SHIPPED round-34`. The owner named the add-guests panel's "Pay from wallet"; a walk of the string tables found **20 English keys** (emails included) and **13-15 in each of Czech, Russian and Ukrainian**. It was in the cancel reassurance, the cancel confirm, the top-up page and title, the pass lede, the toast, the FAQ, the checkout line item and three email templates. One surface said "Redeem credit", another said "Pay from wallet", and a third said "back in your wallet" — three names for one thing, two of them the database's word for where the number is kept. `credit_ledger` keeps its name; so does the admin panel, where the organizer is reconciling money and the ledger's noun is the clearest word they have |
| 264 | *The strongest form of "one term".* **`addGuests.payCredit` was DELETED rather than retranslated** | `SHIPPED round-34`. Two keys for one act is two things to translate and two chances to drift — and they had already drifted, which is how the round started. The panel now renders `booking.payWithCredit`, the booking page's own key, so the two surfaces cannot disagree without somebody deliberately reintroducing a second key. `e2e/vocabulary.spec.ts` asserts it as SAMENESS rather than against a literal: pinning both to a string would pass on the day one of them changes and the test is updated to match |
| 265 | *The law, in two forms because one of them cannot see everything.* **A unit walk over the tables AND a four-language page crawl** | `SHIPPED round-34`. `lib/i18n/__tests__/vocabulary.test.ts` walks every key in all four tables — including the ones only one error path renders, which a crawl would never visit — and `e2e/vocabulary.spec.ts` loads eight player pages in all four locales and reads the RENDERED text, because a string-table walk cannot see a word hardcoded into a component. Both exempt `admin`, `brand` and `privacy`, the same exemptions the translation walk has |
| 266 | *Found while enforcing row 263.* **"Mobile wallet" was a different word wearing the same spelling** | `SHIPPED round-34`, and it is a copy improvement rather than a workaround. The FAQ and the pass page said "pay by card or mobile wallet" — Apple Pay and Google Pay, not this product's credits. Carving an exception into the law for it would have weakened the law; naming the two services instead is **more concrete than the phrase it replaces** and leaves the rule absolute with no exemption to remember. All four languages |
| 267 | **(R34-3) Add-guests ends on BOOKING CONFIRMED — reversing a round-27 decision** | `SHIPPED round-34`, migration written and **handed over**. Round 27 sent a settled add-guests checkout to the game page, reasoning that "the confirmation page is about a booking coming into existence" and that an unchanged screen would read as nothing having happened. **What it produced was a silent return**: money leaves the card and the player is dropped back where they started, with a roster one scroll away and two names longer. The absence of a full stop reads as a failure. **Both rails now end in the same place** and the copy carries the difference — "+2 guests confirmed", in the same volt panel with the same tick |
| 268 | *What made row 267 a migration.* **The confirmation could not know how many guests it was talking about** | `SHIPPED round-34`. `bookings.guest_count` is the TOTAL, so a player who booked two guests and later added one reads 3 either way — the booking row cannot say which of two true things just happened. `checkout_outcome` now projects `guest_count` from the register row **the webhook settled**, and the credit rail carries what it just spent. **The number in the URL is treated as decoration, not evidence**: a player who edits it changes the headline on their own screen and nothing else — no money, no seat, no roster — which is exactly why nothing downstream reads it |
| 269 | **(R34-4) A player can take their own guests back off** | `SHIPPED round-34`, migration written and **handed over**. `cancel_guests(booking, n)` is `cancel_booking`'s rules applied to a slice: same lock order, same ownership check inside the function, same window. **It can never reach the player's own seat** — `p_count` is bounded by `guest_count`, so the smallest a booking becomes is the one seat it started as, and leaving entirely stays the existing Cancel with its own confirmation. Seats free immediately, `sync_game_fullness` runs, and the panel calls `notifyWaitlistForGame` exactly as `cancelBookingAction` does |
| 270 | *The rule inside row 269 that had to be chosen rather than copied.* **What a removed guest is WORTH** | `SHIPPED round-34`. Not the game's current price: a booking can be assembled at two different prices, because `settle_checkout_session` adds its own amount to `price_czk` when guests are bought later. The only figure certainly true of THIS booking is what it holds divided by the seats it holds. **The remainder is computed first and the refund is the difference**, so refund plus remainder is exactly the original and no rounding can invent or destroy a crown |
| 271 | *A decision about somebody else's money, stated rather than buried.* **A partial guest refund is UNEXPIRING** | `OPEN — informational; overrule it and it is a small change`. `cancel_booking` mirrors each redemption back to the batch it came from, carrying that batch's expiry. **A partial refund has no unambiguous batch to return to** — the ledger records that credit was spent on a booking, never which seat it bought, and seats are fungible. Splitting proportionally across batches would be an allocation rule this product has never needed, with rounding that can over-refund a batch across repeated partial cancellations. So it lands in the ordinary unexpiring pool, which is **never worse for the player** than the alternative — the right way to break a tie about money that is not mine. Full cancellation is unchanged and still mirrors to batches |
| 272 | *Where the brief contradicted itself, resolved in the open.* **"Only before the cutoff" versus "identical to self-cancellation"** | `OPEN — one word from Oliver flips it`. Item 4 says both "allowed only before the 8-hour cutoff" and "Rules identical to self-cancellation … after the cutoff the control disappears/disables exactly like self-cancel". **Those are two different products, because self-cancel does NOT disappear after the cutoff** — `cancel_booking`'s own comment says why: "Cancelling is still permitted right up to kickoff; only the refund is gated. Freeing the spot late is worth more to everyone else than the player's silence." I built the IDENTICAL-TO-SELF-CANCEL reading: the control stays to kickoff and the sentence under it changes from a promise to a warning. A guest's seat freed two hours out is worth exactly as much to the other eleven as the player's own. **If Oliver wants it hidden past eight hours it is one condition on one line** |
| 273 | *Extracted rather than copied.* **One guest-count picker, two panels** | `SHIPPED round-34`. Add-guests and cancel-guests ask the identical question in opposite directions and the owner asked for the same language, so the pills-plus-dropdown moved into `GuestCountPicker`. **The booking-time picker is deliberately NOT this component**: it offers "Just me" at zero, its options are radio INPUTS because it posts inside a bigger form, and its ceiling is the policy's rather than a count it is handed. Folding those in would mean three booleans and a conditional at the one place a mis-wire spends somebody's money |
| 274 | *The trap from row 260, closed properly.* **Capability flags for objects a migration did not create are now PROBED, not asserted** | `SHIPPED round-34`. Carrying the list forward by hand fixes the out-of-order case and leaves a worse one: round 34's file would claim `playerNumbers: true` on a database where round 33's migration has not been applied — a flag actively lying about a column that does not exist, and both admin reads answer a missing column by rendering nothing. **Every flag whose object the migration does not itself create is an existence probe** against `pg_proc` or `information_schema`. It cannot lie, it cannot be dropped by an out-of-order apply, and it costs one catalog lookup on a `stable` function the app calls once per render. Only the two flags round 34 creates are asserted |
| 275 | **Apply round 34's migration** | `BUILT-DORMANT-ON-the owner running it`. `20260914100000_cancel_guests.sql` — additive, capability-gated, not deploy-first, applied twice against a clean local stack. **Without it the product is exactly what it was**: no cancel-guests panel (`cancelGuests` false), and a settled add-guests checkout returns to the game page because `checkout_outcome` does not project `guest_count`. Shape-only verification; the behaviour is drilled in `supabase/tests/cancel_guests.sql` (23 assertions), which `run.mjs` rolls back |
| 276 | *The same defect as row 262, on a surface the item did not name.* **The admin venue disclosure still types `▾`** | `OPEN — deliberately out of scope, one line to fix`. Item 1 named the party picker's fourth control and "both pickers (booking-time and add-guests)"; `app/admin/venues/page.tsx:127` carries the identical typed glyph on the venue row's open/close marker and will be rendering the identical blob. **Not fixed, because widening an item the owner scoped is how a round stops being reviewable** — and because admin is one person on one device rather than every player on every phone. Recorded so it is a decision rather than an oversight; CLAUDE.md names it as next in line |
| 277 | *Found by doing the verification item 2 asked for.* **The credit rail charges the GAME'S price, not 150** | `OPEN — a money decision, and it is Oliver's`. `add_guests_with_credit` debits `game.price_czk x guests`. **On a 150 CZK game that is exactly `N x 150` and the credits ruling holds**; on a game priced 180 or 200 — production has both — a guest costs more than one credit, so two guests take 400 CZK, which is two and two-thirds. Verified rather than assumed, and asserted in `add_guests_after_booking.sql` against what the function ACTUALLY does: the refusal fires before anything is spent, a refused spend debits nothing, and two guests on a 150 CZK game take exactly 300 as one redemption row. **Nothing was changed** — whether a guest should cost one credit regardless of the pitch's price is a ruling, not a bug fix |
| 278 | *The display bug row 277 would have caused, caught before it shipped.* **The add-guests panel nearly printed a credit figure it could not honour** | `SHIPPED round-34`. Item 2 says amounts in credits, and the first version divided the guest count straight into credits — which is right only while every game costs 150. On a 200 CZK game it would have printed "2 credits" beside a button about to take 400. **The unit now follows the arithmetic**: credits when the cost divides cleanly by `PASS_REFERENCE_PRICE_CZK`, crowns when it does not, which is at least true. The same "handled, not hidden" rule the admin wallet uses for a ragged balance — and the reason that rule existed to copy is round 31's finding that three of four production wallets are ragged |
| 279 | *A recurring "flake" that was neither a flake nor what I first thought.* **`cutover.spec.ts` was asserting on a LOADING SKELETON** | `SHIPPED round-34`. It failed in rounds 33 and 34's full runs, always on `/football/games`, always passing in isolation; round 33 called it flake and re-ran. **The games page has had no "Upcoming games" heading since round 23**, which removed it deliberately — "a heading repeating the tab name is the largest type on the page spent on the one fact the reader cannot have arrived without knowing". The only place that string still renders as an `<h1>` is `GameCardSkeleton`, the SUSPENSE FALLBACK. So the assertion passed only while the server was slow enough to paint a skeleton, and failed once it was warm — **a test that could not tell the product working from the product missing**, which is the `count(*)` trap in a different costume. It now asserts `game-list`, which is what "the namespace serves the list" means. **My first two fixes were both wrong and are recorded because the wrong turns are the useful part**: `networkidle`, which HANGS because that list streams and the network never goes idle; and an edit that deleted the `page.goto` outright, caught only by instrumenting the run and reading `url about:blank` |
| 280 | **RULING — credits are seat-denominated, flat (supersedes row 277)** | `SHIPPED round-35`, migration written and **handed over**. **1 credit = 1 game = 1 seat, whatever `price_czk` says.** Round 34 verified the credit rail charging `game.price_czk × N` and named it a ruling rather than a bug; this is the ruling. Every credit path now debits `150 × seats` — the player's own redemption, add-guests, and the refund. **Card payments are untouched** and still charge the game's real price. `public.credit_seat_price_czk()` is the SQL twin of `PASS_REFERENCE_PRICE_CZK`, so the rate lives in one place on each side rather than three literals |
| 281 | *The consequence the ruling forces, found by running the suites.* **Partial credit IN CROWNS no longer exists — and a single seat can never be partly paid** | `SHIPPED round-35`. A crown-wise application IS a price-based debit, so it goes with the rest. What follows is sharper than it sounds: a seat is covered by a whole credit or not at all, so **a one-seat booking with any credit at all is fully paid**, and the "applied credit with money still owed" state only exists on a PARTY now. Four SQL suites asserted the old shape and all four were reshaped rather than re-expected — `booking_create`, `booking_cancel`, `booking_rpcs_b` and `game_pass`. Two of them had to become parties of two, because the state they exist to test cannot occur on one seat any more |
| 282 | *Found by the ruling's own spec failing.* **THREE places asked "can this wallet pay", and two of them asked in crowns** | `SHIPPED round-35`. `create_booking_internal` was the one everybody knew about. `PaymentMethodChoice` disabled the radio on `creditCzk >= price × seats`, and `createBookingAction` refused the POST on the same arithmetic — a round-23 guard against an unpaid `cash` booking, which is still needed and was still price-based. On a 180 CZK game a wallet holding four credits (600) was told "Not enough credit for that booking" for a party of four costing 720 by card and exactly four credits by credit. **The e2e caught it as a timeout, not as a wrong number**, because the refusal renders where nothing was asserting |
| 283 | *What the ruling costs, measured on production rather than estimated.* **270 CZK across three wallets can no longer be spent** | `OPEN — informational; it is the ruling working as written`. A balance under one credit buys nothing now, and a remainder above a whole credit is equally unspendable. On production today: **one wallet holds 50 CZK** and can no longer put it towards anything, and two more hold **2,810 and 1,010** — 18 credits + 110 and 6 credits + 110. **270 CZK in total is now inert.** It was already unspendable as a *whole* game; what changed is that it can no longer be applied as a part. Nothing is migrated, because the ledger is accounting truth and 110 CZK really is 110 CZK — if the owner wants those three topped up to the next whole credit that is a grant, and it is a decision about money |
| 284 | *The other half of the ruling.* **A credit-paid seat refunds exactly one credit, and credit seats come off first** | `SHIPPED round-35`. `cancel_guests`'s round-34 rule divided `price_czk` by the seats, which was the only honest figure while a credit seat and a card seat could cost different amounts of the same booking. They still can — a mixed booking holds credit seats at 150 and card seats at the game's price — so the split is explicit rather than averaged. **Credit seats come off first**, which is a choice: the two are indistinguishable in the ledger, and this is the order that returns a spendable credit rather than a part-share of a card payment. It is also the only order under which the owner's acceptance holds — two guests added with credit, one removed, +150 back |
| 285 | **Rows 271 and 272 — CLOSED AS BUILT** | `CLOSED round-35`, by the owner. The partial refund stays unexpiring, and the cancel-guests control stays available to kickoff with the refund gated at eight hours, exactly as `cancel_booking` behaves. Both are now load-bearing rather than provisional, and the reasoning for each is in the migration beside the code it governs |
| 286 | **(R35-2) The admin undercounted every party ever booked** | `SHIPPED round-35`, and the owner's diagnosis was exactly right: it counted booking ROWS. **THREE sites, not the two he named** — `lib/admin/queries.ts::countActiveBookings` feeding `/admin/games` and the game page's `{booked}/{capacity}` readout between kick-off and price, and a query of its own in `lib/admin/dashboard.ts` feeding the `/admin` dashboard's `booked / capacity`. A booking with two guests read as 1 on all three while every player surface said 3, so the half of the product deciding whether to chase people was the half with the wrong number. House guests on the game were missed too — they are not booking rows at all |
| 287 | *How row 286 was fixed rather than patched.* **One counter, and the admin can reach it in bulk** | `SHIPPED round-35`. Not a second copy of the arithmetic in TypeScript: `public.game_seats_taken_many(uuid[])` WRAPS `game_seats_taken`, which stays the single definition of a taken seat and is what `create_booking` refuses against. A batch function because the admin list decorates every game on the page and a round trip per row is what the old query was avoiding. **Not `game_roster_public`**, which is what the player side counts — that view admits four PUBLIC statuses and the admin lists drafts and cancelled games too, so it would silently return zero for rows it was asked about, which is the same class of bug being fixed |
| 288 | **(R35-3) "X CZK left after" is removed, not converted** | `SHIPPED round-35`, the owner's word. It was a CZK preview of a credit balance sitting between Redeem credit and Pay online. Converting it to "2 credits left after" would have kept a running total nobody asked for between two buttons; the balance is on the account page, and this panel's job is to say what the guests cost. **The refusal beneath it stays**, because it is not a preview — it is the reason the button above it is disabled |
| 289 | *The law extension, and it is narrow on purpose.* **A credit amount never wears crowns** | `SHIPPED round-35`. A string is an offender only when it is ABOUT credit AND carries a money placeholder or unit — so "180 CZK" on a game stays, because a card price in crowns is the product working. The one string that legitimately does both is the top-up receipt: a bank transfer really does move crowns and the thing it becomes really is credits, and the `{credits}` placeholder is what tells the test so. **Two enforcements, like the wallet law**: a walk over every key in all four tables, and a rendered crawl of four credit-speaking pages that reads each LINE — because a number formatted by `formatCzk` beside a credit label is invisible to a table walk, neither half of it being a string in the table |
| 290 | *What the law extension caught.* **Two emails priced credit in crowns** | `SHIPPED round-35`. `topupReceipt` rendered three crown figures — received, credited and the new balance — where only the first is money that moved; the other two are what the player HOLDS and now read as credits. `passExpiring` said "You have {amount} of pass credit left", which is a credit balance wearing crowns exactly. **And it made a line redundant**: "Left: 3 credits" and "Roughly this many games: 3" are the same sentence twice once a credit IS a game, and the second says "roughly" about a number that is now exact. The games line is gone; the caller still computes it and the props still take it, so the cron route is unchanged |
| 291 | **Apply round 35's migration** | `BUILT-DORMANT-ON-the owner running it`. `20260915100000_credits_are_seats.sql` — applied twice against a clean local stack. **SELF-SUFFICIENT WITH RESPECT TO ROUND 34**: everything it needs from `20260914100000` is created here too, guarded, so applying 34 then 35 and applying 35 alone both end in the same place. It rewrites `create_booking_internal` and `add_guests_with_credit` IN PLACE — reading `pg_get_functiondef`, substituting the credit arithmetic, and raising if the text it expects is absent — so it edits production's functions rather than the repo's idea of them. **Until it lands the product prices credit by the game**, which is today's behaviour and is what rows 277 and 280 are about |
| 292 | *What the ruling cost the suites, counted.* **Four SQL suites and four e2e specs asserted the old arithmetic** | `SHIPPED round-35`. `booking_create`, `booking_cancel`, `booking_rpcs_b`, `game_pass`, `booking.spec`, `pass.spec` and `round24.spec`. **None was re-expected; each was reshaped to the state it exists to test** — two SQL suites and one e2e had to become parties of two, because "applied credit with money still owed" cannot occur on one seat any more. `round24`'s fixture found it in ONE line rather than in six tests, because round 29 made it assert its own precondition: "the fixture booking was paid outright — the wallet covers the game". That assertion is the reason this round cost an hour rather than a morning |
| 293 | **(R35v2-2, THE LEAD) The single-source audit — the price lived in FOUR places, and one of them was a CHECK constraint** | `SHIPPED round-35 v2`. The owner's instruction was one source and an audit for a second copy. There were three besides it. **`lib/pass/creditPrice.ts`** is the declared source and moved 150 → 180. **`public.credit_seat_price_czk()`** is the SQL authority and moved with it. **`TOPUP_PRESETS = [150, 300, 450]`** in `lib/payments/topup.ts` was one game, two, three, hard-coded — and **nothing imported it**, so it was both wrong and unused; deleted rather than derived. **`pass_tiers_credited_rule`** spelled 150 as a literal inside a CHECK, which is the worst place for one: it does not fail when the price moves, it fails the next time somebody inserts a tier, naming a constraint rather than a price. It now calls the function — legal because the function is IMMUTABLE, with the stated cost that Postgres does not re-validate existing rows, so a future move must update `pass_tiers` in the same migration. The seed's nine `priceCzk: 150` literals now derive from the constant |
| 294 | *The sweep the owner asked for.* **Nothing about 150 survives, and a test says so on every run** | `SHIPPED round-35 v2`. `lib/pass/__tests__/seatPrice.test.ts` scans `lib`, `app`, `components` and `scripts` with comments stripped, and fails on any line pairing `150` with a money word — which catches `priceCzk: 150`, `= 150` and `150 CZK` while leaving `PitchBackground`'s canvas radius alone. It walks all four string tables whole, because in copy any 150 is a price. **Comments are exempt and deliberately so**: the struck-through history in this codebase is how a later reader learns what the number used to be |
| 295 | **(R35v2-2) Every game reprices, and every wallet goes to zero** | `SHIPPED round-35 v2`, migration written and applied. `update public.games set price_czk = credit_seat_price_czk()` — no exceptions, published included, which is the point of doing it before launch: a dual-price world is two players on the same pitch owing different amounts because one booked on Tuesday. **The wallets go to zero by `delete from public.credit_ledger`** — every row, not an offsetting entry, because the simplest honest way to make a balance zero is for there to be no rows behind it. An offsetting entry would leave a ledger telling a story about money that never moved. **`bookings.credit_applied_czk` goes with it**, because that column is a CLAIM that ledger rows exist and leaving it set would make the admin's outstanding figure under-report by exactly the amount it claims was paid |
| 296 | *What the reset deliberately does not touch.* **`topups` rows survive their ledger entries** | `OPEN — informational; test data, named rather than hidden`. A confirmed top-up is a record that somebody said money arrived; its ledger row is gone, so the two now disagree and the admin shows a confirmed top-up that credited nothing. Inventing a reconciliation rule for it would be the ceremony the pre-launch ruling exists to avoid. Visible in the admin rather than silent |
| 297 | **Rows 244 and the ragged-wallet saga — CLOSED AS MOOTED** | `CLOSED round-35 v2`. There are no ragged balances left because there are no balances. The `adminWallet` remainder path stays in the code and keeps its unit test: it is right the first time somebody is granted an odd amount by hand, which is a thing an admin can still do |
| 298 | **(R35v2-3) The pass table, at the owner's prices** | `SHIPPED round-35 v2`. 5 = 840 · 8 = 1,296 · 12 = 1,879 · 15 = 2,241 · 20 = 2,772, with `credited_czk` the anchor at `games x 180` (900 / 1,440 / 2,160 / 2,700 / 3,600). **The percentages are NOT stored and must not be**: `PassTierCard` computes `(anchor − price) / anchor` and rounds, so the owner's five — 7, 10, 13, 17, 23 — are a CONSEQUENCE of the two numbers beside them. Storing them would be a fourth copy able to disagree with the price it describes. All five come out exactly: 6.67 rounds to 7, 10.0 to 10, 13.01 to 13, 17.0 to 17, 23.0 to 23. Asserted on the rendered page, separators stripped, because a grouped "1,296" is the locale's punctuation rather than the price |
| 299 | **(R35v2-5, AND IT WAS MINE) The admin counts read ZERO, and I shipped it** | `SHIPPED round-35 v2`. The owner reported the count as "entirely stale — updates on NEITHER bookings NOR guests". It was not stale: it was **zero**. Round 35 v1 routed all three admin counts through `game_seats_taken_many`, a new RPC created by a migration the owner had not yet applied — and the error path returned an EMPTY MAP, which reads as zero everywhere it lands. Deployed hours before the report. **Same family as the missing-GRANT trap CLAUDE.md records**: a read that comes back empty looks like missing data rather than a missing function. It now falls back to `game_seats_taken`'s arithmetic over one query rather than to nothing — a second copy that is stated, scoped and deletable once the migration is everywhere |
| 300 | *The original half of item 5, which stands.* **Three admin sites counted booking ROWS** | `SHIPPED round-35 v2`. `countActiveBookings` fed `/admin/games` and the game page's `{booked}/{capacity}` between kick-off and price; `lib/admin/dashboard.ts` had a query of its own for the `/admin` dashboard. A party of three read as 1 and the game's own house guests were not rows at all. All three now go through one exported `countSeatsTaken`, so the dashboard cannot drift from the list again |
| 301 | **(R35v2-4) Delete cancelled game — what the button did before** | `SHIPPED round-35 v2`. **Nothing, with a message telling you to do the thing you had already done.** `admin_delete_game` counted EVERY booking row regardless of status and refused if there were any, with the detail "cancel the game first" — and `cancel_game` CANCELS bookings rather than removing them, so the count was unchanged afterwards. The refusal's own advice could not work; the only reachable delete was on a game nobody had ever booked. The guard now counts `reserved`/`confirmed`, which is the status test every other seat count in this schema already uses |
| 302 | *What the conformance suite caught in my first fix.* **The delete did not need to touch bookings at all** | `SHIPPED round-35 v2`. The first version also deleted the cancelled rows by hand — and `v13_conformance/rpc.sql` failed with **"no function anywhere hard-deletes a booking"**, which is a v1.3 rule asserted by scanning `prosrc`. It would have been the first violation of it in the schema, to do something the database was already doing: **every foreign key pointing at `games` already cascades**, and `credit_ledger.booking_id` is SET NULL so refunds outlive the game. The extra half was deleted and the verification now asserts its ABSENCE |
| 303 | **(R35v2-6) Every country has a flag, in a circle — row 212 closes** | `SHIPPED round-35 v2`. `country-flag-icons` ships 267; the signup list is 197; **the intersection is the whole list, so there are no flagless edge entries at all**. 111 KB of SVG copied into `public/flags/3x2` by `scripts/sync-flags.mjs`, served as `<img>` rather than bundled — 197 React components would be 111 KB on every page to draw one flag. The circle is the game box's construction, deliberately identical: `overflow-hidden` + `rounded-full` on a fixed box, `object-cover`, and the `ring-ink/70` hairline that round 19 found necessary because `hairline-strong` vanishes on the white band of the Czech and Russian flags. Sizes pinned at 18px (profile) and 14px (compact), and the spec asserts the shape by measuring — a square box whose radius is at least half its width — rather than by reading a class name |
| 304 | **(R35v2-8) Ban profile — row 11 wakes** | `SHIPPED round-35 v2`, migration written and applied. Three things in one transaction, because a ban that blocks the account but leaves the seats is a half-ban that reads as a bug. **(a)** `players.banned_at`, enforced at `current_player_id()` — the chokepoint every state transition already goes through, so "cannot act" needed no new check in forty functions. **(b)** `banned_phones`, its own table keyed on the number because the ban must outlive the row: re-registering makes a NEW player. RLS with no policy, so no client can read it; `is_phone_banned` answers a boolean rather than handing back the list. **(c)** future bookings cancelled, seats released, the SAME `spot_released` event so the same waitlist machinery fires. Past games keep their roster. Credits freeze: nothing refunded, nothing confiscated. An admin cannot be banned |
| 305 | *The half of the ban that is not an undo.* **Unban restores access and frees the number; the cancellations stay** | `SHIPPED round-35 v2`. The owner's ruling and the only honest option: those seats were released, the waitlist was told, and somebody else may be sitting in them. Both directions are idempotent and both are event-logged |
| 306 | **(R35v2-9) The admin players list shows faces** | `SHIPPED round-35 v2`. The detail page has shown the avatar since Phase 7; the list showed initials for everybody, so the one surface an organizer scans to find somebody was the one that made them all look alike. Same 44px tile, same volt hairline, same initials underneath as the fallback — `overflow-hidden` doing the clipping and `avatarUrl` composing the address, because a second way of building it is a second thing to get wrong |
| 307 | *What the reprice cost the suites, counted.* **Eight SQL suites and four e2e specs moved with the rate** | `SHIPPED round-35 v2`. `booking_create`, `booking_cancel`, `booking_rpcs_b`, `game_pass`, `add_guests_after_booking`, `credits_are_seats`, `ledger_invariant` and two conformance files; `booking.spec`, `pass.spec`, `round24.spec` and `round35.spec`. **The `credits_are_seats` fixture moved from 180 to 200**, because at 180 the credit rate and the game price would be the same number — the coincidence that suite exists to rule out. And `v13_conformance/schema_b` had a guard against a VACUOUS assertion which the wallet reset made vacuous itself; it now creates its own row, which is the lesson it was written to teach |
| 308 | **Apply round 35 v2's migrations** | `APPLIED BY ME on the owner's one-time overnight authorization` — see §6 for the order and the verification. `20260915100000_credits_are_seats`, `20260916100000_price_180_clean_slate`, `20260916110000_delete_cancelled_game`, `20260916120000_ban_profile`. The Oliver-applies rule stands for every future round |
| 309 | **(R35v5-2, THE LEAD) The single-source audit — the price is no longer a NUMBER, so a copy of it cannot exist** | `SHIPPED round-35 v5`. Round 35 v2 audited a FLAT price and found it in four places, one of them inside a CHECK constraint. This round removes the category: **the price is a FUNCTION of the duration**, so there is nothing constant left to copy. `public.price_for_duration()` is the authority and `lib/games/price.ts` mirrors it. The stray assumptions the audit found this time were all of the same shape — a number standing in for a decision: the admin form PREFILLED the credit nominal as the price and let an organizer type over it, `scripts/fixtures.ts` set every seeded game to it, and `admin_create_game_v2` / `admin_update_game` stored whatever the caller sent. **All three now derive**, and the form's price field is read-only |
| 310 | *The distinction the round turns on.* **The credit nominal and the 90-minute price are the same number and must not become the same constant** | `SHIPPED round-35 v5`. `credit_seat_price_czk()` is 180 because that is what a credit is worth in the ledger; `price_for_duration(90)` is 180 because that is what ninety minutes costs a card. They agree today. Keeping them as one constant would make the day they diverge a silent data change rather than a decision — so they are two functions, and `lib/games/__tests__/price.test.ts` asserts the coincidence DELIBERATELY, which is what makes it visible when it ends |
| 311 | **(R35v5-2) Every game reprices per its length, and NULL is sixty** | `SHIPPED round-35 v5`. Production held 51 games at a flat 180 and two at 150. Nineteen carry no duration at all: they render as the standard length, so they are priced as one. **Reading null as "unknown, charge the higher price" would have billed nineteen historical games for time nobody booked** |
| 312 | *The flag item 2 asked for.* **One 120-minute game exists, and it is priced at 180 pending a ruling** | `OPEN — Oliver's ruling`. Exactly one: `c8543c80…`, Praha 5 • Smíchov, **settled**, 2026-08-27. `price_for_duration` returns the 90-minute price for anything that is not 60, which is a pre-pick rather than an invented tier — it costs nothing today because the only such game is in the past and paid for. A second one appearing is the moment this needs an answer |
| 313 | **(R35v5-1) A credit buys a 90-minute seat, and a 60-minute game is online-only** | `SHIPPED round-35 v5`. `credit_seat_minutes()` is 90. `create_booking_internal` applies credit only at that length — a shorter game applies nothing and comes back owing its whole price, so the only rail left is the online one. `add_guests_with_credit` refuses by name, `GAME_NOT_CREDIT_ELIGIBLE`, because that path IS the rail: the player pressed the credit button and deserves the reason. **Neither control renders on a short game** — not disabled with an explanation, NOT RENDERED, because a greyed-out credit button asks "why can I not use my credits" on a screen with no room to answer. The sentence that answers it is on `/pass`, above the prices, where somebody is deciding to buy |
| 314 | *What item 1 created that the product had never had.* **A game with no way to pay for a guest** | `SHIPPED round-35 v5`. The add-guests panel assumed at least one rail was always available. On a 60-minute game with the online rail unconfigured it rendered its heading, its picker and its price with **no button under them** — a control that asks a question it cannot act on. It now renders only when a rail exists; on production that is always the online one, so the visible effect is nil and the dead state is gone |
| 315 | *Where the fixtures had to move with the ruling.* **A fixture with no duration is a 60-minute game, and takes no credit** | `SHIPPED round-35 v5`. Six SQL suites and the seed asserted credit behaviour on games that carried no duration — which under item 1 take no credit at all. The scaffold now defaults to the credit's own length so the rest of the suite keeps testing what it was written to test, and a spec that wants the short game asks for it. **The seed's own acceptance check caught this in one line**: "expected a derived credit/confirmed booking, got qr/reserved" |
| 316 | *Found by installing pgTAP.* **Two conformance scans were reading an extension's functions as ours** | `SHIPPED round-35 v5`. `create extension pgtap` puts several hundred helpers into `public`, and `v13_conformance/security.sql` began reporting every one of them — "no SECURITY INVOKER function writes state" listed the whole of pgTAP. The assertions are about code we wrote; `pg_depend` tells them apart by extension ownership, which is more honest than a name list that goes stale the first time pgTAP adds a helper. **The scans were only ever correct by accident of where the extension happened to live** |
| 317 | **(R35v5-3) The pass table — unchanged from v2 and re-verified** | `SHIPPED round-35 v2, verified round-35 v5`. 5 = 840 · 8 = 1,296 · 12 = 1,879 · 15 = 2,241 · 20 = 2,772, anchored at `games x 180`. The percentages are computed from the two numbers beside them and are not stored. `/pass` renders all five prices and all five discounts on production |
| 318 | **Apply round 35 v5's migration** | `APPLIED BY ME on the owner's one-time overnight authorization` — `20260917100000_duration_pricing.sql`. The Oliver-applies rule stands for every future round |

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

**Everything here was re-verified on 2026-09-06, not copied forward** — each
migration probed for the OBJECT it creates rather than for a filename, because
a filename proves only that the repo has it. Row 64 came off this list as a
result (`create_booking` is at six arguments on production); rows 48 and 57 came
off on 2026-08-20. **Rows 187 and 194 came off on 2026-09-06** — both were
recorded as blocked and both had already come true, which is the whole reason
this section is re-probed rather than copied. What follows is what is genuinely
still owed.

### Round 13's three migrations

**None is required for the deployed code to be SAFE** — that was checked before
shipping, and it is why round 13 deployed ahead of them. Each one enables a
surface that currently degrades rather than breaks:

| Migration | Until it runs |
|---|---|
| `20260821210000_pass_via_stripe` | The pass buy action 404s on `begin_pass_purchase` — unreachable anyway while row 33 is unset, because every tier says "Coming soon". The WEBHOOK also needs it: `confirm_online_purchase` is what the route now calls |
| `20260821220000_contact_settings` | The admin Contact form fails with SETTING_KEY_UNKNOWN. The footer dialog still works, on the built-in address |
| `20260821230000_venue_management` | `/admin/venues` renders and its photo and amenity controls work; only Save (rename / map link / pitch name) fails |

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260821210000_pass_via_stripe.sql --production
node scripts/apply-migration.mjs \
  supabase/migrations/20260821220000_contact_settings.sql --production
node scripts/apply-migration.mjs \
  supabase/migrations/20260821230000_venue_management.sql --production
```

**IN THAT ORDER**, though only the first matters: the webhook's dispatcher must
exist before `STRIPE_WEBHOOK_SECRET` is set, or the first real payment reaches
a route that cannot settle it.

### Round 14's migration (row 105)

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260821240000_public_player_profile.sql --production
```

Additive and independent of the three above — one composite type, one
`SECURITY DEFINER` function, one grant. It reads nothing the product does not
already show on a roster.

**Until it runs, `/player/<nickname>` answers 404 for everyone.** The roster
avatars are already links in the deployed code, so this is the one migration on
this page whose absence is VISIBLE to players rather than to the owner: a tap
that lands on a not-found page. It degrades rather than breaks — nothing that
takes money or a seat is involved — but it degrades in public.

The function excludes rows with a null `auth_user_id`, which is how guests and
old shadow players stay unreachable, and it is keyed by **nickname** so the
public roster view never has to carry a player id.

### ~~One migration, and it must land BEFORE the next deploy~~ (round 12, applied)

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260821200000_online_payment_pending.sql --production
```

The deployed code calls `create_booking` with `p_online`, and production's
five-argument version does not accept it — **booking breaks if the code ships
first**. Additive otherwise: four nullable columns, two indexes, two functions,
two RPCs, and a rewrite of `game_roster_public` and `game_seats_taken` to route
their filter through `booking_holds_seat`. No row changes. Rollback is
`supabase/rollback/20260821200000_online_payment_pending_down.sql`.

The `--production` flag is deliberate and cannot be replaced by an environment
variable — see CLAUDE.md on why implicitness is what failed.

### Round 35 v5's migration (row 318) — APPLIED BY ME, one-time authorization

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260917100000_duration_pricing.sql --production
```

One file, and it is the last of the round-35 sequence. It creates
`price_for_duration()` and `credit_seat_minutes()`, reprices every game per its
length, makes both game writers derive the price, and stops `create_booking`
and `add_guests_with_credit` applying credit to a game that is not 90 minutes.

| Before it runs | After it runs |
|---|---|
| Every game costs 180, whatever its length | 60 minutes is 150, 90 is 180, from one mapping |
| A caller's price is stored as sent | The length decides, and the form's field is read-only |
| A credit buys any game | A credit buys a 90-minute seat; shorter games are online-only |

**IT REWRITES FOUR FUNCTION BODIES IN PLACE** — `admin_create_game_v2`,
`admin_update_game`, `create_booking_internal` and `add_guests_with_credit` —
reading `pg_get_functiondef`, substituting one statement each, and **raising
rather than overwriting** if the text it expects is absent.

### Round 35 v2's migrations (row 308) — APPLIED BY ME, on a one-time authorization

**The owner delegated this round's applies once, explicitly, after the deploy
was Ready. The Oliver-applies rule stands for every future round.** In date
order, each verified by its objects after applying:

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260915100000_credits_are_seats.sql --production
node scripts/apply-migration.mjs \
  supabase/migrations/20260916100000_price_180_clean_slate.sql --production
node scripts/apply-migration.mjs \
  supabase/migrations/20260916110000_delete_cancelled_game.sql --production
node scripts/apply-migration.mjs \
  supabase/migrations/20260916120000_ban_profile.sql --production
```

**THE ORDER IS NOT OPTIONAL HERE**, and round 33's trap is the reason it is
stated: `20260916100000` moves `credit_seat_price_czk()` to 180 and
`20260915100000` CREATES it at 150. Applied the other way round the price would
silently go back. Every file restates `app_capabilities()` with probes rather
than assertions, so a partial state is safe to sit in — but a wrong ORDER is
not, which is why each one is verified before the next is run.

| Migration | What it does |
|---|---|
| `credits_are_seats` | A credit buys a seat, flat. Rewrites the credit arithmetic in `create_booking_internal` and `add_guests_with_credit` IN PLACE, raising if the text it expects is absent |
| `price_180_clean_slate` | 180 everywhere, the five pass tiers, every wallet to zero, and the tier CHECK stops spelling the price as a literal |
| `delete_cancelled_game` | The delete guard counts held seats instead of every booking row |
| `ban_profile` | `players.banned_at`, `banned_phones`, the signup refusal, `ban_player` / `unban_player` |

**WHAT THE CLEAN SLATE DOES TO DATA, in one line each:** every game's
`price_czk` becomes 180; every `credit_ledger` row is deleted; every
`bookings.credit_applied_czk` becomes 0. Nothing else is touched — `topups`
rows survive their ledger entries and now disagree with them, which is row 296.

### Round 35's migration (row 291) — the credits ruling

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260915100000_credits_are_seats.sql --production
```

**Safe in either order against round 34's, and safe WITHOUT it.** Everything it
needs from `20260914100000` is created here too, guarded. Applied twice against
a clean local stack; the second run raises nothing and changes nothing.

| Before it runs | After it runs |
|---|---|
| A seat paid by credit costs whatever the game costs a card — 180 or 200 on 14 of the 46 games | A seat costs one credit, flat |
| A sub-credit balance is applied as a part-payment | It buys nothing, and stays in the wallet |
| Three admin surfaces count booking rows | They count seats, through `game_seats_taken` |

**IT REWRITES TWO FUNCTION BODIES IN PLACE.** It does not paste
`create_booking_internal`'s 203 lines over production; it reads
`pg_get_functiondef`, substitutes the credit arithmetic, and **raises and
changes nothing** if the text it expects is absent — so a production copy that
has drifted gets a refusal rather than a silent overwrite.

**WHAT IT COSTS THREE PLAYERS, and it is not hidden.** A balance that is not a
whole number of credits can no longer be part-applied: one wallet holding 50
CZK, and two holding a 110 CZK remainder each. **270 CZK becomes inert.** See
row 283 — topping them up to the next whole credit is a grant and it is your
call.

### Round 34's migration (row 275) — additive, safe to be late

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260914100000_cancel_guests.sql --production
```

**Not deploy-first, and safe in either order against round 33's two.** Applied
twice against a clean local stack; the second run changes nothing.

| Before it runs | After it runs |
|---|---|
| No cancel-guests panel anywhere — `cancelGuests` is false and the control does not render | A player with guests on their booking can take some or all of them off |
| A settled add-guests checkout returns to the GAME PAGE, which is today's behaviour | Both add-guest rails end on the confirmation, saying "+2 guests confirmed" |

**IT DROPS AND RE-ADDS `events_event_type_catalog`** — pre-approved
(CLAUDE.md, 2026-08-01) while the new list is a strict superset. It is: one
addition, `booking_guests_removed`.

**IT ALSO DROPS AND RECREATES `checkout_outcome`**, because the return type
gains a column and `create or replace` cannot change a return type. Both
callers moved with it in the same change.

**AND IT CHANGES HOW `app_capabilities()` ANSWERS.** Flags for objects this
migration does not itself create are now EXISTENCE PROBES rather than hardcoded
`true` — see row 274. The practical effect for you: applying this one while
round 33's are still outstanding is safe, because `playerNumbers`,
`adminRenamePlayer` and `partyUpToThirteen` will each report what is actually
in the database rather than what the newest file hoped for.

### ~~Round 33's two migrations (row 258)~~ — APPLIED, verified 2026-09-14

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260913110000_player_number_and_rename.sql --production
node scripts/apply-migration.mjs \
  supabase/migrations/20260913120000_party_up_to_thirteen.sql --production
```

**Neither is deploy-first and the order does not matter.** Both were applied and
then applied AGAIN against a clean local stack, because both do something a
second run could get wrong: the first sets a sequence, the second rewrites two
function bodies. The sequence's `setval` is guarded so it can never move
backward — a rolled-back insert consumes a value without leaving a row, so a
naive `max + 1` on a second run would hand the next signup a number an earlier
one already had, and "never reused" has to survive the file being applied twice.
The second raises `notice … already reads the function` and changes nothing.

| Migration | Before it runs | After it runs |
|---|---|---|
| `player_number_and_rename` | The player page shows no Change-name control and no number; the admin list shows no number. Today's behaviour | Both appear, and every existing player is numbered in signup order |
| `party_up_to_thirteen` | The party picker is `+1/+2/+3` and no fourth control — exactly the old product | The dropdown appears, offering `+4`…`+13`, capped by the free seats |

**No deploy is needed after either.** Each surface asks the database what it can
do rather than being told by a build.

**THE FIRST ONE DROPS AND RE-ADDS `events_event_type_catalog`**, pre-approved
(CLAUDE.md, 2026-08-01) while the new list is a strict superset — it is: one
addition, `player_renamed`, nothing removed.

**THE SECOND ONE REWRITES TWO FUNCTION BODIES IN PLACE**, and it is worth
knowing how before you run it. It does not paste 240 lines of plpgsql over
production; it reads `pg_get_functiondef` for `create_booking_internal` and
`can_add_guests`, replaces exactly one token in each with a call to the new
`public.max_party_guests()`, and re-creates them. If the token it expects is not
there it **raises and changes nothing** — so if production's copy of either has
drifted from the repo, you get a refusal rather than a silent overwrite.
`prosrc` keeps comments, so the round trip loses none of them.

**Both carry shape-only verification.** Nothing is written, no booking is made
and no player is renamed. The behaviour is drilled in
`supabase/tests/admin_rename_player.sql`, `player_number.sql` and
`party_size.sql`, which `run.mjs` wraps in `begin; … rollback;`.

### ~~Round 31's migration (row 241)~~ — APPLIED, verified 2026-09-13

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260913100000_venue_map_url.sql --production
```

Adds `venues.map_url`, moves the two venues whose `map_query` holds a raw share
URL into it, and adds the CHECK that stops a third. **Until it runs, those two
venues keep showing a URL as their address line and searching Maps for it as
words** — which is the state they have been in since before round 30.

It also re-declares both venue writers with a trailing `p_map_url`, dropping
the old signatures first. That drop is the point: `create or replace` with an
extra parameter creates an OVERLOAD, and a three-argument call then fails as
ambiguous (row 240).

### ~~Round 30's migration (row 232)~~ — APPLIED, verified 2026-09-13

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260912100000_admin_remove_cover.sql --production
```

Without it the "Remove banner" button's RPC is absent and the control reports
the error rather than doing damage. Shape-only per the round-29 rule.

### ~~ROUNDS 27 AND 28 — FRESH COMMANDS (row 226)~~ — ALL FOUR APPLIED, verified 2026-09-12

**All four were rewritten on 2026-09-12** after the incident in row 223: their
verification blocks used to build fixtures and call writing RPCs, and
`apply-migration.mjs` commits. Two of them would have damaged live data. They
are shape-only now and re-validated end to end against a clean local stack.

Run them in this order:

```bash
# Round 27 — add guests after booking (additive, capability-gated, late-safe)
node scripts/apply-migration.mjs \
  supabase/migrations/20260907100000_add_guests_after_booking.sql --production

# Round 28 — the public profile's widened scope (additive, late-safe)
node scripts/apply-migration.mjs \
  supabase/migrations/20260909100000_public_profile_scope.sql --production

# Round 28 — credit_ledger.note + grant_credit restated (additive, late-safe)
node scripts/apply-migration.mjs \
  supabase/migrations/20260909110000_credit_ledger_note.sql --production

# Round 27 — the pending-machinery cleanup. LAST, and DEPLOY FIRST.
node scripts/apply-migration.mjs \
  supabase/migrations/20260907110000_pending_machinery_cleanup.sql --production
```

**The cleanup is last and is the only one with an ordering hazard.** It drops
`is_pending` from `game_roster_public`, and only code from round 27 onward has
stopped selecting that column. Production is already running it (`51b57bc`), so
the condition is met — but it stays last because it is the one that would empty
every lineup on the site if the deploy were ever rolled back beneath it.

The first three are additive and capability-gated: without them the add-guests
panel does not render, the public profile omits the three new fields, and the
remove-credit form reports the RPC's error. Nothing breaks.

**Each prints `TARGET <host>` before doing anything.** Check it says the
production pooler, then let it run.

### ~~Round 29's migration (row 221)~~ — APPLIED 2026-09-12

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260909120000_auto_settle.sql --production
```

**APPLYING IT IS THE BACKFILL.** It marks every past game `settled` as-is —
**35 games on production** — drops `settle_game`, and teaches the daily sweep
to close what it plays.

**The two halves want to land together**, which is unlike the last two rounds.
The deploy removes the settle button and reads the sweep's new return shape; the
migration removes the RPC that button called and changes that shape. Applying it
against the OLD deploy leaves a button whose function is gone. Deploying without
it leaves a route reading a shape from a function that still returns an integer.
Neither is dangerous — both are visible immediately and neither moves money —
but there is no reason to sit in either state.

**Afterwards, nothing about settling is manual.** A game kicks off, the nightly
sweep marks it played and closes it in the same run, and the only thing that can
hold one open is an unpaid `reserved` row — which under pay-first means somebody
made a booking by hand. When that happens the cron logs the game ids and the
admin game page lists the names.

**Row 184's cleanup is now OPTIONAL.** The eleven fossil holds survive as inert
rows on settled games and stay visible as money owed. Running
`docs/ops/round26-unsettleable-games.sql` tidies them; not running it changes no
number anybody reads.

### ~~Round 28's two migrations (row 215)~~ — both additive, both safe to be late

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260909100000_public_profile_scope.sql --production

node scripts/apply-migration.mjs \
  supabase/migrations/20260909110000_credit_ledger_note.sql --production
```

Order does not matter and neither is deploy-first. Without the first, the
public profile's country/position/level come back absent and the block renders
nothing — the page is exactly what it was. Without the second, the ledger keeps
its event-only memo and the new remove-credit form reports the RPC's error
rather than writing a row.

### Turn Link and Klarna off in Stripe (row 216)

Row 207 pinned the sessions this product creates to `card`. The ACCOUNT still
decides what is offered anywhere else, and a session created by any other path
re-inherits its defaults — so both halves, or the pinning is one deploy away
from being undone by a checkbox.

1. **Stripe dashboard → Settings → Payment methods** (make sure you are in
   **live** mode, not test — the toggle is per mode).
2. Find **Klarna** in the list and turn it **off**. If it shows as "on by
   default via automatic payment methods", turn that off for Klarna
   specifically rather than disabling automatic methods wholesale.
3. **Link has its own switch and is NOT in that list on every account.** Look
   under **Settings → Payment methods → Link**, or **Settings → Checkout and
   Payment Links → Link**. Turn it off there.
4. While you are in Payment methods, confirm **Cards** is on and **Apple Pay**
   and **Google Pay** show as enabled — those two are what give a phone its
   native wallet sheet, and they ride on cards rather than being separate
   choices at checkout.
5. **Check it on the next real payment**: the embedded form should show a card
   form and, on a phone, a wallet button. No "Pay later", no email prompt
   offering to save the card to Link.

### ~~Round 27's two migrations (row 203)~~ — AND THE ORDER IS NOT LAST ROUND'S

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260907100000_add_guests_after_booking.sql --production

node scripts/apply-migration.mjs \
  supabase/migrations/20260907110000_pending_machinery_cleanup.sql --production
```

**The first is capability-gated and can be late with no cost.** Until it runs,
`app_capabilities().addGuestsAfterBooking` is false, the panel does not render,
and a player books their party up front exactly as before. That is the OLD
SHAPE, not a broken one.

**The second is DEPLOY FIRST, THEN MIGRATE — the opposite of round 26's.** It
drops `is_pending` from `game_roster_public`, and only the code deployed this
round has stopped asking for that column. Running it against the PREVIOUS
deploy makes PostgREST error on both roster reads, and both call sites answer
an error with an empty list — so every lineup on the site would render empty,
silently. Round 26 handed this over as a script to paste; that is why it is a
migration now, and why it is last.

#### Then take one real payment — the drive, updated for the fixed flow

Row 196 fixed the outage that made this impossible. Nothing has yet been proven
by a payment: `checkout_sessions` holds two `open` rows and no `booked` one.

1. Sign in and open a published game with a free spot. Claim a spot → **Online
   payment**. Add a guest if you want the party math tested.
2. You land on `/payment/checkout?game=…&guests=…` — **our page shell with
   Stripe's form embedded; the URL never leaves our domain.** The line reads
   the venue, the seats, and **price × (1 + guests)**. There is no editable
   quantity, and no sentence telling you to change one.
3. **Before paying, open the game page in another tab.** Your name is NOT on
   the lineup and the spots-left count has NOT dropped. That is the whole of
   pay-first in one observation.
4. Pay. Stripe returns you to `/payment/return`, which polls briefly and then
   forwards you to **"Booking confirmed"** on a booking id that did not exist
   before you paid — the webhook created it.
5. Back on the game page: your name on the lineup, the count down, and — once
   row 203's first migration is applied — an **Add guests** panel between the
   lineup and the share box. Pick `+1`, pay from the wallet, and the guest
   appears as "<your name>'s Guest 1" with the count down by one more.

What proves it rather than looks like it:

```sql
select kind, status, count(*) from public.checkout_sessions group by 1, 2;
```

One `booking`/`booked` row from step 4, and if you did step 5 online, one
`add_guests`/`booked`. The register is otherwise empty, so anything there is
from this drive.

**If it stalls on "confirming":** the webhook did not land. Redeliver
`checkout.session.completed` from the Stripe dashboard. The money is never
lost — it is in Stripe, and redelivery settles it.

**Row 188 stays staged until this drive reports confirmed.** Retiring the link
flow is the round AFTER a real payment has gone through embedded, in the
owner's own order: verify, then remove `NEXT_PUBLIC_STRIPE_PAYMENT_URL` and
`NEXT_PUBLIC_STRIPE_PASS_URLS`, then delete `lib/payments/stripeLinks.ts` and
the six Payment Links.

### ~~Round 26's migration (row 194)~~ — APPLIED, and the deploy is live

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260906100000_pay_first_booking.sql --production
```

**DONE — verified 2026-09-06 by probing the objects**, not the filename:
`checkout_sessions` plus all six checkout RPCs exist and `app_capabilities()`
reports `payFirstCheckout: true`. Production runs `3470e7b`, so **the two
halves agree** and the gap described below never stayed open.

~~**APPLY THIS PROMPTLY AFTER THE DEPLOY.** It is the one migration this
project has produced where the two halves should not sit apart for long — not
because anything breaks, but because the shapes disagree: before it runs,
choosing "Online payment" opens a checkout that cannot be registered and the
webhook falls through to `confirm_online_purchase` looking for a booking that
pay-first never created, so an online payment arrives with nothing to settle
and lands in the logs as `unknown`.~~ Kept struck rather than deleted because
it is the shape of the risk if this migration is ever rolled back ahead of a
deploy.

**WHAT IS STILL OWED IS THE PAYMENT, NOT THE MIGRATION.** `checkout_sessions`
is empty — pay-first, active expiry and the credit fallback have never run
against live Stripe. **Take one real payment as the check** (row 187), and
expect: our own page shell around Stripe's form, NO roster row and NO decrement
of the spot count before paying, then "Booking confirmed" on a booking the
webhook created, and exactly one `checkout_sessions` row at status `booked`.

#### ~~Then the cleanup, when you are ready — not urgent~~ — IT IS A MIGRATION NOW

~~`psql "$SUPABASE_DB_URL" -f docs/ops/round26-schema-cleanup.sql`~~ — the
script is deleted. It was never safe to paste: the deployed code still selected
the column it drops (row 204). It ships as `20260907110000` above, paired with
the code that stopped asking. It still **keeps** `payment_pending_at` and
`online_payment_window()`, for the reasons stated in the migration.

### ~~Round 25's migration (row 186)~~ — APPLIED by the owner

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260905100000_pending_seat_is_anonymous.sql --production
```

**THIS IS THE ONE WHERE BEING LATE HAS A LIVE COST.** Nothing breaks without
it — the deployed code selects `is_pending` and reads its absence as false —
but until it runs, a player who opens the payment page and closes the tab is
published by name on the public roster for thirty minutes, and every abandoned
checkout adds another `reserved` row that blocks its game from ever settling.

### ~~Round 25's two Stripe keys (row 187)~~ — SET by the owner

**Steps 1–3 are DONE**, found in `vercel env ls production` on 2026-09-06 and
created twenty hours earlier. Step 4, the branding, is the owner's taste and is
not probeable from here — it is kept below with the steps, which stay for the
record and for whoever rotates a key.

~~**Both, or neither.** `embeddedCheckoutEnabled()` requires the pair; until
then the Payment Link flow keeps working exactly as it does today.~~

1. **Stripe dashboard → Developers → API keys.** Copy the **Secret key**
   (`sk_live_…`) and the **Publishable key** (`pk_live_…`). Live mode, not test
   — the pass rail already took a real payment on live keys.
2. **Vercel → Settings → Environment Variables → Production:**
   - `STRIPE_SECRET_KEY` = `sk_live_…` — server-only, **never** prefixed
     `NEXT_PUBLIC_`. It can create charges.
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_…` — this one is meant to
     be in the browser.
3. **Redeploy.** Both are read at request time, but `NEXT_PUBLIC_` values are
   inlined at BUILD time, so the publishable key needs a new build to appear.
4. **Stripe dashboard → Settings → Branding.** This is the only control over
   what the embedded form looks like inside its frame:
   - **Brand colour** — set it to the volt `#C8FF00` if you want the buttons to
     match; the contrast against white is poor, so `#0F0F0F` on the button with
     volt as the accent reads better.
   - **Logo** and **icon** — the roundel.
   - **Font** — one of Stripe's list; Onest is not on it.

**WHAT STRIPE'S BRANDING DOES NOT ALLOW, stated plainly because somebody will
try:** the form is an iframe and no CSS of ours crosses that boundary. There is
no dark theme for Checkout and no `appearance` object (that is Payment Element,
a different product). **The fields will be on white.** The page around it — the
shell, the heading, the amount in our own display face, the volt-hairline panel
— is entirely ours, and that is the whole of what embedding buys: the player
does not leave, and the amount is ours to compute.

### ~~Round 24's two migrations (rows 174 and 175)~~ — APPLIED by the owner

Verified 2026-09-05 by probing the objects: all three functions exist, all
three capability flags read true, and the played sweep has cleared the entire
backlog — **zero kicked-off-but-published games remain**, where 28 sat a week
ago. The hand-run backfill was never needed, exactly as the round-24 note said.

~~**Neither is required for the deployed code to be safe**, which was checked
rather than assumed: `app_capabilities()` reports both features as absent until
they land, the cron route answers `available: false` instead of throwing, and
the bell falls back to the stored title and body.

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260901100000_advance_played_games.sql --production

node scripts/apply-migration.mjs \
  supabase/migrations/20260901110000_player_notifications.sql --production
```

Order does not matter; each restates `app_capabilities()` in full and derives
the other's flag by looking for its function, so applying either one alone
cannot switch the other off.

#### The one-time backfill — 28 stale games

**IT IS NOT ACTUALLY NEEDED, and that is worth saying before the SQL.** The
hourly sweep catches every kicked-off game on its next run, so applying the
migration above IS the backfill, about forty minutes later at worst.

Run this to do it deliberately instead of discovering it:

```sql
-- What is about to change, first. 28 rows on 2026-09-01, oldest 2026-08-02.
select id, venue, starts_at, status
  from public.games
 where status in ('published', 'full')
   and starts_at + make_interval(mins => coalesce(duration_minutes, 60))
                 + make_interval(mins => 120) < now()
 order by starts_at;

-- Then advance them, through the same function the cron calls.
select public.advance_played_games(120);
```

**BEFORE RUNNING IT, KNOW WHAT CLOSES.** `cancel_game` accepts only
`draft`/`published`/`full`, so bulk-cancelling one of these games and crediting
everyone on it stops being possible the moment it advances (row 176). The
per-player remedy stays: `admin_remove_booking` credits a confirmed booking and
has no game-status gate.

### Round 23's migration (row 169) — PLAYERS MET

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260830100000_players_met.sql --production
```

Validated against local inside a transaction and rolled back. Additive: one
function, one composite column, one capability flag. It drops and recreates
`public_player_profile` — a composite type cannot grow an attribute while a
function's return type depends on it — and the body is restated in full rather
than patched.

**NOTHING BREAKS BEFORE IT RUNS, which was checked rather than assumed.**
`app_capabilities()` has no `playersMet` key, so the flag reads false, the RPC
is never called, and both profiles render "pitches played" exactly as today.
`thirdStat` is unit-tested on that path specifically, because it is the one the
E2E suite cannot reach — the local database has the function applied.

| Before it runs | After it runs |
|---|---|
| Both profiles show "pitches played" as the third tile | Both show "players met" |
| `public_player_profile` returns six columns | Seven |

**No deploy is needed afterwards.** The surface asks the database what it can
do rather than being told by a build.~~

**AND IT WILL READ ZERO FOR EVERYONE UNTIL ROW 165 IS DEALT WITH.** 25 games
have kicked off and are still `published`; nothing marks a game played
automatically, so no player has met anybody as far as the database is
concerned. The migration is correct and the number will be honest — it will
just be zero, and that is worth knowing before applying it rather than after.

### ~~Round 19's migration (row 141)~~ — APPLIED by the owner 2026-08-27

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260826200000_organizer_telegram_handle.sql --production
```

Validated against local inside a transaction and rolled back. Additive except
for one deliberate drop — see below.

**IT DROPS THE THREE-ARGUMENT `set_game_organizer`.** That is not tidying:
`admin_create_game_v2` calls it internally, and leaving both overloads would
make that call ambiguous to Postgres — two candidates differing only by a
defaulted fourth argument. Dropping it binds the existing call to the new
function with the handle defaulting to null, which is exactly the behaviour it
had.

| Before it runs | After it runs |
|---|---|
| No Telegram username field; every UA/RU game shows WhatsApp — today's behaviour | The field appears, and a game whose organizer has a handle offers Telegram |

**No deploy is needed afterwards.**

### ~~Round 18's migration (rows 136 and 137)~~ — APPLIED, found 2026-08-27

**THE OWNER APPLIED IT AND DID NOT REPORT IT**, which is precisely the case
this list's re-verification rule exists for — round 20 probed instead of
echoing and found the row had come true. Evidence, three ways: `games.language`
exists; `public.app_capabilities()` **evaluated on production returns
`gameLanguage: true`**, and since this migration ships its own replacement of
that function the flag cannot read true without it; and `games_format_format`
now reads the four-group pattern.

```bash
# ~~node scripts/apply-migration.mjs \
#   supabase/migrations/20260826100000_game_language.sql --production~~
```

Validated against local inside a transaction and rolled back. Additive: one
column with a default, one widened CHECK, one function, one capability flag.

**IT CARRIES A BUG FIX, not only a feature.** Production's
`games_format_format` has been `^[0-9]{1,2}v[0-9]{1,2}$` since the beginning —
`20260802180000_format_three_way` was never applied there — so every `6v6v6` an
organizer has typed since August 2nd was REFUSED by the database. That is the
whole of why the owner sees non-standard formats "not updating". This migration
catches production up and widens to four groups in one statement.

| Before it runs | After it runs |
|---|---|
| The language dropdown is not rendered; every card shows `en-cs` flags | The dropdown appears and the pill follows the game |
| `6v6v6` and `7v7v7v7` are rejected on save | Both save and render |

**No deploy is needed afterwards.** The surface asks the database what it can
do rather than being told by a build.

### ~~Round 16's three migrations (rows 117, 118, 119)~~ — APPLIED 2026-08-25

**Run them in this order.** Nothing depends on the order except your reading of
the output, but the third is the one whose verification prints a summary worth
seeing:

```bash
node scripts/apply-migration.mjs \
  supabase/migrations/20260823100000_players_updated_at.sql --production
node scripts/apply-migration.mjs \
  supabase/migrations/20260823110000_policy_v3_eight_hours.sql --production
node scripts/apply-migration.mjs \
  supabase/migrations/20260823120000_round16_actions.sql --production
```

All three are validated against local inside a transaction and rolled back, and
all three are additive. **The deployed code already tolerates each one being
absent**, which is not a claim but a shape:

| Migration | Before it runs | After it runs |
|---|---|---|
| `players_updated_at` | A replaced photo shows the old one to everyone but the uploader — today's behaviour | Every photo URL moves with its bytes |
| `policy_v3_eight_hours` | The product says 10 hours and enforces 10 — consistent, because the UI reads the enforced number | It says 8 and enforces 8 |
| `round16_actions` | Leave-waitlist, Clear all, Remove player, both deletes and cancel-with-a-reason are HIDDEN | They appear, with no deploy |

**No deploy is needed after any of them.** That is deliberate: each surface
asks the database what it can do rather than being told by a build.

**THE THIRD ONE DROPS AND RE-ADDS `events_event_type_catalog`**, which is
pre-approved (CLAUDE.md, 2026-08-01) while the new list is a strict superset —
it is: four additions, nothing removed. Its verification INSERTS one row of
each new type and rolls it back, because a CHECK that lists a value and a CHECK
that accepts it are not the same thing when the list was retyped by hand.

### The return URL, six links (row 108)

**One URL, pasted six times.** In Stripe, each Payment Link → *After payment*
→ **Redirect customers to your website**:

```
https://hrajfotbalek-wlya.vercel.app/payment/return
```

The six are the per-game booking link and one per pass tier — `5`, `8`, `12`,
`15`, `20`, which is what `pass_tiers` actually holds (§7 has the corrected
template).

**NOTHING BREAKS WITHOUT IT.** The webhook is what settles a payment, and it
is a different path entirely; a player who is not redirected still gets their
booking or their credits. What they lose is being TOLD — they end on Stripe's
own receipt page and have to navigate back themselves. So this is a
completeness step, not a blocking one.

**It is the same URL for every link.** The page works out what was bought
without being told, which is the whole of round 15 item 1 — there is no
per-link URL to get wrong, and no query parameter to append.

### The Stripe webhook, four steps (row 65)

1. **Stripe → Developers → Webhooks → Add endpoint**, with the URL
   `https://hrajfotbalek-wlya.vercel.app/api/stripe/webhook`
2. Subscribe it to **`checkout.session.completed`** and nothing else. The route
   answers 200 and ignores any other type, so extra subscriptions are noise
   rather than damage — but each one is a delivery to pay attention to.
3. **Copy the signing secret** (`whsec_…`) from that endpoint's page.
4. **Vercel → Settings → Environment Variables → Production**, add
   `STRIPE_WEBHOOK_SECRET` with that value. **Server-side — do NOT prefix it
   with `NEXT_PUBLIC_`**, which would inline the signing secret into the
   browser bundle and let anyone forge a confirmation. Then **redeploy**: the
   route reads it at request time, but a redeploy is what makes the setting
   take effect on the running build.

**ADJUSTABLE QUANTITY ON THE LINK IS SAFE.** The handler checks
`amount_total >= ` what the party owes, so a player who sets quantity 3 pays
450 and is confirmed; an overpayment credits the wallet through the existing
ledger path. Below the owed amount the booking is FLAGGED, never seated — an
underpaid party is a pitch short of money on the day.

### §7 — Row 84, the credit-redemption report

**It does not reproduce.** Four layers were checked on 2026-08-21:

| Layer | Method | Result |
|---|---|---|
| The function | Called `create_booking` on PRODUCTION as a real player with a real balance against a real game, in a rolled-back transaction | `credit / confirmed / 150 applied` |
| PostgREST | Called it over the production REST API with `p_online` | Resolves and reaches the function body |
| Signatures | Compared both databases | Identical, one overload, no 4-argument version anywhere |
| The application | Drove the button end to end in a browser, INCLUDING with `NEXT_PUBLIC_STRIPE_PAYMENT_URL` set — the one environmental difference | Passes |

**The likeliest explanation** is that the report predates round 12's deploy at
04:05, the same window in which items 1–5 looked undelivered and had been. The
logs cannot confirm it: Vercel's retention had aged out everything but the
probes.

**The one unverified link** is a real signed-in booking through the deployed
build, which needs a session for the owner's own account. Minting one to
create and cancel a booking against a live game is not something to do unasked.

**What shipped regardless:** `e2e/credit-redeem.spec.ts` (the flow had NO
browser test — the chooser had specs for which options render, the SQL suite
for what the RPC derives, and between them sat the button), and a
calling-contract guard in `booking_create.sql` asserting one overload, the six
parameter names its callers send, and that only two are required.

### Two environment variables are still unset

Each holds a finished feature dormant: `NEXT_PUBLIC_GOOGLE_AUTH` (row 27) and
`NEXT_PUBLIC_STRIPE_PASS_URLS` (row 33). `NEXT_PUBLIC_STRIPE_PAYMENT_URL` is
no longer among them — set 2026-08-20, row 9 shipped, **re-verified 2026-08-21**.

`STRIPE_WEBHOOK_SECRET` (row 65) is the third, and it is now the one that
matters most: **re-verified absent on 2026-08-21 by probing the live endpoint**,
which answered 503. Until it is set an online booking holds its seats for
thirty minutes and then quietly stops, because nothing can confirm it.

### THE PASS JSON TEMPLATE, printed again (row 33)

Every real tier identifier as a key, ready to paste into Vercel as
`NEXT_PUBLIC_STRIPE_PASS_URLS`. **One Payment Link per tier** — never the
single-game link, at any quantity, because tier prices are discounted:

```json
{"5":"","8":"","12":"","15":"","20":""}
```

**CORRECTED 2026-08-21 against the live `pass_tiers` table**, which holds
`5, 8, 12, 15, 20`. ~~`{"1":"","5":"","10":"","15":"","20":""}`~~ was written
from memory in round 7 and never checked: it invents a 1-tier and a 10-tier
that do not exist, and omits 8 and 12 — so pasting it would have left two real
tiers permanently unsellable while two keys sat there matching nothing. The
tiers with no key say "Coming soon" rather than selling at the wrong price, so
the mistake would have been quiet.

Run this to print the keys your `pass_tiers` table actually holds, rather than
trusting the line above:

```sql
select jsonb_object_agg(games::text, '') from public.pass_tiers;
```

~~**One data statement is outstanding** — the venue separator moved from an
em-dash to a bullet in the fixtures and production rows still carry the old
one.~~ **DONE, and the owner did it.** Counted on the live database on
2026-08-23: zero venues and zero games still carry `' — '`. It came off this
page by being checked rather than by being reported.


---

## 9. Round 18 item 4 — why cash is still there

The item's own condition was that the online path be verified end to end on
production before cash was removed. It is not verified, and the evidence is not
ambiguous.

**WHAT IS IN PLACE.** `NEXT_PUBLIC_STRIPE_PAYMENT_URL` is set;
`STRIPE_WEBHOOK_SECRET` is set; `POST /api/stripe/webhook` answers **400** to an
unsigned request, which is the endpoint working — it refuses what it cannot
verify. `confirm_online_purchase` and every column it writes exist on
production.

**WHAT HAS NEVER HAPPENED.** Not one row in `bookings` or `credit_topups` has
ever carried a `stripe_session_id`. That column is written by
`confirm_online_purchase` and by nothing else, so its emptiness is not an
absence of evidence — it is evidence that **no payment has ever been confirmed
through Stripe on this product.** The 27 `payment_confirmed` events are all
from the admin `confirm_booking` path.

**THE ONE ATTEMPT, AND IT IS THE PART THAT MATTERS.** Exactly one booking has
ever gone down the online path:

| | |
|---|---|
| Player | Kane |
| Game | Praha 3 • Pražačka, 2026-08-23 16:37 |
| Chose online | 2026-08-23 15:07 |
| `stripe_session_id` | **null** |
| Status now | **still `reserved`** |

Two readings, and this side cannot tell them apart. Either Kane abandoned
checkout — in which case everything behaved correctly — or **Kane paid and the
webhook never confirmed it**, in which case a real player paid 150 CZK, lost
the seat when the thirty-minute window closed at 15:37, and the money is
unreconciled. **The Stripe dashboard answers this in thirty seconds and nothing
here can.**

**WHY I DID NOT DRIVE ONE MYSELF.** The two available ways to produce a
confirmation are to make a real payment — spending real money on an outward
action nobody authorised — or to send a correctly-signed webhook, which would
write a fabricated confirmed booking into the live product. Neither is a test.
There are also no upcoming games on production to book.

**TO OPEN THE GATE**, in order:

1. Open Stripe → Payments and look for a payment around **2026-08-23 15:07**.
   If one is there, Kane paid and there is money to reconcile — and the webhook
   is not delivering.
2. Stripe → Developers → Webhooks → the endpoint → **Recent deliveries**. An
   empty list means Stripe has never called us, whatever the secret says.
3. Once a real payment confirms — `stripe_session_id` stops being null — cash
   can go. The removal is a small change; the verification is the item.
