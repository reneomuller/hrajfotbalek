# Supabase auth email templates — HUMAN STEPS

Three templates carry a credential into a mailbox, and all three are edited in
the Supabase dashboard rather than in this repository. None of them can be
verified by reading the dashboard: the failure they share is that a template
which renders correctly still produces a credential nothing can exchange. They
are verified on a real phone, and each is a separate line in
`docs/g1-checklist.md`.

These edits are Oliver's.

---

## The failure mode all three share

`app/auth/callback/route.ts` reads two query parameters and defaults one of
them:

```ts
const tokenHash = url.searchParams.get("token_hash");
const otpType = (url.searchParams.get("type") ?? "email") as EmailOtpType;
```

So a template that emits `token_hash` but forgets `&type=` does not fail
visibly — it verifies as type `email`, which is the magic-link type. For the
magic-link template that is correct. For the other two it is a type mismatch,
and `verifyOtp` rejects a credential that is otherwise perfectly valid. The
player sees `/auth/error`; the dashboard shows a template that looks fine.

**Every template below therefore states its own `type` explicitly.** The
default exists for the magic link and should never be relied on anywhere else.

The second shared failure is `{{ .SiteURL }}`. It must appear in the project's
redirect allow-list (Authentication → URL Configuration). On a mismatch
Supabase does **not** error: it redirects to the project Site URL instead, so
the credential arrives on a page that does not exchange it, and the player ends
up authenticated at the auth server holding no session cookie.

---

## 1. Magic Link — the login email

**Where:** Authentication → Emails → **Magic Link** → *Message body*

**Sent by:** `signInWithOtp` in `app/login/actions.ts:63`.

**Placeholders required:** `{{ .TokenHash }}` **and** `{{ .Token }}`.

```html
<h2>Sign in to Hraj Fotbal</h2>

<p>Tap the button to sign in:</p>

<p>
  <a
    href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email"
    style="display:inline-block;background:#C8FF00;color:#0A0A0A;font-weight:800;
           text-decoration:none;padding:14px 22px;border-radius:13px"
  >Sign in</a>
</p>

<p style="color:#777">
  Link not working? Some apps — WhatsApp, Instagram, a few mail clients — open
  links in their own browser, where the sign-in cannot complete. Type this code
  into the login page instead:
</p>

<p style="font-family:monospace;font-size:28px;letter-spacing:8px">{{ .Token }}</p>

<p style="color:#777">The link and the code both expire in one hour.</p>
```

**If `{{ .Token }}` is omitted:** the six-digit box on `/login` rejects every
code. The code is generated regardless — it simply is not printed in the email,
so `verifyOtp` has nothing to verify. This is the box's *only* input; there is
no other way for the player to learn the code.

**If `{{ .ConfirmationURL }}` is used instead of `{{ .TokenHash }}`:** the link
carries a PKCE `code`, which only works in the browser that requested it — the
verifier lives in a cookie scoped to that browser. Mail apps routinely open
links elsewhere, and the exchange dies with "code verifier not found in
storage" on a link that looks perfectly normal. `token_hash` verifies
statelessly and survives being opened anywhere. The callback accepts both
shapes, so this degrades rather than breaks — which is what makes it hard to
notice: it works on your desktop and fails for one person on a phone.

---

## 2. Confirm signup — the new-account email

**Where:** Authentication → Emails → **Confirm signup** → *Message body*

**Sent by:** `signUp()` in `app/signup/actions.ts:96`, which passes
`emailRedirectTo` pointing at `/auth/callback`.

**Placeholder required:** `{{ .TokenHash }}`, with `type=signup`.

```html
<h2>Confirm your email</h2>

<p>One tap and your Hraj Fotbal account is ready:</p>

<p>
  <a
    href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup"
    style="display:inline-block;background:#C8FF00;color:#0A0A0A;font-weight:800;
           text-decoration:none;padding:14px 22px;border-radius:13px"
  >Confirm email</a>
</p>

<p style="color:#777">
  Link not working? Some apps open links in their own browser, where this
  cannot complete. Type this code on the sign-in page instead:
</p>

<p style="font-family:monospace;font-size:28px;letter-spacing:8px">{{ .Token }}</p>

<p style="color:#777">The link and the code expire in one hour.</p>
```

