# Redesign v2 — export audit

**Read-only round.** Nothing in `app/`, `components/`, `lib/` or `tailwind.config.ts`
was touched. This file is the only write.

**Source:** `/Users/oliverstaehelin/export` — the first path checked, and the only
one that exists (`~/Desktop/export` and `~/Downloads/export` are both absent).

**Contents:** 19 PNGs, `p01`–`p19`, all **784px wide** with heights from 1536 to
4040. One viewport, exported full-page. The exports do **not** distinguish
mobile from desktop — every frame is a phone in a device bezel with a status bar
and a home indicator. **There is no desktop design in this export**, which is
itself a gap: `md:` breakpoints exist across the product today (the header link
row, the reading column, the admin tables) and nothing here says what they
become.

---

## 1. Page map

| File | Redesigns | Notes |
|---|---|---|
| `p01` | **`/` (home)** | Hero, 3-step how-it-works, upcoming matches, community, PotM, FAQ, footer |
| `p02` | **`/games`** | Day strip, pass panel, day-grouped cards |
| `p03` | **`/game/[id]`** (detail) | Info, availability, included/amenities, organizer, players, game information, claim bar |
| `p04` | **`/game/[id]/book`** | Payment method chooser |
| `p05` | **`/game/[id]/book/confirmation`** | QR/bank-transfer state selected |
| `p06` | **`/game/[id]/book/confirmation`** | Same page, **Stripe** method selected |
| `p07` | **`/game/[id]/book/confirmation`** | Same page, **card** method selected |
| `p08` | **`/login`** | Password + Google, with a signup block |
| `p09` | **`/signup`** | Full account form |
| `p10` | **`/account`** — My games tab | Cover, stats, tabs |
| `p11` | **`/account`** — Settings tab | Same shell, settings pane |
| `p12` | **NEW PAGE — no existing route** | **Community** (leaderboard, PotM, activity feed) |
| `p13` | **NEW PAGE — no existing route** | **Notifications** |
| `p14` | **`/admin`** → dashboard | Today `/admin` redirects to `/admin/games`; this is a real dashboard |
| `p15` | **NEW PAGE — no existing route** | **Add players to a game** — nearest existing is `/admin/games/[id]/add-player`, but the design is a different surface (search + subscribed list) |
| `p16` | **NEW PAGE — no existing route** | **Add new pitch** |
| `p17` | **`/admin/games/[id]`** | Game detail: roster, payments, photo, what-this-pitch-provides |
| `p18` | **`/admin/site`** | Home-page settings |
| `p19` | **NEW PAGE — no existing route** | **Financials** |

`p05`/`p06`/`p07` are three **states of one page**, not three pages.

---

## 2. Affordance census

Every navigational affordance visible in the designs, with its implied
destination. "—" means the design shows no target.

### Global chrome (on nearly every frame)
| Affordance | Appears on | Implied destination |
|---|---|---|
| HF mark + `HRAJ FOTBAL.` wordmark | all | `/` |
| Bell icon (with unread dot) | all signed-in | **Notifications** (`p13`) |
| Avatar circle | all signed-in | `/account` |
| `EN ▾` | all | language menu |
| `Sign in` (volt pill in header) | `p08`, `p09` | `/login` |
| Tab: **Home** | all | `/` |
| Tab: **Games** | all | `/games` |
| Tab: **Profile** | all | `/account` |
| Tab: **Community** | **`p12` only** | **Community** — a FOURTH tab |
| Footer: Privacy / Terms / Contact | most | `/privacy`, `/terms`, mailto |

### `p01` home
`Find a game →` → `/games` · `All games →` → `/games` · game card (whole card) →
`/game/[id]` · `Join →` ×2 → `/game/[id]/book` · `WhatsApp` → external ·
`@HRAJFOTBAL` → external · PotM card → **player profile? (no target shown)** ·
6 FAQ accordion rows → in-page.

### `p02` games
`All` + day cells `TODAY 20 … MON 24` → `/games?day=` · **`Game Pass` panel + `→`**
→ `/pass` · card → `/game/[id]` · `Join →` → `/game/[id]/book`.

### `p03` game detail
`←` back → `/games` · `Open location in Maps` → external · `Message` (organizer)
→ **no target shown** · `Share on WhatsApp` → external · **`Claim your spot`** →
`/game/[id]/book`.

### `p04` book
`← BACK TO THE GAME` → `/game/[id]` · three radio methods (Stripe / card / cash)
· `Confirm booking` → confirmation.

