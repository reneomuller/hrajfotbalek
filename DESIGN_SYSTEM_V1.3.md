# Design system v1.3 — the build document

**Contract:** `letco-prompt-hrajsport-phase2-v1.md` v1.3, rulings A–P
**Primary viewport:** 390 × 844 (iPhone 14 / Pixel 7 class). Desktop is secondary
but **specified** — see §1.7; "secondary" previously meant "undefined", which
left each of the build stages to pick its own breakpoint.
**Direction:** volt-on-black, unchanged. This round removes variety, it does not
introduce a palette.

This is the document a Figma library is built from, and the same document the
code stage implements. Values are **current** where a token survives and
**proposed** where it collapses — nothing here is invented decoration; every
change traces to a ruling.

---

# 1. Tokens

## 1.1 What is being deleted, and why it is first

`tailwind.config.ts` today carries **nine text greys, nine hairlines, six radii
and four font families**. At 390px, `#9A9A9A` and `#8A8A8A` are the same colour;
5px, 8px and 9px are the same corner. The variety is invisible individually and
overwhelming in aggregate — it is the mechanism by which each screen reads as
slightly unlike every other, and it is why the complaint is "messy" rather than
a list of screens.

**This ships as one change, before any screen** (ruling A). Every surface
inherits it without being rebuilt, and no later stage gets to re-open a grey.

> **Because ruling A freezes the table for the whole round, every accessibility
> correction to a token is made here or not at all.** Two are made below: the
> `faint` tone (§1.2) and the input focus treatment (§2.8). A contrast failure
> baked into the frozen table cannot be fixed in a later stage without
> re-opening the ruling.

## 1.2 Colour

**Accent — unchanged.**

| Token | Value | Role |
|---|---|---|
| `volt` | `#C8FF00` | The one accent. Primary CTA fill, active nav, selected day |
| `volt-dim` | `#8FB800` | Pressed / disabled volt |

**Scarcity ladder — unchanged (v1.2 C stands).** Absolute, not proportional.

| Token | Value | Applies |
|---|---|---|
| `volt` | `#C8FF00` | 11+ spots left |
| `warn` | `#FFA31A` | 10 or fewer |
| `danger` | `#FF5A4E` | 3 or fewer, and `Full` |

Appears **once per card**, on the spots figure (ruling D). Colour is never the
only carrier of that state — the figure states the number, and `Full` states the
word.

**Surfaces.**

| Token | Value | Role |
|---|---|---|
| `ink` | `#080808` | Page ground |
| `surface` | `#0F0F0F` | Cards, panels — **opaque now**, not `rgba(15,15,15,.66)` |
| `surface-raised` | `#161616` | A card on a card; the nav pill; input fills |
| `surface-avatar` | `#222222` | Avatar fallback fill |

> Translucency retires from cards. v1.1.2 §8 made the panels *more* opaque
> because the background was winning against the text; taking them to solid
> finishes that argument rather than re-tuning it a third time. Translucency
> survives in exactly one place — the scrim over a venue photo, where there is
> something behind it worth seeing.

**Text — nine tones become three.**

| Token | Value | Contrast on `surface` | Role | Replaces |
|---|---|---:|---|---|
| `bone` | `#E9E7E0` | ~15.6:1 | Primary — titles, values, anything a decision rests on | `bone`, `chalk` |
| `muted` | `#9A9A9A` | ~7.0:1 | Secondary — supporting facts, durations, subtitles | `muted`, `muted-dim`, `subtle`, `footer-dim` |
| `faint` | `#7E7E7E` | ~4.7:1 | Tertiary — eyebrows, disabled, timestamps | `faint`, `hint`, `dim` |

> **`faint` moves from `#6F6F6F` to `#7E7E7E`, inside ruling A's one change.**
> `#6F6F6F` computes to roughly 3.8:1 on `surface` and 4.0:1 on `ink` — under
> the 4.5:1 AA threshold for normal text — and it is assigned to `eyebrow` (11px)
> and `small` (13px), which carry real content: the day-strip game count, the
> pass card's expiry line, and the claim bar's `Kicked off 19:00` status. That
> last one is the whole message of the bar in that state.
>
> **Why `#7E7E7E` and not `#8A8A8A`.** `#8A8A8A` clears AA comfortably at
> 5.6:1, and it is the wrong answer: §1.1 above names `#9A9A9A` and `#8A8A8A` as
> *the* example of two greys that are the same colour at 390px, and `muted` is
> `#9A9A9A`. Fixing the contrast by recreating the exact pair this round exists
> to delete would be a fix that undoes the ruling it is made under. `#7E7E7E` is
> as low as the AA floor allows — `#7B7B7B` is 4.5:1 exactly — which buys the
> widest separation from `muted` that still clears the threshold: 28 levels
> rather than 16.
>
> **The band is narrow and that is the real finding.** With `muted` at 6.8:1 and
> the AA floor at 4.5:1, a third tone has about 30 levels of room. **The rule
> that keeps it a distinct step:** `faint` is for text that is genuinely
> tertiary, never for the only statement of a fact. Where a `faint` line is the
> only place something is said — the claim bar's started state — it renders at
> `small`, not `eyebrow`. If a fourth tone is ever proposed, this band is the
> argument against it.

**Hairlines — nine become three.**

| Token | Value | Role |
|---|---|---|
| `hairline` | `rgba(255,255,255,.08)` | Divider inside a surface |
| `hairline-strong` | `rgba(255,255,255,.14)` | Secondary-button outline |
| `hairline-volt` | `rgba(200,255,0,.30)` | Selected / active outline |

Per ruling C, **no stroke on a card, chip, panel or day box.** Fill and radius
carry the surface. If a border is being drawn to separate two things, the gap
between them is too small.

**Focus — one token, new, and it is not a hairline.**

| Token | Value | Role |
|---|---|---|
| `focus-ring` | `#C8FF00` (full-opacity `volt`), 2px, 2px offset | The visible focus indicator on **every** focusable element |

> `hairline-volt` at `rgba(200,255,0,.30)` over `surface-raised` computes to
> roughly 2.4:1 — below the 3:1 WCAG 1.4.11 requires of a non-text indicator,
> and it was the only focus affordance the spec named. A focus ring is a
> different job from a selected outline and gets its own token; the offset keeps
> it legible against a `volt`-filled control, where a `volt` ring on its own
> edge would vanish.

**External brand — unchanged.** `whatsapp #25D366`, `instagram` gradient. Used
only for real brand marks, never as UI accents.

## 1.3 Radius — six become three

| Token | Value | Applies |
|---|---|---|
| `pill` | `999px` | Chips, spots pill, nav capsule, level badge |
| `control` | `14px` | Buttons, inputs, day boxes |
| `card` | `18px` | Cards, panels, sheets, the claim bar |

`chip 5` / `control 8` / `badge 9` / `cta 13` / `card 16` / `panel 22` retire.

## 1.4 Type

**Families — four become two, plus one reserved.**

| Family | Role |
|---|---|
| `display` (Anton) | The wordmark, and section titles only |
| `sans` (Manrope) | Everything else, including all buttons and nav labels |
| `mono` (JetBrains) | **Reserved: the variabilní symbol, nothing else.** It is copied into a banking app and must not be confusable |

Barlow Condensed leaves player-facing UI.

**Scale — seven steps.**

| Token | Size / line | Weight | Case |
|---|---|---|---|
| `hero` | `clamp(44px,10vw,88px)` / 0.92 | display | Upper (wordmark) |
| `title` | `clamp(24px,6vw,34px)` / 1.05 | display | Sentence |
| `time` | `28px` / 1.0 | sans 700 | — |
| `body-lg` | `17px` / 1.4 | sans 600, **700 variant** | Sentence |
| `body` | `15px` / 1.45 | sans 400–600 | Sentence |
| `small` | `13px` / 1.4 | sans 500 | Sentence |
| `eyebrow` | `11px`, `+3px` tracking | sans 600 | **UPPER** |

> `body-lg` carries **two documented weight variants of one step** — 600 as the
> default and 700 for the spots figure (§2.1). It is not two scale steps, and
> code should mirror the Figma layer rather than inventing one.

> `hero` drops from `clamp(58px,12.5vw,124px)`. Ruling J requires the hero lose
> ≥25% of its height so the three step cards clear the fold; the type is the
> largest part of that height.

**The uppercase rule (ruling B), stated once:** `eyebrow` is the only uppercase
style in the product. Every button, link, nav label, card title, section heading
and day label is sentence case. If a mockup shows tracked capitals anywhere
except a small grey eyebrow, it is wrong.

## 1.5 Spacing

4-point scale: **4, 8, 12, 16, 22, 32, 48**. `22` is the page gutter and stays
the outer margin on every screen. Card internal padding is `16`. Vertical gap
between cards in a list is `12`; between sections, `32`.

## 1.6 Elevation

No shadows except one: the claim bar and the nav pill cast
`0 -8px 24px rgba(0,0,0,.6)` upward, so content scrolling under them reads as
*under*. `volt-glow` retires from general use — a glow on everything is the same
problem as a border on everything.

## 1.7 Breakpoints — one value, and what changes at it

**One breakpoint: `md` = `768px`.** One is enough because only one thing
genuinely changes shape, and naming it here stops each of the eight build stages
from choosing its own.

| | Below `md` (390–767) | At and above `md` |
|---|---|---|
| **Navigation** | The floating nav pill renders. The header's link row does **not** | The header's link row renders. The nav pill does **not** |
| **Header** | Wordmark, auth control, language switcher — always, at every width (§3.1a of the contract) | Same, plus the links |
| **Page gutter** | `22` | `22`, with content capped at `720px` and centred |
| **Day strip** | 8 boxes, horizontally scrollable | 8 boxes, all visible, no scroll |
| **Pass tiers** | One per row | Two across |
| **Home step cards** | One per row | Three across |
| **Game card** | As drawn | As drawn, wider — no re-layout |

