# Supabase magic-link email template — HUMAN STEP

The six-digit code path on `/login` needs the login email to actually contain a
six-digit code. Supabase's default "Magic Link" template emits only the link, so
**the code box will reject every code until this dashboard edit is made.** The
code is generated regardless; it just is not printed in the email.

This edit is Oliver's — it lives in the Supabase dashboard, not in this repo.

## Where

Supabase dashboard → **Authentication → Emails → Magic Link** → *Message body*.

## What to paste

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

## Why each piece

- **`{{ .Token }}`** is the six-digit code. This is the addition — everything
  else can stay as it is if you prefer the existing wording. Without this
  placeholder there is no code in the email and `verifyEmailOtp` has nothing to
  verify.
- **`{{ .TokenHash }}`, not `{{ .ConfirmationURL }}`.** The default template's
  `ConfirmationURL` carries a PKCE `code`, which only works in the browser that
  requested it — the cookie holding the verifier is scoped to that browser. Mail
  apps routinely open links somewhere else, and the exchange then fails with
  "code verifier not found in storage" on a link that looks perfectly normal.
  `token_hash` verifies statelessly and survives being opened anywhere.
  `app/auth/callback/route.ts` accepts both shapes.
- **`{{ .SiteURL }}`** must match the project's redirect allow-list
  (Authentication → URL Configuration). On a mismatch Supabase silently
  redirects to the project Site URL instead of erroring — the credential still
  arrives, just on a page that does not exchange it.

## Verifying it worked

1. Request a link from `/login`.
2. The email should show both a button and a six-digit code.
3. Type the code into the box that appears under the form on the same tab.
4. You land on `/games` (or on whatever you were doing before signing in).

If the code is rejected but the link works, the template edit has not taken
effect. If both fail, check the redirect allow-list first.
