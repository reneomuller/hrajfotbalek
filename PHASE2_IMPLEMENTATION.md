# Phase 2 — Stage 2: Requirements, implementation plan, scenarios

**Contract:** `letco-prompt-hrajsport-phase2-v1.md` v1.1.4
**Depends on:** `PHASE2_ANALYZE.md` (findings F1–F12, risks R1–R9)
**Scope:** frozen at v1.1.4.

---

# Part A — Requirements inventory

Every requirement traces to a contract section. `[G1]` / `[G2]` / `[G3]` is the
gate that verifies it.

## A.1 Auth (§3)

| ID | Requirement | Gate |
|---|---|---|
| REQ-AUTH-001 | Signed-out visitors see two distinct entries, "Log in" and "Sign up" | G1 |
| REQ-AUTH-002 | Signup collects email, nickname, password, country, skill, phone (optional), TOS, reminders opt-in — in that order | G1 |
| REQ-AUTH-003 | Account creation calls `signUp({email, password})`; the profile row is written only after a user id exists | G1 |
| REQ-AUTH-004 | Password minimum is 8 characters, enforced by the hosted project setting, not only the form | G1 |
| REQ-AUTH-005 | Nickname validation uses the existing charset rules (v2.5 §3): `^[A-Za-z0-9 _-]{1,20}$`, case-insensitive uniqueness | G1 |
| REQ-AUTH-006 | Email verification happens once, at signup; afterwards the account is password-authenticated | G1 |
| REQ-AUTH-007 | `players` gains `country`, `skill_level`, `tos_accepted_at`, `tos_version`, all nullable | G1 |
| REQ-AUTH-008 | Country is ISO 3166-1 alpha-2, selected from a scrollable flag list with type-to-jump | G1 |
| REQ-AUTH-009 | TOS acceptance is required and stamps both timestamp and version | G1 |
| REQ-AUTH-010 | `/terms` renders `content/terms.md` from the repo; a marked placeholder ships until human copy arrives; no generated legal text | G1 |
| REQ-AUTH-011 | Password is the primary login: email + password, explicit submit | G1 |
| REQ-AUTH-012 | The Phase 1 OTP path becomes "Forgot password / no password yet" and lands on a set-password step | G1 |
| REQ-AUTH-013 | Existing passwordless players are routed through OTP → set-password once, and no account is stranded | G1 |
| REQ-AUTH-014 | Sessions persist until explicit sign-out; no "remember me" control | G1 |
| REQ-AUTH-015 | Deep-link resume and shadow claim work identically from both entries, via the shared post-auth path | G1 |
| REQ-AUTH-016 | `/account` gains change-password, requiring the current password | G1 |
| REQ-AUTH-017 | `/account` gains change-email; the address changes only after **both** old and new addresses confirm | G1 |
| REQ-AUTH-018 | Three Supabase templates (Magic Link, Confirm signup, Change email) carry `{{ .Token }}` and/or `{{ .TokenHash }}` per §3.1 | G1 |

## A.2 Profile and credit (§4)