`SCR-APP-CHROME` in the wireframe sketches the desktop link row and the nav pill
in one frame; they are **mutually exclusive at every width**, and the frame is a
composite, not a layout.

**Content priority above `md` is per screen** — see the §3 table. The rule
behind every row of it: nothing is added at desktop width that a phone does not
get, and nothing is dropped. Width buys layout, not content.

---

# 2. Components

Build these as a library page before any screen. Every screen is assembled from
them; nothing is drawn twice.

## 2.0 Accessibility — applies to every component below

Not a section to read once. Each component's own entry restates the parts that
apply to it, and a component whose entry is silent on these is not ready to
build. 83 of 144 front-end files are being rewritten this round; this is the one
moment where building it in is cheap.

**Semantics — the element, not the handler.**

| Thing | Element |
|---|---|
| Game card (whole card is the tap target, ruling E) | `<a href>` wrapping the card — **not** a `<div onClick>`. Ruling E made the card a link, not a control |
| Day box, selected day box, `All` | `<a href>` — the filter is in the URL and the view is shareable |
| Rest day (no games) | Plain `<div>`: not a link, **not focusable**, no `tabindex` |
| Past game card | Plain element at 45% opacity, not focusable |
| Buttons that act (`Claim your spot`, `Save profile`, dismiss, close) | `<button>` |
| Cancel-booking dialog | `<dialog>` opened with `showModal()` |
| Nav pill items | `<a href>` inside a `<nav>` |
| FAQ question | `<button>` controlling a disclosure, `aria-expanded` |
| Every form | `<form>` with `<label htmlFor>` on every input |

**Focus.** Every focusable element shows the `focus-ring` token (§1.2) on
`:focus-visible`. Focus is never removed without a replacement, and the ring is
never the same treatment as the selected state — a selected day box that is not
focused, and a focused day box that is not selected, must be distinguishable.

**Accessible names for every icon-only control.** None of these has visible
text, so each carries an `aria-label`:

| Control | Accessible name |
|---|---|
| Avatar edit pencil (§3, profile) | "Change your photo" |
| Toast dismiss | "Dismiss" |
| Dialog close (×) | "Close" |
| Header avatar (signed in) | "Your profile" |
| Language switcher trigger | "Language: English" (the current language, spoken) |
| Back chevrons | Their destination — "Back to games", not "Back" |

**Dialogs.** `role="dialog"`, `aria-modal="true"`, an accessible name from the
title, a focus trap, `Escape` closes, and **focus returns to the control that
opened it**. `<dialog>` + `showModal()` gives the trap and the `Escape` for
free; the focus return does not come free and must be written.

**Live regions.** The toast is `aria-live="polite"` for success and
`aria-live="assertive"` for error, with `role="status"` / `role="alert"` to
match. Inline form errors are associated with their field via
`aria-describedby` and the field carries `aria-invalid`.

**Keyboard equivalents for anything scrollable or hover-driven.** The day strip
scrolls horizontally on touch; with a keyboard, each box is a link in tab order
and the container scrolls the focused box into view. The language menu opens on
`Enter`/`Space`, moves with arrow keys, closes on `Escape`, and returns focus to
its trigger.

**Targets.** Minimum **44 × 44px** for nav pill items, day boxes, the toast
dismiss, the dialog close, the avatar pencil and every text button. Where the
visual is smaller, the hit area is padded to 44 — the pencil is a 20px glyph in
a 44px target.

**Contrast.** Text at 4.5:1 minimum (§1.2 is built to clear it); non-text
indicators — focus ring, selected outline, the ladder colours where they carry
state — at 3:1 minimum.

**Verification.** axe-core on each stage's screens, zero serious violations, and
the core flows walked with the keyboard alone: find a game, claim a spot, cancel
a spot, sign in.

## 2.1 Game card — canonical (ruling E)

**One component, used on the games list, the home preview, and My Games.** No
variants per surface — including My Games' past rows, which use this card at its
past state rather than a list-row shape of their own.

```
┌────────────────────────────────────────────┐
│  20:00  60 min                       6v6   │   time = `time`/bone, duration = `small`/muted
│                                            │   format pill right-aligned
│  Praha 3 — Pražačka                        │   `body-lg`/bone
│                                            │
│  (◐)(◐)(◐)+9          3 spots left         │   avatar stack left, spots right
└────────────────────────────────────────────┘
   surface · radius card · padding 16 · no border
```

- **Whole card is the tap target.** No `View game →` (ruling E). It is an
  `<a href>` (§2.0), so it is keyboard-reachable and openable in a new tab.
- **Spots figure** is `body-lg` weight 700 in its ladder colour. It is the only
  coloured text on the card, and the number carries the meaning — the colour
  reinforces it.
- **Avatar stack**: up to 3 faces at 28px, −8px overlap, then `+N` in a
  `surface-avatar` circle. Replaces the deleted capacity bar (ruling D). Falls
  back to initials, which the product already does everywhere. **At zero
  bookings the stack is absent**, not an empty ring — the spots figure already
  says the game is open.
- **Format pill**: `pill`, `surface-raised` fill, `small`/muted. No level badge
  (ruling I).
- **No venue photo on the list.** v1.1.4 B stands; the photo is the detail's.
- **Overflow:** venue name truncates to one line with an ellipsis; time,
  duration, format and spots never truncate (§2.13).

**States:**

| State | Change |
|---|---|
| Default | As drawn |
| Full | Spots figure → `Full` in `danger`. Card still tappable — the detail offers the waitlist |
| **Past** | Whole card at **45% opacity**, not tappable, **not focusable**, no press state. New — the product has never drawn this |
| **Loading** | Replaced by the §2.10 skeleton at this card's exact geometry |

## 2.2 Day strip (ruling H)

Exactly **8 boxes**, horizontally scrollable below `md`, fully visible above it.
Today first.

```
┌──────┐  ┌──────┐
│ Fri  │  │ Sat  │      weekday `small`/muted
│  7   │  │  8   │      date `body-lg`/bone
│  1   │  │  4   │      game count `small`/faint — omitted when 0
└──────┘  └──────┘
 selected   rest
```

- `control` radius, `surface-raised` fill, **no border**.
- Selected: `volt` fill, `ink` text.
- A day with no games is drawn, greyed, **not a link and not focusable**
  (v1.2 A stands).
- Tapping a selected day clears the filter. An `All` affordance clears it too.
- **The strip filters; the list is never truncated by it** (ruling H).
- **Accessibility:** each active box is an `<a href>`; the focused box scrolls
  into view; selected state is announced (`aria-current="true"`), not inferred
  from the fill; minimum 44px target.

## 2.3 Bottom nav (ruling K)

Floating pill, `surface-raised`, `pill` radius, 16px inset from the screen edge,
`env(safe-area-inset-bottom)` respected via the existing `--tabbar-h`.
**Renders below `md` only** (§1.7); above it the header link row does this job.

Four items, in order: **Home · Games · Pass · Profile.**
Active item sits in a filled `volt` capsule with `ink` icon and label. Labels are
`small`, sentence case.

- **Accessibility:** a `<nav>` of `<a href>` items, `aria-current="page"` on the
  active one, 44px minimum target per item, focus ring visible against both the
  `surface-raised` pill and the `volt` capsule.
- **Overflow:** labels never truncate and never wrap. `Permanentka` (CS) in a
  four-item bar at 390px is the tightest case in the product and is a drawn
  prerequisite (`LETCO_ANALYZE.md` §6 P4). If it does not fit, the label
  changes; the type does not shrink and the label does not ellipse.

## 2.4 Claim bar (ruling G)

Fixed to the bottom, **above** the nav pill, `surface` at full opacity, `card`
radius on the top corners only, upward shadow. **It is present on every game
detail, in every state.**

| State | Left | Right |
|---|---|---|
| Open, signed in | `150 CZK` | Primary button `Claim your spot` |
| Open, signed out | `150 CZK` | Primary button `Sign in to claim` |
| Full | `150 CZK` | Secondary button `Join waitlist` |
| **On the waitlist** | `150 CZK` | `You are #3 on the waitlist` as `small`/muted — **no button this round** |
| Holding, paid | `Paid` in volt | Text button `Cancel` |
| Holding, unpaid | `150 CZK due` in warn | Text button `Cancel` |
| Started / cancelled | `150 CZK` | `Kicked off 19:00` / `Cancelled` as `small`/faint text — **no button** |

