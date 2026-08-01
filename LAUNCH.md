# Launch sequence — HUMAN steps

Everything in this file is Oliver's to run. The code side of Phase 30 is in
place (the Resend SMTP block is prepared in `supabase/config.toml`,
`.env.example` documents the production values, and the live-send path is
covered by `npm run test:unit -- -t "sendEmail live"`), but the cutover itself
is a sequence of irreversible, outward-facing actions — sending real email to
real people and wiping the database — and those are not an agent's to take.

Run the steps in order. Each one is verifiable before the next.

> **Status observed 2026-07-28.** Steps 1 and 2 appear to have been run by hand:
> the database holds zero games, bookings, waitlist rows, credit entries and
> events; no `@seed.hrajfotbal.test` auth users remain; the junk venues are
> gone; four players and three admins survive, on seven real venues. The steps
> are kept below because they are the record of what was done and the procedure
> if it must be done again — re-run the dry runs to confirm before assuming.
> **One consequence:** `npm run test:e2e` can no longer sign in against this
> database until it is reseeded (`npm run seed`). That is by design; see
> `e2e/README.md`.

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

**0.4 — Rotate the database password.** Supabase dashboard → **Project Settings
→ Database → Reset database password**. Then update `SUPABASE_DB_URL` in
`.env.local` and in the Vercel environment, in that order, and re-run
`npm run test:integration` to prove the new string works before you need it.

*Why:* the current password has been pasted into terminals, shell history and
at least one agent transcript during the build. None of that is a breach on its
own, and all of it is why a launch is the right moment to make the old string
worthless. It is also the credential that `--purge-fixtures` (step 1) needs, so
rotate before that, not after.

---

## 1. Purge the fixture accounts

The reset in step 2 keeps every player by design. That is right for people and
wrong for accounts that were never people — above all the five seeded auth users
in `scripts/fixtures.ts`, which share **a password committed to this
repository**, and one of which (`Organizer`) carries `is_admin`. Left in place,
that is a published-password admin login against production.

The purge is a flag on the same script. Run the dry run first and read the list:

```bash
npm run reset:platform -- --purge-fixtures                 # lists, deletes nothing
```

It prints four blocks. `WILL PURGE` is what goes: the seeded auth users and
their player rows, the hand-typed test shadows (`UIa2607`, `Jachym`, `B`,
`Bbab`, `Jsjejbebe`), and the junk venues (the XSS probe, `Gate Test M3`,
`Test hřiště`, the `Pražačka (draft)` duplicate). `NOT PURGED` is what matched a
name but failed a guard — a nickname that turned out to belong to a real signup
is refused, not taken. `LEFT ALONE` is fixture-shaped rows the lists do not
cover; decide those by hand. `WILL KEEP` is the count you should recognise.

**Read `LEFT ALONE` properly.** It catches rows carrying a fixture id that no
list here names — `ShadowNoEmail` is the archetype, since it has no email to
match on. Accounts like `oliverv2`, which carry neither a fixture id nor a
fixture email, are outside the purge entirely and will not be listed at all;
whether such an account is a person is not a question a script can answer, so
check the admin player list yourself.

The purge does not run on its own — the `--confirm` run in step 2 carries it.

*Verify:* the counts under `WILL KEEP` match the real people you expect, and
every admin you still want is one of them.

---

## 2. Reset the platform

Clears every game, booking, waitlist row, credit entry and event. Keeps every
player, their admin flags and the venues.

```bash
npm run reset:platform                                        # dry run
npm run reset:platform -- --purge-fixtures --confirm          # does it, with step 1
npm run reset:platform -- --confirm                           # does it, without step 1
```

Use the first `--confirm` form unless you decided against the purge in step 1.

The dry run has been executed and works. Neither `--confirm` form has been run
by an agent; per the status note above, the equivalent appears to have been done
by hand on 2026-07-28, and re-running is a no-op rather than a risk — the wipe
is unconditional and the purge matches on names that are already gone.

*Why it matters:* the credit rows in particular are liabilities the product
would honour — fixture wallet balances are money owed for games that never
happened.

*Verify:* the script compares the surviving players and venues row by row
against the ones it meant to keep — in both directions, so a row that vanished
and a row that survived when it should not are both caught — and exits non-zero
on either. It also confirms no purged auth user outlived its player row, which
would leave a working login attached to nobody. Then open `/admin/stats` —
every number should be zero or empty.

**Also check the venue list.** The reset preserves venues by design, and the
E2E suite creates one called **E2E Scratch Pitch**. `--purge-fixtures` does not
know about it — the suite creates it on demand, so it is not a fixed fixture. If
the suite has ever been pointed at this database, delete that venue by hand,
otherwise it sits in the organizer's venue picker on day one. (It was removed
from the dev database at the end of the M5 build.)

