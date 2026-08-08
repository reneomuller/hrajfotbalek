# The v1.3 change surface, measured

Every figure here is reproducible. The command that produced it is printed
beside it; run the command, get the number. Where a figure disagrees with
`REDESIGN_V1.3_ANALYZE.md` §5, the disagreement is recorded rather than
smoothed over — the analysis is the earlier measurement and this is the one the
build is driven from.

## Where these were taken

- **Branch:** `build/v13`, at the Phase 3 commit.
- **Equivalent to** `feat/phase-21-football-rewrites` (`4b2cccb`), which is what
  the analysis names. Verified rather than assumed:

  ```sh
  git diff --name-only 4b2cccb..HEAD -- app components
  ```

  returns nothing. Every commit on `build/v13` so far touches only Markdown,
  `.gitignore`, `.env*`, `playwright.config.ts` and `supabase/config.toml`.
  Nothing in `app/` or `components/` has changed, so the counts are the counts
  on the named branch.
- **Scope of every grep:** `app` and `components`. `lib/` is in the Tailwind
  `content` glob too, but carries no class strings worth counting.
- **Denominator:** 144 files.

  ```sh
  find app components -name "*.tsx" -o -name "*.ts" | wc -l
  ```

---

## 1. Retiring families

### Greys — six retire into three tones

`chalk`, `muted-dim`, `subtle`, `hint`, `dim`, `footer-dim`.

```sh
grep -rEo "\b(text|bg|border|ring|fill|stroke|decoration|placeholder|from|to|via)-(chalk|muted-dim|subtle|hint|dim|footer-dim)\b" app components | wc -l   # 35
grep -rlE "\b(text|bg|border|ring|fill|stroke|decoration|placeholder|from|to|via)-(chalk|muted-dim|subtle|hint|dim|footer-dim)\b" app components | wc -l   # 25
```

**35 usages across 25 files.** The analysis says 34/24. One usage in one extra
file; the prefix set above is explicit, and a narrower one (`text-` only) is
the most likely source of the older figure.

### Hairlines — six of nine retire

`hairline-soft`, `hairline-chrome`, `hairline-panel`, `hairline-link`,
`hairline-volt-soft`, `hairline-volt-strong`.

```sh
grep -rEo "hairline-(soft|chrome|panel|link|volt-soft|volt-strong)\b" app components | wc -l   # 39
grep -rlE "hairline-(soft|chrome|panel|link|volt-soft|volt-strong)\b" app components | wc -l   # 27
```

**39 usages across 27 files.** The analysis says 40/27 — files agree exactly.

> **The retiring six are not the obvious six.** `hairline-strong` **survives**
> (and changes value, §3), while `hairline-volt-strong` **retires**. Writing
> the set as "the six that are not `hairline`, `hairline-strong`,
> `hairline-volt`" is the only safe way to say it. A pattern of
> `hairline-(soft|chrome|panel|strong|link|volt-soft)` — which reads naturally
> and is wrong — reports **72 usages across 47 files**, because `strong`
> matches the survivor and `volt-strong` is missed. That near-doubling is what
> a wrong set looks like.

Per-token, so a partial migration can be checked:

| Token | Usages |
|---|---:|
| `hairline-soft` | 1 |
| `hairline-chrome` | 11 |
| `hairline-panel` | 0 |
| `hairline-link` | 16 |
| `hairline-volt-soft` | 5 |
| `hairline-volt-strong` | 6 |

### Radii — four names retire outright

`chip`, `badge`, `cta`, `panel`. (`control` and `card` survive by name; see §3.)

```sh
grep -rEo "rounded-(chip|badge|cta|panel)\b" app components | wc -l   # 51
grep -rlE "rounded-(chip|badge|cta|panel)\b" app components | wc -l   # 41
```

**51 usages across 41 files.** Matches the analysis exactly.

### `font-condensed` — leaves player-facing UI

```sh
grep -rEo "font-condensed\b" app components | wc -l   # 117
grep -rlE "font-condensed\b" app components | wc -l   # 64
```

**117 usages across 64 files.** Matches the analysis exactly.

### `font-mono` — narrows to one job

```sh
grep -rEo "font-mono\b" app components | wc -l   # 189
grep -rlE "font-mono\b" app components | wc -l   # 70
```

**189 usages across 70 files.** Matches the analysis's 189.

`mono` is not deleted — it is **reserved for the variabilní symbol and nothing
else**, because that string is copied into a banking app and must not be
confusable. Every other usage migrates to `sans`. The analysis estimates ~12 of
the 189 are payment-related; that set is identified per call site in Phase 18,
not by a grep, because "payment-related" is a judgement about what the string
means rather than about what it matches.

### Translucent surfaces — the family goes opaque

`surface-card`, `surface-card-strong`, `surface-panel`, `surface-overlay`.

```sh
grep -rEo "surface-(card|card-strong|panel|overlay)\b" app components | wc -l   # 49
grep -rlE "surface-(card|card-strong|panel|overlay)\b" app components | wc -l   # 43
```

**49 usages across 43 files.** Matches the analysis's 43 files.

### `shadow-volt-glow` — retires from general use

```sh
grep -rEo "shadow-volt-glow(-lg)?\b" app components | wc -l   # 4
grep -rlE "shadow-volt-glow(-lg)?\b" app components | wc -l   # 4
```

**4 usages across 4 files.** Matches the analysis.

---

## 2. The headline

```sh
{ grep -rlE "\b(text|bg|border|ring|fill|stroke|decoration|placeholder|from|to|via)-(chalk|muted-dim|subtle|hint|dim|footer-dim)\b" app components
  grep -rlE "hairline-(soft|chrome|panel|link|volt-soft|volt-strong)\b" app components
  grep -rlE "rounded-(chip|badge|cta|panel)\b" app components
  grep -rlE "font-condensed\b" app components
  grep -rlE "surface-(card|card-strong|panel|overlay)\b" app components
  grep -rlE "shadow-volt-glow(-lg)?\b" app components ; } | sort -u | wc -l   # 83
```

