# Merge readiness — `staging/v13` → `main`

A running checklist of everything that must be **true**, or **consciously
accepted by Oliver**, before the redesign era merges to `main`.

`main` and production are untouched by this era. No redesign round runs
`vercel --prod`. Pushes to `staging/v13` auto-deploy previews; the preview URL
is reported in every end report.

Add to this file whenever a round creates a new condition. Nothing is removed —
items are checked off or marked accepted, so the list reads as a history of what
had to hold.

---

## Blocking

*(none — see the payment gate below)*

### Payment gate: **GREEN** — old flow untouched

**Status 2026-08-20, night round.** The payment round was **excluded** from the
night run by the owner. R3 is recorded law but **not executed**: the existing
payment surfaces — the QR/bank-transfer path, `'26'`-series variable symbols,
`create_topup`/`confirm_topup`, the ledger — are **byte-identical and live**.

So the original blocking item does not apply to this merge:

> ~~**Payment: QR is removed from the redesigned UI and the card option is
> inert — merging before Stripe activation leaves NO working per-game payment
> path. Do not merge until Stripe is live or Oliver explicitly accepts
> this.**~~ **NOT YET IN EFFECT.** R3 executes in a later round. Until it does,
> the redesign carries the v1.3 payment flow unchanged and a player can pay.

**This item returns to BLOCKING the moment the payment round runs.** Whoever
executes R3 must move it back up and re-read the sentence above.

## Open (not yet blocking, must be resolved or accepted)

- [ ] **Desktop is undefined for every redesigned surface.** The export is
      mobile-only by design (R7). Current v1.3 `md:` behaviour survives as
      interim law and no round may degrade it — but "interim" has no end date
      yet, so merging ships a product whose phone and desktop surfaces come from
      two different design generations.

- [ ] **`/pass` has no redesign frame.** Two designed surfaces link to it and it
      is the commercial core. Either it stays v1.3 into the merge (a visible
      seam) or it gets a frame first.

- [ ] **Undesigned live routes** (AUDIT.md §3c) each need a stays-v1.3 /
      awaits-design ruling before merge, or the merged product is part-redesigned
      in ways nobody chose.

- [ ] **New pages ship no dead affordances.** Any control the frames draw that
      points at an unbuilt page is OMITTED, not shipped inert (owner, night
      round). Community tab, bell/notifications, `+ ADD VENUE`, `View unpaid`,
      `EXPORT DATA`, organizer `Message` and the public player profile are all
      absent by that rule rather than forgotten.

- [ ] **Public player profile is quarantined** (R8). Leaderboard, PotM and roster
      avatars ship non-clickable. If any round makes one clickable, this becomes
      blocking.

- [ ] **CS/RU native-review batch** must be sat before merge. Every redesign
      round adds drafts; shipping unreviewed Czech to a Czech-default product is
      the failure mode.

---

## Accepted

*(nothing yet — entries move here with a date and Oliver's words)*

---

## Satisfied

- [x] **`staging/v13` contains `main`.** Re-verified at the start of every
      redesign round by merging `main` in first, so the branch stays trivially
      mergeable back. Last verified: Round 1, `main` fully contained.
