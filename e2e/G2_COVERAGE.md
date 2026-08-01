# G2 scenario coverage

Where each `TEST-2xx` from `PHASE2_IMPLEMENTATION.md` Part C is implemented,
and — where it matters — what is deliberately NOT covered by a machine.

Written at Phase 20 because the specs did not all land there: a criterion the
plan names inside a phase was verified in that phase, so this is the map rather
than the delivery.

| Scenario | Where | Notes |
|---|---|---|
| TEST-218 organizer phone, three viewers | `games.spec.ts` | Also `supabase/tests/game_organizer_contacts.sql` and `admin_games_phase2.sql`. Page **and** API asserted |
| TEST-219 duration renders everywhere | `games.spec.ts` | Page, `.ics` DTEND and schema.org `endDate` asserted to agree **with each other** |
| TEST-220 null duration falls back | `games.spec.ts` | Same three surfaces |
| TEST-221 skill badge only when restricted | `games.spec.ts` | Detail and row; plus a booking proving skill is never a gate |
| TEST-222 venue photo panel and fallback | `games.spec.ts` | Both halves. The photo half asserts `naturalWidth > 0`, so a 404 fails |
| TEST-223 copy link raises a toast | `games.spec.ts` | Clipboard permission granted, so the real path is under test, not the fallback |
| TEST-224 home reads settings anonymously | `home.spec.ts` | The signed-out read is the assertion — a missing grant returns empty, not an error |
| TEST-225 admin edits a site setting | `home.spec.ts` | Home reflects it **and** the event names the admin |
| TEST-226 player detail + no-show marking | `admin.spec.ts` | Asserts the booking row and the `attendance_marked` event, not the button |
| TEST-227 stats against a known window | `admin.spec.ts` | Deltas against a baseline read first — the day window holds whatever else the run did today |
| TEST-232 format never derived from capacity | `games.spec.ts` | Plus a separate no-format spec: a game that HAS a format hides the bug |
| TEST-233 the page knows whether you are in | `games.spec.ts` | Holder sees the booking, non-holder the claim |
| TEST-234 density at phone width | `games.spec.ts` | Counts rows **fully** inside the viewport. 6 of 6 |

## Deliberately not automated

- **Inbox-dependent paths.** `EMAIL_DRY_RUN` is forced on for the suite, so
  nothing is delivered. Receipt and heads-up mail are verified by a human at
  the gate; asserting a mock would assert the mock.
- **The three auth email templates.** Dashboard configuration, not code. A
  wrong placeholder fails silently and only a real phone shows it.
- **Venue photography.** `20-venue-photo-panel.png` uses a committed asset;
  whether the real photos read well at panel size is a human verdict.

## Strips

`screenshots/g2/`, numbered by the phase that added them so the batch reads in
build order. Gitignored — a snapshot of a moment, not a baseline to diff.
