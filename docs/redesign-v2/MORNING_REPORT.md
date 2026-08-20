# Redesign v2 — morning report

**Written 2026-08-20, end of the overnight run.** Rounds 3–6 built, merged, and
deployed. `main` and production carry the redesign.

---

## Deployment

| | |
|---|---|
| **Deployment ID** | `dpl_J58ahaiigYzV8t6MFPZJhQW8KBEg` |
| **State** | Ready, target production |
| **Alias** | `https://hrajfotbalek-wlya.vercel.app` — confirmed pointing at this deployment |
| **Build URL** | `hrajfotbalek-wlya-d0jwf38k6-reneomuller-7550s-projects.vercel.app` |
| **Inspector** | `vercel.com/reneomuller-7550s-projects/hrajfotbalek-wlya/J58ahaiigYzV8t6MFPZJhQW8KBEg` |
| **Commit** | `8f7679c`, `main` fast-forwarded from `staging/v13` (16 commits) |

Deployed with `npx vercel --prod` because the `main` webhook is broken.

**Live verification, after the deploy:**

| Check | Result |
|---|---|
| `/` | 200, renders `hero-headline`, `how-it-works`, `text-page-title` |
| `/games` | 200, renders `game-row` and the `pitch-default` card photo |
| `/game/<id>` | 200, renders `game-hero`, `hero-photo`, `hero-scrim`, `availability-card`, `claim-bar` |
| `/login` | 200 |
| `/account` | 307 to login, signed out — correct |
| `/pitch-default.jpg` | 200 |

A `curl` with no locale cookie served the Czech hero ("Hraj fotbal / Kdykoli"),
which incidentally confirms the three-language path is live.

---

## Suites at the merge commit

| Suite | Result |
|---|---|
| `npm run test:e2e` | **207 passed, 1 skipped**, 0 failed |
| `npm run test:unit` | 582 passed |
| `npx eslint .` | clean |
| `npx tsc --noEmit` | clean |
| `npm run build` | clean |

The skip is `strips-redesign-card.spec.ts` "a past card drops the cue" — it
skips itself when the seed has no past game on the My-games tab, which is
correct behaviour and is documented in `NIGHT_LOG.md`.

`npm run test:integration` was **not** run: it points at the live database and
the merge checklist does not call for it.

---

## What shipped

### Round 3 — home and games (`b5ddbe1`, `cecf325`)

- **The hero is the slogan, not the wordmark.** The header already carries the
  mark eighty pixels above, so the page's largest type was saying the brand
  name twice. Two Anton rows, from two string keys, so the break is the copy's
  punctuation rather than a width. `headlineLead` / `headlineAccent` removed
  with their i18n exemptions.
- **How-it-works is one ordered list** with hairline-divided rows, not three
  cards: 01 → 02 → 03 is a sequence and three boxes say you may start anywhere.
  The numerals rise to Anton volt (R5).
- **The three home panels take the frames' neutral edge** — `.lifted`, the
  treatment `globals.css` already writes once — instead of three private
  spellings of a volt border on `surface`.
- **Player of the Month inverts its hierarchy:** the title demotes to a volt
  eyebrow and the name takes the display face, face at the right. The title is
  the same three words every month; the name is the only thing that changes.
- **Community's two figures become a two-column grid.** As a wrapping flex row
  they sat side by side at every width except 390, where they overran by eight
  pixels — the frame's layout everywhere but the viewport the frames are
  drawn at.
- **`page-title`, a new type step.** The frames set a page heading at 32px on a
  390 viewport; `title` clamps to its 24px floor there, so every page heading
  was a third small. A new step rather than a wider `title`, which is aliased
  four ways across 19 headings in rounds that are not in scope.

### Round 3, first commit — the nav bar (`bc093ff`)

The owner's reversal: the band stays flush and full-bleed, the **cells** take
the frames' 12px inset from each screen edge with a 6px gap. Second reversal on
this element, recorded struck-through with its lineage in the component and in
`DESIGN_SYSTEM_V1.3.md` §7 R12. The `elementFromPoint` top-layer guarantee and
the safe-area handling are untouched; `nav-pill.spec.ts` now asserts the two
halves separately and asserts the inset is symmetric.

