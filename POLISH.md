# Polish backlog
One line per item. Move to DONE when shipped. Sessions: only touch items explicitly assigned in a mandate.

## Safe now (M1–M3 surfaces)
- [ ] (add items as you notice them)

## After M4 (needs venue/admin structure)
- [x] Games list redesign: match-card visual w/ map panel, player avatars, live counter
      (decision made: waitlist avatars are PUBLIC, mirroring the roster — a queue nobody can see
       is a queue nobody trusts. `game_waitlist_public` withholds player_id and joined_at so the
       order is readable without the timestamps that produce it.)
- [ ] Game detail: venue address line once column exists

## M5 batch (Phase 27 territory)
- [x] Three languages (EN main, CZ, RU) via strings module + switcher
      (EN is the only complete table; CZ/RU are partial overlays merged onto it,
       so a missing key renders English rather than a blank. Cookie-based, not a
       URL prefix — every game link already shared points at /game/<id> with no
       locale segment. A completeness test walks every player-facing key.
       NOT translated, each deliberately: admin, the privacy page, and email —
       email has no per-player language to read, since the locale is a cookie,
       i.e. a fact about a browser rather than a person.)
- [x] Styled 404, favicon, PWA icons
      (`app/not-found.tsx`; icons are BUILT from the theme tokens by
       `scripts/generate-icons.mjs` rather than hand-exported, so a volt change
       moves the home-screen icon with it. Manifest is install-artifacts only —
       no service worker, deliberately.)
- [x] Empty states with personality (no games, empty account)
      (one `components/EmptyState.tsx` shape: what is true, what happens next,
       one way out. The empty games list points at the WhatsApp group.)
- [x] Loading skeletons on games list
      (`app/games/loading.tsx` — server-rendered, no client JS; /games is
       force-dynamic and does five round trips, which on mobile data reads as
       broken rather than as loading.)
- [ ] Privacy page real text (HUMAN-owned — Oliver drafts)
      (the PAGE ships: `app/privacy/page.tsx` with a DRAFT banner, an outline of
       what the real policy must cover, and a live contact address. The TEXT is
       still owed — this item stays open until Oliver supplies it.)
- [x] Footer contact email
      (general contact in the footer; data-protection requests keep their own
       address, which /privacy and /account both point at.)
- [x] ends_at column vs durationMinutes constant (from M3 session note)
      (DECIDED: keep the constant, no column. Nothing but display reads an end
       time — the "in progress" label and schema.org `endDate` — so a column
       would carry no authority the constant lacks, while costing a migration,
       a required admin field, validation and a backfill. Revisit when a game of
       a different length is actually scheduled; introduce it nullable then and
       fall back to the constant. Reasoning recorded in `lib/policy.ts`.)

## DONE

## Safe now (batch 1 — ready)
- [x] Remove the live/upcoming ticker text above the wordmark entirely
- [x] Segmented player-count bar (one notch per spot, per original index.html) on the landing match card — was already conformant; extracted to `capacitySegments()` + tests so it stays that way
- [x] Cancellation-policy reassurance line on the booking screen ("Cancel anytime before kickoff for full wallet credit")
- [x] Waitlist position shown to the waitlisted user on the game page ("You're #2 in line")
- [x] Post-login destination: DECIDED — stays /games; wordmark links to landing

## After M4 (games-list redesign session)
- [x] Calendar-ish match cards: original-html visual, avatars on roster+cards, segmented bars
- [x] Urgency states: Open → "3 spots left" (volt) → Full + waitlist; waitlist avatars/nicknames PUBLIC (like the roster), own position highlighted for the logged-in user
      (threshold is proportional — a quarter of capacity, floor 1, cap 3 — in `lib/games/urgency.ts`;
       the public queue is `game_waitlist_public`, migration 20: nickname + position, never player_id or joined_at)
- [x] "I'm waitlisted" badge on list cards for the logged-in user
- [x] "Your next game" strip at top of /games for logged-in users
- [x] Share-to-WhatsApp button on game card + page
- [x] Per-game format + surface ("6v6 turf") — columns + admin input in the M4 migration; render on cards/detail/above map
- [x] Game notes field (organizer logistics) — column + admin input + render on detail
      (column and admin input shipped with the M4 migrations; the detail render was already live)

## M5 batch (additions)
- [x] schema.org Event markup on game pages
      (`lib/games/schemaOrg.ts` — a pure builder with tests, because structured
       data fails silently: a bad `offers` block is simply ignored, so the
       assertions are the only feedback loop. Price is CZK unconditionally.)

## New backlog (post-launch)
- [ ] `players.locale` column, captured at signup — the prerequisite for
      translating transactional email. Until it exists, translating off the
      cookie would send Czech to a Russian speaker whenever a cron job rather
      than a request does the sending.
- [ ] Game detail: venue address line once the column exists (carried over)

## Noticed during Phase 2 planning (2026-07-28) — deliberately NOT in the plan
Scope was frozen at contract v1.1.1, so these are recorded rather than built.
- [ ] **No Node version pin.** No `engines` field, no `.nvmrc`, no
      `.node-version`. Repo scripts rely on `--env-file` and TS type-stripping,
      both of which are Node-major-sensitive, and nothing stops a new machine
      running something else. Pinned versions currently live only in
      `PHASE2_ENVIRONMENT.md` §2.
- [ ] **`complete_signup` is orphaned by Phase 2.** Postgres cannot
      `create or replace` a function into a different parameter list, and
      dropping one is a destructive migration that Phase 2 §1 forbids without a
      named gate sign-off — so `complete_signup_v2` ships alongside it and the
      original is left unused. Dropping it wants its own gated migration.
- [ ] **`npm run db:types` destroys `lib/types/database.ts`.** That file is
      hand-authored, not generated: it carries `BookingResult`, `CancelResult`,
      `ConfirmResult`, `ClientPaymentMethod`, `GameSurface`, the curated
      `EventType` catalog and explanatory comments, and it types optional RPC
      arguments as `| null` where the generator emits `?:`. Running the script
      (now possible, since Docker exists) overwrote all of it and broke six
      call sites; the file had to be restored from a backup and patched by
      hand. Either delete the script, or make it append the hand-written block
      and reconcile the nullability — but do not leave a one-word command that
      silently deletes a maintained file. The file's own header still says
      generation is impossible because Docker is missing, which is no longer
      true.
- [ ] **`games.venue` (text, NOT NULL) still exists beside `venue_id`.**
      Migration 15 added the `venues` table and never removed the original
      column, so every game insert still has to populate a value nothing reads.
      Removing it is destructive and therefore gated.

## Deferred decisions
- Waitlist mechanics: notify-all FCFS stays for launch; ordered-priority revisited post-launch with real data (policy v2 candidate)
- [x] Fix shared probe() SQL test helper: false pass on non-volatile functions (planner prunes unread call) — use value-consuming pattern from waitlist_position.sql suite
      (`count(_p::text)`, not `count(*)`, in all 10 suites that define probe().
       Wrapping the cast in a subquery is NOT enough — pruning just moves up a
       level; verified against `public.waitlist_position` as anon, where
       count(*) reports rows:1 and count(_p::text) reports denied. All 16
       suites still ALL PASS under the strict probe, so nothing was resting on
       a false pass.)
- [x] M5: reset-platform script (service-role, wipes games/bookings/waitlist/ledger/events, preserves players+admin flags, --confirm required) — build and run at launch-eve
      (built as `scripts/reset-platform.mjs` and NOT run — running it is a
       human step in the launch sequence.)
