# The four-item nav bar at 390px, in Czech

**Verdict: PASS.** `Permanentka` fits. No word change is needed, and the type
size does not move.

Ruling K sets the bar's contents: Home in, My Games out (`/my-games` survives
as a route). The four labels are therefore **Home, Games, Pass, Profile**, and
the Czech for Pass is `Permanentka` — eleven characters against three, four and
six for its neighbours, which is why the plan asked whether it fits before any
screen work depends on the answer.

## How it was measured

Not estimated. The labels were inserted into the running product, in the
Manrope it actually ships, and measured with `getBoundingClientRect()` so that
letter-spacing, font loading and sub-pixel rounding are the browser's rather
than a formula's.

- **Viewport:** 390px.
- **Cell:** the bar is `inset-x-0` full width, its `<ul>` has `p-0`, and each
  `<li>` is `flex-1` — so four equal cells of **97.5px**.
- **Style:** `sans` (Manrope), weight 500, sentence case, no tracking. That is
  the v1.3 nav label: `mono` retires to the variabilní symbol only, and ruling
  B makes `eyebrow` the only uppercase style in the product, so the current
  `font-mono text-[9px] uppercase tracking-[1px]` is gone in all three
  respects.
- **Size: 13px (`small`).** `small` is the only sentence-case step in the
  seven-step scale that suits a nav label — `eyebrow` is 11px but is uppercase
  by definition, and there is no 11px sentence-case step. This is a jump from
  today's 9px, which is what made the question worth asking.
- **Padding budget: 8px** (4px each side), leaving **89.50px** usable. See
  the sensitivity note below — this is the one judgement in the measurement.

## Result at 13px

| Label | CS | Width | Verdict |
|---|---|---:|---|
| Home | `Domů` | 35.77px | fits |
| Games | `Zápasy` | 44.27px | fits |
| **Pass** | **`Permanentka`** | **81.45px** | **fits, 8.05px spare** |
| Profile | `Profil` | 31.92px | fits |

English, for comparison — every label is comfortably shorter, and `Pass` at
28.86px is a third of the Czech:

| Label | EN | Width |
|---|---|---:|
| Home | `Home` | 35.73px |
| Games | `Games` | 42.36px |
| Pass | `Pass` | 28.86px |
| Profile | `Profile` | 39.59px |

`Permanentka` is the widest label in either language by 37px. It is the
constraint, and it clears.

## Sensitivity — the honest caveat

The margin is **8.05px, or 9% of the cell**, and it rests on the 8px padding
assumption. That assumption is the only soft number here, so it is worth
stating what moves the verdict:

| Padding budget | Usable | `Permanentka` 81.45px |
|---|---:|---|
| 8px (used above) | 89.50px | fits, 8.05px spare |
| 12px | 85.50px | fits, 4.05px spare |
| 16px | 81.50px | **fits by 0.05px — effectively touching** |
| 20px | 77.50px | overflows by 3.95px |

So: comfortable at 8–12px of padding, marginal at 16, failing at 20. A
four-column bar does not want 20px of horizontal padding per cell — the icon
above is 22px and the cell is 97.5px — so 8–12 is the realistic range and the
verdict holds. **If Stage 0 gives the nav pill generous internal padding, this
measurement is the thing to re-run**, not a decision to revisit from memory.

At **12px** it would also still fit (75.19px against 89.50px, 14.31px spare),
which is the fallback if the pill's padding grows — but per the phase's own
instruction, the word changes before the type size does, so the replacements
below come first.

## If it had failed — the replacements, measured anyway

The phase says to change the word rather than the type size. It did not come to
that, but the candidates were measured in the same run so the answer exists if
the padding question reopens:

| Candidate | Width @13px | Note |
|---|---:|---|
| `Kredit` | 36.75px | Shortest. Accurate to the wallet model — a pass *is* prepaid credit — but it names the mechanism rather than the product, and `Permanentka` is what a Czech player calls the thing |
| `Permice` | 49.73px | Colloquial contraction of `Permanentka`. Fits the informal *ty* register the copy already uses |
| `Vstupenka` | 64.81px | Wrong meaning — a ticket is for one entry, a pass is for several |
| `Peněženka` | 67.14px | "Wallet". Collides with the wallet surface, which is a different screen |

`Permice` would be the choice, on register grounds. **It is not being made** —
`Permanentka` fits, and changing product vocabulary to solve a problem that
does not exist would be a change with no measurement behind it.

## Reproducing

The app must be running (`npx next start -p 3100` against the non-production
env), then the probe inserts each label off-screen at the style above and reads
its width. The numbers in this file came from that run at 390px with
`document.fonts.ready` awaited — measuring before the font loads reports
fallback metrics, which are narrower and would produce a false pass.