| ID | Requirement | Gate |
|---|---|---|
| REQ-PROF-001 | A dedicated storage bucket holds profile photos: public read, authenticated write of own object only | G1 |
| REQ-PROF-002 | Uploads are limited to 2 MB and jpeg/png/webp, enforced at the bucket, not only the client | G1 |
| REQ-PROF-003 | The client crops to square before upload | G1 |
| REQ-PROF-004 | The initials avatar remains the fallback everywhere a photo can be absent | G1 |
| REQ-PROF-005 | An admin can remove any player's photo; the removal emits `profile_photo_removed` | G1 |
| REQ-PROF-006 | Account anonymization deletes the storage object and clears `photo_path` (supersedes v2.5 §8) | G1 |
| REQ-PROF-007 | `/account` shows games-played count, past games (venue, date, attendance), and upcoming bookings | G1 |
| REQ-TOPUP-001 | `credit_topups` stores pending top-ups; RLS deny-by-default; owner reads own rows; no client writes | G1 |
| REQ-TOPUP-002 | Top-up VS comes from a dedicated `'27'`-prefixed sequence, never reused, never colliding with booking `'26'` | G1 |
| REQ-TOPUP-003 | Amounts: presets 150 / 300 / 450, free entry allowed, min 50, max 2000, validated in the RPC | G1 |
| REQ-TOPUP-004 | `create_topup` is owner-only, resolves identity from `auth.uid()`, emits `topup_requested` | G1 |
| REQ-TOPUP-005 | The top-up QR screen renders the standard SPD string with the top-up VS | G1 |
| REQ-TOPUP-006 | `confirm_topup` is admin-or-service-role only and mirrors `confirm_booking`'s signature | G1 |
| REQ-TOPUP-007 | The credited amount is always the received amount; a null received amount means the requested amount | G1 |
| REQ-TOPUP-008 | Confirmation writes the ledger (`reason: topup`), flips status, and emits `topup_confirmed` — one transaction | G1 |
| REQ-TOPUP-009 | Confirming an already-confirmed top-up is rejected, not doubled | G1 |
| REQ-TOPUP-010 | A receipt email (amount, new balance, VS) sends on confirmation through the existing seam | G1 |
| REQ-TOPUP-011 | `credit_reason` gains `topup` in its own migration, ahead of any migration using it | G1 |
| REQ-TOPUP-012 | Pending top-ups contribute nothing to the balance | G1 |
| REQ-TOPUP-013 | Top-up credit spends through the existing auto-apply rails, unchanged | G1 |

## A.3 Games (§5)

