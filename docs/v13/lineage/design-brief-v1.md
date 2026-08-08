# HrajFotbal — Front-End Redesign Design Brief (Figma Wireframes v1)

**Purpose:** Input for generating Figma wireframes + layouts for every screen. Design-first pass — iterate on visuals before any implementation begins.
**Scope:** UI / front-end only. Items requiring backend changes are marked `[BACKEND DELTA]` — design their UI now, but implementation is gated separately.
**Visual direction:** Keep current HrajFotbal brand feel (colors, tone). Mobile-first — primary viewport 390px; desktop is secondary.

---

## 0. Design System First (deliver before screens)

Produce a small component library page in Figma before individual screens, so every screen is assembled from shared components:

- **Tokens:** spacing scale, type scale, corner radius, brand colors, elevation/shadow
- **Nav bar** (bottom, mobile): 4 items — Home (house icon) → Games → Pass → Profile
- **Game card** (single canonical version used everywhere):
  - Info pills in fixed order: **Format** first, then **Level** (exactly one level per game, never two)
  - **Spots left** in an oval/pill
  - No "View game →" link — the entire card is the tap target
  - No surface info on cards
  - **States:** default / full (waitlist) / **past** (faded ~40–50% opacity, non-interactive)
- **Primary CTA button** (the "Find a game" style) — reused for all main conversion actions
- **Pass card** component (see §6 for content spec)
- **Info box** component (icon + label rows, used on game detail)
- Form inputs: text field, dropdown, **multi-select chips**, toggle between display/edit mode

---

## 1. Global Navigation

- Bottom nav order: **Home (house icon) → Games → Pass → Profile**
- **"My Games" removed from nav** — relocated into Profile (§5)
- Pass stays in nav

---

## 2. Homepage

### Layout order (top → bottom)
1. **Hero** — reduced ≥25% in height on mobile so the three feature cards (Find a game / Claim your spot / …) are visible above the fold
2. Three-step section
3. **Upcoming Games** (preview)
4. **"500+ active players" banner**
5. Join our community card
6. FAQ (copy unchanged for now)
7. Footer

### Final copy (use verbatim)
- Hero tagline: **"Come for the game, stay for the crew"**
- Hero subline: **"Weekly pickup football games near you. Find a game, book in seconds, show up & play!"**
- Steps:
  - **01 — Find a Game:** "Matches near you every week."
  - **02 — Book your spot:** "Claim your spot in seconds."
  - **03 — Show up and Play:** "You're in. Time to play."
- ❌ Remove "training bibs, goalie gloves and balls provided" line (lives on game detail only)

### Upcoming Games preview
- Section title: **"Upcoming Games"** (match games page naming)
- Max **3 cards** — the next 3 games platform-wide by closest kickoff; keep the "your next game" highlight for logged-in users with a booking
- Uses the canonical game card component (§0)
- **"All games →"** button moves to the **bottom** of the section, sized/styled like the primary CTA

### Community section
- Players banner sits **above** the community card; number displayed as **"500+ active players"**
- ❌ Player of the Month removed (returns in Phase 2 with rewards/leaderboard)

---

## 3. Games Page

### Calendar strip
- **Max 1 week ahead — exactly 8 date boxes.** No dates beyond that anywhere, including the All Games view
- (Admin can pre-create games further out; they surface publicly as the window rolls at midnight — no design implication beyond the hard 8-box cap)

### Game list
- Canonical game cards only (§0)
- **Past games:** once kickoff has passed, card switches to the *past* state — faded, unclickable. Design the visual distinction clearly (opacity + no shadow/press state)

---

## 4. Game Detail Page

### Final section order (top → bottom)
1. Venue photo
2. Venue name
3. **Info box:** date, time, format, level, **"Open location in Maps"** link inside this box
4. Availability (spots left)
5. Organizer — with **WhatsApp contact button** `[BACKEND DELTA: organizer WhatsApp field]`
6. Player list
7. **"Good to know / Before you come"** — merged into one section (bibs/gloves/balls info lives here)
8. Share on WhatsApp (bottom — sharing is lowest priority; booking is the goal)
9. Sticky **"Claim your spot"** bar — **opaque background**, must not collide with footer on scroll

### Removals
- ❌ Price next to the time (price stays prominent in the bottom bar only)
- ❌ "2 subs per team"
- ❌ "all welcome — this is a guide, not a rule"
- ❌ "Copy link" button (redundant; currently broken anyway)

### Level badge
- Sits **below the date**, thinner box, exactly one level per game

---

## 5. Profile Page

### Editable details block
Fields (display mode by default):
- **Display name** (as shown on player lists)
- **Preferred position** — **multi-select** chips
- **Level** — casual / intermediate / advanced
- **Nationality**
- **Phone number — mandatory** `[BACKEND DELTA: required at signup + validation]`
- **Email — read-only**; small "request email change" link at the bottom of the block (existing double-confirmation flow)

Button behavior: **"Edit details"** → switches block to edit mode → button becomes **"Save profile"**
❌ Remove the stray image text next to the profile picture

### My Games (relocated from nav)
- A **"My Games" button with dropdown/expandable list** of all games the user has joined (upcoming + past, past using the faded card state)