### `p05`–`p07` confirmation
`Get credits` → `/pass` · **`Get a pass and save up to 23 %`** → `/pass` ·
method radios · `Apple Pay` / `Google Pay` / `Pay 150 CZK →` → Stripe ·
`ADD TO CALENDAR` → `.ics` · `← BACK TO THE GAME` → `/game/[id]`.

### `p08` login
**`Continue with Google`** → OAuth · `SIGN IN` → session ·
**`Forgot your password?`** → **password-reset page** · **`Sign up with Google`**
→ OAuth · `Sign up with email →` → `/signup`.

### `p09` signup
`Read the terms` → `/terms` · `Read the privacy policy` → `/privacy` ·
`CREATE MY ACCOUNT` → session · `Sign in` → `/login`.

### `p10`/`p11` profile
Tabs `Overview` / `My games` / `Settings` → `/account?tab=` · pencil on avatar →
photo upload · `Find a game →` → `/games` · past-game rows → **`/game/[id]`?
(not stated)** · `Change my email` → in-place · `Edit details` → in-place.

### `p12` community *(new)*
`500+ players` pill → **no target** · leaderboard rows ×4 → **player profile?** ·
PotM card → **player profile?** · activity rows (GAME / RESULT / MILESTONE) →
**game detail? no target** · `WhatsApp group` + `Open →` → external.

### `p13` notifications *(new)*
`Mark all read` → in-place · **`Claim now`** → `/game/[id]/book` or waitlist
convert · notification rows ×4 → their subjects (game detail, payment).

### `p14` admin dashboard
Chips `Games` / `Players` / `Top-ups` / `Financials` / (a fifth, clipped) ·
6 game rows → `/admin/games/[id]` · `+ CREATE GAME` → `/admin/games/new` ·
**`+ ADD VENUE`** → **add-venue page** · **`EXPORT DATA`** → **export surface** ·
**`FINANCIALS`** → **Financials** (`p19`).

### `p15` add players *(new)*
Game header pill → `/admin/games/[id]` · search field · 4 result rows → add ·
second search "Add players to subscribed list" → **subscribed-list surface**.

### `p16` add new pitch *(new)*
`VENUE` select → venues · `ADD PITCH →` → save.

### `p17` admin game detail
`← ALL GAMES` → `/admin/games` · `EXPORT CSV` → download · 2 unpaid rows →
confirm-payment · roster avatars → **player detail?** · `REPLACE THE PHOTO` →
upload · `SAVE WHAT'S PROVIDED` → save.

### `p18` admin home page
Nav chips · `SAVE NUMBER` ×2 · PotM select · `SAVE PICK`.

### `p19` financials *(new)*
`← DASHBOARD` → `/admin` · `This month` / `Last month` / `All time` ·
**`View unpaid →`** → **unpaid-spots surface** · `EXPORT CSV` → download ·
4 transaction rows → **no target**.

---

## 3. Gap report

### 3a. DESIGNED-BUT-MISSING TARGETS — *the list for your design tool*

Affordances that clearly lead somewhere, whose destination has **no image**.

| # | Affordance | On | Missing destination |
|---|---|---|---|
| 1 | **Bell icon** | every signed-in frame | Notifications exists as `p13`, but **no frame shows the bell in the admin chrome resolving there** — minor; the real gap is that `p13` has no empty state |
| 2 | **`Forgot your password?`** | `p08` | **Password-reset request + set-new-password screens.** Two frames. Live routes `/login/set-password` exists; the *request* screen does not |
| 3 | **`+ ADD VENUE`** | `p14` | **Add venue** — `p16` designs *Add pitch*, which is a different object |
| 4 | **`EXPORT DATA`** | `p14` | **Export surface** (or a defined download-only behaviour) |
| 5 | **`View unpaid →`** | `p19` | **Unpaid spots list** |
| 6 | **`Top-ups` chip** | `p14`, `p17`, `p18` | **Admin top-ups** — a live route (`/admin/topups`) with no frame |
| 7 | **`Players` chip** | `p14`, `p17`, `p18` | **Admin players list** — `p15` is *add players to a game*, not the roster |
| 8 | **5th admin chip (clipped)** | `p14`, `p17` | Unreadable at this crop — **please re-export `p14` with the chip row scrolled** |
| 9 | **`Message` (organizer)** | `p03` | **No destination shown.** In-app messaging does not exist |
| 10 | **Leaderboard / PotM / roster avatars** | `p12`, `p01`, `p17` | **Public player profile.** Referenced from three surfaces, designed nowhere |
| 11 | **Activity feed rows** | `p12` | Targets unstated (game detail? result?) |
| 12 | **`Add players to subscribed list`** | `p15` | **Subscribed-list surface** — a new concept with no other frame |
| 13 | **Waitlist screens** | — | `p13` says "a spot opened… Claim now", so the flow is implied, but the **waitlist join / position / convert** screens are undesigned. `/game/[id]/waitlist/convert` is live |
| 14 | **Desktop / `md:` layouts** | all | No frame above 784px. Every breakpoint is undefined |

