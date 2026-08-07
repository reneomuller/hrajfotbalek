# Phase 22 — cutover checklist (human-executed)

**Contract:** `letco-prompt-hrajsport-phase2-v1.md` §9, §9.1
**Precondition:** Phase 21 merged. Everything below is a dashboard action or a
verification; none of it is a coding session.

The order is load-bearing in two places, marked **ORDER**. Everything else can
be done as convenient.

---

## 0. Before anything

- [ ] **Vercel Pro is active.** Required by §10 for G3, and step 8 cannot be
      done without it — the Hobby plan permits daily cron only.
- [ ] Phase 21 (`feat/phase-21-football-rewrites`) is merged to `main` and
      deployed. Safe to merge ahead of the cutover: the `/` → `/football`
      redirect is keyed on a host that does not resolve yet, so it ships inert.
      `/football/*` starts resolving on the current origin the moment it lands,
      which is intended — it is an alias, and nothing links to it.

## 1. Domain

- [ ] `hrajsport.cz` DNS points at Vercel.
- [ ] `hrajsport.cz` **and** `www.hrajsport.cz` attached to the project. Both,
      because the redirect matches the host exactly and `www` is a separate rule.
- [ ] The old `*.vercel.app` origin is kept attached and set to **301-redirect**
      to the new one (REQ-CUT-003). Do not detach it — every link this product
      has ever shared points at it.

## 2. Supabase — **ORDER: this comes BEFORE step 3**

Doing this after the env var flip breaks every login, and it breaks it
*silently*: an `emailRedirectTo` that is not allow-listed does not error, it
redirects to the project Site URL, where nothing exchanges the credential. The
player ends up authenticated at the auth server holding no session cookie. This
is the Phase 1 lesson that cost the most.

- [ ] Redirect allow-list carries **both** origins — the new one added, the old
      one left in place for the transition (REQ-CUT-005).
- [ ] `https://hrajsport.cz/auth/callback` and `https://www.hrajsport.cz/auth/callback`
      both listed.
- [ ] Site URL updated to `https://hrajsport.cz`.

## 3. The env var — **ORDER: after step 2, and it needs a REDEPLOY**

- [ ] `NEXT_PUBLIC_SITE_URL` = `https://hrajsport.cz` (no trailing slash — the
      code strips one, but only one).
- [ ] **Redeploy after changing it.** `NEXT_PUBLIC_*` values are inlined at
      build time, not read at runtime, so the change does nothing until a build
      picks it up. A cutover that skips this looks like the env var "not
      working" and sends everyone hunting in the wrong place.

## 4. Verify the routing (TEST-228)

- [ ] `https://hrajsport.cz/` redirects to `/football`.
- [ ] `https://www.hrajsport.cz/` redirects to `/football`.
- [ ] The wordmark on `/football` still reads **HRAJ FOTBAL** (REQ-CUT-006).
- [ ] `/football/games`, `/football/pass`, `/football/game/<a real id>` all render.
- [ ] The unprefixed paths still render on the new origin too — `/games`,
      `/game/<id>`. They are canonical; `/football/*` is the alias.

## 5. Verify the old links (TEST-229)

- [ ] A previously shared game link on the old `*.vercel.app` origin resolves —
      301 to the same game on the new origin, not to the root.

## 6. Verify auth on the new origin (TEST-230)

Both paths, because they fail differently and only one of them is the common one.

- [ ] Password sign-in works.
- [ ] The six-digit code path (`/login` → "no password yet") completes.
- [ ] A magic link, opened **from a mail app on a phone**, lands signed in. This
      is the one that catches an allow-list miss, and the embedded-browser
      cookie-jar problem lives here too — see `CLAUDE.md`.
- [ ] Change-email double confirmation still round-trips.

## 7. Verify the origin-derived surfaces on production (REQ-CUT-004)

All four already derive from `NEXT_PUBLIC_SITE_URL` in code and are asserted in
`e2e/cutover.spec.ts`; this is confirming the deployed value, not the wiring.

- [ ] A shared game link in WhatsApp unfurls with an image (OG `metadataBase`).
- [ ] The share-to-WhatsApp button produces a `hrajsport.cz` URL.
- [ ] A downloaded `.ics` opens and its URL field is `hrajsport.cz`.
- [ ] A booking email's links point at `hrajsport.cz`.

## 8. Cron — **the sequence in §9.1 is the whole point**

`vercel.json` currently runs the three sweeps **once a day** (Hobby-plan
constraint). Restoring the §7 cadences is a code change; I can make it in a
session once Pro is active.

- [ ] `vercel.json` restored to expiry every 15 min, nudge and reminder every 30
      (REQ-CUT-007). Currently `0 5 * * *`, `10 5 * * *`, `0 15 * * *`, plus
      pass-expiry at `20 5 * * *`.
- [ ] Deployed.
- [ ] **A real native execution verified** — a fired run in the Vercel log with
      its matching `booking_expired` / `nudge_sent` / `reminder_sent` rows in the
      database. A schedule that has merely been accepted is not evidence
      (REQ-CUT-008).
- [ ] **Only then**, disable the cron-job.org jobs. Both running together is
      harmless — all three routes are idempotent, proven at the M3 gate — so
      there is no cost to overlapping and a real cost to retiring early.
- [ ] `LAUNCH.md` records the external scheduler as **historical rather than
      deleted**: the Hobby-plan constraint returns the day the plan does.

## 9. Close the gate

- [ ] G3 walked per contract §10: the full checklist on a phone at
      `hrajsport.cz/football`.
- [ ] `EXECUTION_PLAN_PHASE2.md` Phase 22 and GATE G3 rows updated.

---

## Known-open, not blocking

- **`/football/*` is an alias, not a namespace.** Internal links stay
  unprefixed, so a player entering at `/football` leaves it on their first tap.
  Deliberate for Phase 21 and recorded in the commit. It becomes a real decision
  when a second sport exists, not before.
- **Privacy policy copy** is still owed (deferred by ruling to the public-launch
  checklist, G3).
- **`/game/<missing id>` returns 200, not 404**, on both path shapes. Pre-dates
  this phase; noted because a cutover is when someone first looks at status codes.
