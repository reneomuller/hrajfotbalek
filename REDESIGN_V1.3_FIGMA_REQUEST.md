# Figma request — v1.3 components and screens

**Role:** the design request for the remaining Figma deliverable.
**File:** Hraj Fotbal — Design System v1.3 — `https://www.figma.com/design/0lKWK6pRonKNbmFDglzoR7`
**Contract:** `letco-prompt-hrajsport-phase2-v1.md` v1.3, rulings A–P
**Design spec:** `DESIGN_SYSTEM_V1.3.md` §2 and §3
**Primary viewport:** 390 × 844 (iPhone 14 / Pixel 7 class). Desktop is
secondary but **specified** — one breakpoint, `md` = 768px, per
`DESIGN_SYSTEM_V1.3.md` §1.7. Below it the nav pill renders and the header links
do not; at and above it the reverse. Draw both.
**Date:** 2026-08-07

---

## 0. What already exists — do not rebuild it

The **§1 token layer is built**, on the Cover and Foundations pages:

| | |
|---|---|
| Collections | 5 — Primitives, Color, Radius, Spacing, Typography |
| Variables | 65 |
| Text styles | 9 (`Type/Hero` … `Type/Eyebrow`) |
| Effect styles | 1 (`Elevation/Lift`) |

**Everything below is assembled from these.** No new colour, radius, spacing
step or type size may be introduced. If a frame seems to need one, that is a
finding to log, not a token to add — the entire point of ruling A is that no
later stage gets to re-open a grey.

Primitives are hidden from every picker on purpose. **Pick semantic tokens.**

The **Components page is empty.** That is the deliverable.

---

## 1. Rules that constrain every frame

These are not style preferences; each is a ruling with a stated cost.

1. **The eyebrow is the only uppercase style in the product** (ruling B). Every button, link, nav label, card title, section heading and day label is **sentence case**. If a frame shows tracked capitals anywhere except a small grey eyebrow, it is wrong.
2. **No stroke on a card, chip, panel or day box** (ruling C). Fill and radius carry the surface. Stroke keeps exactly two jobs: a secondary button's outline, and a selected state. *If a border is being drawn to separate two things, the gap between them is too small.*
3. **One accent per card** (ruling D). The spots figure is the only coloured text on a game card.
4. **One shadow, and it points up** (§1.6). Only the claim bar and the nav pill cast it. `volt-glow` is retired from general use.
5. **Money is Czech in every language.** CZK, `QR platba`, `variabilní symbol`. The player is about to open a Czech banking app and the words must match it.
6. **The mono face appears exactly once in the product** — the variabilní symbol. Nowhere else.
7. **Translucency survives in exactly one place** — the scrim over a venue photo, where there is something behind it worth seeing. Cards are opaque.
8. **Two token values changed for contrast, inside ruling A's one change.** `text/tertiary` (`faint`) is **`#7E7E7E`, not `#6F6F6F`** — the old value computes to ~3.8:1 on `surface` and fails AA at the 11px and 13px steps it is assigned to, and it carries real content (the day-strip count, the pass expiry line, the claim bar's started status). Note it is **not** `#8A8A8A`, which clears AA but is the exact grey §1.1 of the design spec names as indistinguishable from `text/secondary` at 390px. And **focus is its own token** — a 2px full-opacity `volt` outline at 2px offset, *not* `border/accent` at .30, which computes to ~2.4:1 and fails the 3:1 WCAG requires of a non-text indicator. If the Figma variables still hold the old values, that is a finding to log before drawing, not a value to work around.
9. **Every frame is annotated for accessibility** (§2.11 below). A component drawn without its semantic element, focus state and accessible name is not finished.
10. **Draw the Czech and the Russian, not only the English.** §4 says this and it is repeated here because it is the rule most often dropped: the card, claim bar, nav pill and step cards are drawn in all three at 390px, and the longest Russian claim-bar label is roughly twice the English.

---

## 2. Components requested (§2)

Build these as a library page **before any screen**. Every screen is assembled
from them; nothing is drawn twice.

### 2.1 Game card — canonical (ruling E)

**One component, used on the games list, the home preview, and My Games.** No
variants per surface.

