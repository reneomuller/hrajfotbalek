# Launch sequence — HUMAN steps

Everything in this file is Oliver's to run. None of it has been done. The code
side of Phase 30 is in place (the Resend SMTP block is prepared in
`supabase/config.toml`, `.env.example` documents the production values, and the
live-send path is covered by `npm run test:unit -- -t "sendEmail live"`), but
the cutover itself is a sequence of irreversible, outward-facing actions —
sending real email to real people and wiping the database — and those are not
an agent's to take.

Run the steps in order. Each one is verifiable before the next.

---

## 0. Before the day

**0.1 — Supabase email template.** Add `{{ .Token }}` and switch the link to
`{{ .TokenHash }}`. Full snippet and reasoning: `AUTH_EMAIL_TEMPLATE.md`.
Until this is done the six-digit code box on `/login` rejects every code,
because the email does not contain one.

*Verify:* request a link, confirm the email shows both a button and a code.

**0.2 — Resend DNS.** Confirm the domain shows **verified** in the Resend
dashboard. Not "pending", not "partially". A half-verified domain does not
bounce — it lands quietly in spam, and from this side that is indistinguishable
from working.

**0.3 — Privacy text.** Supply the real copy for `/privacy`. The page currently
ships a DRAFT banner and an outline of what the policy has to cover; the
wording is yours and no generated text should replace it. Launching with the
DRAFT banner visible is a choice you can make knowingly — it must not happen by
being forgotten.

---

## 1. Reset the platform

Clears every game, booking, waitlist row, credit entry and event. Keeps every
player, their admin flags and the venues.

```bash
npm run reset:platform                 # dry run — counts, deletes nothing
npm run reset:platform -- --confirm    # does it
```

The dry run has been executed and works; **the `--confirm` run has not.**

*Why it matters:* the credit rows in particular are liabilities the product
would honour — fixture wallet balances are money owed for games that never
happened.

*Verify:* the script re-counts players, admins and venues afterwards and exits
non-zero if any of them moved. Then open `/admin/stats` — every number should
be zero or empty.

**Also check the venue list.** The reset preserves venues by design, and the
E2E suite creates one called **E2E Scratch Pitch**. If the suite has ever been
pointed at this database, delete that venue by hand — otherwise it sits in the
organizer's venue picker on day one. (It was removed from the dev database at
the end of the M5 build; the suite recreates it on demand.)

---

## 2. Switch the magic-link email to Resend

Hosted project: **Project Settings → Authentication → SMTP**.

```
host:     smtp.resend.com
port:     587
username: resend
password: <the Resend API key>
sender:   noreply@hrajfotbal.com   ("Hraj Fotbal")
```

The same values are prepared, commented, in `supabase/config.toml` — that file
governs a local stack only, so uncommenting it does not affect production.

*Verify, immediately, on a real phone:* request a link, receive it, sign in.
Auth email regressing here locks every user out, and it is the one path the E2E
suite deliberately bypasses — so it has the least automated coverage of
anything in the system. Do this before step 3, not after.

---

## 3. Turn delivery on

Set `EMAIL_DRY_RUN=off` in the production environment (Vercel → Settings →
Environment Variables) and redeploy.

*Verify:* `npm run test:unit -- -t "sendEmail live"` passes locally, then
trigger one email of each family against a real address and confirm arrival:

- booking held (QR) — book a spot
- payment confirmed — mark it paid
- cancellation credit — cancel it
- waitlist spot open — fill a capacity-1 game, queue, cancel
- nudge / reminder / expiry — the three cron routes
- game cancelled — cancel a throwaway game

Note the fail-safe direction while you are here: a missing or unrecognised
`EMAIL_DRY_RUN` logs rather than sends. `EMAIL_DRY_RUN=true` means dry-run
**on**. Only `off` / `false` / `0` / `no` sends.

---

## 4. The real game, running shadow

Create one real game and run it **in parallel with the existing WhatsApp
process** — the manual process stays the safety net for exactly one game.

Walk the acceptance checklist against it, on a phone, not a desktop:

- [ ] Book → scannable SPD QR in under 60 seconds
- [ ] The QR actually pays: scan it in a real banking app and check the VS
- [ ] Credit auto-applies on a second booking (full and partial)
- [ ] A full game offers the waitlist; joining works and shows a position
- [ ] Cancel → credit → spot released → waitlist notified, with nothing pressed
- [ ] Admin confirm in ≤5 s; roster distinguishes paid / holding / cash / free
- [ ] Add a shadow player and their booking in one action, ≤10 s
- [ ] Attendance → settle, with no `reserved` booking surviving
- [ ] The link shared into WhatsApp renders the preview card
- [ ] The `.ics` opens in the phone's calendar
- [ ] The whole admin lifecycle inside 5 minutes of admin time
- [ ] The app installs to the home screen with the right icon and splash
- [ ] EN / CZ / RU all read correctly on the phone, and payments stay Czech

---

## 5. Then, and only then

- Retire the WhatsApp booking thread (keep the group; it is the community).
- Watch `/admin/stats` for the first week: magic-link drop-off is the number
  that tells you whether login is working for people who are not you.

---

## If something goes wrong

- **Nobody can log in.** Check SMTP first (step 2), then the redirect
  allow-list — a mismatch there fails silently. The six-digit code path is the
  fallback that works when the link does not.
- **Emails are not arriving.** Check Resend's dashboard for the domain status
  before anything else, and remember that `EMAIL_DRY_RUN` unset means silence.
- **The panel is slower than WhatsApp.** That is a product failure, not a
  performance one. Note where the time went and fix the flow.
