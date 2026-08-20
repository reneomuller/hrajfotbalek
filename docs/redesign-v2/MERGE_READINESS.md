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

### Payment gate: **RESOLVED** — credits and cash always work; online is a gated placeholder

**Status 2026-08-20, round 7 item 10. R3 has now executed** and the gate
resolves rather than returning to blocking. The reason it can is that the
round was built so that no state of the system has a player unable to pay.

**What a player can do today, in every configuration:**

| Path | State | Who it covers |
|---|---|---|
| **Credits** | live, unchanged | anyone with a balance — applied FIRST by `create_booking`, never offered as a choice, never a gate |
| **Cash on the pitch** | live, unchanged | everyone. Books the spot, marks it UNPAID, appears in the admin unpaid view for settling in person |
| **Online payment** | placeholder, gated | nobody yet — see below |

**Online is inert BY CONSTRUCTION, not by omission.**
`NEXT_PUBLIC_STRIPE_PAYMENT_URL` is the entire activation. While it is empty
the option renders fully styled and marked "Coming soon", **cannot be
selected**, and is **refused server-side** if a stale tab or a hand-made POST
submits it anyway. Confirm is disabled until something selectable is chosen,
so there is no sequence of clicks that submits a method with a dead path
behind it. Set the variable and the same option books the spot unpaid and
hands the player to that URL.

**The rails are untouched, which is R3's load-bearing half.** QR is gone from
the booking screens and nowhere else: the `'26'`-series variable symbols,
`create_topup` / `confirm_topup`, the pass paths and the credit ledger are
byte-identical, and `create_booking` still accepts `qr` from a client. The
online option books onto that rail — `online` → `qr` is a UI-to-rail
translation in one `Record`, and it is the single line that moves when Stripe
is integrated. `e2e/booking.spec.ts` asserts both halves in one test: the rail
still books and still renders its QR, and the booking form does not name QR
anywhere.

> ~~**Payment: QR is removed from the redesigned UI and the card option is
> inert — merging before Stripe activation leaves NO working per-game payment
> path. Do not merge until Stripe is live or Oliver explicitly accepts
> this.**~~ **RESOLVED 2026-08-20.** The premise was that removing QR would
> leave no working per-game path. Cash is that path, it always was, and it is
> now the default rather than the second option. Merging before Stripe is live
> ships a product where every player can pay.

**ROUND 8 ADDS A THIRD OPTION AND TWO LINK VARIABLES.** The chooser is now
Redeem credit / Online / Cash, with credit DEFAULT-SELECTED when the wallet
covers the game and non-selectable with an "Add credits" pill when it does
not. Pass tiers gained their own link map. Neither changes the gate above:
with no variables set, credit and cash both work and online is inert.

> **RECORDED REVERSAL — credit is no longer applied silently IN THE BOOKING
> FLOW.** It used to be an invisible outcome: a player with a balance picked a
> payment method, and `create_booking` quietly spent the wallet instead. That
> is still exactly what happens in the LEDGER — one redemption, same amount,
> `credit` still derived by the RPC and still rejected as an input — but the
> player now says so first. Every other surface that applies credit
> (waitlist convert, admin add-player) is untouched.

**What is still owed when Stripe lands:** a real integration behind that URL —
a session, a webhook, and a booking that flips to paid on confirmation.
Redirecting to a hosted payment link books the spot unpaid and trusts the
player to complete it, which is the same trust the cash path already extends
and is acceptable only while the volume is what it is.

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