### Round 4 — game detail (`d6ede2e`)

- **One header band for every game.** There were two: a 280px full-bleed hero
  for a venue with a photograph and a compact text header for one without, so
  the same page opened differently depending on a column most venues leave
  null — and the tall one pushed "when is it" below the fold.
- **R6(b)'s fade, built.** The photograph backs the band and the scrim's last
  stop is `ink` at **full** opacity, at 90% of the band. That is the
  load-bearing detail: it is the page's own ground, so the join is invisible.
  A `to-ink/[.95]` looks identical in review and leaves a hairline of
  photograph along the top of the first card.
- **R5's two named cases, finally applied.** The availability counter and the
  claim bar's price are display-scale numerals and are now Anton; the list
  card's figure stays on the body face, which is the half R5 forbids. Both
  directions asserted.
- The counter and the avatar stack share a row, as `p03` draws them.

### Round 5 — auth (`59280fb`)

- **The product's page shell.** Both screens were a vertically centred
  `max-w-sm` card — a login screen from a different app. Now `pt-24`,
  `px-gutter`, `max-w-shell`, `page-title`: the same four `/games` uses.
- **The frames' cards**, one per field stack, with capsule controls.
- **`.field` / `.field-label` moved into `globals.css`** beside `.lifted`. The
  two forms carried byte-identical constants — the two auth screens were
  staying in step by two people remembering to edit both. The label loses
  JetBrains Mono, which appears in none of the nineteen frames; the field
  gains a fill, because `bg-transparent` on `ink` makes an empty input an
  outline around the page.

### Round 6 — profile (`175ff5a`)

- **The cover becomes a photograph**, reversing the gradient. The old reasoning
  was sound and its premise changed: it assumed the only photograph available
  was some particular venue's. R6 introduced one generic pitch used behind
  every card and every game header, so here it is furniture rather than a claim
  about where anyone has played. The objection still stands against a *venue*
  photo on a profile, and that is still not built.
- **`p11`'s settings rows:** a tracked-caps label over a larger white value,
  ruled between rows.

---

## Two bugs found and fixed on the way

**A viewport too short to hold a pitch crashed the background** (`a38d0d7`).
`PitchBackground` computes its field rect from the viewport minus a margin with
a 20px floor, so below roughly `NAV + 40` of height the centre-circle radius
goes negative and `arc()` throws `IndexSizeError` — an *uncaught* exception
from a background decoration, on every surface, aborting the rest of that
effect. Reachable in the wild (a short in-app browser chrome, a resized desktop
window) and reliably in the harness, which is where it surfaced.

**The profile cover painted over the nickname.** Giving the cover a scrim made
it a *positioned* element, and a positioned element paints above its
non-positioned siblings whatever the source order says — so it sliced the name
in half along the band's bottom edge. It reads as a font-rendering artefact
rather than as a stacking mistake. Diagnosed with `elementFromPoint`, which is
CLAUDE.md's standing method for this family, and that is how it is now
asserted.

---

## The finding worth reading first

**Anton ships no Cyrillic subset.** `app/layout.tsx` loads `latin` and
`latin-ext`, which is all Google publishes for that face — so **every display
heading in Russian falls back to the body face**, product-wide. It has always
been true; the hero is simply where it first has consequences.

"КОГДА УГОДНО. ГДЕ УГОДНО." measures 536px in the fallback against 358px of
available width at 390, so fitting line two on one row needs a 29px hero
against the frame's 44. Russian therefore sets **three** rows, and the break
lands on the sentence boundary, which reads correctly.

The spec was rewritten accordingly: **the rule is the break, not the count.**
Every sentence must fit on a row, which is equivalent and deterministic — a
greedy line-breaker can only split inside a sentence that does not fit on a row
of its own. Three rows reading "ИГРАЙ В ФУТБОЛ. / КОГДА УГОДНО. / ГДЕ УГОДНО."
is the copy's own punctuation; three rows breaking after "ГДЕ" is the defect,
and it is one font-metric change away at any time.