### 3b. NEW PAGES — no existing route

| Design | Proposed route | Notes |
|---|---|---|
| `p12` Community | `/community` | Also adds a **4th nav tab** |
| `p13` Notifications | `/notifications` | Needs a notification store — SCOPE.md quarantines this ("there is no notification store; email is the channel") |
| `p14` Admin dashboard | `/admin` | Route exists but only redirects |
| `p15` Add players to game | `/admin/games/[id]/players` | Overlaps `/admin/games/[id]/add-player` |
| `p16` Add new pitch | `/admin/pitches/new` | Depends on migration 41 (`games.pitch_name`, written, unapplied) — and on a **pitch entity**, which is quarantined |
| `p19` Financials | `/admin/financials` | New |

### 3c. UNDESIGNED EXISTING ROUTES

Live today, no frame in the export. Each needs your ruling: **stays v1.3** or
**awaits a design**.

| Route | Note |
|---|---|
| `/pass` | **Highest-value gap.** Two designs link to it (`Game Pass` panel, `Get a pass and save up to 23 %`) and the pass economy is the product's commercial core |
| `/my-games` | Kept as a route; the tab now carries the content |
| `/account/topup`, `/account/topup/[id]` | The QR reconciliation path |
| `/game/[id]/waitlist/convert` | See gap 13 |
| `/login/set-password` | See gap 2 |
| `/admin/games` (list) | `p14` shows a dashboard excerpt, not the list |
| `/admin/games/new`, `/admin/games/[id]/edit` | The game form — the biggest admin form, undesigned |
| `/admin/games/[id]/attendance` | Settle/attendance marking |
| `/admin/games/[id]/add-player` | See `p15` |
| `/admin/players`, `/admin/players/[id]`, `/admin/players/merge` | The merge tool is identity-critical |
| `/admin/topups`, `/admin/stats` | `p19` may supersede `/admin/stats` — **needs a ruling** |
| `/privacy`, `/terms` | Legal; privacy is a marked DRAFT |
| `/auth/error` | The magic-link failure surface |

---

## 4. Design-language delta

### Typefaces — **consistent with standing law, one thing to watch**
Anton (display) appears on the wordmark, page titles (`UPCOMING GAMES`,
`SIGN IN`, `DASHBOARD OVERVIEW`, `FINANCIALS`), section headings and the hero.
Body, labels, form fields and card copy are all a geometric sans consistent with
**Onest**. **No contradiction of the standing ruling.**

Two observations, not actions:
- `p19` sets **large money figures in Anton** (`61,750 CZK`, `1,506 CZK`) and
  `p03` sets `14 spots left` in Anton. Both are existing display usage, so this
  is within the rule — but it extends Anton into *numeric data*, which is a
  slight widening worth naming.
- `p05`–`p07` set `150 CZK` in Anton at hero scale. Same note.

### Palette — **volt is still the accent, unchanged**
`#C8FF00` (or indistinguishable) on near-black. Confirmed volt roles: primary
CTAs, active tab fill, active chip fill, key figures, eyebrow labels, links.
Ink/surface ladder reads the same. Deltas:
- **Photographic backgrounds inside game cards** (`p01`, `p02`) — cards now sit
  on a pitch photo with a dark scrim. Today's list card is a flat surface. This
  is the single largest visual change in the export.
- **Profile cover is a photograph** (`p10`, `p11`), where v1.3 ships a token
  gradient. There is still no cover-photo column.
- **Full-colour third-party marks** — the WhatsApp green and the Instagram
  gradient (`p01`, `p12`), matching what shipped.
- `p19` introduces a **bar chart** in volt tints — a new chart primitive.

### Spacing / radius / card anatomy
- Radii read larger and softer: cards ≈ 18–20px (matches `card: 18px`), CTAs and
  chips fully rounded (`pill`). Consistent with ruling A's table.
- **Card anatomy changed.** v1.3's canonical list card is venue → pill+badges →
  capacity bar → spots → faces on a flat surface. The export shows: photo
  background, venue + format badge on one line, time pill left, **spots figure
  right on the same line**, capacity bar, then **faces left and a `Join →`
  button right**. The card gains a **primary action**, which ruling E
  deliberately removed ("no `View game →`… a link inside a link").