| ID | Requirement | Gate |
|---|---|---|
| REQ-GAME-001 | Game create/edit takes organizer name (required, defaults to the creating admin's nickname) and phone (optional) | G2 |
| REQ-GAME-002 | Organizer contact lives in `game_organizer_contacts`, deny-by-default, with **no** `anon`/`authenticated` grants | G2 |
| REQ-GAME-003 | Organizer name is publicly readable through a `SECURITY DEFINER` projection | G2 |
| REQ-GAME-004 | `game_organizer_phone(game_id)` returns the phone only to a caller with a `reserved`/`confirmed` booking on that game; null otherwise | G2 |
| REQ-GAME-005 | A SQL assertion proves `anon` cannot retrieve the phone by any route, and neither can a player without a booking | G2 |
| REQ-GAME-006 | `games.duration_minutes` is nullable; admin input is free numeric, bounded 30–180, defaulting to 60 | G2 |
| REQ-GAME-007 | Cards and detail render a time range (`TUE 28 JUL 19:30–20:30`) | G2 |
| REQ-GAME-008 | `.ics`, schema.org `endDate` and the in-progress label all read the per-game value, falling back to `policy.game.durationMinutes` | G2 |
| REQ-GAME-009 | `games.allowed_skill_levels` is a nullable enum array; all-levels games render **no badge anywhere** | G2 |
| REQ-GAME-010 | Restricted games render level badges on card and detail | G2 |
| REQ-GAME-011 | Skill restriction is display-only; booking is never blocked by it | G2 |
| REQ-GAME-012 | The venue photo panel replaces the traced-map panel, using the venue's `image_path` | G2 |
| REQ-GAME-013 | A venue with no photo renders name + "Open map" only — no empty frame | G2 |
| REQ-GAME-014 | Card and detail carry Copy link (primary) and WhatsApp (secondary); copy raises a toast | G2 |
| REQ-GAME-015 | Every `games` insert continues to populate the legacy `games.venue` NOT NULL column (F3) | G2 |
| REQ-GAME-016 | `games.subs_per_team` (nullable int, CHECK 0–20); admin input; renders beside the format when set, nothing when null (v1.1.2 §5.3a) | G2 |
| REQ-GAME-017 | Format is admin-entered and rendered verbatim; **never derived from capacity** anywhere. Capacity remains the sole booking limit (v1.1.2 §5.3a) | G2 |
| REQ-GAME-018 | `/game/[id]` is state-aware: booking holders see payment state + cancel and no claim CTA; non-holders see the claim CTA only while spots remain; server-side determination (v1.1.2 §5.6) | G2 |
| REQ-GAME-019 | The games list is compact rows, no venue photo, **well more than 3** games visible at Pixel-7 width (v1.1.4 §5.5, tightening v1.1.2) | G2 |
| REQ-PROF-008 | `game_roster_public` gains `photo_path` only; rosters render the photo with initials fallback; view + rendering ship together (v1.1.3 §4a) | G2 |
| REQ-GAME-020 | Each list row: time span, venue, format + subs, surface, price, skill badge when restricted, spots-left + fullness bar (v1.1.4 §5.5) | G2 |
| REQ-GAME-021 | Day-picker strip above the list, filtering by day with per-day counts (v1.1.4 §5.5) | G2 |
| REQ-GAME-022 | Cards and rows say "View game"; exactly one claim button, on the detail (v1.1.4 §5.6a) | G2 |
| REQ-GAME-023 | Detail carries a practical-info block: arrival, equipment, organizer, notes, duration (v1.1.4 §5.7) | G2 |
| REQ-AUTH-019 | Header: one Log in button, language dropdown right of it (EN→CZ→RU, flags), user-icon account entry when signed in (v1.1.4 §3.1a) | G2 |
| REQ-AUTH-020 | Account security controls are compact text links above the delete link (v1.1.4 §3.3) | G2 |
| REQ-PASS-001 | Game pass = discounted wallet credit with expiry, six tiers, credited value = games × 150 (v1.1.4 §4.2) | G2 |
| REQ-PASS-002 | Exact-pass-price match credits the pass VALUE with expiry; any other amount falls back to credited = received, no expiry (v1.1.4 §4.2) | G2 |
| REQ-PASS-003 | Consumption soonest-expiring-first; refunds return to the source batch with its original expiry (v1.1.4 §4.2) | G2 |
| REQ-PASS-004 | Expiry sweep writes an event; heads-up email 3 days before, on the existing cron (v1.1.4 §4.2) | G2 |
| REQ-PASS-005 | Receipt states received, credited and expires — all three (v1.1.4 §4.2) | G2 |
| REQ-UX-004 | Translucent surfaces ~20% more opaque, via the token table not the components (v1.1.2 §8) | G2 |

## A.4 Home, admin, UX (§6–§8)

| ID | Requirement | Gate |
|---|---|---|
| REQ-HOME-001 | The how-it-works strip moves above fold-two, with the equipment line beneath it | G2 |
| REQ-HOME-002 | A stats strip under the wordmark shows games-per-week (published games, trailing 7 days) and active players | G2 |
| REQ-HOME-003 | `site_settings` is a single-row table with an explicit `anon`/`authenticated` SELECT grant | G2 |
| REQ-HOME-004 | Admin writes `site_settings` through an admin-only RPC; each change emits an event | G2 |
| REQ-HOME-005 | The community section becomes three equal panels: Join · FAQ · Player of the Month | G2 |
| REQ-HOME-006 | Player of the Month renders photo + username, falling back to the initials avatar | G2 |
| REQ-HOME-007 | The six FAQ entries render exactly as specified in §6 | G2 |
| REQ-ADMIN-001 | Clicking a player in the admin list opens a detail page with photo, nickname, email, country, skill, balance, games played, per-game list, no-show count | G2 |
| REQ-ADMIN-002 | Manual no-show marking is available on player detail and on the game roster; both call `mark_attendance` | G2 |
| REQ-ADMIN-003 | Manage and Edit merge into one game-editing surface carrying add-player, roster, ✓ Paid, attendance and cancel | G2 |
| REQ-ADMIN-004 | Stats drop credits-outstanding, magic-link drop-off and waitlist depth | G2 |
| REQ-ADMIN-005 | Stats keep no-show rate and add fill rate, confirmed revenue, new vs returning, cancellations | G2 |
| REQ-ADMIN-006 | Every metric is filterable day / week / month | G2 |
| REQ-ADMIN-007 | All metrics remain queries over `events` and current tables — no new tracking machinery | G2 |
| REQ-UX-001 | One shared toast component, volt-on-black, auto-dismiss | G2 |
| REQ-UX-002 | Toasts fire for booking created, sign-in, cancellation + credit, top-up confirmed, link copied | G2 |
| REQ-UX-003 | The Playwright harness produces phone-width screenshot strips of key flows for batch review | G2 |

## A.5 Cutover, cross-cutting (§9, §1)

| ID | Requirement | Gate |
|---|---|---|
| REQ-CUT-001 | Next.js rewrites map `/football/*` onto existing routes; code does not move | G3 |
| REQ-CUT-002 | `/` on hrajsport.cz redirects to `/football` | G3 |
| REQ-CUT-003 | The old origin 301-redirects; already-shared links keep resolving | G3 |
| REQ-CUT-004 | `NEXT_PUBLIC_SITE_URL`, OG `metadataBase`, share-link builder, `.ics` URL and `emailRedirectTo` all move with the origin | G3 |
| REQ-CUT-005 | Supabase Site URL and redirect allow-list carry both origins during transition | G3 |
| REQ-CUT-006 | The wordmark inside `/football` stays HRAJ FOTBAL | G3 |
| REQ-CUT-007 | `vercel.json` returns to the §7 cadences (expiry 15 min, nudge and reminder 30 min) once Pro is active | G3 |
| REQ-CUT-008 | cron-job.org jobs are retired only after a native Vercel execution is verified with its matching event rows | G3 |
| REQ-ENV-001 | A seeded non-production database exists; `npm run seed` and `npm run test:e2e` are green against it | pre-G1 |
| REQ-ENV-002 | No session runs `reset-platform.mjs` against production, and no session flips the production `EMAIL_DRY_RUN` | all |
| REQ-SEC-001 | Every new write is an RPC: `SECURITY DEFINER`, `search_path=''`, schema-qualified, identity from the session | all |
| REQ-SEC-002 | Every new table has RLS enabled in its creating migration, with grants stated explicitly | all |
| REQ-SEC-003 | Every migration in Phase 2 is additive; any `drop` is named as a gate item | all |
| REQ-I18N-001 | Every new player-facing string ships with Czech and Russian in the same phase (F8) | G1/G2 |
| REQ-I18N-002 | FAQ, terms and privacy copy are human deliverables; no generated text substitutes for them | G2 |

---

# Part B — Implementation plan

## B.1 Migration sequence

Numbered from 21. Each is additive; each enables RLS and states grants; each has
a rollback file, per repo convention.

| # | Migration | Contents | Notes |
|---|---|---|---|
| 21 | `player_profile_columns` ✅ | `players`: `country text`, `skill_level skill_level`, `tos_accepted_at timestamptz`, `tos_version text`, `photo_path text` — all nullable. New enum `skill_level (beginner\|intermediate\|advanced)`. CHECKs: ISO-3166 shape, photo-path shape, TOS pair | No UPDATE grants (F11) |
| 22 | `credit_reason_topup` ✅ | `alter type credit_reason add value 'topup'` | **Alone in its migration** (F6). Shipped ahead of `complete_signup_v2` so Phase 1's two migrations land together; the rollback documents why there is no clean down |
| 23 | `rpc_complete_signup_v2` | New function with the full parameter list; old `complete_signup` left orphaned (F2, R4) | Orphan cleanup is a later gated migration |
| 24 | `credit_topups` | Table + `'27'` sequence + `next_topup_code()` + RLS + owner-read grant | Uses the enum from 23 |
| 25 | `rpc_topups` | `create_topup`, `confirm_topup` | Ledger + status + event in one transaction |
| 26 | `storage_profile_photos` | Bucket, size/MIME limits, `storage.objects` policies | Public read, own-object write |
| 27 | `game_details_phase2` | `games`: `duration_minutes int`, `allowed_skill_levels skill_level[]` | Nullable |
| 28 | `game_organizer_contacts` | Table, RLS, **no client grants**, `game_organizer_public` projection, `game_organizer_phone()` | R2 — assertions ship with it |
| 29 | `rpc_admin_games_phase2` | Admin game create/edit extended for organizer, duration, skill | Keeps writing legacy `games.venue` (F3) |
| 30 | `site_settings` | Single-row table, RLS, **explicit anon + authenticated SELECT**, `set_site_setting` RPC, events | R-HOME |

## B.2 RPC contracts

**`complete_signup_v2(p_nickname text, p_gdpr_consent boolean, p_marketing_opt_in boolean, p_country text, p_skill_level skill_level, p_tos_version text) returns uuid`**
Owner-derived (`auth.uid()`), rejects without a session, validates nickname charset and case-insensitive uniqueness, requires GDPR **and** TOS, stamps `tos_accepted_at = now()`, writes the player row and `account_created` in one transaction. Named errors: `NICKNAME_INVALID`, `NICKNAME_TAKEN`, `CONSENT_REQUIRED`, `TOS_REQUIRED`, `COUNTRY_INVALID`, `SKILL_REQUIRED`.

**`create_topup(p_amount_czk int) returns credit_topups`**
Owner-only. Validates 50 ≤ amount ≤ 2000. Draws `next_topup_code()`. Inserts `pending`. Emits `topup_requested`. Errors: `AMOUNT_OUT_OF_RANGE`, `INSUFFICIENT_PERMISSION`.

**`confirm_topup(p_topup_id uuid, p_confirmed_by uuid, p_received_amount_czk int default null) returns record`**
Admin-or-service-role only. Rejects unless status is `pending` (REQ-TOPUP-009). Credited amount = `coalesce(p_received_amount_czk, amount_czk)`. Writes `credit_ledger` (`reason: topup`), sets `status='confirmed'`, `confirmed_by`, `confirmed_at`, emits `topup_confirmed` — one transaction. Errors: `TOPUP_NOT_PENDING`, `INSUFFICIENT_PERMISSION`.

**`game_organizer_phone(p_game_id uuid) returns text`**
`SECURITY DEFINER`, `search_path=''`. Returns the phone only when `auth.uid()` maps to a player with a `reserved` or `confirmed` booking on that game. Returns null — never raises — for everyone else, so absence is indistinguishable from "no phone recorded".

**`set_site_setting(p_key text, p_value jsonb) returns void`**
Admin-only via `is_admin_caller()`. Emits `site_setting_changed` with key, new value and acting admin.

**`remove_profile_photo(p_player_id uuid) returns void`**
Admin-only. Clears `photo_path`, emits `profile_photo_removed`. Storage object deletion is performed by the server action holding the service-role client, because `storage.objects` is not reachable from plpgsql.

## B.3 Storage design

Bucket `profile-photos`, public read. Object key `players/<player_id>.<ext>` —
deterministic, so a re-upload replaces rather than accumulates. Policies:
`insert`/`update`/`delete` permitted only when the object's first path segment
matches the caller's player id; `select` open. Bucket-level `file_size_limit`
2 MB and an allowed-MIME list; the client crop is convenience, the bucket is
enforcement (REQ-PROF-002).

## B.4 Stats metric definitions (F7, R7)

Each metric is defined here so the UI cannot quietly invent a different one. `$from`/`$to` come from the day/week/month filter.

- **No-show rate** — `count(bookings where attendance='no_show') / count(bookings where attendance is not null)`, over games whose `starts_at` falls in range.
- **Fill rate** — `sum(active bookings at settle) / sum(capacity)` over games with `starts_at` in range. Active = `confirmed` + `reserved` at the time the game reached `played`/`settled`.
- **Confirmed revenue (CZK)** — `sum(price_czk - credit_applied_czk)` over bookings with a `payment_confirmed` event in range. Credit applied is explicitly excluded: it is not money arriving, it is a liability being discharged.
- **New vs returning** — a booking is *new* if it is the player's first `booking_created` ever; *returning* otherwise. Computed over `booking_created` events in range.
- **Cancellations** — `count(booking_cancelled events in range)`, split by whether a `credit_issued` accompanied it.

## B.5 i18n obligations (F8)

Every phase that adds a player-facing key adds its `cs` and `ru` overlay entries
in the same phase. Human-owned copy, which no session generates: `content/terms.md`,
the privacy text, the six FAQ entries in all three languages, and venue photos.

## B.6 Test strategy

- **Unit** — pure functions: country validation, amount bounds, VS formatting, duration range/fallback, stats date-window maths, toast reducer.
- **SQL suites** — one per new RPC group, `begin; … rollback;`, using the strict `count(_p::text)` probe: `complete_signup_v2`, `topups`, `organizer_contacts`, `site_settings`.
- **E2E** — gate-critical journeys only (Part C), against the seeded dev database.
- **Screenshot strips** — phone-width captures of signup, login, top-up, game detail, home, admin edit (REQ-UX-003).

---

# Part C — Gherkin scenarios

Gate-critical paths. `TEST-2xx` ids are referenced by the execution plan.

```gherkin
# ---------- G1: auth ----------
Scenario: TEST-201 New player signs up with a password
  Given I am signed out
  When I choose "Sign up"
  And I enter email, nickname, an 8-character password, country and skill level
  And I accept the terms
  Then an account is created and a verification email is sent
  When I verify from the email
  Then I hold a session, my player row carries country, skill and a TOS stamp
  And an "account_created" event exists for me

Scenario: TEST-202 Password shorter than the minimum is refused
  Given I am on the signup form
  When I enter a 7-character password
  Then the account is not created
  And the refusal comes from the auth service, not only the form

Scenario: TEST-203 Returning player logs in with a password
  Given I have a verified password account
  When I enter my email and password
  Then I am signed in without any email round trip

Scenario: TEST-204 Existing passwordless player is migrated exactly once
  Given my account predates Phase 2 and has no password
  When I request the code and enter it
  Then I am asked to set a password
  And after setting it I sign in with the password on every later visit
  And I am never asked to set one again

Scenario: TEST-205 Deep-link resume survives password signup
  Given I tap "Book" on a game while signed out
  When I complete signup with a password
  Then I land on that game's booking screen with the intent intact

Scenario: TEST-206 Shadow player claims an identity through password signup
  Given a shadow player exists with my exact email
  When I sign up with a password using that email
  Then my history is preserved and no duplicate player row is created
  And a "player_claimed" event exists

Scenario: TEST-207 Changing email requires both addresses to confirm
  Given I am signed in
  When I request an email change
  Then confirmation is sent to the old and the new address
  And my email changes only after both are confirmed

Scenario: TEST-208 Changing password requires the current one
  When I submit a new password without the current one
  Then the change is refused

# ---------- G1: profile and credit ----------
Scenario: TEST-209 Photo upload and fallback
  When I upload a 1 MB square jpeg
  Then it renders on my account and on rosters
  And a player without a photo renders the initials avatar

Scenario: TEST-210 Oversized upload is refused by the bucket
  When I upload a 3 MB image bypassing the client crop
  Then storage refuses it

Scenario: TEST-211 Admin removes a photo
  When an admin removes my photo
  Then the object is gone, my avatar falls back to initials
  And a "profile_photo_removed" event exists

Scenario: TEST-212 Anonymization deletes the photo
  When my account is anonymized
  Then my player row is retained with nulled PII
  And my photo object no longer exists in storage

Scenario: TEST-213 Top-up requested, confirmed, credited
  Given my balance is 0
  When I request a 300 CZK top-up
  Then a pending top-up exists with a '27'-prefixed VS
  And my balance is still 0
  And a "topup_requested" event exists
  When an admin confirms it with no received amount
  Then my balance is 300, the ledger row reads "topup"
  And a "topup_confirmed" event exists and a receipt email is dispatched

Scenario: TEST-214 Received amount overrides the requested amount
  Given a pending top-up of 300 CZK
  When an admin confirms it with a received amount of 250
  Then exactly 250 is credited

Scenario: TEST-215 Double confirmation is refused
  Given a confirmed top-up
  When an admin confirms it again
  Then it is rejected and the balance does not move

Scenario: TEST-216 Top-up amount bounds are enforced in the function
  When I request a top-up of 20 CZK or of 5000 CZK via the API directly
  Then both are rejected

Scenario: TEST-217 Top-up credit spends on the next booking
  Given my balance is 300 and a game costs 200
  When I book
  Then 200 is applied, my balance is 100, and the booking confirms without a QR

# ---------- G2: games ----------
Scenario: TEST-218 Organizer phone is visible only to booked players
  Given a game with an organizer phone
  Then an anonymous visitor cannot see it on the page or through the API
  And a signed-in player with no booking on that game cannot see it
  And a player holding a confirmed booking can

Scenario: TEST-219 Duration renders as a range everywhere
  Given a game of 90 minutes starting 19:30
  Then the card and detail read 19:30–21:00
  And the .ics DTEND and the schema.org endDate agree with it

Scenario: TEST-220 Null duration falls back to the policy constant
  Given a game with no duration recorded
  Then every surface renders a 60-minute range

Scenario: TEST-221 Skill badge appears only when restricted
  Given an all-levels game
  Then no level badge renders anywhere
  Given a game restricted to Advanced
  Then the badge renders on the card and the detail
  And a Beginner can still book it

Scenario: TEST-222 Venue photo panel and its fallback
  Given a venue with a photo
  Then the detail renders the photo panel, the venue name and "Open map"
  Given a venue with no photo
  Then it renders the name and "Open map" and no empty frame

Scenario: TEST-223 Copy link raises a toast
  When I tap "Copy link" on a game card
  Then the link is on the clipboard and a toast confirms it

Scenario: TEST-232 Format is what the admin typed, never what capacity implies
  Given an admin creates a game with capacity 12 and format "5v5"
  Then the card, the detail page and the panel above the map all read "5v5"
  And no surface renders "6v6"
  And booking is still limited by capacity alone

Scenario: TEST-233 The game page knows whether I am already in
  Given I hold a confirmed booking on a game
  When I open that game's page
  Then I see my payment state and a cancel action
  And "Claim your spot" does not appear
  Given I hold no booking and spots remain
  Then the claim CTA appears
  Given I hold no booking and the game is full
  Then the waitlist is offered instead

Scenario: TEST-234 The games list shows more than one game at a time
  Given at least three published games
  When I open /games at phone width
  Then at least three of them are visible without scrolling

# ---------- G2: home and admin ----------
Scenario: TEST-224 Home reads site settings anonymously
  Given I am signed out
  Then the stats strip shows games-per-week and the active-player number
  And the Player of the Month panel renders

Scenario: TEST-225 Admin edits a site setting
  When an admin changes the active-player number
  Then the home page reflects it and an event records who changed it

Scenario: TEST-226 Player detail shows history and allows no-show marking
  When an admin opens a player
  Then photo, country, skill, balance, games played and no-show count render
  When the admin marks a no-show there
  Then the booking's attendance updates and an "attendance_marked" event exists

Scenario: TEST-227 Stats reflect a known week
  Given a week with 4 games, 40 bookings, 2 no-shows and 3 cancellations
  When I view stats filtered to that week
  Then fill rate, confirmed revenue, new vs returning and cancellations match hand-computed values
  And credits-outstanding, magic-link drop-off and waitlist depth are absent

# ---------- G3: cutover ----------
Scenario: TEST-228 The new origin serves football
  Given the cutover is complete
  When I open hrajsport.cz
  Then I am redirected to /football and the wordmark reads HRAJ FOTBAL

Scenario: TEST-229 Old links keep working
  When I open a previously shared game link on the old origin
  Then it 301-redirects to the same game under the new origin

Scenario: TEST-230 Auth round-trips on the new origin
  When I request a magic link and a code on hrajsport.cz
  Then both complete and land me signed in on the new origin

Scenario: TEST-231 Native cron fires before the external jobs retire
  Given Vercel Pro is active and vercel.json carries the §7 cadences
  When the next native execution runs
  Then its event rows exist
  And only then are the cron-job.org jobs disabled
```
