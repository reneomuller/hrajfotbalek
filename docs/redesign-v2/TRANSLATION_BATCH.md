# CS/RU translation batch — awaiting native review

**Standing practice.** Player-facing copy ships in three languages in the same
commit that adds it; Czech and Russian are **drafts** until a native speaker
reviews them. This file is the queue. English is authored, not drafted, and is
not listed.

`lib/i18n/__tests__/i18n.test.ts` guarantees COVERAGE — every player-facing key
has a value in both overlays, or the suite fails. It cannot guarantee QUALITY,
which is what this file is for.

## Round 13 (2026-08-21)

| Key | EN | Why it is worth a second look |
|---|---|---|
| `landing.heroLine1` | Play football | **RESTORED** after round 12 removed it. The CS and RU values are the originals, unchanged — worth confirming they still read as a slogan rather than a label |
| `pass.howItWorksBody` | You pay via your credit card or mobile wallet… | The owner's verbatim English. CS/RU are fresh drafts and describe a payment method the product did not have last week |
| `faq.items` (all four) | — | **Rewritten.** The waitlist answer is the one to check: it must say EMAIL and must say everyone is told at once, because the race is settled by capacity. Softening either makes it a promise the code does not keep |
| `booking.bookingConfirmed` | Booking confirmed | Two words, the largest type on the confirmation screen |
| `booking.awaiting*` (6 keys) | Waiting for your payment… | Round 12's, listed again because they have still not been reviewed |
| `booking.party*` (6 keys) | Bringing anyone? … | Round 11's, still unreviewed. `partySummary` interpolates a count and a price |
| `games.guestOfPlayer` | {name}'s Guest {n} | **Neither language forms a possessive this way.** Both drafts use a dash instead, which is a choice a native speaker should confirm rather than inherit |
| `games.guestNumbered` | Guest {n} | |
| `games.gameInfoTitle` | Game information | New this round |
| `errors.passNotConfigured` | This pass is not on sale yet. | New this round |
| `siteFooter.contactTitle` | Get in touch | New this round |

## Deliberately NOT translated

These are in `INTENTIONALLY_UNTRANSLATED` and the test enforces it:

- `landing.community.telegram` / `telegramUrl` — a product's name is not a word,
  same as WhatsApp and Instagram
- `booking.partyPlus` (`+{n}`) — a quantity with a plus in front of it
- `common.czk` — money is Czech in every language (CLAUDE.md)
- Everything under `admin.` — the panel is English by ruling R22

## Emails

**English only, and it is a decision, not an omission.** There is no
`players.locale` column; the locale is a cookie, which is a fact about a
browser rather than about a person. Recorded in `SCOPE.md` §3.