- The **nav bar is flush and full-width** with pill-shaped tab cells — matches
  what shipped last round.

### FLAGGED FOR RULING — designs that contradict standing law

> None of these were acted on. Each needs your word.

1. **Card gains a `Join →` button** (`p01`, `p02`) — reverses **ruling E**, which
   removed the in-card CTA so the whole card could be one anchor. A button inside
   a card-sized link is the exact construction ruling E rejected.
2. **Fourth nav tab, `Community`** (`p12`) — **ruling K** settled the pill at
   three (Home, Games, Profile) and explicitly removed `Pass` and `My games`.
3. **`Pay with Stripe` *and* `Pay with card` as separate methods** (`p04`–`p07`) —
   these are the same rail described twice. `p04` also shows **no bank-transfer
   option at all**, while `p05` shows QR as the selected method on the same flow.
   The two frames disagree with each other.
4. **Card payment on a GAME** (`p04`, `p06`, `p07`) — the Stripe round explicitly
   **defers per-game card payment**; passes come first. This designs the deferred
   half.
5. **`Get a pass and save up to 23 %`** (`p05`–`p07`) — a **percentage as a
   headline**. Ruling F puts credits in games, not CZK, and the discount is
   computed per tier; 23 % is the *largest* tier's saving presented as if it were
   the offer.
6. **`150 CZK / 1 credit`** (`p03`) — correct under the flat-150 ruling. **Not a
   violation** — recorded because it is the one surface where the ruling is
   visible, and it holds.
7. **Capacity bar reads as segments, not the ladder** (`p01`–`p03`) — the
   segments are uniformly volt with no urgency tone change. The **absolute
   colour ladder** ("do not touch spotsTone") is not visible in these frames.
   May simply be un-rendered rather than contradicted.
8. **Calendar cells** (`p02`) — six cells (`All` + 5 days) against the shipped
   nine (`All` + 8). Cells are taller and rounder. The owner's calendar-width
   ruling ("scrolling calendars hide days") means **fewer cells must not mean a
   scrolling row** — the export does not show whether it scrolls.
9. **`Financials` may supersede `/admin/stats`** (`p19`) — revenue, settled
   games, avg per game, and a week chart overlap the stats page. Two surfaces
   answering one question.
10. **Notifications + Community both need backend that does not exist** —
    SCOPE.md quarantines the notification store; a leaderboard and activity feed
    need aggregate queries the product has no shape for.
11. **Organizer `Message` button** (`p03`) — implies in-app messaging. No such
    capability; the product's channel is WhatsApp.
12. **`p17` "What this pitch provides"** — the copy says it is a property of the
    **pitch**, but amenities are stored on the **venue** (`set_venue_amenities`).
    Same venue/pitch conflation as migration 41.
13. **Modal/portal law** — no modal or dialog appears anywhere in the 19 frames.
    The cancel dialog, the one portalled surface, is **undesigned**.

---

## 5. Proposed section order for the build rounds

Ordered so that nothing is built twice and every round lands on law that is
already settled. **Proposal only — nothing built.**

**Round 0 — rulings (no code).** Clear the 13 flags above, especially card CTA
(E), fourth tab (K), and the payment-method contradiction. Everything downstream
depends on these.

**Round 1 — chrome and shell.** Header (bell, admin badge), nav bar, footer.
Touches every page, so it goes first and the rest inherit it.

**Round 2 — the game card.** One component, three surfaces. The photo background
and the anatomy change are the largest visual delta and unblock rounds 3–4.

**Round 3 — home + games.** Both are compositions of round 2's card.

**Round 4 — game detail.** Includes the claim bar. Depends on card language.

**Round 5 — auth.** Login, signup, and the **two missing password-reset frames**.
Pairs naturally with the Google-login feature round already proposed.

**Round 6 — profile.** Cover, stats, tabs — closest to what shipped, so cheapest.

**Round 7 — booking + payment.** *Gated on the Stripe round and on ruling 3/4
above.* Do not start before the payment model is settled — this is money.

**Round 8 — admin.** Dashboard, game detail, home page, then the undesigned
admin routes as they get designs.

**Round 9 — new pages.** Community, Notifications, Financials. Last, because each
needs backend that does not exist and quarantine entries that need lifting.

**`/pass` sits outside this order** — it is linked from two designs, is
commercially central, and has no frame. It either stays v1.3 or needs a design
before round 7.
