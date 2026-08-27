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
| 9 | Stripe checkout — the per-game booking link | **`SHIPPED round-12`**, and it was the OWNER who unblocked it. `NEXT_PUBLIC_STRIPE_PAYMENT_URL` is **set in Vercel production**, created 2026-08-20 — verified with `vercel env ls production`, not assumed. Every deploy since carries it, so the online option is live rather than a gated placeholder. Round 12 item 5 then closed the hole this opened: an online booking used to hold its seats before Stripe had seen any money. See row 58 |
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
| 27 | Google sign-in | `BUILT-DORMANT-ON-setting NEXT_PUBLIC_GOOGLE_AUTH=1 and configuring Google OAuth in Supabase`. **Re-verified 2026-08-27: still absent from `vercel env ls production`.** The flow ships; `components/auth/GoogleAuthBlock.tsx` returns null while the flag is unset, and a spec fails if anyone renders it unconditionally |
| 28 | Change email | `SHIPPED round-7` |
| 29 | Game-pill photo fade | `SHIPPED round-7` |
| 30 | Admin frames (`p14`–`p19`) mapping check | `SHIPPED round-7` (item 0) — and it found the audit wrong: `p15` is add-player, `p16` is the new-venue block **inside** `/admin/games/new`, `p19` is `/admin/stats`, `p12` is home's community section. Only `p13` was genuinely new |
| 31 | New game flow, financials page, admin player detail | `SHIPPED round-7` |
| 32 | Payment UI: three options | `SHIPPED round-7` (item 11) — three options with the online one gated. See row 9 |
| 33 | Pass purchase links, one env var, JSON map of tier → link | `BUILT-DORMANT-ON-pasting the JSON map into Vercel` — `NEXT_PUBLIC_STRIPE_PASS_URLS`. **Re-verified 2026-08-27: `vercel env ls production` still lists only `STRIPE_WEBHOOK_SECRET` and `NEXT_PUBLIC_STRIPE_PAYMENT_URL` among the Stripe/auth variables.** It is the last thing between a player and a pass — the return page, the webhook secret and `begin_pass_purchase` are all live. Corrected template in §7: `{"5","8","12","15","20"}` |
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
| 65 | **Set `STRIPE_WEBHOOK_SECRET` in Vercel** | **`SHIPPED`, and the OWNER did it** — set 2026-08-21, found on the re-verification rather than reported. **Verified twice on 2026-08-23:** present in `vercel env ls production`, and `POST /api/stripe/webhook` on the live deployment now answers **400** to an unsigned request instead of 503 — which is the endpoint working: it refuses what it cannot verify and no longer refuses everything. ~~`BUILT-DORMANT-ON-adding the endpoint in Stripe and pasting the signing secret into Vercel`.~~ |

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
| 89 | *Gap found while verifying row 72.* The waitlist notifies by EMAIL only; the bell does not carry it | `OPEN`. The round-7 notifications store is a broadcast to `audience: 'all'` with no per-player recipient, so wiring the waitlist into it is a schema change rather than a cheap join. The FAQ says "emailed" rather than softening the claim |
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
| 108 | **Set the return URL on all six Payment Links** | `BUILT-DORMANT-ON-the owner pasting one URL into six Stripe links`. `https://hrajfotbalek-wlya.vercel.app/payment/return`, under each link's *After payment → Redirect customers to your website*. **NOT VERIFIABLE FROM THIS SIDE** — it lives in the Stripe dashboard and this repo holds no Stripe API key, so unlike every other row here it is reported rather than probed. Nothing breaks without it: the WEBHOOK settles the booking or the credits, and what a player loses is being told |
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
| 131 | **(R18-4) Remove cash payment** | **`BLOCKED — NOT DONE`, and the gate is the reason.** The item's own condition was a verified end-to-end online payment on production. **No booking or top-up on production has ever carried a `stripe_session_id`** — zero, since the rail was built. The 27 `payment_confirmed` events are all from the admin confirm path. Exactly one booking ever went down the online path and it is still unconfirmed. Cash stays. See §9 |
| 132 | **(R18-5) Admin games numbering** | `SHIPPED round-18`. A rendered row index, never stored: persisting one would mean deciding what happens on delete — renumber or leave a hole — and both are wrong for a number whose only job is to be countable on a screen. The spec asserts a contiguous 1..n, which only a rendered index can guarantee |
| 133 | **(R18-6) "Notes from organizer"** | `SHIPPED round-18` — **a rename, and the found reality is the finding.** The note was ALREADY its own card. What it was not was legible: its label read "Game information", the same words as the fact card's heading two hundred pixels above, set as a 10px eyebrow while every neighbour carries a `body-lg` heading |
| 134 | **(R18-7) The detail's photo crop** | `SHIPPED round-18`. Four variants rendered and compared before picking `object-[50%_30%]` at `pt-36`. Either lever alone falls short — shifting the crop inside a 53px band shows a different sliver, and a taller band still centred keeps discarding the horizon. Costs 32px of fold, spent knowingly |
| 135 | **(R18-8) Telegram contact for UA/RU games** | `SHIPPED round-18`, dormant on row 136. `/api/tg/<gameId>` mirrors the WhatsApp redirect so the number never reaches page source. **`t.me/+<number>` resolves only if that number is on Telegram and findable by phone** — unverifiable from here, and the failure is silent and off-site. Proposal in §9 |
| 136 | **Apply `20260826100000_game_language.sql`** | **`SHIPPED`, and the OWNER applied it** — found on the 2026-08-27 re-verification rather than reported, which is the whole reason this ledger re-probes instead of echoing. Verified three ways against the live catalog: `games.language` exists, `public.app_capabilities()` **evaluated on production returns `gameLanguage: true`** (the migration ships its own replacement of that function, so the flag cannot be true without it), and `games_format_format` now reads `^[0-9]{1,2}v[0-9]{1,2}(v[0-9]{1,2}){0,2}$` — production had been one migration behind on that since 2026-08-02 (row 137). The language dropdown is live and no deploy was needed to turn it on. ~~`BUILT-DORMANT-ON-the owner running it`. Verified absent 2026-08-26.~~ |
| 137 | **(R18-9) Non-standard formats and durations did not show** | `SHIPPED round-18`, half of it dormant on row 136. **TWO BUGS.** Production's `games_format_format` is still `^NvN$` because `20260802180000_format_three_way` was never applied there — so `6v6v6` was never SAVED, which is why it never showed. And `7v7v7v7` was refused by BOTH regexes, which capped at three groups. Separately, `duration_minutes` was in `GameCard`'s type, threaded from the query and drawn in the file's own ASCII sketch — and no element ever rendered it |
| 138 | **(R19-1) The flags form the pill** | `SHIPPED round-19`. **The bug measured first:** the card's flags rendered 16x8 and the detail's 26x30.19 — two sizes, the second a 2:1 drawing forced into a nearly-square half. Both causes were the same mistake, two constructions for one thing; there is one now, with no variant. `preserveAspectRatio="slice"` rather than stretch, `flex-1` halves rather than fixed widths, and the divider is `ink` because a white hairline vanishes on the white half of the Czech and Russian flags |
| 139 | **(R19-2) Telegram by username** | `SHIPPED round-19`, dormant on row 141. Ratifies the round-18 proposal, **corrected to username**. The phone form is REMOVED, not demoted — keeping it as a fallback would mean the product still sometimes sends players to Telegram's "user not found" page, which is the whole defect. A UA/RU game with no handle shows WhatsApp: contact is always possible, and no button goes nowhere |
| 140 | **(R19-3) Admin numbering counts from the oldest** | `SHIPPED round-19`. The list stays newest-first; only the numbering runs the other way. The reason is stability — numbering from the top changes every game's number the moment a new one is created, which makes "the third one" a different game each week |
| 141 | **Apply `20260826200000_organizer_telegram_handle.sql`** | `BUILT-DORMANT-ON-the owner running it`. **Re-verified absent 2026-08-27** — probed three ways: no `games.organizer_telegram` column, no `normalize_telegram_handle` in `pg_proc`, and `set_game_organizer` still at **three** arguments. `app_capabilities()` on production returns no `organizerTelegram` key at all. Until it is applied the Telegram username field is not rendered and every UA/RU game shows WhatsApp — which is exactly today's behaviour. It DROPS the three-argument `set_game_organizer`: two overloads differing only by a defaulted fourth argument would make `admin_create_game_v2`'s internal call ambiguous |
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

**Everything here was re-verified on 2026-08-27, not copied forward** — each
migration probed for the OBJECT it creates rather than for a filename, because
a filename proves only that the repo has it. Row 64 came off this list as a
result (`create_booking` is at six arguments on production); rows 48 and 57 came
off on 2026-08-20. What follows is what is genuinely still owed.

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

### Round 19's migration (row 141)

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