**If `&type=signup` is omitted:** the callback defaults to `email` and
`verifyOtp` refuses the credential on a type mismatch. The new player lands on
`/auth/error` holding an unconfirmed account, and the only visible evidence is
a log line. This is the single most likely way to get this template wrong,
because the link is otherwise identical to the magic-link one.

**If `{{ .TokenHash }}` is omitted in favour of `{{ .ConfirmationURL }}`:** as
above — PKCE, same-browser-only, and a signup email is *more* likely than a
login email to be opened in a mail app's embedded browser, because it is the
player's very first interaction with the product.

**`{{ .Token }}` is optional here but included:** it costs one line and gives a
player whose link opens in the wrong browser a way through, rather than a dead
end on their first day.

> **This template is never exercised locally.** `supabase/config.toml` sets
> `enable_confirmations = false`, so on the local stack `signUp()` returns a
> session immediately and no email is sent. The hosted project has
> confirmations **on** — which is why `app/signup/actions.ts` documents
> "`signUp()` returns a user and no session, and the player goes to their
> inbox." The local stack cannot reproduce that path, so this template's only
> verification is the G1 walk on a real phone.

---

## 3. Change email address — the two-mailbox email

**Where:** Authentication → Emails → **Change email address** → *Message body*

**Sent by:** `updateUser({ email })` in `app/account/actions.ts:271`.

**Placeholder required:** `{{ .TokenHash }}`, with `type=email_change`.

```html
<h2>Confirm your new email address</h2>

<p>
  You asked to change the email on your Hraj Fotbal account from
  <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>.
</p>

<p>
  <a
    href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change"
    style="display:inline-block;background:#C8FF00;color:#0A0A0A;font-weight:800;
           text-decoration:none;padding:14px 22px;border-radius:13px"
  >Confirm the change</a>
</p>

<p style="color:#777">
  This message is sent to both addresses, and both have to confirm before the
  change takes effect. If you did not ask for this, ignore it — nothing changes
  until both are confirmed.
</p>
```

**Both mailboxes get this message.** `supabase/config.toml` sets
`double_confirm_changes = true`, and the hosted project must match
(Authentication → Providers → Email). With it on, a change needs confirmation
from the old address *and* the new one, so someone who gets hold of a live
session cannot quietly move the account to a mailbox they control — the real
owner is told and has to agree.

**If `&type=email_change` is omitted:** type mismatch, `verifyOtp` refuses, and
the change silently never completes. The player's email appears unchanged with
no error anywhere they can see.

**If `{{ .Email }}` and `{{ .NewEmail }}` are omitted:** the message is
identical in both mailboxes and says nothing about which address is which. The
one arriving at the *old* address is a security notice — it is the owner's only
chance to notice a change they did not ask for — and a security notice that
does not name the new address is not one.

---

## Verifying, on a phone

Reading the dashboard proves the template was saved, not that the credential it
mints can be exchanged. Each of these is a separate line in
`docs/g1-checklist.md` for that reason.

1. **Magic link.** Request a link from `/login`. The email shows a button *and*
   a six-digit code. Type the code into the box under the form: you land on
   `/games`. Then request a second link and open the button **from inside
   WhatsApp** — that is the embedded-browser case, and it is the one that
   regresses.
2. **Confirm signup.** Sign up with an address you can read on the phone. The
   confirm button lands you signed in, not on `/auth/error`.
3. **Change email.** Change the address from `/account`. Both mailboxes receive
   a message; the change takes effect only after both are confirmed.

If a code is rejected but the link works, the template edit has not taken
effect. If both fail, check the redirect allow-list first — it fails silently,
so it is the cheapest thing to eliminate.