```
┌────────────────────────────────────────────┐
│  20:00  60 min                       6v6   │  time = Type/Time / text-primary
│                                            │  duration = Type/Small / text-secondary
│  Praha 3 — Pražačka                        │  Type/Body Large / text-primary
│                                            │
│  (◐)(◐)(◐)+9          3 spots left         │  avatar stack left, spots right
└────────────────────────────────────────────┘
   surface/card · radius/card · padding 16 · NO BORDER
```

- **Whole card is the tap target.** No `View game →`.
- **Spots figure** is `Type/Body Large Strong` in its ladder colour — the only coloured text on the card.
- **Avatar stack**: up to 3 faces at 28px, −8px overlap, then `+N` in a `surface/avatar` circle. Falls back to initials, which the product already does everywhere.
- **Format pill**: `radius/pill`, `surface/raised` fill, `Type/Small` / secondary. **No level badge** (ruling I).
- **No venue photo on the list** — the photo is the detail's.

| State | Change |
|---|---|
| Default | As drawn |
| Full | Spots figure → `Full` in `scarcity/critical`. **Card still tappable** — the detail offers the waitlist |
| **Past** | Whole card at **45% opacity**, not tappable, **not focusable**, no press state. New — the product has never drawn this. **My Games uses this same state for its past rows** — ruling E forbids a per-surface row shape |
| **Focus** | The focus ring (rule 8), visible against `surface/card` |
| **Loading** | The §2.10 skeleton at this card's exact geometry |

> **Zero bookings:** the avatar stack is **absent**, not an empty ring. The spots
> figure already says the game is open.
>
> **Semantics:** the card is a **link** (ruling E made it one), so draw it as an
> anchor, not as a tappable panel — annotate it as such.

### 2.2 Day strip (ruling H)

Exactly **8 boxes**, horizontally scrollable below `md`, **all eight visible
above it**, today first.

```
┌──────┐  ┌──────┐
│ Fri  │  │ Sat  │   weekday  Type/Small / secondary
│  7   │  │  8   │   date     Type/Body Large / primary
│  1   │  │  4   │   count    Type/Small / tertiary — omitted when 0
└──────┘  └──────┘
 selected   rest
```

- `radius/control`, `surface/raised` fill, **no border**.
- Selected: `surface/accent` fill, `text/on-accent`.
- A day with no games is **drawn, greyed, and not a link** — and **not focusable**.
- Tapping a selected day clears the filter. An `All` affordance clears it too.
- **The strip filters; the list is never truncated by it.**
- **Minimum 44 × 44px target per box**, and the focus ring must be
  distinguishable from the selected fill — draw a box that is selected but not
  focused, and one that is focused but not selected.

### 2.3 Bottom nav (ruling K)

Floating pill, `surface/raised`, `radius/pill`, 16px inset from the screen edge,
`env(safe-area-inset-bottom)` respected via the existing `--tabbar-h`.

Four items in order: **Home · Games · Pass · Profile.** Active item sits in a
filled `surface/accent` capsule with `text/on-accent` icon and label. Labels are
`Type/Small`, **sentence case**.

**Renders below `md` only.** Above it the header link row does this job; the two
never appear together. Draw both widths.

> ⚠ Draw this with the Czech strings too — `nav.pass` → `Permanentka` is 11
> characters in a four-item bar at 390px. If it does not fit, that is a finding
> the code stage needs before Stage 3, not after. **The label never truncates
> and never wraps**: if it does not fit, the word changes.

Each item is a **link** with a 44 × 44px minimum target and a focus ring visible
against both the raised pill and the accent capsule.

### 2.4 Claim bar (ruling G)

Fixed to the bottom, **above** the nav pill, `surface/card` at full opacity,
`radius/card` on the **top corners only**, `Elevation/Lift`. **Present on every
game detail, in every state.**

| State | Left | Right |
|---|---|---|
| Open, signed in | `150 CZK` | Primary `Claim your spot` |
| Open, signed out | `150 CZK` | Primary `Sign in to claim` |
| Full | `150 CZK` | Secondary `Join waitlist` |
| **On the waitlist** | `150 CZK` | `You are #3 on the waitlist` as `Type/Small` / secondary — **no button this round**; reserve the space |
| Holding, paid | `Paid` in `text/accent` | Text button `Cancel` |
| Holding, unpaid | `150 CZK due` in `scarcity/filling` | Text button `Cancel` |
| Started / cancelled | `150 CZK` | `Kicked off 19:00` / `Cancelled` as `Type/Small` / tertiary — **no button** |

