# UI/UX audit — August 2026

Branch `audit/uiux-2026-08`. **Main is not touched by any of this.**

Evidence lives beside this file: `screens/` (76 captures, `name-locale-viewport.jpg`),
`measures.json`, `pass2.json`, `pass3.json`. Every number below was **measured
from the rendered page**, not read off a stylesheet — decoded pixels for
contrast, `getBoundingClientRect` for geometry, `getComputedStyle` for type.
The screenshots are downsampled JPEGs for review; no claim here rests on them.

---

## MORNING BRIEF

**The ten that matter, one line each:**

1. **F1 — Tapping an empty day chip shows every game.** The control says
   "Today", the URL says `?day=…`, 23 games render and "All" lights up instead.
   Round 14's own comment claims it shows an empty state.
2. **F2 — Every date in the product is English.** `DISPLAY_LOCALE = "en-GB"` is
   hardcoded across 29 call sites, so a Czech player reads "Tue 25 Aug" — while
   the day headings four pixels away say "Út 25 srp" from a different formatter.
3. **F3 — Russian "ДЛИТЕЛЬНОСТЬ" overprints its own value** on the game detail:
   the label needs 117px in an 84px column and `overflow: visible` lets it run
   over "60 минут".
4. **F4 — No error boundary anywhere.** 30 routes, zero `error.tsx`. A render
   error blanks the app — against this repo's own written rule.
5. **F5 — Keyboard focus is invisible.** Two `focus-visible` declarations in the
   whole product; everything else falls back to a default ring that does not
   read on near-black.
6. **F6 — 71 interactive elements sit under the product's own 44px floor**,
   including the language switcher and the footer links on all 33 pages.
7. **F7 — The primary action is drawn 11 different ways**: heights 34.5→64px,
   two radii, four weights, both cases.
8. **F8 — Half of all type bypasses the scale.** `text-[13px]` (83 uses) beats
   `text-small` (74) for the identical value; 115 declarations use sizes the
   scale does not contain at all.
9. **F9 — 16 heading treatments** for what is conceptually three levels,
   including three different eyebrows (10/400, 11/400, 11/600).
10. **F10 — A missing game returns HTTP 200.** `/game/<any-uuid>` renders "that
    game does not exist" with a success status, so crawlers index it.

**Prepared on the branch, ready to cherry-pick** (each its own commit, message
names the finding): P-F1, P-F3, P-F4, P-F5, P-F10, P-F11, P-F12, P-F13, P-F14,
P-F15, P-F16, P-F17, P-F18. See §5.

**Proposals worth your attention** (§6): the date-locale repair (F2) is bigger
than a prepared commit and wants a decision; a `players.locale` column would
unlock localised emails as a side effect; and the type-scale cleanup is
mechanical but touches ~300 declarations.

**Recommended review order:** F1 → F3 → F10 → F4 → F5 (correctness and trust,
all small) → F6/F14/F15 (tap targets, mechanical) → F7/F8/F9 (consistency,
needs your taste) → F2 (needs a decision) → proposals.

---

## 1. What is already good

Stated first because an audit that only lists faults mis-describes the product.

- **Contrast is not a problem anywhere.** Decoded-pixel ratios on every
  photographic surface: card venue 16.5:1, card time pill 16.2:1, spots figure
  9.0:1, hero 21:1, profile cover 20:1. The scrim work from rounds 2, 7 and 9
  holds up under measurement. No finding.
- **Vertical rhythm is 80% on-scale** (2,319 of 2,870 margin/gap values on
  4/8/12/16/22/32/48). The off-scale remainder is dominated by 1–3px hairline
  nudges. This is healthier than most production codebases.
- **Motion is restrained**: 58 `transition-colors`, three spinners, one drift.
  No page carries decorative animation. That is a deliberate-looking product.
- **Semantic structure is real**: `<dl>` for facts, `<details>` for disclosure,
  portalled dialogs, `aria-hidden` on decorative flags.

