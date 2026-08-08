# Type, spacing and elevation — the v1.3 scale

Seven steps, two families plus a reserved third, one shadow, one breakpoint.

## Families — four become two, plus one reserved

| Family | Face | Where |
|---|---|---|
| `display` | Anton | The wordmark, and section titles. Nothing else |
| `sans` | Manrope | **Everything else**, including all buttons and nav labels |
| `mono` | JetBrains Mono | **Reserved: the variabilní symbol, and nothing else** |

**Barlow Condensed leaves player-facing UI.** It was deleted from the config
rather than aliased, and the reason generalises — see *Deleted or aliased*
below. Its 117 call sites now inherit the body font, which is Manrope, which is
where they were going.

**`mono` is reserved, not retired.** The VS is copied into a Czech banking app
and matched by exact string comparison. A proportional font makes `0`/`O` and
`1`/`l` confusable, and a mismatched VS is a payment that arrives unreconciled —
the one failure in this product that costs manual work to undo. Of 189
`font-mono` usages, roughly a dozen are payment-related; **which dozen is a
judgement per call site, made in Phase 18.** A grep cannot tell a VS from a game
id.

## The seven steps

| Token | Size / line height | Weight | Case |
|---|---|---|---|
| `hero` | `clamp(44px,10vw,88px)` / 0.92 | display | Upper (wordmark only) |
| `title` | `clamp(24px,6vw,34px)` / 1.05 | display | Sentence |
| `time` | `28px` / 1.0 | sans 700 | — |
| `body-lg` | `17px` / 1.4 | sans 600, **700 variant** | Sentence |
| `body` | `15px` / 1.45 | sans 400–600 | Sentence |
| `small` | `13px` / 1.4 | sans 500 | Sentence |
| `eyebrow` | `11px`, `+3px` tracking | sans 600 | **UPPER** |

### `body-lg` is one step at two weights, not two steps

600 by default, 700 for the spots figure. It is written as a single scale entry
with the weight applied at the call site, mirroring the Figma layer. A scale
that gains a step every time a weight changes stops being a scale — and the
seven steps only stay legible as a hierarchy while each one means a different
*size*.

### `hero` shrinks, deliberately

From `clamp(58px,12.5vw,124px)` to `clamp(44px,10vw,88px)`. Ruling J requires
the hero lose **at least 25%** of its height so the three step cards clear the
fold on a phone, and the type is the largest part of that height.

This is the one type change that is meant to be obvious. It is not in the
silent-delta list in `docs/v13/change-surface.md` §3 for that reason: those are
changes that hide, and this one is the point.

### Ruling B — `eyebrow` is the only uppercase style

Every button, link, nav label, card title, section heading and day label is
sentence case. If a mockup shows tracked capitals anywhere except a small grey
eyebrow, the mockup is wrong.

## Spacing — a 4-point scale

**4 / 8 / 12 / 16 / 22 / 32 / 48.**

| Use | Value |
|---|---|
| Page gutter, outer margin on every screen | `22` |
| Card internal padding | `16` |
| Between cards in a list | `12` |
| Between sections | `32` |

**Six of the seven are already Tailwind's defaults** — `1` `2` `3` `4` `8` `12`
resolve to exactly 4/8/12/16/32/48px — so the config does **not** restate them.
Redefining a token to the value it already holds reads like a change, and
listing six keys implies the ones not listed were removed, which `extend` does
not do. Only `gutter: 22px` is declared, because only it is off the grid.

`22` is kept rather than rounded to `24` because it is the existing gutter on
every screen in the product. Moving it would shift every layout sideways to
satisfy a rule about arithmetic.

## Elevation — one shadow

```
lift: 0 -8px 24px rgba(0,0,0,.6)
```

The claim bar and the nav pill cast **upward**, so content scrolling under them
reads as *under* rather than as cut off. That is the only shadow in the product.

`volt-glow` and `volt-glow-lg` are gone. A glow on everything is the same
problem as a border on everything — it stops meaning anything and becomes
texture. Their four call sites simply stop glowing, which is the retirement.

## One breakpoint

**`md = 768px`.** Tailwind's default set is replaced rather than extended.

Safe, and checked rather than assumed: `sm:`, `lg:`, `xl:` and `2xl:` have
**zero** usages across `app/` and `components/`; `md:` has four.

One breakpoint is enough because only one thing genuinely changes shape — the
floating nav pill gives way to the header's link row — and naming it once stops
each of the eight build stages picking its own.

## The opacity question, answered once

v1.1.2 §8 asked for translucent surfaces to become ~20% more opaque, because the
pitch background was winning against the text on it. **That request is satisfied
and exceeded by taking the surfaces fully opaque** in Phase 15, and must not be
applied a second time on top. A third round of alpha tuning would be re-litigating
an argument that has now been ended rather than adjusted.

## Deleted or aliased — the rule this config follows

The config now does both, and the choice is not arbitrary:

> **Delete a token when the ABSENCE of its class produces the intended result.
> Alias it when absence produces something else.**

An ungenerated Tailwind class is not a build error — it is simply no CSS. So:

| Token | Absence yields | Decision |
|---|---|---|
| `font-condensed` | Inherits body font = **Manrope** | **Delete** — that is the target |
| `shadow-volt-glow` | No shadow | **Delete** — that is the retirement |
| `text-section-title` | Inherits **body** size, not title | **Alias** |
| `text-chalk` | Inherits parent colour | **Alias** |
| `rounded-card` | **Square** corner | **Alias** |
| `bg-surface-card` | No background at all | **Alias** |

Deleting a token in the second group would not break the build. It would
silently degrade the screen, and no suite in this repository asserts a computed
colour or radius — so nothing would catch it. That is the more dangerous
failure, and it is why the aliases exist until Phases 17 and 18 rewrite the call
sites that name them.
