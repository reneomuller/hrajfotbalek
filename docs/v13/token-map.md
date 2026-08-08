# Token migration map — retiring → surviving

The lookup table Phase 17's call-site sweep is driven from. Every retiring
token maps to exactly one surviving token, or to `sans`.

**Source of record.** `DESIGN_SYSTEM_V1.3.md` §1.1–1.6, which carries the
"Replaces" columns directly. The Figma §1 layer
(`0lKWK6pRonKNbmFDglzoR7`, 65 variables) is the upstream source, and each
semantic variable's description names the tokens it absorbs; reconciling the
two is Phase 54's job, and any disagreement found there is a defect in this
file, not in Figma.

**Counts** come from `docs/v13/change-surface.md`, which prints the command
beside each figure.

---

## 1. Text — nine tones become three

| Retiring | → | Surviving | Value |
|---|---|---|---|
| `chalk` `#CFCFCF` | → | `bone` | `#E9E7E0` |
| `muted-dim` `#8A8A8A` | → | `muted` | `#9A9A9A` |
| `subtle` `#777777` | → | `muted` | `#9A9A9A` |
| `footer-dim` `#888888` | → | `muted` | `#9A9A9A` |
| `hint` `#666666` | → | `faint` | `#7E7E7E` (0 call sites) |
| `dim` `#555555` | → | `faint` | `#7E7E7E` |

Surviving: `bone` (primary), `muted` (secondary), `faint` (tertiary).

> **`faint` itself moves** `#6F6F6F` → `#7E7E7E`. See §6.
>
> **`muted-dim` `#8A8A8A` is deliberately not the new `faint`.** `#8A8A8A`
> clears AA at 5.6:1 and would be the tempting target, but §1.1 of the design
> system names `#9A9A9A`/`#8A8A8A` as *the* example of two greys that are the
> same colour at 390px — and `muted` is `#9A9A9A`. Migrating `muted-dim` to a
> new tone at `#8A8A8A` would recreate the exact pair this round exists to
> delete. It goes to `muted`, and the pair collapses.

## 2. Hairlines — nine become three

| Retiring | → | Surviving | Value |
|---|---|---|---|
| `hairline-soft` `.06` | → | `hairline` | `rgba(255,255,255,.08)` |
| `hairline-chrome` `.07` | → | `hairline` | `rgba(255,255,255,.08)` |
| `hairline-panel` `.10` | → | `hairline` | `.08` (0 call sites) |
| `hairline-link` `.14` | → | `hairline-strong` | `rgba(255,255,255,.14)` |
| `hairline-volt-soft` `.16` | → | `hairline-volt` | `rgba(200,255,0,.30)` |
| `hairline-volt-strong` `.30` | → | `hairline-volt` | `rgba(200,255,0,.30)` |

Surviving: `hairline` (divider inside a surface), `hairline-strong`
(secondary-button outline), `hairline-volt` (selected / active outline).

> **Ruling C removes most of these call sites rather than migrating them.**
> No stroke on a card, chip, panel or day box — fill and radius carry the
> surface. So the correct action at a call site is often *delete the border
> class*, not *rename it*. Migrating all 39 retiring-hairline usages to a
> surviving token would satisfy this table and fail ruling C. **Read the call
> site; do not rename mechanically.**
>
> `hairline-link` → `hairline-strong` is value-preserving (`.14` → `.14`),
> which is the one row here that is safe to do blindly.

## 3. Focus — a new token, and it is not a hairline

| New | Value |
|---|---|
| `focus-ring` | `#C8FF00` (full-opacity `volt`), 2px, 2px offset |

Nothing retires into this; it is added. `hairline-volt` at `.30` over
`surface-raised` computes to roughly 2.4:1, below the 3:1 that WCAG 1.4.11
requires of a non-text indicator, and it was the only focus affordance the
spec named. A focus ring is a different job from a selected outline.

## 4. Radius — six become three

| Retiring | → | Surviving | Value |
|---|---|---|---|
| `chip` `5px` | → | `pill` | `999px` |
| `badge` `9px` | → | `pill` | `999px` |
| `cta` `13px` | → | `control` | `14px` |
| `panel` `22px` | → | `card` | `18px` (0 call sites) |

Surviving: `pill` `999px` (chips, spots pill, nav capsule, level badge),
`control` `14px` (buttons, inputs, day boxes), `card` `18px` (cards, panels,
sheets, claim bar).

> `chip 5px` → `pill 999px` is the largest single jump in this file: a 5px
> corner becomes fully round. It is intended — chips are capsules in v1.3 — but
> it does not read as a token rename in review, it reads as a redesign.

## 5. Families — four become two, plus one reserved

| Retiring | → | Surviving |
|---|---|---|
| `font-condensed` (Barlow Condensed) | → | `font-sans` (Manrope) |
| `font-mono` (JetBrains), **except** the variabilní symbol | → | `font-sans` (Manrope) |

Surviving: `display` (Anton — the wordmark and section titles only), `sans`
(Manrope — everything else, including all buttons and nav labels), `mono`
(JetBrains — **reserved: the variabilní symbol, nothing else**).

> `mono` is not deleted. The VS is copied into a Czech banking app, and a
> proportional font makes `0`/`O` and `1`/`l` confusable in a string that must
> match exactly or the payment arrives unreconciled. Of 189 `font-mono`
> usages, the analysis estimates ~12 are payment-related. **Which 12 is a
> judgement per call site, made in Phase 18** — a grep cannot tell a VS from a
> game id.

## 6. Values that move under an unchanged name