---

## 2. Findings

Severity: **breaks-trust** (the product misleads or fails) · **feels-cheap**
(works, reads as unfinished) · **polish**.

### F1 · Tapping an empty day chip shows every game — breaks-trust · S

`resolveSelectedDay` returns `null` when the requested day's `count === 0`
(`lib/games/days.ts:226`), so the filter silently does not apply.

Measured: tapping the empty **Today** chip →
`url: /games?day=2026-08-27`, `gameRows: 23`, `anyDaySelected: null`,
`allChipSelected: "true"`, `emptyStateShown: false`. Ten day headings render,
from "Tomorrow · Fri 28 Aug" to "Sun 20 Sept".

The player presses a day, the URL agrees they pressed it, and the product
shows them three weeks of everything with a different chip highlighted.

**TWO RECORDED INTENTIONS DISAGREE — this is not one ruling being broken.**

`DayPicker` promises: *"EVERY DAY IS A LINK NOW, including an empty one
(amendment A): tapping it shows the list's empty state, which is a real answer
rather than a dead control."*

`resolveSelectedDay`'s own docstring says the opposite, with a reason:
*"the filter still only accepts days there is something to filter to. Without
this, a link shared on the day of a game and opened after it would land on an
empty list instead of the whole board."*

Both intentions are good. Only one was implemented, and the other was written
down as though it had been. **I missed the second one on first reading and the
finding was originally written as a simple contradiction of `DayPicker`; that
was wrong and this is the correction.**

**Fix (prepared, P-F1):** the two cases are distinguishable, so this is a
repair rather than a choice. A tap can only name a day the strip is currently
*drawing*; a stale link names one that has fallen out of the window. Membership
in `tabs` separates them exactly — the count, which conflated them, never did.
After: rows 0, the tapped day selected, `All` deselected.

Evidence: `pass5.json`, `prepared/F1-empty-day.jpg`.

### F2 · Every date renders in English — breaks-trust · M

`lib/format.ts:12` — `const DISPLAY_LOCALE = "en-GB";` — feeds
`formatGameDate`, `formatGameDateTime`, `formatDate` and `formatTimeSpan`
across **29 call sites**. Meanwhile `lib/games/days.ts` maintains a proper
`DATE_LOCALE: Record<Locale, string>` used only by the day picker and the day
headings.

So one screen shows both systems: the heading reads "Út 25 srp", the card
under it reads "Tue 25 Aug".

Evidence: `screens/detail-out-ru-390.jpg` — the Russian game detail reads
**"Когда / Tue 25 Aug"**.

The module's docstring justifies the fixed **time zone** at length and says
nothing about the locale, so this is drift rather than a ruling.

**Fix:** thread the request locale into the formatters. Not prepared — see §6,
because 29 call sites and the email templates need a decision about scope.

### F3 · Russian duration label overprints its value — breaks-trust · S

`InfoCard`'s `<dl>` is `grid-cols-[84px_1fr]`. Measured on the RU detail:
`Длительность` has `clientWidth: 84`, `scrollWidth: 117`, `overflow: visible`.
It does not clip — it **draws over** the definition beside it.

Evidence: `/tmp/audit/ru-detail.png` (reproduced in `screens/`): the label's
final characters sit on top of "60 минут".

Czech is fine; the German-length Russian word is the one that breaks. Two
other RU-only overflows in the same family: the badge grid on `/account` and
`/player/[nickname]` (+16px).

**Fix:** let the term column size to content (`grid-cols-[auto_1fr]` with a
min) or allow the label to wrap.

### F4 · No error boundary on any route — breaks-trust · S

30 `page.tsx`, **zero `error.tsx`**, no `global-error.tsx`. Only two
`loading.tsx` (`/games`, `/game/[id]`).

The repo's own rule file `.claude/rules/_injected-fe-error-boundary.md` opens:
*"Every route has an Error Boundary"* and *"Without a boundary, a single render
error blanks the whole app."*

