# G1 — the gate that is walked on a phone

Every line here is a thing this repository **cannot prove**. Each is either a
hosted-project setting that lives in a dashboard, or a credential path whose
only honest test is a real mailbox on a real handset.

The rule that shapes the list: **reading the dashboard is not verification.**
A saved template proves the save; it does not prove that the credential it
mints can be exchanged. Every failure mode collected here is silent — the
setting looks right, the email looks normal, and the player lands somewhere
that cannot complete the exchange.

Walked on a phone, not a desktop, and where a line says WhatsApp it means
WhatsApp: the embedded-browser case is the one that regresses, and a desktop
pass tells you nothing about it.

> Created by Phase 2. Phase 53 walks it and records the results, after the
> suites exist.

---

## 1. Password minimum — the API, not the form

- [ ] **Hosted project: password minimum is 8.**
      Authentication → Providers → Email → *Minimum password length*.
      Supabase's default is **6**, and `PASSWORD_MIN_LENGTH` in
      `lib/auth/signupProfile.ts` has always been 8 — so the form and the API
      disagreed, silently, in the direction that accepts weak passwords.
- [ ] **Verified by API, not by form.** From a terminal, not the signup page:
      ```
      curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
        -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
        -d '{"email":"…","password":"1234567"}'
      ```
      Expect `422` / `weak_password`. A `200` with an `access_token` means the
      setting did not take, whatever the dashboard shows.
      *(Verified green on the local stack at `minimum_password_length = 8`;
      the hosted project is a separate setting and a separate check.)*

## 2. Email change needs both mailboxes

- [ ] **Hosted project: `double_confirm_changes` is enabled.**
      Authentication → Providers → Email → *Secure email change*.
      With it off, only the new address confirms — so anyone holding a live
      session can move the account to a mailbox they control and the real owner
      is never told. `supabase/config.toml` already sets it `true` for the
      local stack; the hosted project is not covered by that file.

## 3. The three templates

Each is a separate line because each fails differently, and passing one tells
you nothing about the other two. Full bodies and per-template failure modes are
in `AUTH_EMAIL_TEMPLATE.md`.

- [ ] **Magic Link** — email shows a button **and** a six-digit code.
      Typing the code into the box under `/login` lands on `/games`.
      *Missing `{{ .Token }}` ⇒ the code box rejects every code.*
- [ ] **Magic Link, opened from inside WhatsApp.** Send yourself the link,
      open it in the WhatsApp in-app browser, and confirm it signs you in.
      *This is the PKCE case: `{{ .ConfirmationURL }}` instead of
      `{{ .TokenHash }}` works on your desktop and fails here.*
- [ ] **Confirm signup** — signing up with a readable address sends a confirm
      email whose button lands you **signed in**, not on `/auth/error`.
      *Missing `&type=signup` ⇒ the callback defaults to type `email`,
      `verifyOtp` refuses on a type mismatch, and the only evidence is a log
      line.*
      **Not reproducible locally**: `config.toml` has
      `enable_confirmations = false`, so the local stack returns a session
      immediately and never sends this email. The phone is its only test.
- [ ] **Change email address** — changing the address from `/account` puts a
      message in **both** mailboxes, naming the old and the new address, and
      the change takes effect only once both confirm.
      *Missing `&type=email_change` ⇒ silent no-op.*
      *Missing `{{ .Email }}`/`{{ .NewEmail }}` ⇒ the notice arriving at the
      old address cannot say what it is warning about.*

## 4. The redirect allow-list

- [ ] **`NEXT_PUBLIC_SITE_URL` and the allow-list agree exactly.**
      Authentication → URL Configuration.
      This one is worth its own line because it fails *silently*: a
      non-allow-listed `emailRedirectTo` does not error, it redirects to the
      project Site URL, and the player arrives authenticated at the auth server
      holding no session cookie. It is the cheapest thing to eliminate when
      "login randomly fails for one person", so eliminate it first.

## 5. Production and non-production are actually different

Checked by comparing values, not by remembering which file is which.

- [ ] **Supabase project ref, anon key and service-role key all differ**
      between the deployed production environment and the non-production
      stack. *(Verified distinct between `.env.local` and `.env.test.local`.)*
- [ ] **Resend**: the non-production side has **no** `RESEND_API_KEY` at all.
      Absent rather than unused — a key that is present is a key that can be
      used by accident, and its absence is the proof a dry run really was dry.
- [ ] **Site origin**: production serves `https://hrajsport.cz`.

      > **Read this before "fixing" anything.** `.env.local` carries
      > `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and `EMAIL_DRY_RUN=on`,
      > and **both are correct**. That file is not the deployed production
      > environment — it is the local-ops file that happens to hold production
      > *database* credentials, which is why `playwright.config.ts` calls it
      > "production credentials". The deployed values live in Vercel's
      > environment (`CUTOVER_CHECKLIST.md` §4). Editing `.env.local` to look
      > like production would change nothing that ships and would point local
      > ops work at a live origin while it writes to the live database.

- [ ] **`EMAIL_DRY_RUN=off` exists in exactly one place**: the Vercel
      production environment. Confirmed by checking Vercel, not by grepping
      this repository — no file here should ever contain it.