---

## 3. Switch the magic-link email to Resend

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
anything in the system. Do this before step 4, not after.

---

## 4. Turn delivery on

Set `EMAIL_DRY_RUN=off` in the production environment (Vercel → Settings →
Environment Variables) and redeploy.

**Set `EMAIL_FROM` explicitly while you are in there.** `sendEmail()` falls back
to `Hraj Fotbal <noreply@hrajfotbal.com>` when the variable is unset, which is
correct only for as long as that address stays on the verified Resend domain.
An unset variable means the sender is a default in code rather than a decision
in config, and the failure that produces — Resend rejecting the domain, or the
mail landing in spam — looks like an application bug from every angle except the
right one. Whatever you set must be on the domain that showed **verified** in
step 0.2.

*Verify:* `npm run test:unit -- -t "sendEmail live"` passes locally, then
trigger one email of each family against a real address and confirm arrival:

- booking held (QR) — book a spot
- payment confirmed — mark it paid
- cancellation credit — cancel it
- waitlist spot open — fill a capacity-1 game, queue, cancel
- nudge / reminder / expiry / pass-expiry — the four cron routes
- game cancelled — cancel a throwaway game

Note the fail-safe direction while you are here: a missing or unrecognised
`EMAIL_DRY_RUN` logs rather than sends. `EMAIL_DRY_RUN=true` means dry-run
**on**. Only `off` / `false` / `0` / `no` sends.

---

## 5. Point a real scheduler at the cron routes

**The Vercel crons run once a day.** `vercel.json` schedules expiry at 05:00,
nudge at 05:10 and reminder at 15:00 UTC, because the Hobby plan allows daily
cron only. The spec (§7) asks for every 15 / 30 / 30 minutes, and the difference
is not cosmetic: the scarcity nudge gives a player 12 hours to pay, so with a
daily sweep an expired spot can sit unreleased for up to a further 24 hours
before it reaches the waitlist — long enough that the waitlisted player has made
other plans. A booking made shortly after the daily reminder run, for a game
inside the 24-hour horizon, can have its reminder fire after kickoff.

So point an external scheduler at the same routes. **cron-job.org** is free and
enough; any scheduler that can send a header will do.

Three jobs, all `GET`, against the production domain:

| Path | Cadence | What it does |
|---|---|---|
| `/api/cron/expiry` | every 15 min | expires lapsed reservations, releases the spot, notifies the waitlist |
| `/api/cron/nudge` | every 30 min | one scarcity nudge per unpaid booking on a full game with a queue |
| `/api/cron/reminder` | every 30 min | one 24h reminder per active booking |
| `/api/cron/pass-expiry` | hourly | three-day heads-up, then expires spent-out pass batches (§4.2) |

Each job sends the shared secret as a header:

```
x-cron-secret: <CRON_SECRET>
```

The routes also accept `Authorization: Bearer <CRON_SECRET>`, which is the form
Vercel's own crons use — either is fine. Use the exact value of `CRON_SECRET`
from the Vercel environment. If `CRON_SECRET` is unset on the server, **every**
call is rejected, including Vercel's: the guard fails closed.

**Leave the Vercel crons in place as a backstop.** All four routes are
idempotent — that was proven at the M3 gate — so a daily run overlapping a
30-minute one produces no duplicate email and no duplicate event. Two schedulers
are strictly better than one here, because the failure mode of an external
scheduler is silence, and silence is what the backstop covers.

*Verify:* trigger each route by hand first —

```bash
curl -sS -H "x-cron-secret: $CRON_SECRET" https://<domain>/api/cron/expiry
```

— and confirm a 200 with a JSON summary, then a 401 without the header. After
the first scheduled firing, check `/admin/stats` or the `events` table for the
matching `booking_expired` / `nudge_sent` / `reminder_sent` rows.

---

## 6. The real game, running shadow

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

## 7. Then, and only then

- Retire the WhatsApp booking thread (keep the group; it is the community).
- Watch `/admin/stats` for the first week: magic-link drop-off is the number
  that tells you whether login is working for people who are not you.

---

## If something goes wrong

- **Nobody can log in.** Check SMTP first (step 3), then the redirect
  allow-list — a mismatch there fails silently. The six-digit code path is the
  fallback that works when the link does not.
- **Emails are not arriving.** Check Resend's dashboard for the domain status
  before anything else, and remember that `EMAIL_DRY_RUN` unset means silence.
- **Spots are not being released, or reminders are late.** The external
  scheduler (step 5) has stopped, or `CRON_SECRET` no longer matches and every
  call is 401ing. The daily Vercel crons will still be running, which is exactly
  why the symptom is "late" rather than "never".
- **The panel is slower than WhatsApp.** That is a product failure, not a
  performance one. Note where the time went and fix the flow.