---

## 6. Credits & Pass Page

### Wallet
- Balance shown in **credits, not CZK** (1 game = 1 credit); visually smaller/secondary
- **"Top up credit" routes to the pass options section** — there is no separate top-up-wallet flow. Purchase a pack → credits land in wallet `[BACKEND DELTA: Stripe purchase flow — design checkout entry point + success state now, wiring is a separate phase]`

### Pass cards — content template (use verbatim structure)
> **5 games pass**
> 140 CZK / game
> Save 50 CZK
> 1 month expiration

- CTA: **"Get this pass"** (not "Buy this pass")
- ❌ Remove "you get X CZK of credit" line
- ❌ Remove "Expires 1 month after it lands" phrasing → **"1 month expiration"**
- ❌ No single-game pass

---

## 7. Admin Panel

### 7a. Venue → Pitch structure `[BACKEND DELTA: new pitch entity]`
- After venue creation, allow creating **pitches** under it (Pitch 1, 2, 3…)
- Pitch form: venue selector + pitch name only (no surface/hours — inherited from venue)
- Games display **which pitch** they're on everywhere in admin

### 7b. Game creation form
- Venue + **pitch** selectors
- Time with **minute precision** (e.g. 7:50–9:00)
- Price per player
- **Organizer dropdown** + "Add organizer" flow + "promote player → organizer" action `[BACKEND DELTA: organizer role management]`
- Create game button

### 7c. Game management view
Per game: venue name, pitch, date & time, format, organizer, player list (**"View all"** button so the list doesn't dominate the dashboard)

Three actions:
- **Edit game** (price, pitch, time)
- **Delete game** (no record — accidental creation)
- **Cancel game** (record kept; **auto-issues 1 credit to every paid player**) `[BACKEND DELTA: bulk credit issuance — may partially exist via cancellation loop]`

Player list actions:
- Manual **add/remove player**
- Remove → confirmation popup: **"Issue a credit for this user?" Yes / No** (Yes grants 1 credit)

### 7d. User management
- ‼️ Profile creation captures **email + WhatsApp/phone** `[BACKEND DELTA if not already mandatory]`
- **Phone shown next to player name** in admin lists
- **Search bar**: name / email / phone
- Actions per user: **assign credit / ban / delete account** — ban & delete require a confirmation dialog

---

## 8. Bugs (dev backlog — not design scope, listed for completeness)
1. Footer overlaps "Claim your spot" bar on scroll-hold; bar is transparent (design fix in §4, engineering fix here)
2. "Copy link" broken (moot — removed)
3. First game card: missing format / two levels shown (data or rendering bug — canonical card component prevents recurrence)

## 9. Deferred to Phase 2
- FAQ copy refinement
- Player of the Month (with rewards/leaderboard)

---

## 10. Creative Latitude — Propose What's Missing

Beyond the specified screens, you have a mandate to **identify gaps and propose additions**. This brief was written from feedback on existing screens; it likely misses screens a complete product needs. Audit every user journey end-to-end and design what's missing.

### Known candidate gaps (start here, but don't stop here)
- **Booking flow states:** confirmation screen after claiming a spot, insufficient-credits state, full-game → waitlist join flow, waitlist-spot-opened notification state
- **Cancellation (player side):** where and how does a player cancel a booking? Confirmation dialog, credit-returned confirmation
- **Empty states:** no upcoming games, empty My Games, zero credit balance, empty search results (admin)
- **First-run / onboarding:** what a brand-new user sees between signup and first booking
- **Auth screens:** login, signup, email confirmation, password reset — restyled to match the new system
- **Stripe checkout journey:** entry → payment → success / failure / abandoned states
- **Error & system pages:** 404, generic error, maintenance
- **Loading states:** skeleton screens for game lists and detail pages
- **Notifications surface:** where the user sees "your waitlist spot opened" or "game cancelled, credit issued" beyond email

### Rules for proposals
1. **Locked decisions stay locked.** Everything specified in §§1–7 (copy, removals, section orders, the 8-box calendar cap, credits-not-CZK, etc.) is decided — proposals extend the spec, they don't revise it. If you believe a locked decision is a mistake, log it as a **finding with rationale**; do not silently design around it.
2. **Label every proposal.** Proposed frames are marked **`PROPOSAL`** in Figma and grouped on a separate page/section, each with a one-line rationale ("why this screen needs to exist").
3. **Stay in front-end scope.** Proposals requiring new backend capability get the same `[BACKEND DELTA]` tag; prefer proposals that work with the existing backend contract.
4. **Conversion first.** The product's job is getting a player from landing → booked. Proposals should serve that funnel or reduce support burden (missed cancellations, confused users) — not add surface area for its own sake.

---

## Deliverables expected from this brief
1. **Figma component library page** (§0)
2. **Wireframes for every screen** in §§1–7, mobile-first, using only library components
3. **State variants** where specified: past game card, edit/save profile toggle, full game/waitlist, pass purchase success
4. **Proposal page** (§10): missing screens + improvement ideas, each labeled `PROPOSAL` with a one-line rationale; findings logged for any challenged locked decision
5. One iteration round on wireframes before high-fidelity design is produced
