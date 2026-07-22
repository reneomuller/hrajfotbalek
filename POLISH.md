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
- [ ] Three languages (EN main, CZ, RU) via strings module + switcher
- [ ] Styled 404, favicon, PWA icons
- [ ] Empty states with personality (no games, empty account)
- [ ] Loading skeletons on games list
- [ ] Privacy page real text (HUMAN-owned — Oliver drafts)
- [ ] Footer contact email
- [ ] ends_at column vs durationMinutes constant (from M3 session note)

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
- [ ] schema.org Event markup on game pages

## Deferred decisions
- Waitlist mechanics: notify-all FCFS stays for launch; ordered-priority revisited post-launch with real data (policy v2 candidate)
- [ ] Fix shared probe() SQL test helper: false pass on non-volatile functions (planner prunes unread call) — use value-consuming pattern from waitlist_position.sql suite
- [ ] M5: reset-platform script (service-role, wipes games/bookings/waitlist/ledger/events, preserves players+admin flags, --confirm required) — build and run at launch-eve