**83 of 144 files.** Matches the analysis exactly.

This counts files touched by a *retiring name*. It is the floor, not the
ceiling: §3 adds files that change appearance without any name changing, and
the design system's own figure for Stage 0 is **92 of 144 (64%)**.

---

## 3. The silent deltas — tokens that survive by name and change value

**This is the section that decides whether Stage 0 lands or quietly regresses.**
A call site using one of these keeps compiling, keeps reading correctly in
review, and renders differently. There is no grep that finds a *missed* one,
because nothing about the call site is wrong — the token table underneath it
moved.

The analysis names three (F5, F6, and `faint`). **There are six.** The three
below marked **UNDOCUMENTED** are not in `REDESIGN_V1.3_ANALYZE.md` §5 and were
found by reconciling `DESIGN_SYSTEM_V1.3.md` §1.2–1.3 against
`tailwind.config.ts` while measuring the retiring sets.

| Token | Now | v1.3 | Usages / files | Source |
|---|---|---|---:|---|
| `hairline-volt` | `rgba(200,255,0,.18)` | `rgba(200,255,0,.30)` | 44 / 34 | F5 |
| `surface` | `#0A0A0A` | `#0F0F0F`, opaque | 47 / 34 | F6 |
| `surface-raised` | `#0D0D0D` | `#161616`, opaque | 2 / 1 | F6 |
| `faint` | `#6F6F6F` | `#7E7E7E` | 39 / 24 | analysis §1.2 |
| `hairline-strong` | `rgba(255,255,255,.12)` | `rgba(255,255,255,.14)` | 39 / 30 | **UNDOCUMENTED** |
| `rounded-control` | `8px` | `14px` | 39 / 30 | **UNDOCUMENTED** |
| `rounded-card` | `16px` | `18px` | 54 / 43 | **UNDOCUMENTED** |

```sh
grep -rEo "hairline-volt([^a-z-]|$)" app components | wc -l                       # 44
grep -rEo "\b(bg|text|border)-surface([^a-z-]|$)" app components | wc -l          # 47
grep -rEo "\b(bg|text|border)-surface-raised\b" app components | wc -l            # 2
grep -rEo "\b(text|bg|border|ring|fill|placeholder)-faint\b" app components | wc -l  # 39
grep -rEo "\bhairline-strong\b" app components | wc -l                            # 39
grep -rEo "\brounded-control\b" app components | wc -l                            # 39
grep -rEo "\brounded-card\b" app components | wc -l                               # 54
```

### The failure mode, per delta

- **`hairline-volt` `.18` → `.30`.** A port that preserves the old value is a
  plausible-looking regression: the code compiles, the token exists, and every
  selected state in the product is simply too faint. This is F5, called out in
  the analysis precisely so it would not be discovered at implementation time.
- **`surface` / `surface-raised`.** Two changes at once — the hex moves *and*
  the translucent family collapses into them. v1.1.2 §8 already made panels
  more opaque because the background was winning against the text; solid
  finishes that argument rather than re-tuning it a third time. Getting only
  the opacity half produces cards that are the right colour and still
  translucent.
- **`faint` `#6F6F6F` → `#7E7E7E`.** A contrast repair, not a taste change:
  `#6F6F6F` computes to ~3.8:1 on `surface`, under the 4.5:1 AA floor, and it
  is assigned to text that carries real content — the claim bar's
  `Kicked off 19:00`, which is the entire message of the bar in that state.
  Keeping the old value ships a known accessibility failure.
- **`hairline-strong` `.12` → `.14` — UNDOCUMENTED.** It absorbs today's
  `hairline-link` value. So the *retiring* `hairline-link` and the *surviving*
  `hairline-strong` end up identical, which makes a lazy migration
  (`hairline-link` → `hairline-strong`) accidentally correct, while
  `hairline-strong`'s own 39 existing call sites silently darken by two
  hundredths. Small, and it is the secondary-button outline on every screen.
- **`rounded-control` `8px` → `14px` — UNDOCUMENTED.** Nearly double. Every
  button, input and day box. This is the most visible of the three and the
  easiest to mistake for "the redesign looks different" rather than "a token
  moved".
- **`rounded-card` `16px` → `18px` — UNDOCUMENTED.** Cards, panels, sheets and
  the claim bar. Subtle alone; compounding with `rounded-control` across the
  same screens.

**Consequence for Stage 0's strip review.** Softer corners on every control,
rounder cards, stronger selected outlines, lighter surfaces and slightly
lighter tertiary text are all **expected** at the checkpoint. A strip set that
shows none of them means the token table changed and the call sites did not.

---

## 4. Free deletions — three tokens with zero call sites

```sh
grep -rEo "\b(text|bg|border|ring)-hint\b" app components | wc -l   # 0
grep -rEo "\bhairline-panel\b" app components | wc -l               # 0
grep -rEo "\brounded-panel\b" app components | wc -l                # 0
```

`hint`, `hairline-panel` and `rounded-panel` exist only in
`tailwind.config.ts`. All three confirmed at **0**, so removing them is a
config-only edit with no call-site work.

They are also the evidence for ruling A's thesis: a table carrying three tokens
nothing ever used was a sampling of a reference, not a system.

**The failure mode of getting this wrong** is inverted from §3 — it is cheap,
not expensive. Deleting a token that *does* have call sites fails the build at
Tailwind's class resolution, loudly and immediately. That is why these three
are listed with their counts rather than simply deleted: the count is the
claim, and re-running the grep is how the claim stays true.
