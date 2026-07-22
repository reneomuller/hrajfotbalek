# Polish backlog
One line per item. Move to DONE when shipped. Sessions: only touch items explicitly assigned in a mandate.

## Safe now (M1–M3 surfaces)
- [ ] (add items as you notice them)

## After M4 (needs venue/admin structure)
- [ ] Games list redesign: match-card visual w/ map panel, player avatars, live counter (decide: waitlist avatars public vs count-only)
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
- [ ] Calendar-ish match cards: original-html visual, avatars on roster+cards, segmented bars
- [ ] Urgency states: Open → "3 spots left" (volt) → Full + waitlist; waitlist avatars/nicknames PUBLIC (like the roster), own position highlighted for the logged-in user
- [ ] "I'm waitlisted" badge on list cards for the logged-in user
- [ ] "Your next game" strip at top of /games for logged-in users
- [ ] Share-to-WhatsApp button on game card + page
- [ ] Per-game format + surface ("6v6 turf") — columns + admin input in the M4 migration; render on cards/detail/above map
- [ ] Game notes field (organizer logistics) — column + admin input + render on detail

## M5 batch (additions)
- [ ] schema.org Event markup on game pages

## Deferred decisions
- Waitlist mechanics: notify-all FCFS stays for launch; ordered-priority revisited post-launch with real data (policy v2 candidate)
