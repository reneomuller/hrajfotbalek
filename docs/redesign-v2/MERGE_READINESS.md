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

- [ ] **Payment: QR is removed from the redesigned UI and the card option is
      inert — merging before Stripe activation leaves NO working per-game
      payment path. Do not merge until Stripe is live or Oliver explicitly
      accepts this.**

  Ruling R3 retires QR from the redesigned payment surfaces and draws the card
  option exactly as the frames show it, wired to nothing. The backend QR
  machinery is untouched and still works — but no redesigned screen reaches it.
  Between merge and Stripe activation, a player on the redesigned UI has no way
  to pay for a game.

  Resolution is one of: Stripe Checkout live and wired; or Oliver accepts a
  payment-less window in writing; or the merge waits.

---

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