**Fix:** one `app/error.tsx` and one `app/global-error.tsx` with the product's
own shell, a retry, and a link out.

### F5 · Keyboard focus is effectively invisible — breaks-trust · S

Three files in the entire product contain any focus styling; two
`focus-visible:outline*` declarations total. Everything else — every claim
button, every nav link, every admin control — falls back to the UA default
ring, which on `#0A0A0A` is close to unreadable.

**Fix:** one global `:focus-visible` rule in `globals.css` using the volt token
at 2px with an offset. One declaration covers the product.

### F6 · 71 interactive elements under the 44px floor — feels-cheap · M

The floor is the product's own (round 14, item 5: *"below the 44px tap target
floor everything else in this product respects"*). Worst by reach:

| Control | Height | Pages |
|---|---|---|
| Footer `Privacy` / `Terms` | 18.2px | 33 |
| `locale-trigger` (language switcher) | 32.2px | 33 |
| wordmark link | 38px | 33 |
| `nav-account` (header avatar) | 38px | 24 |
| `notification-bell` | 40px | 24 |
| `admin-nav-*` chips | 32.2px | 8 |
| amenity checkboxes (×10) | 13px | admin/venues |
| skill checkboxes (×3) | 16px | admin game form |
| admin text inputs | 37.5px | admin game/site |
| `change-password-link`, `deletion-mailto` | 34px | account |

Excluded as false positives: `photo-input*` at 1px are `sr-only` inputs inside
a label — the label is the target and it is large.

### F7 · The primary action is drawn eleven ways — feels-cheap · M

Every volt-background control, measured:

| Height | Radius | Type | Where |
|---|---|---|---|
| 34.5 | 999 | 11px/400 UPPER | `stat-window-*` |
| 37.75 | 14 | 15px/700 | `nav-login` |
| 38.19 | 999 | 13px/600 | `period-*` |
| 44 | 14 | 17px/700 | `next-matches-all` |
| 46.5 | 14 | 15px/800 UPPER | `amenities-submit` |
| 52 | 14 | 17px/700 | `guest-add`, `venue-save` |
| 53.8 | 999 | 17px/800 | `Find a game →` |
| 53.8 | 999 | 17px/800 UPPER | `login-submit` |
| 55.8 | 14 | 17px/800 UPPER | `game-form-submit` |
| 56.19 | 18 | 16px/400 | nav pill tabs |
| 64 | 14 | 15px/600 | `day-tab-all` |

Two radii for one shape, four weights, both cases, and a 30px height spread.
Each looks fine alone; together they say the screens were built separately.

**Fix:** a `.btn-primary` component class the way `.lifted`, `.field` and
`.badge-pill` already work, with documented exceptions.

### F8 · Half of all type bypasses the scale — feels-cheap · M

Arbitrary `text-[Npx]` vs the token that means the same thing:

| Literal | Uses | Token | Uses |
|---|---|---|---|
| `text-[13px]` | 83 | `text-small` | 74 |
| `text-[11px]` | 40 | `text-eyebrow` | 23 |
| `text-[15px]` | 20 | `text-body` | 47 |
| `text-[17px]` | 16 | `text-body-lg` | 63 |

**The literal beats the token for two of the four**, including the eyebrow.
And 115 declarations use sizes the scale does not contain at all: 12px (57),
10px (35), 14px (15), 9px (8).

Rendered at 390px the product shows **21 distinct font sizes against a scale
of eight**.

### F9 · Sixteen heading treatments — feels-cheap · M

For what is conceptually page-title / section / sub-section. Three different
eyebrows alone:

- `H2 10px w400 uppercase track=3px` — players list, venue presets
- `H2 11px w400 uppercase track=3px` — credit balance
- `H3 11px w600 uppercase track=3px` — player of the month