Never transparent (the brief's bug 1), never absent.

> **Seven states, not six.** The waitlist state is new. Without it a waiting
> player sees `Join waitlist` for ever, cannot tell whether the tap worked, and
> has no way off a notify-all FCFS list that keeps emailing them. `Leave
> waitlist` is the only control in the product that removes a waitlist row.
>
> **Draw the bar inside the loading skeleton too** — its height is reserved so
> the content beneath does not jump when the data lands.
>
> **Overflow:** the price never truncates; the right-hand label wraps to a
> second line and the bar grows before anything truncates. Draw the Russian.

### 2.5 Buttons

| Variant | Fill | Text | Radius | Height |
|---|---|---|---|---|
| Primary | `surface/accent` | `text/on-accent`, `Type/Body Large Strong` | `radius/control` | 52 |
| Secondary | none, `border/strong` outline | `text/primary` | `radius/control` | 52 |
| Text | none | `text/secondary` | — | 44 min target |

Sentence case, always. One primary per screen region.

**Every variant carries five states as variants** — the spec previously gave
three variants and no state axis, which is how eight form submissions reached
the wireframe with nothing to render while they ran:

| State | Treatment |
|---|---|
| Default | As above |
| Hover / press | Primary → `surface/accent-pressed`. Secondary → `border/accent`. Text → `text/primary` |
| **Focus** | The focus ring (rule 8) — 2px, 2px offset |
| Disabled | Primary → `surface/accent-pressed`, label at 55%. Still in tab order |
| **Pending** | Fill drops to `surface/accent-pressed`, **label unchanged**, 16px spinner to its left, pointer-events off |

> **Pending is the double-submit guard, not decoration.** Two taps on `Take the
> spot` put two booking calls into the same capacity race. The label stays put
> so the button does not change width mid-press.

### 2.6 Info row

Icon (20px, `text/secondary`) + label (`Type/Body` / secondary) + value
(`Type/Body` / primary, right). **Rows separated by `border/hairline`, not by
gaps.** Used by the detail's info card and "Good to know".

### 2.7 Pass card (ruling N)

```
5 games pass          ← Type/Body Large / primary
140 CZK per game      ← title-adjacent, text/accent
Save 50 CZK           ← Type/Small / secondary
1 month expiration    ← Type/Small / tertiary
[ Get this pass ]     ← primary button
```

No "you get X CZK of credit" line. No single-game tier.

**Five tiers, and they are the five rows `pass_tiers` carries.** There is no
10-game tier — an earlier wireframe drew one and it is not in the table:

| Games | Price | Per game | Saving | Expiry line |
|---:|---:|---:|---:|---|
| 5 | 700 | 140 | 50 | 1 month expiration |
| 8 | 1 080 | 135 | 120 | 1 month expiration |
| 12 | 1 560 | 130 | 240 | **2 months** expiration |
| 15 | 1 875 | 125 | 375 | **2 months** expiration |
| 20 | 2 300 | 115 | 700 | **2 months** expiration |

**The expiry line renders on every card**, not only the first — contract §4.2
requires it stated loudly *before* purchase. One per row below `md`, two across
above it. No tier is visually emphasised: the per-game price is the comparison
and it is already the largest thing on the card.

### 2.8 Form controls (ruling L)

Text field: `surface/raised` fill, `radius/control`, **no border at rest**, and
**the focus ring** when focused — a 2px full-opacity `volt` outline at 2px
offset, **not** `border/accent` at .30, which fails the 3:1 contrast a non-text
indicator needs (rule 8). Label above in `Type/Small` / secondary.

**Error state:** 1px `scarcity/critical` border plus the message beneath in
`Type/Small` / critical. Colour is never the only signal — draw the message.

**Multi-select chips:** `radius/pill`, `surface/raised` at rest, `surface/accent`
+ `text/on-accent` when selected, focus ring on focus. **They wrap to as many
rows as they need** — never a horizontal scroll, never a truncated label.
Preferred position is the only consumer in the product, so **draw the state
where more chips are selected than fit one row**; drawing a plain select there
instead would leave this component with no consumer at all.

Display/edit toggle: the whole block swaps; `Edit details` → `Save profile`.

### 2.9 Empty state (ruling P)

Icon or nothing, `Type/Body Large` / primary line, `Type/Body` / secondary second
line, one primary action where an action exists. **Never a bare centred sentence.**

### 2.10 Skeleton (ruling P)

`surface/raised` blocks at the **exact geometry of the card they replace**, 1.2s
pulse.

> The trap this round is fixing: the deleted capacity bar looked like a skeleton
> because it was a row of grey segments inside a real card. **Skeletons must
> never appear inside a populated card.**

**Draw two, not one.** The list skeleton exists; the **game detail** skeleton is
the one §3 asks for and no frame has drawn — and the detail is the surface a
shared WhatsApp link opens:

| Surface | Skeleton geometry |
|---|---|
| Games list | Card geometry, three blocks |
| **Game detail** | Photo block 16:9 · info-card block, five rows · availability line · organizer card block · lineup row · **claim bar rendered in its own state so its height is reserved** |
| **Pass** | Wallet block + five tier cards |
| Profile | **None** — server-rendered empty frame; the labels are static and only the values load |
| My games | Card geometry for upcoming; counts as a server-rendered empty frame |

### 2.11 Error and pending conventions — NEW

Twenty-one wireframe actions reach the server and only sign-in had a drawn
failure. Draw the three surfaces as components:

| Surface | When |
|---|---|
| **Inline field error** | The wrong input is on screen and nameable — §2.8's error state |
| **Form-level error block** | The failure is about the submission: a race lost, a window closed, a permission refused. `surface/raised` block above the submit button, critical icon, one sentence plus a way forward |
| **Error toast** | Not a form submission, or the result screen has already replaced the page |

Draw, specifically: the two **distinct** signup consent errors beside their own
boxes (`TOS_REQUIRED`, `CONSENT_REQUIRED` — one box covering both makes the
consent non-specific); the booking race-lost block; the cancel-failed block
*inside* the dialog; and the three photo rejections (over 2 MB, unsupported
type, upload failed).

### 2.12 Toast — NEW

| Variant | Tone | Duration |
|---|---|---|
| Success | volt icon | Auto-dismiss 5s, paused on hover/focus |
| **Error** | critical icon | **No auto-dismiss** — an error the reader missed is an error that did not happen |

One at a time; a second replaces the first. Dismiss is a 44px icon-only control.
**Inventory:** sign-in and top-up-confirmed keep their toast; booking-created and
cancellation-plus-credit become server-rendered screens (a toast on top of a
screen says the same thing twice); **link copied is gone**, because ruling G
deleted the control that fired it.

### 2.13 Accessibility annotations — NEW, and required on every component

Annotate each component with:

- **Its semantic element** — card = link, day box = link, rest day = plain
  non-focusable element, dialog = modal dialog, everything that acts = button.
- **Its focus state**, drawn as a variant.
- **The accessible name of every icon-only control**: avatar edit pencil
  ("Change your photo"), toast dismiss ("Dismiss"), dialog close ("Close"),
  header avatar ("Your profile"), language trigger (speaks the current
  language), back chevrons (their destination, not "Back").
- **Dialog behaviour** on the cancel sheet: modal, focus trapped, Escape closes,
  **focus returns to the control that opened it**.
- **Live-region behaviour** on the toast: polite for success, assertive for
  error.
- **44 × 44px minimum** on nav items, day boxes, dismiss and close controls, the
  avatar pencil and every text button.

---

## 3. Screens requested (§3)

Mobile-first frames at 390px. `PROPOSAL` marks a frame the brief did not
specify — group these separately, each with a one-line rationale.

**Every screen the wireframe enumerates appears here.** Eight previously fell
off this table — including the auth restyle and the 404 it already listed as
deliverables, and the payment step that sits between the claim bar and every
booking.

| # | Screen | States to draw | Desktop (≥ `md`) |
|---|---|---|---|
| 0 | Global chrome | Header signed in / signed out, **language menu with its flags**, nav pill, footer, toast **success and error** | Header links replace the nav pill |
| 1 | Home | Signed out, signed in with a booking, **upcoming at zero / one / two games** | Steps three-across; upcoming cards stay one per row |
| 2 | Games list | Default, day-filtered, `PROPOSAL` empty, `PROPOSAL` loading | Day strip fully visible, no scroll |
| 3 | Game detail | Open, full, holding a spot, started, **on the waitlist**, `PROPOSAL` loading, **empty lineup**, **absent waitlist block**, **expanded roster** | Photo caps at 720px; claim bar stays fixed |
| 4 | `PROPOSAL` Claim confirmation | Success, insufficient balance (**routes to the pass tiers**) | Single column, capped |
| 5 | `PROPOSAL` Cancel booking | Confirm dialog, refunded-to-wallet result (ruling O, credit half only), **failure inside the dialog** | Dialog centred, 480px max |
| 6 | Pass / credits | **Five tiers**, wallet **as credits with CZK beneath**, **multi-batch with one expiring within three days**, `PROPOSAL` zero balance | Tiers two-across; wallet full width above |
| 7 | Profile | Display mode, edit mode with **all six ruling-L fields** and position as **chips** (including more chips than fit a row), My Games expanded, **photo crop / uploading / three rejections** | Single column, capped — a form that reflows to two columns changes its reading order |
| 8 | `PROPOSAL` Waitlist | **Join confirmation**, spot-opened state, not-on-the-list state | Single column, capped |
| 9 | Auth | Sign in, sign up (**contract §3.1 field order**, **both consent errors**), **set password**, `PROPOSAL` restyled to the new system | Form capped at 420px, centred |
| 10 | `PROPOSAL` 404 / error | 404; **sign-in-link failure with resend, wrong-address and use-a-code paths** | Centred |
| 11 | **Payment choice** | QR platba / cash, **pending on submit**, race-lost error | Single column, capped |
| 12 | **My games** | Upcoming, **waitlisted**, past (**canonical card, past state**), empty, counts | Single column, capped |
| 13 | **Pass / top-up payment (QR)** | Pending, confirmed | Single column, capped |
| 14 | **Terms · Privacy** | As they stand — token-inherit only, no redesign | Prose capped at 640px |

> **Do not draw a standalone top-up amount chooser.** Ruling N removes the
> separate top-up-wallet entry point from the player UI. Screen 13 renders the
> QR for the top-up a **pass purchase** creates; `create_topup` and its VS
> series are untouched.

**Home order (ruling J):** hero (**≥25% shorter**) → three steps → Upcoming Games
(3 canonical cards + `All games →` primary button at the section's **bottom**) →
active-players banner → community card → FAQ → footer.
No Player of the Month. No equipment line.

**At zero upcoming games** the section renders the §2.9 empty state with the
WhatsApp action; at one or two it renders what it has. The `All games` button
stays in every case.

**Game detail order (rulings G, M):** venue photo → venue name → info card (date,
time, format, level, `Open location in Maps`) → availability → organizer (**with
locked state**) → player list → `Good to know` → share on WhatsApp → claim bar.
**No price in the info card. No `Copy link`. No "2 subs per team".**

**Lineup and waitlist at zero.** `Lineup (0)` renders one inline empty line with
no action — the claim bar already carries the action. **The waitlist block does
not render at all when empty.** The lineup lists every player; the `+N` overflow
**expands in place** and is not a decorative glyph.

**Wallet display (ruling F).** Credits are the headline; the CZK figure sits
small beneath. Contract §4.2 requires **batches** — amount, expiry date,
games-equivalent — rather than one opaque total, so the wallet is a list, and
the two-batch state with one inside its three-day heads-up window is a required
frame, not an edge case.

**Organizer locked state (ruling M):** a WhatsApp contact button is correct for a
player who holds a spot and impossible for anyone else — organizer phone lives
in a deny-by-default table behind a `SECURITY DEFINER` read gated on an active
booking. Non-holders see the organizer's name and *"Contact unlocks when you
book"* in the **same card, same height, no layout shift**.

---

## 4. Copy

Use `DESIGN_SYSTEM_V1.3.md` §4 verbatim — it carries the EN / CS / RU table for
every new and changed string. Two notes that affect drawing:

- **Draw the Czech and the Russian, not only the English.** Czech is consistently longer and Russian longer still, and the nav bar, the claim bar and the buttons are where it breaks. Czech uses informal *ty* throughout; Russian follows — the register is a pickup football game, not a bank. The four components that must exist in all three languages at 390px: **the canonical card, the claim bar, the nav pill and the three step cards**.
- **`games.spotsLeft` has plural forms** (`1 místo` / `2–4 místa` / `5+ míst`). Draw at least the 1-spot and 5-spot cases so the plural is visible as a requirement.
- **Truncation is specified, not improvised** — `DESIGN_SYSTEM_V1.3.md` §2.13 says per component whether text truncates, wraps, or does neither. A frame that solves an overflow a different way is a finding to log.
- **The cancellation window is one sentence, read from `lib/policy.ts`.** Do not draw "Free cancellation up to 12 hours before start" — the FAQ and the payment step previously carried two different windows the same player reads minutes apart. Draw the token `{window}` and annotate its source.
- **§4 of the design spec gained new rows** for the two consent errors, the waitlist position and leave action, the photo rejections, the batch expiry lines, the second pass expiry, and the signup resend paths. All of them are drawn strings, so all of them need CS and RU in the frame.

---

## 5. Do not draw these — they were refused

Reproducing any of these means the frame was built from the raw brief rather
than the contract. See `LETCO_ANALYZE.md` §1 and §1a, and §9 for the full
ruling-by-ruling coverage table.

- ❌ A level badge on a list card, or "exactly one level per game" — **ruling I**
- ❌ A games list truncated to the 8-day strip window — **ruling H**
- ❌ A "delete game, no record" admin action — **ruling O**
- ❌ The capacity bar, in any form — **ruling D**
- ❌ `View game →` on a card — **ruling E**
- ❌ Price in the game detail info card — **ruling G**
- ❌ Player of the Month, or the equipment line on home — **ruling J**
- ❌ `Copy link`, "2 subs per team", "all welcome — this is a guide, not a rule"
- ❌ Pitches, Stripe checkout, organizer dropdowns, in-app notifications, admin ban/delete — **quarantined, §12a**
- ❌ **A standalone top-up amount chooser or a "Top up credit" screen** — **ruling N**. Topping up routes into the pass options; the QR screen for a pass purchase is screen 13
- ❌ **A 10-game pass tier**, or any tier other than 5 / 8 / 12 / 15 / 20 — it is not a row in `pass_tiers`
- ❌ **A wallet led by the CZK figure** with games as a trailing qualifier — **ruling F** puts credits first
- ❌ **A "12 hours before start" cancellation window**, or any hand-written window — it comes from `lib/policy.ts`
- ❌ **A single "I accept the terms and privacy policy" box** — the two legal acts are never merged and carry distinct errors (contract §3.1)
- ❌ **A language menu without flags** — contract §3.1a puts a flag beside each entry, because someone who cannot read the page needs a non-textual way out

---

## 6. Acceptance

1. Components page carries all **thirteen** components from §2 (the ten original plus error/pending conventions, the toast, and accessibility annotations), each with its states as variants — **including the pending button state and every focus state**.
2. No hardcoded fills, strokes, radii or type — every visual property bound to a variable or a text style. *(The §1 pages pass this at 198/198 fills and 33/33 strokes; hold the same bar.)*
3. Every screen assembled from library components — nothing drawn twice. **My Games' past rows are the canonical card in its past state**, not a row of their own.
4. `PROPOSAL` frames grouped separately, each with a one-line rationale.
5. **Czech and Russian** drawn for the nav bar, the claim bar, the canonical card and every button — not only English.
6. Zero tracked-uppercase outside a grey eyebrow.
7. **Every screen in the §3 table exists**, including the four that previously had none: payment choice, My games, the top-up QR, and global chrome.
8. **Contrast holds:** `text/tertiary` at `#8A8A8A` or better against `surface`, and the focus ring at 3:1 or better against every surface it lands on. Check the two values before drawing — if the variables still hold the old ones, log it.
9. **Every interactive element has a drawn focus state, an accessible name where it is icon-only, and a 44 × 44px minimum target.**
10. **Desktop frames** at the `md` breakpoint for home, games list and game detail at minimum, showing the header links and no nav pill.
11. **Every server-backed action has a drawn failure and a drawn pending state** — the wireframe had one failure state across twenty-one server actions, and a failure that renders as nothing happening is the "silently does nothing" mode this product has already paid for once.
12. Findings logged for any refused decision you believe is a mistake — **do not silently design around it.**