Never transparent (the brief's bug 1), never absent.

> **The waitlist state is new and it is the fourth row for a reason.** Without
> it a waiting player sees `Join waitlist` indefinitely, with no way to tell
> whether the tap worked and no way to know where they stand — while the
> notify-all FCFS emails keep arriving.
>
> **It ships without a `Leave waitlist` control, and that is a known gap.**
> There is no `leave_waitlist` RPC — `join_waitlist`, `waitlist_position` and
> `notify_waitlist` are the only three that exist — and every state transition
> here is a `SECURITY DEFINER` RPC, so it cannot be faked from the client.
> Leaving is quarantined (`LETCO_ANALYZE.md` §2a). The read-only position is
> still strictly better than the indefinite `Join waitlist` it replaces: the
> player can tell the tap worked and can see where they stand. **Reserve the
> right-hand space for the control** so adding it later is not a re-layout.

- **The bar renders in the loading skeleton too** (§2.10), so its height is
  reserved and the content beneath it does not jump when the data lands.
- **Overflow:** the price never truncates; the right-hand label wraps to a
  second line before it truncates, and the bar grows to fit (§2.13). The
  longest Russian labels here are roughly twice the English.
- **Accessibility:** the bar is a `<footer>` region with an accessible name; its
  button is a real `<button>` inside a `<form>` where it submits.

## 2.5 Buttons

| Variant | Fill | Text | Radius | Height |
|---|---|---|---|---|
| Primary | `volt` | `ink`, `body-lg` 700 | `control` | 52 |
| Secondary | none, `hairline-strong` outline | `bone` | `control` | 52 |
| Text | none | `muted` | — | 44 min target |

Sentence case, always. One primary per screen region.

**State axis — every variant carries all five.** The spec previously gave three
variants and no states, which is how eight `form_submit` actions reached the
wireframe with nothing to render while they ran.

| State | Treatment |
|---|---|
| Default | As above |
| Hover / press | Primary → `volt-dim` fill. Secondary → `hairline-volt` outline. Text → `bone` |
| **Focus** | `focus-ring` (§1.2), 2px, 2px offset, on `:focus-visible` |
| Disabled | Primary → `volt-dim` fill, `ink` at 55%. `aria-disabled`, not removed from tab order |
| **Pending** | **Fill drops to `volt-dim`, the label is unchanged, a 16px spinner sits left of it, `pointer-events: none`, and the button is `aria-busy="true"`** |

> **Pending is not decoration; it is the double-submit guard.** `click()` returns
> as soon as a form is submitted, and a server action is cancelled by navigation
> — two taps on `Take the spot` put two `create_booking` calls into the same
> capacity race. Every `form_submit` in `LETCO_UI_WIREFRAME.json` renders this
> state from its action's pending flag, and the label stays put so the button
> does not change width mid-press.

## 2.6 Info row

Icon (20px, `muted`) + label (`body`/muted) + value (`body`/bone, right).
Rows separated by `hairline`, not by gaps. Used by the detail's info card and
"Good to know". The icon is decorative (`aria-hidden`); the label is the name.

## 2.7 Pass card (ruling N)

```
5 games pass          ← `body-lg`/bone
140 CZK per game      ← `title`-adjacent, volt
Save 50 CZK           ← `small`/muted
1 month expiration    ← `small`/faint
[ Get this pass ]     ← primary
```

No "you get X CZK of credit" line. No single-game tier (v1.2 E stands).

**The tier list is the five rows `pass_tiers` actually carries** — the 1-game
tier was deleted from the table by v1.2 E, and there is no 10-game tier:

| Games | Price | Credited | Saving | Expiry line |
|---:|---:|---:|---:|---|
| 5 | 700 | 750 | 50 | 1 month expiration |
| 8 | 1 080 | 1 200 | 120 | 1 month expiration |
| 12 | 1 560 | 1 800 | 240 | 2 months expiration |
| 15 | 1 875 | 2 250 | 375 | 2 months expiration |
| 20 | 2 300 | 3 000 | 700 | 2 months expiration |

**The expiry line renders on every card**, never only on the first. Contract
§4.2: an expiry discovered after purchase is a complaint; an expiry read before
purchase is a choice. All five cards render in one vertical list below `md`, two
across above it; none is emphasised over the others — the per-game price is the
comparison and it is already the largest thing on each card.

## 2.8 Form controls (ruling L)

Text field: `surface-raised` fill, `control` radius, no border at rest.
Label above in `small`/muted, always a real `<label htmlFor>`.

**Focus:** the `focus-ring` token — a 2px full-opacity `volt` outline at 2px
offset. **Not `hairline-volt`**, which computes to roughly 2.4:1 against
`surface-raised` and fails the 3:1 WCAG 1.4.11 requires of a non-text indicator.
This was the only focus affordance the spec named, so it was also the only one
every other focusable element would have inherited.

**Error:** the field takes a 1px `danger` border and `aria-invalid="true"`, and
the message renders beneath it in `small`/`danger`, associated by
`aria-describedby`. Colour is never the only signal — the message is the signal.

**Multi-select chips:** `pill`, `surface-raised` at rest, `volt`/`ink` when
selected, `focus-ring` on focus. They are `<button role="option">` inside a
labelled group, or checkboxes styled as chips — either way keyboard-operable and
individually announced as selected or not. **They wrap to as many rows as they
need**; they never scroll horizontally and never truncate a label. Preferred
position (§3 screen 7) is the one consumer, and it must be drawn in the state
where more chips are selected than fit one row.

**Display/edit toggle:** the whole block swaps; `Edit details` → `Save profile`.
Focus moves to the first field of the edit block when it opens, and back to
`Edit details` when it closes.

## 2.9 Empty state (ruling P)

Icon or nothing, `body-lg`/bone line, `body`/muted second line, one primary
action where an action exists. Never a bare centred sentence.

Used by: the games list at zero, **home's upcoming section at zero**, My games at
zero, the wallet at zero balance, and the game detail's lineup at zero.

## 2.10 Skeleton (ruling P)

`surface-raised` blocks at the **exact geometry of the card they replace**, 1.2s
pulse, `aria-hidden` with an `aria-live="polite"` "Loading" status beside it.
Note the trap this round is fixing: the deleted capacity bar looked like a
skeleton because it was a row of grey segments inside a real card. Skeletons must
never appear inside a populated card.

**Where each one goes, and what geometry it takes:**

| Surface | Skeleton |
|---|---|
| Games list | Card geometry, three blocks. **Drawn** |
| **Game detail** | Photo block (16:9), info-card block with five rows, availability line, organizer card block, lineup row — **and the claim bar rendered in its own state, so its height is reserved**. This is the surface a shared WhatsApp link opens, and it was the one screen §3 asked for a skeleton on and no frame drew |
| **Pass** | Wallet block and the five tier cards — the balance and its batches are both loaded |
| **Profile** | **No skeleton.** Server-rendered empty frame: the labels are static and only the values are loading |
| **My games** | Card geometry for the upcoming section; the counts render as a server-rendered empty frame |

## 2.11 Error and pending conventions

Twenty-one wireframe actions reach the server. Before this section the product
had one drawn failure state — sign-in — which means every other failure rendered
as nothing happening: the "silently does nothing" mode `CLAUDE.md` records as an
already-paid-for lesson.

**Three surfaces, and every server action picks exactly one.**

| Surface | When | Shape |
|---|---|---|
| **Inline field error** | The input that is wrong is on screen and identifiable | §2.8's error treatment, beneath the field, `aria-describedby` |
| **Form-level error block** | The failure is about the submission, not a field — a race lost, a window closed, a permission refused | `surface-raised` block above the submit button, `danger` icon, `role="alert"`, one sentence plus a way forward |
| **Error toast** | The action was not a form submission, or its result screen has already replaced the page | §2.12's error variant |

| Action | Failure surface | Success |
|---|---|---|
| `createBookingAction` | Form-level block (game filled, already booked, started) | **Server-rendered** confirmation screen |
| `convertWaitlistAction` | Form-level block (lost the race → still-on-the-waitlist copy) | Server-rendered confirmation |
| `joinWaitlistAction` | Form-level block; a repeat tap is **not** an error — it reports the existing position | Bar re-renders in its waitlist state |
| `cancelBookingAction` | Form-level block inside the dialog (window closed, already cancelled) | **Server-rendered** refunded result |
| `buyPassAction` | Form-level block on the tier | Server-rendered top-up QR |
| `createTopupAction` | Form-level block, including the RPC's own 50–2000 rejection | Server-rendered QR |
| `updateProfileAction` | Inline field errors; form-level for anything else | Block returns to display mode with the new values |
| `changePasswordAction` | Inline field error on the wrong current password | In-place confirmation |
| `changeEmailAction` | Inline field error on the address | In-place "check both inboxes" |
| `set_profile_photo` + upload | Inline, beneath the avatar (too large / unsupported type / upload failed) | The new avatar renders |
| `signOutAction` | Error toast | Redirect to home |
| `setLocale` | Error toast | Page re-renders in the new language |
| `signInWithPassword`, `verifyEmailOtp`, `setPassword`, `startSignup` | Form-level block; **`TOS_REQUIRED` and `CONSENT_REQUIRED` are two distinct inline errors on their two boxes** | Redirect to the carried destination |

**Success never depends on client state.** `revalidatePath` unmounts anything
rendered from a `useActionState` result before it can be read, so every success
above is either a server-rendered screen or a toast the server emits — never a
banner a client action wrote.

**Pending is universal.** Every `form_submit` renders §2.5's pending state while
its action is in flight.

## 2.12 Toast

One component, `surface-raised`, `card` radius, above the claim bar and the nav
pill, dismissible.

| Variant | Tone | Semantics | Duration |
|---|---|---|---|
| Success | `bone` text, `volt` icon | `role="status"`, `aria-live="polite"` | Auto-dismiss at 5s |
| **Error** | `bone` text, `danger` icon | `role="alert"`, `aria-live="assertive"` | **No auto-dismiss** — an error the reader missed is an error that did not happen |

- **One at a time.** A second toast replaces the first rather than stacking; an
  error never replaces an error.
- Dismiss is a `<button aria-label="Dismiss">` at a 44px target.
- Hovering or focusing pauses the auto-dismiss timer.

**Inventory, restated against the v1.3 surfaces.** Contract §8 lists five
triggers; ruling G deleted `Copy link` from the game detail, so one of the five
no longer has a source:

| Contract §8 trigger | v1.3 |
|---|---|
| Booking created | **Retired as a toast** — the confirmation is a server-rendered screen (§2.11); a toast on top of it says the same thing twice |
| Sign-in | Kept |
| Cancellation + credit | **Retired as a toast** — same reason: the refunded result is a screen |
| Top-up confirmed | Kept — the player is not on the page when it happens |
| Link copied | **Gone.** Ruling G deleted the control that fired it |

## 2.13 Truncation and overflow

The wireframe is drawn in English. Czech runs longer and Russian longer still,
and `font-condensed` → `font-sans` widens every string that survives (F3). Every
component states what it does when the text does not fit; a component with no
rule here gets an arbitrary one at build time, per stage, differently.

| Component | Rule |
|---|---|
| Game card — venue name | Truncate, one line, ellipsis |
| Game card — time, duration, format, spots | Never truncate. The venue name yields first |
| Claim bar — price | Never truncate |
| Claim bar — right-hand label | Wrap to two lines; the bar grows. Only then truncate |
| Nav pill — labels | Never truncate, never wrap. If it does not fit, the **word** changes (§2.3) |
| Home step cards — title | Wrap to two lines |
| Home step cards — body | Wrap to three lines, then truncate |
| Info row — value | Wrap to two lines; the label never wraps |
| Pass card — tier title and per-game price | Never truncate |
| Chips | Never truncate. The group wraps to more rows (§2.8) |
| Buttons | Never truncate. Labels wrap to two lines and the button grows |
| Toast | Wrap to three lines |
| Lineup names | Truncate at the avatar's width, ellipsis |

Minimum tap width for any truncating interactive element is 44px regardless of
its content.

---

# 3. Screens

Mobile-first frames, 390px. `PROPOSAL` marks a frame the brief did not specify.

**Every screen in `LETCO_UI_WIREFRAME.json` appears here with an owning build
stage** (§5) and a note of whether it is redesigned or inherits the tokens only.
Eight screens previously fell in no stage, including the two the table itself
lists as deliverables and the mandatory step between the claim bar and every
booking.

| # | Screen | States to draw | Stage | Desktop (≥ `md`) content priority |
|---|---|---|---|---|
| 0 | Global chrome | Header signed in / signed out, language menu **with flags**, nav pill, footer, toast **success and error** | 0 | Header links replace the nav pill; nothing else changes |
| 1 | Home | Signed out, signed in with a booking, **upcoming at zero / one / two games** | 5 | Steps three-across; upcoming cards stay one-per-row so the card is never re-laid-out |
| 2 | Games list | Default, day-filtered, `PROPOSAL` empty, `PROPOSAL` loading | 1 | Day strip fully visible, no scroll; list unchanged |
| 3 | Game detail | Open, full, holding a spot, started, **on the waitlist**, `PROPOSAL` loading, **empty lineup**, **absent waitlist block** | 2 | Photo caps at `720px`; the claim bar stays fixed — the decision must stay reachable at every width |
| 4 | `PROPOSAL` Claim confirmation | Success, insufficient balance (routes to the **pass tiers**, §1a of the analysis) | 6 | Single column, capped |
| 5 | `PROPOSAL` Cancel booking | Confirm dialog, refunded-to-wallet result (ruling O, credit half only), **failure inside the dialog** | 6 | Dialog centred, `480px` max |
| 6 | Pass / credits | **Five tiers**, wallet with balance **as credits with CZK beneath**, **multi-batch (two expiries, one within three days)**, `PROPOSAL` zero balance | 4 | Tiers two-across; wallet full width above them |
| 7 | Profile | Display mode, edit mode (**all six ruling-L fields**, position as **chips**, including more chips than fit one row), My Games expanded, **photo crop / uploading / rejected** | 3 | Single column, capped — a form that reflows to two columns changes its reading order |
| 8 | `PROPOSAL` Waitlist | **Join confirmation**, spot-opened state, not-on-the-list state | 6 / 2 | Single column, capped |
| 9 | Auth | Sign in, sign up (**contract §3.1 field order**, **both consent errors**), set password, `PROPOSAL` restyled to the new system | 7 | Form capped at `420px`, centred |
| 10 | `PROPOSAL` 404 / error | 404, sign-in-link failure **with resend, wrong-address and use-a-code paths** | 7 (auth error) / 0 (404) | Centred |
| 11 | Payment choice | QR platba / cash, error state, **pending on submit** | 6 | Single column, capped |
| 12 | My games | Upcoming, past (**canonical card, past state**), empty, counts | 3 | Single column, capped |
| 13 | Top-up payment (QR) | Pending, confirmed | 4 | Single column, capped |
| 14 | Terms · Privacy | As they stand — **token-inherit only**, strip check | 0 | Prose capped at `640px` |

> **There is no standalone top-up amount chooser.** Ruling N removes the
> separate top-up-wallet entry point from the player UI; `create_topup` and its
> VS series are untouched and a pass purchase mints one, which is what screen 13
> renders. See `LETCO_ANALYZE.md` §1a.

> ### RULING J, AMENDED 2026-08-10 — a documented PARTIAL REVERSAL
>
> Two of ruling J's deletions are reversed by the owner's call. The rest of
> the ruling stands and is built as written.
>
> - **Player of the Month STAYS**, and keeps the hours-on-pitch stat added
>   alongside it. Ruling J removed it as a panel that earned no space; the
>   stat is what changed — a name alone said somebody had been chosen, and
>   hours on the pitch says why.
> - ~~**The equipment line STAYS.**~~ **REVERSED AGAIN 2026-08-16** (Section 2,
>   item 5): the line is removed. It has now been deleted by ruling J,
>   restored by this amendment, and deleted by the owner's order — recorded in
>   full rather than tidied, because the argument for keeping it ("what do I
>   bring" is the second question anyone asks) is sound and someone will make
>   it a third time. If it returns, it returns as a venue amenity, where it is
>   a per-pitch fact an organizer can turn off rather than a promise the string
>   table makes about every pitch forever.
>
> Recorded here rather than in a commit message because the paragraph below
> is what a later session reads and rebuilds from, and an un-amended ruling
> is how a reversal gets quietly re-applied. Everything else in ruling J —
> the reorder, the hero, the FAQ window, the bottom button, the panel order
> — is unchanged.

**Home order (ruling J, as amended):** hero (≥25% shorter) → three steps
(**without** the equipment line, per the 2026-08-16 reversal) →
Upcoming Games (3 canonical cards + `All games →` primary button at the
section's **bottom**) → active-players banner → community card → FAQ →
**Player of the Month** → footer. The **equipment line stays** with the three
steps — **the equipment line is gone**. **At zero upcoming games the section renders the §2.9 empty
state with the WhatsApp action**, and at one or two it renders what it has — the
`All games` button stays in both cases.

**Game detail order (ruling G, M):** venue photo → venue name → info card (date,
time, format, level, `Open location in Maps`) → availability → organizer (with
locked state) → player list → `Good to know` → share on WhatsApp → claim bar.
No price in the info card. No `Copy link`. No "2 subs per team".

**Lineup and waitlist at zero.** `Lineup (0)` renders the §2.9 empty state
inline — one line, no action, since the claim bar already carries the action.
**The waitlist block does not render at all when empty**; a heading over nothing
invites the reader to wonder what is missing. The lineup lists every player;
`+N` is display-only overflow at narrow widths and expands in place.

**Wallet display (ruling F).** Credits are the headline; the CZK figure sits
small beneath. Contract §4.2 requires **batches** — amount, expiry date and
games-equivalent — rather than one opaque total, so the wallet draws a list, and
the multi-batch state with one batch inside its three-day heads-up window is a
required frame rather than an edge case.

---

# 4. Copy — EN / CS / RU

New and changed strings only. These go into `lib/strings.ts` and the `lib/i18n/`
overlays **in the same commit as the English**, or `npm run test:unit` fails.
That walk gates **every** build stage, not only the copy stage — see §5.

> **Money words are not translated.** Currency and payment terms follow the
> existing convention in `lib/strings.ts` in every language — a player is about
> to open a Czech banking app, and a translated `variabilní symbol` is a payment
> that arrives unmatched.

| Key | EN | CS | RU |
|---|---|---|---|
| home.heroTagline | Come for the game, stay for the crew | Přijď si zahrát, zůstaň kvůli partě | Приходи за игрой, оставайся ради компании |
| home.heroSubline | Weekly pickup football games near you. Find a game, book in seconds, show up & play! | Fotbal každý týden ve tvém okolí. Najdi zápas, rezervuj místo za pár vteřin, přijď a hraj! | Футбол каждую неделю рядом с тобой. Найди игру, забронируй место за секунды, приходи и играй! |
| home.step1Title | Find a game | Najdi zápas | Найди игру |
| home.step1Body | Matches near you every week. | Zápasy ve tvém okolí každý týden. | Матчи рядом с тобой каждую неделю. |
| home.step2Title | Book your spot | Rezervuj místo | Забронируй место |
| home.step2Body | Claim your spot in seconds. | Zabereš si místo za pár vteřin. | Займи место за считаные секунды. |
| home.step3Title | Show up and play | Přijď a hraj | Приходи и играй |
| home.step3Body | You're in. Time to play. | Jsi v sestavě. Jde se hrát. | Ты в составе. Пора играть. |
| home.upcomingGames | Upcoming games | Nadcházející zápasy | Ближайшие игры |
| home.allGames | All games | Všechny zápasy | Все игры |
| home.joinWhatsapp | Join the WhatsApp group | Přidej se do WhatsApp skupiny | Вступай в группу WhatsApp |
| nav.home | Home | Domů | Главная |
| nav.games | Games | Zápasy | Игры |
| nav.pass | Pass | Permanentka | Абонемент |
| nav.profile | Profile | Profil | Профиль |
| games.spotsLeft | {n} spots left | Zbývá {n} míst | Осталось мест: {n} |
| games.full | Full | Obsazeno | Мест нет |
| games.past | Finished | Odehráno | Завершено |
| games.emptyTitle | No games scheduled | Žádné naplánované zápasy | Игр пока нет |
| games.emptyBody | New games go up every week. | Nové zápasy přibývají každý týden. | Новые игры появляются каждую неделю. |
| games.loading | Loading games | Načítám zápasy | Загружаем игры |
| game.claimSpot | Claim your spot | Rezervovat místo | Забронировать место |
| game.signInToClaim | Sign in to claim | Přihlas se a rezervuj | Войди, чтобы забронировать |
| game.joinWaitlist | Join waitlist | Zapsat se na čekačku | Записаться в лист ожидания |
| game.onWaitlist | You are #{n} on the waitlist | Jsi {n}. na čekačce | Ты {n}-й в листе ожидания |
| game.waitlistJoined | You're on the list. We email everyone the moment a spot opens. | Jsi na čekačce. Až se místo uvolní, napíšeme všem. | Ты в листе ожидания. Как только место освободится, мы напишем всем. |
| game.paid | Paid | Zaplaceno | Оплачено |
| game.amountDue | {amount} due | K úhradě {amount} | К оплате {amount} |
| game.kickedOffAt | Kicked off {time} | Začalo v {time} | Начало в {time} |
| game.goodToKnow | Good to know | Dobré vědět | Полезно знать |
| game.organizerLocked | Contact unlocks when you book | Kontakt se odemkne po rezervaci | Контакт откроется после брони |
| game.lineupEmpty | Nobody has claimed a spot yet | Zatím si nikdo nezabral místo | Пока никто не занял место |
| game.showAllPlayers | Show all players | Zobrazit všechny hráče | Показать всех игроков |
| booking.confirmBooking | Confirm booking | Potvrdit rezervaci | Подтвердить бронь |
| booking.cancellationWindow | {window} — your credit goes back to your wallet. | {window} — kredit se ti vrátí do peněženky. | {window} — кредит вернётся в кошелёк. |
| booking.gameJustFilled | This game just filled up. | Zápas se právě zaplnil. | Игра только что заполнилась. |
| booking.someoneTookIt | Someone else took the last spot. | Poslední místo si vzal někdo jiný. | Последнее место занял кто-то другой. |
| booking.takeTheSpot | Take the spot | Vzít místo | Занять место |
| booking.cancelTitle | Cancel your spot? | Zrušit rezervaci? | Отменить бронь? |
| booking.refundCredit | Your credit goes back to your wallet. | Kredit se ti vrátí do peněženky. | Кредит вернётся в кошелёк. |
| booking.refundToWallet | What you paid goes back as wallet credit. | Co jsi zaplatil, se ti vrátí jako kredit do peněženky. | То, что ты заплатил, вернётся кредитом в кошелёк. |
| booking.cancelFailed | We couldn't cancel that. Your spot is unchanged. | Zrušení se nepovedlo. Rezervaci máš pořád. | Отменить не вышло. Бронь осталась. |
| pass.tierTitle | {n} games pass | Permanentka na {n} zápasů | Абонемент на {n} игр |
| pass.perGame | {amount} per game | {amount} za zápas | {amount} за игру |
| pass.saves | Save {amount} | Ušetříš {amount} | Экономия {amount} |
| pass.expiration | 1 month expiration | Platnost 1 měsíc | Срок действия 1 месяц |
| pass.expiration2Months | 2 months expiration | Platnost 2 měsíce | Срок действия 2 месяца |
| pass.getThisPass | Get this pass | Získat permanentku | Получить абонемент |
| wallet.credits | {n} credits | {n} kreditů | {n} кредитов |
| wallet.creditsOne | 1 credit | 1 kredit | 1 кредит |
| wallet.inCzk | {amount} in your wallet | {amount} v peněžence | {amount} в кошельке |
| wallet.topUp | Top up credit | Dobít kredit | Пополнить кредит |
| wallet.batchExpires | {amount} expires {date} | {amount} platí do {date} | {amount} действует до {date} |
| wallet.batchExpiresSoon | Expires soon | Brzy vyprší | Скоро сгорает |
| wallet.empty | No credit yet | Zatím žádný kredit | Кредитов пока нет |
| wallet.notEnoughCredit | Not enough credit to cover this game. | Na tenhle zápas nemáš dost kreditu. | Кредита на эту игру не хватает. |
| profile.myGames | My games | Moje zápasy | Мои игры |
| profile.editDetails | Edit details | Upravit údaje | Изменить данные |
| profile.saveProfile | Save profile | Uložit profil | Сохранить профиль |
| profile.displayName | Display name | Zobrazované jméno | Отображаемое имя |
| profile.position | Preferred position | Preferovaný post | Предпочитаемая позиция |
| profile.skillLevel | Skill level | Úroveň | Уровень |
| profile.nationality | Nationality | Národnost | Гражданство |
| profile.phone | Phone | Telefon | Телефон |
| profile.email | Email | E-mail | E-mail |
| profile.changeEmail | Change | Změnit | Изменить |
| profile.requestEmailChange | Request email change | Požádat o změnu e-mailu | Запросить смену e-mail |
| profile.changePhoto | Change your photo | Změnit fotku | Изменить фото |
| profile.photoUploading | Uploading your photo… | Nahrávám fotku… | Загружаем фото… |
| profile.photoTooLarge | That image is over 2 MB. Pick a smaller one. | Obrázek má přes 2 MB. Vyber menší. | Изображение больше 2 МБ. Выбери поменьше. |
| profile.photoWrongType | Use a JPG, PNG or WebP image. | Použij JPG, PNG nebo WebP. | Подойдёт JPG, PNG или WebP. |
| profile.photoFailed | The photo didn't upload. Try again. | Fotka se nenahrála. Zkus to znovu. | Фото не загрузилось. Попробуй ещё раз. |
| profile.noGames | You haven't joined a game yet | Zatím ses nepřihlásil na žádný zápas | Ты ещё не записался ни на одну игру |
| signup.tosRequired | Accept the terms of service to continue. | Bez souhlasu s podmínkami to nejde dál. | Без принятия условий продолжить нельзя. |
| signup.consentRequired | Consent to data processing to continue. | Bez souhlasu se zpracováním údajů to nejde dál. | Без согласия на обработку данных продолжить нельзя. |
| signup.checkInbox | Check your inbox — we sent a link to {email} | Mrkni do e-mailu — poslali jsme odkaz na {email} | Проверь почту — мы отправили ссылку на {email} |
| signup.resend | Send the email again | Poslat e-mail znovu | Отправить письмо ещё раз |
| signup.wrongAddress | Wrong address? Go back and change it | Špatná adresa? Vrať se a oprav ji | Не тот адрес? Вернись и исправь |
| signup.useCodeInstead | Enter the six-digit code instead | Zadej radši šestimístný kód | Ввести шестизначный код |
| auth.linkFailed | That link couldn't be used to sign you in. | Tímhle odkazem se přihlásit nepovedlo. | По этой ссылке войти не получилось. |
| common.saving | Saving… | Ukládám… | Сохраняем… |
| common.working | Just a moment… | Moment… | Секунду… |
| common.tryAgain | That didn't go through. Try again. | Neprošlo to. Zkus to znovu. | Не прошло. Попробуй ещё раз. |
| common.dismiss | Dismiss | Zavřít | Закрыть |
| common.close | Close | Zavřít | Закрыть |

Czech uses informal *ty* throughout, matching the existing copy. Russian
follows it — the register is a pickup football game, not a bank.

`games.spotsLeft` needs Czech and Russian plural forms (`1 místo` / `2–4 místa` /
`5+ míst`; `1 место` / `2–4 места` / `5+ мест`). The current string table is
flat; this is the one string in the set that needs a plural helper, and it is
called out so it is not discovered at implementation time. **It lands on the
Stage 1 card**, so Stage 1 cannot go green without it. `pass.expiration` and
`pass.expiration2Months` are deliberately two keys rather than one templated
plural, so the tier list needs no second helper.

**`booking.cancellationWindow` is one sentence, and `{window}` is read from
`lib/policy.ts`.** The wireframe carried two hand-written windows — *"Free
cancellation up to 12 hours before start"* on the payment step and contract §6's
FAQ answer *"Cancel anytime before kickoff for full wallet credit"* — read
minutes apart by the same player and unable to both be true. `CLAUDE.md` records
that the real window is a value in `lib/policy.ts` and that policy windows are
values, never branches, so both surfaces render this one key from that value.

**Read 2026-08-07 (prerequisite P5), and the FAQ was right.**
`policy.cancellation.cutoffHoursBeforeStart` is **`0`** — *"right up to kickoff,
with no lead-time cutoff"* — and `cancel_booking` is the enforcement authority,
raising `CANCEL_WINDOW_CLOSED` once `starts_at <= now()`. The wireframe's twelve
hours was not a different reading of the policy; it was a different policy.
`unpaidNudge.hoursBeforeStart` is 12, and it appears to have been read across.

**The refund half says credit, not "in kind".** Ruling O asks for cash back to
whoever paid cash, and `policy.cancellation.refundAs` is `"credit"` — migration
`20260720120000` puts it plainly: *there is no cash-refund path anywhere*. Money
never leaves the system, by Phase 1 design. So the copy promises what the
product does, and `booking.refundCash` is deleted rather than translated into
three languages; `booking.refundToWallet` replaces it and is honest to a cash
payer. `LETCO_ANALYZE.md` §2a quarantines the cash half.

---

# 5. Build stages

Mirrors `LETCO_ANALYZE.md` §6 — that document is the source and this table is
kept identical to it. Prerequisites P1–P5 and the four exit conditions there
apply here in full; the two that most often get dropped are restated below.

| Stage | Contents | Screens owned | Verifiable by |
|---|---|---|---|
| **0** | Token table plus all call-site migrations across **92 of 144 files (64%)**. No screen is redesigned, but **every screen changes appearance** (F5/F6 deltas, ~294 font migrations, ruling C's stroke removal, the `faint` and focus-ring contrast corrections). Global chrome restyled: header, footer, nav pill shell, language menu with flags, toast in success **and** error variants | Global chrome — redesign. 404, terms, privacy — **inherit-only, strip check** | `test:unit`; strips of every screen at 390px and desktop, EN and CS, reviewed expecting the deltas; axe |
| **1** | Canonical game card, games list, 8-box day strip, list empty **and** loading | Games list — redesign | `test:e2e` list specs + strips |
| **2** | Game detail rebuild, **seven-state** claim bar (the waitlist state **read-only**, no leave control — quarantined), organizer locked state, detail skeleton with the bar's height reserved, zero lineup, absent waitlist block | Game detail — redesign | `test:e2e`, one spec per bar state |
| **3** | Nav: Home in, **My games entry point** into Profile (`/my-games` stays a route), profile display/edit with all six ruling-L fields, My games' own empty and loading states | Profile, My games — redesign | `test:e2e` incl. `/my-games` still resolving; axe |
| **4** | Pass — the five real tiers with per-tier expiry; wallet in credits with batches and the expiring-soon state; zero balance; top-up QR. **Repricing to 150 is an admin data operation** | Pass, top-up QR — redesign | `test:e2e` + **`test:integration` ledger check** |
| **5** | Home reorder, hero ≥25% shorter, upcoming at zero/one/two, FAQ window from `lib/policy.ts`, copy revision of already-translated keys | Home — redesign | `test:unit` (i18n walk) + strips EN/CS/RU |
| **6** | Payment choice, claim confirmation, waitlist convert **and join confirmation**, cancel dialog with focus management, **refund as wallet credit** (the issuance already exists; cash-to-cash is quarantined) | Payment choice, confirmation, waitlist convert, cancel dialog — redesign | `test:e2e` asserting on server renders or the database |
| **7** | Auth restyled: login, signup in contract §3.1 field order with two distinct consent errors, set password, sign-in-link failure with resend / wrong-address / use-a-code | Login, signup, set password, auth error — redesign | `test:e2e` auth specs (one cached session per player) + axe |

Stage 0 first, always. It is the stage that answers the actual complaint.

**Two exit conditions worth restating here**, because they are the two a stage
table invites you to defer:

1. **CS and RU ship in the same commit as EN, in every stage.** The i18n walk is
   not Stage 5's gate; it is every stage's gate.
2. **A stage ships its surfaces' empty, loading, error and pending states.**
   There is no later stage that collects them (ruling P, and F9 of the
   analysis).

---

# 6. Redesign v2 — Round 0 rulings (2026-08-20)

The 19-frame export in `/Users/oliverstaehelin/export` is audited in
`docs/redesign-v2/AUDIT.md`. That audit raised thirteen items for ruling; the
owner settled them here. **These rulings govern every redesign round.**

The redesign era builds on `staging/v13`. `main` and production are untouched
until the owner orders the merge — see `docs/redesign-v2/MERGE_READINESS.md`.

## R1 — `Join →` on list cards: ADOPTED AS PAINT ONLY

The frames draw a `Join →` button inside each list card. It ships as a
**button-styled visual cue and nothing else**: no `<a>`, no `<button>`, no
handler, no focus stop.

**Ruling E is upheld, not reversed.** E removed the in-card CTA because a link
inside a link is both redundant and the reason the card could not simply be an
anchor. That reasoning is untouched — the whole card remains the single anchor.
What changes is only that the card now *looks* like it carries an action.

**No nested links, ever.** A future round that makes this element interactive
reopens ruling E and needs its own ruling first.

## R2 — Community nav tab: DEFERRED

The pill stays at **three** (Home, Games, Profile). Ruling K is unchanged.

`p12` draws a fourth `Community` tab. The tab may land **only in the round that
ships an actual Community page** — a tab pointing at nothing is the defect
ruling K's own reasoning describes.

## R3 — Payment: QR RETIRED FROM THE REDESIGNED UI

The frames disagree with each other: `p04` shows no bank transfer at all, while
`p05` shows QR selected on the same flow. The owner resolved it toward `p04`.

- **`Pay with Stripe` and `Pay with card` are ONE option.** They were the same
  rail described twice.
- **QR / bank transfer is REMOVED from the redesigned payment surfaces
  entirely.** Card is the sole method shown.
- The card option is **fully styled as designed and wired to NOTHING** — no
  handler, no route, no action. The rail is integrated later.

**SCOPE IS UI-LEVEL ONLY, and this is the load-bearing half.** The backend QR
machinery is **not touched, removed, or refactored**: the `'26'`-series variable
symbols, `create_topup` / `confirm_topup`, the pass paths and the credit ledger
all stay exactly as they are. They are the substrate Stripe maps onto. A round
that "cleans up" the QR backend because the UI no longer calls it is deleting
the thing the next round needs.

> ~~**Insufficient credits offers both routes** — get more credits, or pay for
> this game now.~~ **REVERSED 2026-08-20 (R3).** Until Stripe is live there is
> no working per-game payment route to offer, so the insufficient-credits state
> shows the **Get-credits route only**. Recorded as a conscious reversal rather
> than edited away: the dual route was right when a QR path existed behind it,
> and it becomes right again the moment Stripe does.

**"Never block a booking to upsell" is unchanged.** The pass is offered; it is
never a gate.

**Consequence, recorded in MERGE_READINESS.md as the first blocking item:**
merging before Stripe activation leaves no working per-game payment path.

## R4 — Per-game card payment FUNCTIONALITY: still deferred

R3 grants UI **presence**, not functionality. The Stripe round ships passes
first; per-game card payment remains deferred and is not built by any redesign
round.

## R5 — Anton: widened NARROWLY

Anton extends to **display-scale numerals only** — hero money figures, large
spots-left counters. **Never body-size figures. Never body text.**

The standing ruling otherwise stands in full: Anton is the wordmark and the
existing display headings; body is Onest.

## R6 — Photographic backgrounds: ADOPTED

The frames are the source of truth for the look.

**The asset.** `farming1.png` in the export folder — 640×336, the only image
that is not a 784px bezeled page frame. A web-ready copy lives at
`public/pitch-default.jpg` (JPEG, 78 KB); the original is untouched in the
export folder.

**One DEFAULT pitch image for all games.** Per-venue photos are a later concern
and are not built. `venues.image_path` already exists and is not touched.

**Usage law:**

- **(a) LIST CARDS / PILLS** — faded background, exactly as the frames draw it.
- **(b) GAME DETAIL PAGE** — the photo backs the header band and **fades out
  vertically**: fully faded below the venue-title line and above the first
  content box beneath it, so that box sits on the normal flat surface.

**Contrast floor, on both.** Scrim values are derived FROM the frames. Text
legibility must equal the current flat surface, and the **1.5px volt outline
must remain visibly intact over the photo**. Asserted by a spec when the card
round builds it — not by eye.

## R7 — Desktop: mobile-only export is BY DESIGN

Build mobile from the frames. **Current v1.3 `md:` behaviour survives unchanged
as interim law.** Desktop redesign is its own later phase.

**No round may degrade an existing `md:` layout.** A round that cannot honour a
breakpoint stops and asks.

## R8 — Public player profile: QUARANTINED

The privacy question rides with it. The three referencing surfaces —
leaderboard, Player of the Month, roster avatars — ship **non-clickable and
monogram-style**, mirroring the organizer-photo ruling.

## R9 — Strips hygiene: standing practice

Strips are committed **once**, when presented for review. Incidental
regenerations of already-reviewed strips are **discarded** (`git restore`),
never swept into a commit. A diff full of re-rendered PNGs hides the one file
that actually changed.

## Amendment to §5 build order

**The payment round is UN-GATED from the Stripe integration.** Under R3 the
payment surfaces are paint over an inert control, so they can be built from the
frames without the rail existing. What remains gated is *activation*, which is
MERGE_READINESS.md's first blocking item rather than a build dependency.

---

# 7. Redesign v2 — Round 3 rulings (2026-08-20)

Three stops from the night run, settled by the owner. R10 and R11 are lessons
promoted to law; R12 moves a component.

## R10 — List density: 2 whole cards, RATIFIED

The games list shows **two whole cards above the fold, not three**. The frames'
own density is two — `p02` draws the third below the fold — so the redesign
card at 159px against the old 141px is the design, not an implementation miss.
It was already trimmed as far as the frames allow (padding 16→12, row gaps
10→8, cue padding 6→4) and no further trim is authorised.

**The count is relaxed; the criterion it protected is not.** What the old
three-card rule actually defended is that **the list visibly continues past the
fold** — the reader must be able to see that scrolling yields more. That is
unchanged, still asserted, and is the thing a later round must not break. A
change that fits three cards by making the list *stop* at the fold fails this
ruling even though it satisfies the number.

## R11 — Sub-pixel borders: PROHIBITED, and the diagnosis is law

**No spec may assert a border width the built stylesheet cannot render.**

Chrome snaps a border to the device pixel grid, so `border-[1.5px]` is applied
and *reported* as `1px`. A "make the outline thicker" change therefore did not
render for two rounds, and the spec asserting `1px` agreed with it — a green
suite over a change that never happened.

Every outline in the redesign is **`border-2`**. Do not reintroduce a
fractional border, and do not blame `.lifted`: the built stylesheet shows the
utility wins the cascade. §6 R6's "1.5px volt outline" is superseded by this
ruling wherever the two are read together.

## R12 — Nav bar geometry: THE FRAMES WIN (second reversal)

The **band** is flush — full-bleed, bottom edge on the viewport's bottom edge.
The **cells** are inset **12px from each screen edge**, with a **6px** gap,
measured off `p02` at a 390px viewport.

> ~~The pill floats 16px clear on every side (ruling K).~~ **REVERSED
> 2026-08-19** to flush on all edges, cells at 8px.
> ~~Flush wins over the frames, which inset the cells.~~ **REVERSED
> 2026-08-20 (this ruling).** The frames win on the horizontal geometry.

**Second reversal on this element, and the lineage is recorded rather than
edited away** — three positions in two days means the next session will find a
comment arguing for whichever one it happens to read first.

**Only the geometry moves.** The `elementFromPoint` top-layer guarantee and the
safe-area-inset-as-bottom-padding both survive from the flush work untouched.
`e2e/nav-pill.spec.ts` asserts the two halves separately: `assertFlush` on the
bar, `assertCellsInset` on the cells, symmetric left and right.

---

# 8. Redesign v2 — Rounds 4–6 rulings (2026-08-20)

Decisions taken during the night run, in the order the rounds hit them. Each
one is either a divergence from a frame or a reversal of standing law, and each
is recorded because the next session comparing page to frame will see it
immediately.

## R13 — Game detail: ONE header band, and the photo wins over the frame

There is one header for every game: back circle and venue title on a single
row, first content box directly beneath. The two v1.2 layouts — a 280px
full-bleed hero for a venue with a photograph, a compact text header for one
without — are gone. The same page opening two different ways depending on a
column most venues leave null is the defect; the tall one also pushed "when is
it" below the fold.

**`p03` DRAWS THE BAND FLAT BLACK. R6(b) WINS ANYWAY.** The ruling postdates
the frame and says the photograph backs the band. The scrim's last stop is
`ink` at **full** opacity — the page's own ground — because that is what makes
the join invisible; anything short of it leaves a hairline of photograph along
the top of the first card that reads as a rendering artefact.

**Which photograph:** the venue's own when it has one, R6's default otherwise.
R6 forbids *building* per-venue photos; it does not require deleting the ones
that already work. `data-photo` keeps meaning "this venue has a picture of its
own", and the band is never empty.

## R14 — R5's two named cases, applied

Anton was granted to "display-scale numerals only — hero money figures, large
spots-left counters" and had been applied to neither. `p03` sets both in it:
the availability counter and the claim bar's price. **The list card's figure
stays on the body face** — `body-lg` at weight 700 is a body-size figure, which
is the half R5 forbids. Both directions are asserted.

## R15 — Auth: Google is NOT built, and forgot-password keeps its behaviour

`p08` draws `Continue with Google` and `Sign up with Google`. **There is no
Google OAuth in this product.** A button that cannot sign anyone in is the dead
affordance the run's own rule forbids; it lands with the capability, not
before. A spec fails if a later round paints one from the frame.

`p08` also draws `Forgot your password?` as a link to a screen that does not
exist — the audit lists both reset frames as missing (§3a item 2). **The
working two-step (request a code, then type it) is untouched underneath**; only
the box around it changes. Asserted as "still a form, with its own field and
its own submit", so it cannot be quietly swapped for the frame's link.

**The field treatment moved into `globals.css` as `.field` / `.field-label`**,
beside `.lifted`. Two byte-identical constants in two files is not a shared
treatment. The label loses JetBrains Mono, which appears in none of the
nineteen frames, and takes `eyebrow`; the field gains a fill, because
`bg-transparent` on `ink` makes an empty input an outline around the page.

## R16 — Profile cover: photograph, REVERSING the gradient

> ~~The cover is a gradient, not a photograph. A venue photo would be a picture
> of a pitch this player may never have played on, presented as if it were
> theirs — an invented fact under someone's face.~~ **REVERSED 2026-08-20.**

The reasoning was sound and its **premise changed**: it assumed the only
photograph available was some particular venue's. R6 introduced one generic
pitch used identically behind every list card and every game header, so here it
is furniture — like the pitch canvas already behind this page — and not a claim
about where anyone has played. The objection stands in full against a *venue*
photo on a profile, and that is still not built.

`p10` and `p11` both draw the photographic cover; the audit lists it as a delta
from v1.3 rather than as a request.

**The stacking bug this created is law now.** Giving the cover a scrim made it
a POSITIONED element, and a positioned element paints above its non-positioned
siblings whatever the source order says — so the cover painted over the
overlapping identity row and sliced the nickname in half. It reads as a
font-rendering artefact. Diagnose with `elementFromPoint`, which is CLAUDE.md's
standing method for the z-index family, and give the overlapping row its own
`relative`.

## R17 — `page-title`, a type step the scale did not have

The frames set a page's display heading at **32px** on a 390 viewport; `title`
clamps to its 24px floor there, so every page heading in the product was
rendering a third small. A new step rather than a wider `title`, which is
aliased by `section-title`, `match-title`, `hero-sub` and `community-title`
across 19 headings in rounds that are not in scope.

Applied to: `/games` h1, home's `UPCOMING MATCHES`, the game detail's venue,
the auth titles, and the Player of the Month's name.

## R18 — Accepted divergences, listed

Cosmetic gaps that ship. Each was measured against its frame and judged smaller
than the churn of closing it.

| Surface | Divergence | Why it ships |
|---|---|---|
| Home hero | 44px against the frames' ~48px | `hero`'s clamp floor is ruling J's, set so the three steps clear the fold |
| Home hero, RU | Three rows, not two | **Anton ships no Cyrillic subset.** Russian display copy falls back to the body face and sets far wider; fitting line two on one row needs a 29px hero. The break still lands on the sentence boundary, which is what the spec asserts |
| Home, `All games` | A button under the cards, where `p01` puts a link in the heading row | Ruling J moved it there deliberately and gave its reasons. Law beats frame on an affordance's prominence, as under R1 |
| Community stats, profile stats | Captions wrap to two lines where the frames keep them on one | `eyebrow`'s 3px tracking does not fit "GAMES PLAYED" in a third of 390. Ruling B's one uppercase style beats the frame's letter-spacing |
| Day strip | Nine cells at 48px against the frames' six at ~52px | The calendar-width ruling forbids a scrolling row, so the cell count is fixed and the width follows |
| Games list | Two whole cards above the fold, not three | R10 |
| Every page | The pitch canvas is visible behind the content where the frames draw flat black | `SiteBackground` is round-1 chrome, already reviewed. Removing it globally is a chrome decision, not a page one |
| Game detail | The header band is photographed where `p03` draws it flat | R13 — R6(b) postdates the frame |
| Profile | The cover is 132px; `p10` runs the photograph down past the stats to the tab row | Extending it puts white stat numerals over the photograph's brightest region. That is a contrast question, and the round had no budget left to measure it properly — deferred rather than guessed |

---

# 9. Redesign v2 — Round 8 rulings (2026-08-20)

## R19 — Gradient stop positions are on a 5% scale, or they do not exist

**`via-52%`, `to-72%` and `to-92%` generate NOTHING.** Tailwind emits
gradient-stop-position utilities only for multiples of five; an off-scale value
produces no class, no warning, and a gradient that silently falls back to
evenly-spaced colours.

Three surfaces shipped that way — the list card, the game-detail header band
and the profile cover — each asserting in its own comment that it reached `ink`
before some boundary, and none of them doing it. The computed
`background-image` carried **no stop positions at all**:

```
linear-gradient(rgba(8,8,8,.15), rgba(8,8,8,.45), rgb(8,8,8))
```

**This is R11's lesson in a second costume.** R11 forbade asserting a border
width the stylesheet cannot render; this is the same failure on a different
property, and it went unnoticed for the same reason — the result still looks
like a gradient. Measured band-by-band, the list card read 31/29/15 across its
bottom third where it should have read 8/9/9.

**Use a multiple of five**, or arbitrary syntax (`to-[72%]`). And when a
gradient's *boundary* is the point, assert the rendered pixels either side of
it — `e2e/strips-redesign-card.spec.ts` decodes the screenshot and checks a
floor above the boundary and a ceiling below it.

**A ceiling that cannot fail is worse than none.** The first version of that
assertion sampled 80–97% with a ceiling of 30 and passed the broken gradient
too, because the photograph's own foreground is dark down there. Both numbers
and the sampling window are now measured against the real card.

## R20 — Fidelity pass (round 8, item 12): what was fixed, what remains

The owner's verdict was that several surfaces "barely resemble their frames",
with `p14` named. Every frame was re-shot at 390px beside its export. The
finding is that "different feel" lived almost entirely in three things, exactly
as predicted: **surface treatment, label colour, and one type step** — not in
missing elements.

### Fixed

| Surface | Was | Now |
|---|---|---|
| **All admin (p14, p17, p18, p19)** | The pitch canvas rendered behind every admin page; all four frames draw flat black | `SiteBackground` returns null under `/admin`. A pitch diagram under a table of figures competes with the volt, which on these screens carries meaning rather than character |
| **p14** | A display-size `ADMIN` heading plus a nickname row above the chips — about 90px the frame does not have, duplicating the volt `ADMIN` badge round 1 built **from this same frame** | Heading removed; the two useful facts survive as one thin row |
| **p14** | Tile labels grey, and wrapping onto two lines in all four tiles | Volt, `tracking-[1.5px]`, one line each |
| **p14** | Game-row status greyed | Volt for a game that is on, muted otherwise — the frame colours it |
| **p18** | Settings loose on the page; heading at 22px body-bold | Each setting in a `.lifted` card; heading at `page-title` in the display face |
| **p01, p10, p11** | Stat captions wrapped at `eyebrow`'s 3px tracking | `tracking-[1.5px]`, one line — closing the divergence round 6 accepted |

### Remaining, with honest severity

| Surface | Divergence | Severity | Why it stands |
|---|---|---|---|
| p14 | No game NUMBER (`#62`) on rows | **Low** | `games` has no sequential id. A surrogate display number is a schema decision |
| p14 | We add `All games →`; the frame has no such link | **Cosmetic** | The frame's rows are the only route onward; ours names it |
| p14, p18, p19 | A `nickname · back to the site` row the frames lack | **Cosmetic** | The frames' equivalent is the header avatar, which we also have. Removing it takes away the only way out of the panel on a phone |
| p11 | The cover stops above the stats; `p10`/`p11` run it to the tab row | **Medium** | Extending it puts white stat numerals over the photograph's brightest region. A contrast question that needs measuring, not guessing — the one I would do first |
| p19 | Roughly twice the frame's height | **By design** | The frame is money only; the page also carries the operational metrics that would otherwise have been deleted. Recorded in item 8 |
| p16 | Ours is the whole game form; the frame is a standalone "add pitch" | **By design** | Item 0: venue creation is folded into the game form deliberately, and `surface` / `opening time` are genuinely missing fields |
| p04 | Three options and a disabled state where the frame shows three radios | **By design** | Rulings R3, R4 and round 8 item 11 |
| p02, p03 | Taller than the frames | **Not a divergence** | Seed content, not layout — more games, longer venue names |
| All | Russian display headings set in the body face | **Medium** | Anton ships no Cyrillic (R18). Needs a second display face, which is the owner's call |

---

# 10. Redesign v2 — Round 9 rulings (2026-08-20)

## R21 — Badge dimensions are identical, and that overrides `p03`

**Every badge is one object wearing three colours.** `6v6`, `Turf`, `Advanced`
and anything after them share `.badge-pill`: one height, one padding, one
radius, one type size, one border width. A call site chooses **ink** and
nothing else.

**`p03` DRAWS THE DETAIL BADGE LARGER than `p02` draws the card's** — about
three points. That divergence is **deliberate and this ruling is the record of
it**, confirmed by the owner in round 9.

The reasoning is that a three-point difference between two surfaces is not a
hierarchy any reader perceives. It is indistinguishable from drift — and drift
is exactly what was there before: the format and surface badges carried
`border-2` while the skill badge carried `border`, and a `size` prop rendered
the same badge at `text-small` on the list and `text-body` on the detail. On
the game page the three sat in one row at three heights, which reads as a
rendering fault.

**The `size` prop is removed rather than defaulted**, so a future surface
cannot quietly reintroduce per-instance sizing. Asserted by measurement, not by
eye: `e2e/tmp` aside, the strips spec reports one identical tuple of height,
font-size, border-width, padding and radius for every `.badge-pill` on a game
carrying a format, a surface and a skill restriction.

**If a size difference is ever wanted back**, it is a second class next to
`.badge-pill` with its own name and its own reason — never a prop that lets
each call site decide.

---

# 11. Redesign v2 — Round 10 rulings (2026-08-20)

## R22 — The admin panel is English, and the pitch-name label is not an exception

**The pitch-name field's admin form label stays English.** So does every other
label in `/admin`.

This is the standing rule stated once rather than re-argued per field, because
the question arrives one field at a time and each instance looks small. The
panel is a surface only the owner and the organizers see. `lib/strings.ts`
keeps admin copy outside the player-facing sections deliberately, and
`lib/i18n/__tests__/i18n.test.ts` **actively fails** a translation added there
— the test walks every player-facing key for completeness *and* asserts that
nothing outside those sections is overlaid.

**Carving admin into the overlays is declined as disproportionate.** It is
roughly two hundred keys in two languages, a permanent tax on every admin
string thereafter, and a change to the one test that currently keeps the
boundary honest — for readers who are already reading English in the same
screen's error messages, CSV headers and enum values.

**WHAT THIS DOES NOT TOUCH.** Player-facing rendering of the pitch name — the
data join that puts the typed name on the game detail — is not admin copy. It
is a value, not a label, and it renders in every language exactly as built in
round 9. The distinction is the general one: **a label is translated, a datum
is displayed.**

## R23 — Admin page titles are `title`, and `page-title` is under suspicion

**Every page title inside `/admin` is `font-display text-title uppercase
tracking-wide text-white`.** The panel held four different treatments before
round 10: `page-title` on `/admin` and `/admin/stats` and `/admin/site`,
`section-title` on `/admin/topups`, and a 22px bold **body** face in `bone` on
`/admin/games` and `/admin/players` that predates the redesign entirely.

The step is measured, not chosen. `p14`, `p15`, `p17` and `p19` all draw their
title at a cap height between 17.9 and 23.4 pixels; `title` renders 21.3 at
390px and `page-title` renders 28.2.

### The measurement that is bigger than this ruling, and is NOT acted on

**The player frames draw a 23.4px title cap too.** `p02`, `p05`, `p10`, `p11`
and `p18` all measure it, and `page-title` — added in R17 on the reading that
our titles were rendering "a third smaller than the design" — renders 28.2.

R17 is very likely wrong, and correcting it moves **nineteen headings across
home, games, auth, pass and profile**. Nobody asked for that this round, none
of those surfaces was in scope, and a type change nobody requested is exactly
the class of work `SCOPE.md` exists to stop. It is recorded as an OPEN finding
in `docs/REQUESTS.md` and is the owner's call.

**The method is the durable part.** Cap heights were read at a fixed luminance
threshold on both the frame and our own screenshot, and converted using Anton's
**rendered** cap ratio — 0.86, derived from our render at a known font size —
rather than the face's published metric of 0.72. The published ratio produced a
40px tile numeral in this very round before the rendered one corrected it to
32. **Measure the ratio on the thing you are measuring with.**

---

# 12. Round 11 rulings (2026-08-20)

## R24 — A guest is a seat, not a person

**Nothing in this product creates an identity in order to hold a spot.**

Shadow players did. An admin typed a name, a `players` row appeared, and it sat
in the table that answers "who plays here" — with no account, no email and no
way to get one — until somebody merged it by hand. Round 11 removes that flow
and the merge tool with it.

**A guest is a COUNT, in one of two places, and which one it is says whose seat
it is:**

| | Lives on | Removal is | Renders as |
|---|---|---|---|
| **House guest** | `games.guest_count` | a decrement | `Guest N` |
| **Party guest** | `bookings.guest_count` | cancelling the booking | `<First>'s Guest N` |

House guests are **interchangeable** and that is what makes them "simple":
there is nothing about Guest 2 that differs from Guest 3, so removing one is
arithmetic rather than the deletion of a particular row.

**EXISTING SHADOW PLAYERS ARE A THIRD KIND AND NEEDED NO MIGRATION.** A shadow
is exactly `players.auth_user_id is null`; the roster view projects that as
`is_guest`, so every one of them started rendering as a guest — under its own
name — without a row being touched. One that is later claimed gains an auth
user and stops being a guest, which is the correct behaviour rather than a
loose end.

**GUESTS NEVER CARRY A PHOTOGRAPH AND ALWAYS SORT LAST.** No account, so
nothing to show; and a row alternating between faces and monograms reads as a
rendering fault rather than as a group. An anonymous guest gets a silhouette
rather than initials, because initials taken from the word "Guest" put a line
of identical `GU` badges on a card.

## R25 — Seats are counted in ONE place, and the count is a view row

`public.game_seats_taken()` is the only definition of how full a game is.
`sync_game_fullness`, `create_booking_internal` and `set_game_capacity` call
it; `lib/admin/queries.ts` mirrors it for the sole purpose of DISABLING a
control, never for deciding one.

**THE FAILURE THIS PREVENTS IS INVISIBLE.** A game whose seats are miscounted
still renders, still books, and simply admits one player too many or refuses
one too early. There is no error, no log line and no broken page — which is
why the rule is a function rather than three careful copies of the same
`count(*)`.

**`game_roster_public` EMITS ONE ROW PER SEAT**, and that is what makes the
application side follow for free: `countRosterByGame` counts rows, so every
`{booked} / {capacity}`, every `spotsLeft` and the games list's own fullness
became correct without a single caller learning what a guest is.

**THE LABEL IS NOT IN THE VIEW.** "Karel's Guest 2" is copy. The view returns
`guest_of` and `guest_index`; `lib/roster/guests.ts` builds the string from
`lib/strings.ts` in three languages. Czech and Russian do not form a possessive
with an apostrophe, so each language owns the entire pattern rather than a
fragment something concatenates — a view that returned English would be a
translation the Czech UI could not reach.

## R26 — A party is ONE booking

`price_czk` is the **whole party's**. That single decision is why the variable
symbol, `credit_applied_czk`, the confirmation email, the admin unpaid list and
`cancel_booking` all work untouched: one booking owes one number, which is what
`price_czk` always meant.

**The whole party fits or none of it does.** `create_booking_internal` refuses
with `CAPACITY_FULL` rather than seating part of a party — a player who asked
for three seats and received one has been given something they did not choose.

**One attendance mark, because it is one decision.** The admin roster shows a
party as `+2 guests` beside the name that brought them, not as three rows: three
toggles where the organizer can make one choice would leave two of them
permanently unanswered and settle blocked behind them.

**THE CREDIT RULE IS DERIVED, NOT CORRECTED.** "Redeem credit" is offered only
when the balance covers all `N + 1` seats, and growing the party past the wallet
un-checks it **in the same render**. A `useEffect` would fix it one render late,
and that frame is the one where Confirm is pressable — which would book the
`cash` that "credit" maps to, producing an unpaid party with partial credit
applied. Partial credit still happens inside `create_booking`, exactly as it
always did; what the rule governs is whether the product *offers* a settled
booking it can only half pay for.

## R27 — The party ceiling is the second window that lives in two places

`policy.booking.maxPartyGuests` is **display only**. The authority is
`v_max_guests` inside `create_booking_internal`, which raises `PARTY_TOO_LARGE`,
because a route guard is skipped by anyone using curl. If the two disagree, the
database is right and the UI is lying — the same standing rule as
`cancel_booking`'s cutoff, and moving the ceiling means editing both in one
commit.

**It is NOT a `POLICY_VERSION` bump.** Nothing transitions on it and no event is
stamped with it: it bounds a control's options, and a booking made at a party of
three does not become invalid if the ceiling later moves to four.