And three "section heading" variants: `H3 18px w700 uppercase` (admin),
`H2 17px w700 uppercase` (Your details), `H2 17px w600 none` (credits) — plus
two 24px Anton headings differing only in letter-spacing, and one 17px heading
set in **Anton** while another 17px heading is set in **Onest**.

### F10 · A missing game returns HTTP 200 — polish · S

`GET /game/00000000-0000-4000-8000-000000000000` → **status 200**, body "That
game does not exist, or is not published yet."

`/player/<nobody>` and `/nope` both correctly return 404. The game route is the
outlier: it rendered its own not-found body instead of calling `notFound()`.

**THE FINDING SPLITS, and only half of it could be fixed.**

*Fixed and verified (P-F10):* a missing game now renders `app/not-found.tsx` —
the same screen, in three languages, that every other missing thing gets —
instead of a fourth piece of bespoke copy.

*Not fixed:* **the status is still 200.** This route has a `loading.tsx`, so
Next streams a shell as soon as rendering begins and the status is committed
with the first byte; a `notFound()` thrown afterwards cannot change it. Moving
the call into `generateMetadata`, which is awaited before the stream opens, did
not change it either in this environment — measured both ways, 200 with
"Loading…" in the first response.

It needs a decision that is not mine: drop the skeleton on this route to stop
streaming, or accept that fabricated game URLs answer 200.

### F11 · Thirteen card recipes — feels-cheap · S

Same concept — "a surface holding related content" — in 13 combinations of
radius (14/18), background (`surface`, `surface-raised`, transparent, volt,
volt/10) and border (none, .08, .14, volt/.3, 2px volt/.3).

`r=18 bg=surface-raised border=none` (14 pages) and the same **with** a
`.14` border (8 pages) are the two commonest, and they differ only in whether
somebody remembered `.lifted`.

### F12 · Two spellings of "pill" — polish · S

`border-radius: 999px` (511 elements, `rounded-pill`) and `9999px` (196
elements, `rounded-full`). Visually identical, but `rounded-full` is a Tailwind
default that bypasses the token — the same class of drift as F8, one property
along.

### F13 · The admin nav scrolls with no affordance — polish · S

`scrollWidth: 572` in a `clientWidth: 390`. It **is** reachable — `overflow-x:
auto`, and `elementFromPoint` confirms the last chip is hittable after
scrolling — so this is not the round-17 venue-row bug. But 182px of navigation
sits off-screen with nothing indicating it, on all eight admin pages.

Round 17 solved exactly this shape for venue rows with a chevron.

### F14 · Skill checkboxes are 19.5px — feels-cheap · S

**Half of this finding was wrong and is withdrawn.** The first measurement read
the `<input>`: amenities 13px, skill 16px. But a `<label>` wrapping an input
*is* the hit area, so the label is what matters — and re-measuring found the
amenity labels already carry `min-h-11` and measure **44px**. Nothing to fix
there; the probe was measuring the wrong element.

Measuring labels instead found the real one three screens away: the **skill**
checkboxes on the game form have labels of **19.5px**. Same control, same
product, two hit areas — and this was the small one.

Fixed in P-F14 together with F6's form fields.

### F15 · Header controls sit just under the floor — polish · S

`notification-bell` 40px, `nav-account` 38px, `locale-trigger` 32.2px. All
three are within 12px of the floor and appear on 24–33 pages. Raising them is
a single change to the header's control sizing.

### F16 · Two `loading.tsx` for 30 routes — polish · S

`/games` and `/game/[id]` have skeletons. `/account`, `/pass`, `/admin/*` and
the rest fall through to a blank frame while their server components resolve —
which on the admin pages is a database round trip.

### F17 · The footer links are 18.2px on every page — feels-cheap · S

Called out separately from F6 because of reach: `Privacy`, `Terms` and their
CS/RU equivalents are the smallest interactive targets in the product and they
are on all 33 pages.

### F18 · Borders are drawn in surface colours — polish · S

