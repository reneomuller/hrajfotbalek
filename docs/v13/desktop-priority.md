# Desktop content priority — what changes at `md`, and what must not

One breakpoint: **`md = 768px`**.

**The rule behind every row of the table below, stated once:**

> **Width buys layout, not content. Nothing is added at desktop that a phone
> does not get, and nothing is dropped.**

A screen that gains a panel at 1280px is a screen whose phone version is
missing something. A screen that drops one is a desktop version that is missing
something. Both are the same defect wearing different clothes, and both are
easy to introduce one component at a time while each individual decision looks
reasonable.

## The shell

| | Below `md` (390–767) | At and above `md` |
|---|---|---|
| Page gutter | `22` | `22` — unchanged |
| Reading column | Full width | **Capped at `720px`, centred** |
| Header chrome | Wordmark, auth control, language switcher | Same, **plus** the link row |
| Navigation | The floating pill | The header link row |

**The gutter does not grow with the viewport.** It is `22` at 390px and `22` at
1280px. Growing it is the reflex that turns a centred column into a column with
mysterious extra air, and the cap already does the job the gutter would be
reaching for.

**Navigation is mutually exclusive at every width.** The pill renders below
`md`; the link row at and above. `SCR-APP-CHROME` in the wireframe sketches both
in one frame, and that frame is a composite rather than a layout — two controls
saying "Games" on one screen is one of them being ignored.

**720px is a reading measure, not a grid decision.** A games list stretched
across 1280px is a list whose left edge and right edge are read by different eye
movements. `shell` (980px) stays wider and is used by the header, because chrome
wants the wordmark and the auth control at the *edges* of the screen rather than
floating in the middle of it.

## Per screen

| Screen | Below `md` | At and above `md` | Cap |
|---|---|---|---|
| Games list | One card per row | One card per row, wider | 720 |
| Game detail | Single column | Single column, wider | 720 |
| Game detail photo | Full bleed within the gutter | Same | **720** |
| Home step cards | One per row | **Three across** | 720 |
| Pass tiers | One per row | **Two across** | 720 |
| Day strip | 8 boxes, horizontally scrollable | 8 boxes, all visible, no scroll | 720 |
| Profile | Single column | **Single column at every width** | 720 |
| Dialogs | Full width less gutter | Centred | **≤480** |
| Auth forms | Full width less gutter | Centred | **≤420** |
| Prose (terms, privacy) | Full width less gutter | Centred | **≤640** |

### The rows that are exceptions, and why

**Profile is single column at every width.** It is the one screen where a
two-column desktop layout is tempting and wrong: the fields are a sequence
someone fills in order, and splitting them into columns turns one pass down the
page into a decision about where to look next. The cap does the work.

**Auth forms cap at 420, narrower than prose.** A login form is four fields and
a button; at 640px the label and its input are far enough apart to stop reading
as a pair.

**Dialogs cap at 480.** A dialog that is wider than it is tall stops reading as
a dialog and starts reading as a page that has appeared on top of another page.

**Prose caps at 640, tighter than the 720 column.** Terms and privacy are the
only screens in the product that are continuous text rather than cards, and
continuous text wants a shorter measure than a list of cards does.

**The game card is wider but never re-laid-out.** Its internals do not reflow at
`md` — the same figure in the same place, with more room around it. A card that
rearranges itself at a breakpoint is a second design to keep correct.

## Where each row is implemented

The shell rows — gutter, reading column, navigation switch — are Phase 20, in
`app/layout.tsx` and `tailwind.config.ts`.

**The per-component rows are NOT.** The day strip belongs to Stage 1, the pass
tiers to Stage 4, the home step cards to Stage 5, the game card to Stage 1. Each
lands in the stage that owns its surface, for the same reason ruling P gives for
empty states: a layout decided away from the component it applies to is decided
twice, and the second one is the one that ships.

This table is the contract those stages implement against, which is why it
exists before any of them.

## The check that catches a violation

Neither half of the rule is visible in a diff. A component that gains a
`md:hidden` looks exactly like a component that gained a responsive
refinement — and it is the phone version that quietly loses a node.

So the check is a comparison rather than a review: render each screen at 390px
and at 1280px, and diff the set of **content nodes** — not the layout, not the
classes, the nodes.

- A node present at 1280 and absent at 390 → **fail**. Desktop gained something.
- A node present at 390 and absent at 1280 → **fail**. Desktop dropped something.
- The same nodes in a different arrangement → **pass**. That is the point.

`md:hidden` and `hidden md:flex` are the two utilities that can break this, and
they are legitimate on exactly one pair of elements in the product: the nav pill
and the header link row, which are the same control rendered twice and are
therefore the one place where a node genuinely should not exist at both widths.

Any third use is the thing this table exists to prevent.