**A real display face with Cyrillic is a decision for the owner**, not for a
night run. Until then the Russian product has no display typography.

---

## Deliberate omissions

**No Google sign-in.** `p08` draws `Continue with Google` and `Sign up with
Google`. There is no Google OAuth in this product — the audit files it as a
proposed feature round — and a button that cannot sign anyone in is exactly the
dead affordance the run's own rule forbids. A spec fails if a later round
paints one from the frame without wiring it.

**Forgot-password keeps its behaviour.** `p08` links to a screen that does not
exist; both reset frames are on the audit's missing list. Per instruction the
working two-step — request a code, then type it — is untouched underneath and
only the box around it changed. The spec asserts it is still a form with its
own field and its own submit, so it cannot be quietly swapped for the frame's
link.

**Payment, admin and the new pages** are out of scope and untouched. The v1.3
payment flow is byte-identical and `MERGE_READINESS.md`'s payment gate is
unchanged.

---

## Divergences accepted, with the reason

Full table in `DESIGN_SYSTEM_V1.3.md` §8 R18. In short:

| Surface | Divergence | Why it ships |
|---|---|---|
| Home hero | 44px against the frames' ~48 | `hero`'s clamp floor is ruling J's, set so the steps clear the fold |
| Home hero, RU | Three rows | Anton has no Cyrillic — see above |
| Home, `All games` | A button under the cards, where `p01` puts a link in the heading row | Ruling J moved it there deliberately and gave reasons. Law beats frame on an affordance's prominence, as under R1 |
| Community + profile stats | Captions wrap where the frames keep one line | `eyebrow`'s 3px tracking does not fit "GAMES PLAYED" in a third of 390. Ruling B beats the frame's letter-spacing |
| Day strip | Nine cells at 48px against six at ~52 | The calendar-width ruling forbids a scrolling row, so the count is fixed and the width follows |
| Games list | Two whole cards above the fold | R10, ratified |
| Every page | The pitch canvas shows where the frames draw flat black | `SiteBackground` is round-1 chrome, already reviewed. Removing it is a chrome decision, not a page one |
| Game detail | The band is photographed where `p03` draws it flat | R13 — R6(b) postdates the frame |
| **Profile cover** | 132px tall; `p10` runs the photograph past the stats to the tab row | **The one I would revisit first.** Extending it puts white stat numerals over the photograph's brightest region, which is a contrast question the round had no budget left to measure properly |

---

## What I would have stopped for under normal rules

1. **`All games` on the home page.** `p01` and ruling J disagree about whether
   it is a link in the heading row or a button under the cards. I upheld
   ruling J, on the R1 precedent that law wins over a frame on an affordance's
   prominence. It is genuinely the owner's call and it is a one-line change
   either way.

2. **The Russian display face.** Anton cannot set Cyrillic. Every Russian
   heading in the product is currently the body face at a display size. That
   is a typography decision with a cost (a second webfont) and no correct
   default.

3. **Which photograph backs the game detail band.** R6 says one default and
   that `venues.image_path` is "not touched". I read that as "do not *build*
   per-venue photos", not "delete the ones that work", so the band shows the
   venue's own photograph when it has one and the default otherwise. The other
   reading — default everywhere, always — is defensible and is one line.

4. **The seed prices games at 200 CZK** while ruling F sets the flat price at
   150. The claim bar's `/ 1 credit` suffix is therefore invisible on every
   seeded game. Not touched: it is data, and the credit-model memo already
   flags it as a stop-and-ask.

---

## State

- `main` = `staging/v13` = `8f7679c`, both pushed.
- Production is this commit, aliased and verified.
- Strips for every round in `docs/redesign-v2/strips/`:
  `chrome/`, `card/`, `pages/`, `detail/`, `auth/`, `profile-v2/` —
  three languages where the surface carries copy.
- Standing law recorded in `DESIGN_SYSTEM_V1.3.md` §7 (R10–R12) and §8
  (R13–R18).