`2px rgb(22,22,22)`, `2px rgb(8,8,8)`, `2px rgb(15,15,15)` — 44 elements draw
a border in a *fill* token to fake a gap. It works, and it means a theme change
that moves `surface` moves those borders in a way nobody predicted.

---

## 3. Consistency matrix

The same concept, counted across the product:

| Concept | Distinct renderings | Detail |
|---|---|---|
| Primary action | **11** | F7 |
| Heading | **16** | F9 |
| Card surface | **13** | F11 |
| Font size | **21** (scale has 8) | F8 |
| Pill radius | **2** spellings | F12 |
| Date format | **2** systems (one localised) | F2 |
| Eyebrow label | **3** | F9 |

Each instance is defensible alone. The matrix is the finding.

---

## 4. Benchmark — principles, not skins

Measured against what Airbnb, Linear, Strava, Uber and Spotify do consistently.
Only deltas that are concrete and measurable are listed.

**Where hrajfotbal already matches.**
*Photography under text* — Airbnb and Strava both solve this with a measured
scrim rather than a uniform dim; this product does the same and can prove it
(16:1 over a photo). *Motion restraint* — Linear's discipline is one transition
property and no decorative animation; this product is at 58 `transition-colors`
and three spinners. *One accent* — Spotify's green and this product's volt are
both used for exactly one thing (the action), and ruling D is stricter than
most.

**Where it falls short, with the delta.**

1. **One button, one shape.** Linear and Uber have effectively one primary
   button; a second size is a documented exception. Delta: 11 → 2 (regular and
   compact), enforced by a component class. *F7.*
2. **A type scale you cannot bypass.** Airbnb's DLS makes arbitrary sizes
   awkward to write. Delta: 21 rendered sizes → 8, and the eyebrow token used
   more often than its literal. *F8.*
3. **Empty states that teach.** Strava's empty feed proposes an action; this
   product's `/account?tab=games` and `/my-games` already do (both carry a CTA
   — a genuine strength). The gap is the *filtered* empty state: F1 means the
   day filter never reaches one.
4. **Confirmation moments.** Uber and Airbnb make the moment a booking succeeds
   unmistakable and give it a single next action. This product's
   booking-confirmed screen does this well; the credits-added screen matches
   it. No delta — this is a strength.
5. **Form friction.** Linear's inputs are 40–48px with visible focus. Delta:
   admin inputs are 37.5px with no `focus-visible` at all. *F5, F6.*
6. **Loading that holds the layout.** Airbnb skeletons match the real
   composition so nothing shifts. Delta: 2 of 30 routes have any skeleton.
   *F16.*
7. **Localisation as a first-class property.** Spotify localises dates and
   numbers, not just strings. Delta: strings are translated in three languages
   and dates are not localised at all. *F2.*

**What "premium" would mean here, concretely:** one button shape, eight type
sizes, a visible focus ring, no interactive element under 44px, dates in the
reader's language, and a filter that filters. Nothing on that list is a
redesign.

---

## 5. Prepared on the branch

Each is its own commit whose message opens with the finding ID, so
cherry-picking is mechanical. Before/after strips in `prepared/`.

| Commit | Finding | What it does |
|---|---|---|
| `b416293` | **F1** | An empty day chip filters instead of showing the whole board |
| `6ca0a13` | **F3** | The Russian duration label stops overprinting its value |
| `65347af` | **F10** | A missing game shows the product's not-found screen (UI half only — see F10) |
| `cc798d9` | **F4** | `app/error.tsx` and `app/global-error.tsx` |
| `7042672` | **F5** | One global `:focus-visible` rule |
| `a2a48f3` | **F17** | Footer links reach 44px |
| `5bcbb7c` | **F15** | Header controls reach 44px |
| `f89373e` | **F14 + F6** | Skill labels and every admin field reach 44px — and F14's amenity half withdrawn |
| `56e6914` | **F12** | One spelling of "pill" (23 files, no pixel moves) |
| `c6d93bf` | **F13** | A fade tells the admin nav it continues |

