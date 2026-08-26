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
| `games.infoWhen` / `infoWhere` / `infoFormat` / `infoLevel` | When / Where / Format / Level | **Round 14.** Field labels on the game-detail fact list, at 10px uppercase with letter-spacing. One word each, and both drafts are one word — but CS `Úroveň` and RU `Уровень` are the longest of the four in their language and sit against a value on the same line |
| `pass.batchesExpiring` / `batchesNever` | {credits} remaining · expires {date} | **Round 14.** `{credits}` arrives already pluralised by `lib/pass/credits.ts` (CLDR, three forms in both languages), so the surrounding words must agree with a phrase rather than a number — which is why the CS draft leads with `Zbývá` instead of trailing the count |
| `pass.paymentsSoon` | Payments launching shortly. | **Round 14.** Sits under a green Purchase pill that LOOKS live, so the sentence is the only thing telling a player it is not. It must not read as an error |

| `payment.confirming*` / `slow*` / `returnUnknown*` (9 keys) | Confirming your payment… | **Round 15.** The highest-stakes copy in the product and the reason is not length: this screen must never say the payment succeeded before the webhook does, and never imply it failed. Every line describes OUR state, not the money's. **`slowBookingBody` and `slowPassBody` both end on "you do not need to pay again"** — that clause is the whole point of the sentence and must survive translation as an instruction, not as reassurance |
| `pass.creditsAdded*` (3 keys) | Credits added successfully | **Round 15.** `{credits}` in `creditsAddedCount` is a PHRASE, not a number — it arrives from `creditsLabel` already carrying its own noun form ("1 kredit" / "3 kredity" / "12 kreditů"). A translator who makes the sentence agree with a number will get Russian 11 and 21 wrong, and it will read as fluent to anyone checking in English |

| `games.waitlistLeave` / `waitlistLeftDone` | Leave the waitlist | **Round 16.** The first control this product has for getting OFF a list. The Czech and Russian both need the perfective — "I have left", a completed act — because the sentence appears after the fact, not as a promise |
| `account.waitlistTitle` | Waitlist | **Round 16.** A section heading between "Upcoming" and "Already played" |
| `notifications.clearAll` | Clear all | **Round 16.** It empties the bell for this player only, and neither draft should imply the notifications were deleted for everybody |
| `account.cropTitle` / `cropHint` / `cropZoom` / `cropSave` | Position your photo | **Round 16.** The hint is the only instruction in the product that describes a GESTURE — "drag to move it, and zoom" — and both drafts should read as something you do with a thumb rather than with a mouse |
| `errors.reasonRequired` | Write a reason — every booked player is about to read it. | **Round 16.** Admin-only in practice, but it lives in `errors` because that table is keyed by CODE. The clause that matters is the second one: it is what makes an organizer write a sentence rather than a word |
| `games.infoDuration` | Duration | **Round 16.** One word, in the game-detail fact list beside When / Where / Format / Level |

**Nothing in the cancellation copy changed for policy v3** (round 16, item 6),
in any language, and that is worth knowing before the review: every sentence
interpolates `{hours}` from the policy, so the 10 → 8 move carried itself. If a
reviewer sees a number spelled out anywhere in these three files, it is a bug.

| `faq.items[0].a` / `faq.items[3].a` | …goalkeepers rotate, so nobody needs their own / Goalkeepers and subs rotate, so everyone gets a proper game | **Round 17.** Two lines rehomed from the game detail's retired card. Each half went where a reader would ask for it — the keeper rotation answers "do I need gloves", the pair answers "will I actually play". Both drafts should read as a fact about how the game runs, not as a promise about how much anyone plays |

**`faq.items[3]` had the WRONG ANSWER in every language since round 13** — the
panel substituted the cancellation window into it by index after that item was
deleted, so Czech and Russian readers saw it too. Fixed in round 17; the copy
now in the table is what a reviewer should read.

| `games.infoLanguage` / `infoSurface` | Language / Surface | **Round 18.** Two more one-word labels in the detail's fact list. `infoSurface` is new there because the surface pill left the list card |
| `games.durationShort` | {minutes} min | **Round 18.** The card's compact form. **Czech is exempted from the completeness check** because `min` IS the Czech abbreviation — identical to English by orthography rather than by omission, and Russian differs ("мин") and is translated, which is what makes the exemption a statement about Czech rather than about the key |
| `games.notesLabel` | Notes from organizer | **Round 18.** It read "Game information" — the same words as the fact card's heading two hundred pixels above — in all three languages. Both drafts should read as "what the organizer wants you to know", not as a second set of facts |
| `games.organizerTelegram` | Message on Telegram | **Round 18.** Only the verb differs from the WhatsApp label; the product's name is not a word |

**The Ukrainian/Russian pair is a GAME's language, not the reader's.** A player
reading the interface in Czech can be looking at a `uk-ru` game — the flags say
what will be spoken on the pitch, and nothing about them follows the locale.
Worth knowing before reviewing anything that mentions language this round.

**The public profile added no strings** (round 14, item 13). Its four blocks —
banner, picture, stats, badges — reuse the keys the owner's own profile already
uses, which is the point of composing it from the same three components: the
two surfaces cannot drift into two vocabularies for one thing.

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