**Not a migration — nothing to rename, and nothing a grep can verify.** Listed
here because Phase 17 must not treat "no retiring token at this call site" as
"this call site is finished".

| Token | Now | v1.3 | Usages / files |
|---|---|---|---:|
| `hairline-volt` | `rgba(200,255,0,.18)` | `rgba(200,255,0,.30)` | 44 / 34 |
| `hairline-strong` | `rgba(255,255,255,.12)` | `rgba(255,255,255,.14)` | 39 / 30 |
| `surface` | `#0A0A0A` | `#0F0F0F`, opaque | 47 / 34 |
| `surface-raised` | `#0D0D0D` | `#161616`, opaque | 2 / 1 |
| `faint` | `#6F6F6F` | `#7E7E7E` | 39 / 24 |
| `rounded-control` | `8px` | `14px` | 39 / 30 |
| `rounded-card` | `16px` | `18px` | 54 / 43 |

Three of these seven — `hairline-strong`, `rounded-control`, `rounded-card` —
are **not** in `REDESIGN_V1.3_ANALYZE.md` §5's list of silent deltas. See
`docs/v13/change-surface.md` §3 for the per-delta failure modes.

## 7. Surfaces — the translucent family collapses

| Retiring | → | Surviving |
|---|---|---|
| `surface-card` `rgba(15,15,15,.66)` | → | `surface` `#0F0F0F` |
| `surface-card-strong` `rgba(15,15,15,.84)` | → | `surface` `#0F0F0F` |
| `surface-panel` `rgba(13,13,13,.92)` | → | `surface` `#0F0F0F` |
| `surface-overlay` `rgba(10,10,10,.94)` | → | **stays translucent** |

Unchanged: `ink` `#080808` (page ground), `surface-avatar` `#222222`.

> **`surface-overlay` is the exception and must not be flattened.**
> Translucency survives in exactly one place — the scrim over a venue photo,
> where there is something behind it worth seeing. The other three collapse to
> opaque `surface`. A sweep that maps all four to `surface` produces a venue
> photo with an opaque block sitting on it.

## 8. Elevation

| Retiring | → | Surviving |
|---|---|---|
| `shadow-volt-glow` | → | *(deleted, no replacement)* |
| `shadow-volt-glow-lg` | → | *(deleted, no replacement)* |

One shadow survives, and it is new in this role: the claim bar and the nav pill
cast `0 -8px 24px rgba(0,0,0,.6)` **upward**, so content scrolling under them
reads as under. A glow on everything is the same problem as a border on
everything.

## 9. Type scale

Seven steps: `hero`, `title`, `time`, `body-lg`, `body`, `small`, `eyebrow`.

> **⚠ This table is INFERRED, and it is the only inferred table in this file.**
>
> `DESIGN_SYSTEM_V1.3.md` §1.4 gives the seven surviving steps with sizes,
> weights and cases, but carries **no "Replaces" column for type** — unlike
> §1.2, where the text tones name what they absorb. None of the seven retiring
> step names appears anywhere in that document:
>
> ```sh
> for t in hero-sub section-title match-title card-title community-title lede; do
>   grep -c "\b$t\b" DESIGN_SYSTEM_V1.3.md; done   # 0 0 0 0 0 0
> ```
>
> So the rows below are read off the *current* clamp values in
> `tailwind.config.ts` against the v1.3 sizes — a defensible reading, not a
> specification. **Confirm against the Figma §1 layer's nine text styles before
> Phase 18 relies on it.** Any row may be wrong; the `card-title` → `body-lg`
> row is the least certain, since `card-title` is `clamp(20px,4.5vw,26px)` and
> sits between `body-lg` (17px) and `title` (24–34px).

| Retiring step | Current value | → | Surviving | Usages |
|---|---|---|---|---:|
| `hero-sub` | `clamp(20px,5vw,30px)` | → | `title` | 1 |
| `section-title` | `clamp(26px,7vw,40px)` | → | `title` | 19 |
| `match-title` | `clamp(26px,5.8vw,36px)` | → | `title` | 0 |
| `card-title` | `clamp(20px,4.5vw,26px)` | → | `body-lg` *(least certain)* | 1 |
| `community-title` | `clamp(20px,4.6vw,28px)` | → | `title` | 3 |
| `lede` | `clamp(14px,3.6vw,17px)` | → | `body` | 2 |
| `cta` | `clamp(16px,4vw,19px)` | → | `body-lg` | — |
| `eyebrow` | `clamp(9px,2.4vw,11px)` | → | `eyebrow` (now flat `11px`) | — |

**26 usages total**, so this is a light sweep whichever way the uncertain rows
resolve — `section-title` is 19 of them and is the confident row.

> **`body` 400–600 and `body-lg` 600/700 are weight variants of one step each,
> not new scale steps.** `body-lg` renders 600 by default and 700 for the spots
> figure (§2.1). Code mirrors the Figma layer rather than inventing a step.
>
> **`hero` shrinks** from `clamp(58px,12.5vw,124px)` to
> `clamp(44px,10vw,88px)`. Ruling J requires the hero lose ≥25% of its height
> so the three step cards clear the fold, and the type is the largest part of
> that height. This one is deliberate and visible — it is not in §6 because it
> is the point of the change rather than a hazard.
>
> **Ruling B, stated once:** `eyebrow` is the only uppercase style in the
> product. Every button, link, nav label, card title, section heading and day
> label is sentence case.

## 10. Free deletions — config-only, zero call sites

`hint`, `hairline-panel`, `rounded-panel`. All three confirmed at 0 usages.
Rows appear above for completeness so the map is total, but no call site work
follows from them.