**Ten, not fifteen.** The remaining findings — F2 (dates), F7 (button
treatments), F8 (type scale), F9 (headings), F11 (card recipes), F16
(skeletons), F18 (surface-colour borders) — are each either large, or
taste-dependent, or would collide with anything else in flight. Preparing them
as "small isolated wins" would have misrepresented what they are, so they are
in §6 instead.

**Suites on the branch, with all ten applied:** unit **620/620**, e2e **291
passed / 0 failed / 4 skipped**, lint 0 errors, `tsc` clean, `next build`
clean. The shelf is safe to cherry-pick from.

Each commit message opens with its finding ID, so `git cherry-pick <sha>` is
mechanical and the message explains itself in the target branch.

---

## 6. Proposals — not prepared

**P1 · Localise dates (F2).** Thread the request locale into `lib/format.ts`,
which means passing it to 29 call sites or reading it from a server-side
context. It is not hard, but it is not small, and it wants a decision about
whether the `.ics` and the email templates follow — the emails are English by a
recorded decision that rests on there being no `players.locale`, so a UI-only
fix would leave the two deliberately out of step.

**P2 · `players.locale`.** One nullable column set at signup would make
localised email possible and give F2 a natural home. CLAUDE.md already names
its absence as the reason emails are English. One column, one write at signup,
and the email dispatcher gains a locale argument.

**P3 · A `.btn-primary` component class (F7).** The pattern exists three times
already — `.lifted`, `.field`, `.badge-pill` — and each has paid for itself.
This is the fourth and the most visible.

**P4 · Type-scale sweep (F8).** Mechanical: replace exact-match literals with
their tokens, then decide what 12px and 10px should become. ~300 declarations,
no behaviour change, but it touches most files and would collide with anything
else in flight.

**P5 · Skeletons for the admin routes (F16).** Each admin page makes a database
round trip before its first paint. A shared admin skeleton matching the chip
row plus a card list would cover six routes.

**P6 · An in-app fallback when Telegram cannot resolve.** Round 19 removed the
phone form because it could fail silently off-site. A handle can still be
wrong. Cheapest honest option: validate the handle once at save time by
fetching `t.me/<handle>` server-side and storing the result — one request per
save, no per-render cost.

---

## 7. Ruling challenges

**One, and it is F1 — though it is a contradiction to repair rather than a
ruling to overturn.**

**RULING CHALLENGE · F1 · the empty day chip.** Two recorded decisions
disagree: `DayPicker` says an empty day is a link that shows the empty state;
`resolveSelectedDay` says the filter accepts only days with games, to protect a
stale shared link. The implemented behaviour follows the second and contradicts
the first, and the player gets the worse half of both. **The case for
reopening:** the two intentions are not actually in conflict once the cases are
separated — a tap names a day the strip is drawing, a stale link names one that
has fallen out of the window — so both can be honoured at once. P-F1 does that.
If you disagree and want the fall-back-to-all behaviour kept for empty days,
then `DayPicker`'s comment is the thing to correct instead, and the chip should
be drawn as disabled rather than as a link.

The other candidates were checked and dismissed:

- The **10px eyebrow** looked like a challenge to ruling B (the product's one
  uppercase style). It is not: B governs *case*, not size, and the eyebrow
  token is 11px. The 10px instances are drift. *F9.*
- **`DISPLAY_LOCALE = "en-GB"`** looked deliberate. The module's docstring
  defends the fixed *time zone* at length and never mentions locale, and
  `lib/games/days.ts` localises dates properly — so the two disagree, which a
  ruling would not. *F2.*
- **Duration off the game boxes** (round 19, item 4) and **ruling C's reversal
  for game boxes** (round 17, item 2) are settled and recorded; nothing
  measured argues against either.
