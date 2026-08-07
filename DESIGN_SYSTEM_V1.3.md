# Design system v1.3 — the build document

**Contract:** `letco-prompt-hrajsport-phase2-v1.md` v1.3, rulings A–P
**Primary viewport:** 390 × 844 (iPhone 14 / Pixel 7 class). Desktop is secondary.
**Direction:** volt-on-black, unchanged. This round removes variety, it does not
introduce a palette.

This is the document a Figma library is built from, and the same document the
code stage implements. Values are **current** where a token survives and
**proposed** where it collapses — nothing here is invented decoration; every
change traces to a ruling.

---

# 1. Tokens

## 1.1 What is being deleted, and why it is first

`tailwind.config.ts` today carries **nine text greys, nine hairlines, six radii
and four font families**. At 390px, `#9A9A9A` and `#8A8A8A` are the same colour;
5px, 8px and 9px are the same corner. The variety is invisible individually and
overwhelming in aggregate — it is the mechanism by which each screen reads as
slightly unlike every other, and it is why the complaint is "messy" rather than
a list of screens.

**This ships as one change, before any screen** (ruling A). Every surface
inherits it without being rebuilt, and no later stage gets to re-open a grey.

## 1.2 Colour

**Accent — unchanged.**

| Token | Value | Role |
|---|---|---|
| `volt` | `#C8FF00` | The one accent. Primary CTA fill, active nav, selected day |
| `volt-dim` | `#8FB800` | Pressed / disabled volt |

**Scarcity ladder — unchanged (v1.2 C stands).** Absolute, not proportional.

| Token | Value | Applies |
|---|---|---|
| `volt` | `#C8FF00` | 11+ spots left |
| `warn` | `#FFA31A` | 10 or fewer |
| `danger` | `#FF5A4E` | 3 or fewer, and `Full` |

Appears **once per card**, on the spots figure (ruling D).

**Surfaces.**

| Token | Value | Role |
|---|---|---|
| `ink` | `#080808` | Page ground |
| `surface` | `#0F0F0F` | Cards, panels — **opaque now**, not `rgba(15,15,15,.66)` |
| `surface-raised` | `#161616` | A card on a card; the nav pill; input fills |
| `surface-avatar` | `#222222` | Avatar fallback fill |

> Translucency retires from cards. v1.1.2 §8 made the panels *more* opaque
> because the background was winning against the text; taking them to solid
> finishes that argument rather than re-tuning it a third time. Translucency
> survives in exactly one place — the scrim over a venue photo, where there is
> something behind it worth seeing.

**Text — nine tones become three.**

| Token | Value | Role | Replaces |
|---|---|---|---|
| `bone` | `#E9E7E0` | Primary — titles, values, anything a decision rests on | `bone`, `chalk` |
| `muted` | `#9A9A9A` | Secondary — supporting facts, durations, subtitles | `muted`, `muted-dim`, `subtle`, `footer-dim` |
| `faint` | `#6F6F6F` | Tertiary — eyebrows, disabled, timestamps | `faint`, `hint`, `dim` |

**Hairlines — nine become three.**

| Token | Value | Role |
|---|---|---|
| `hairline` | `rgba(255,255,255,.08)` | Divider inside a surface |
| `hairline-strong` | `rgba(255,255,255,.14)` | Secondary-button outline |
| `hairline-volt` | `rgba(200,255,0,.30)` | Selected / active outline |

Per ruling C, **no stroke on a card, chip, panel or day box.** Fill and radius
carry the surface. If a border is being drawn to separate two things, the gap
between them is too small.

**External brand — unchanged.** `whatsapp #25D366`, `instagram` gradient. Used
only for real brand marks, never as UI accents.

## 1.3 Radius — six become three

| Token | Value | Applies |
|---|---|---|
| `pill` | `999px` | Chips, spots pill, nav capsule, level badge |
| `control` | `14px` | Buttons, inputs, day boxes |
| `card` | `18px` | Cards, panels, sheets, the claim bar |

`chip 5` / `control 8` / `badge 9` / `cta 13` / `card 16` / `panel 22` retire.

## 1.4 Type

**Families — four become two, plus one reserved.**

| Family | Role |
|---|---|
| `display` (Anton) | The wordmark, and section titles only |
| `sans` (Manrope) | Everything else, including all buttons and nav labels |
| `mono` (JetBrains) | **Reserved: the variabilní symbol, nothing else.** It is copied into a banking app and must not be confusable |

Barlow Condensed leaves player-facing UI.

**Scale — seven steps.**

| Token | Size / line | Weight | Case |
|---|---|---|---|
| `hero` | `clamp(44px,10vw,88px)` / 0.92 | display | Upper (wordmark) |
| `title` | `clamp(24px,6vw,34px)` / 1.05 | display | Sentence |
| `time` | `28px` / 1.0 | sans 700 | — |
| `body-lg` | `17px` / 1.4 | sans 600 | Sentence |
| `body` | `15px` / 1.45 | sans 400–600 | Sentence |
| `small` | `13px` / 1.4 | sans 500 | Sentence |
| `eyebrow` | `11px`, `+3px` tracking | sans 600 | **UPPER** |

> `hero` drops from `clamp(58px,12.5vw,124px)`. Ruling J requires the hero lose
> ≥25% of its height so the three step cards clear the fold; the type is the
> largest part of that height.

**The uppercase rule (ruling B), stated once:** `eyebrow` is the only uppercase
style in the product. Every button, link, nav label, card title, section heading
and day label is sentence case. If a mockup shows tracked capitals anywhere
except a small grey eyebrow, it is wrong.

## 1.5 Spacing

4-point scale: **4, 8, 12, 16, 22, 32, 48**. `22` is the page gutter and stays
the outer margin on every screen. Card internal padding is `16`. Vertical gap
between cards in a list is `12`; between sections, `32`.

## 1.6 Elevation

No shadows except one: the claim bar and the nav pill cast
`0 -8px 24px rgba(0,0,0,.6)` upward, so content scrolling under them reads as
*under*. `volt-glow` retires from general use — a glow on everything is the same
problem as a border on everything.

---

# 2. Components

Build these as a library page before any screen. Every screen is assembled from
them; nothing is drawn twice.

## 2.1 Game card — canonical (ruling E)

**One component, used on the games list, the home preview, and My Games.** No
variants per surface.

```
┌────────────────────────────────────────────┐
│  20:00  60 min                       6v6   │   time = `time`/bone, duration = `small`/muted
│                                            │   format pill right-aligned
│  Praha 3 — Pražačka                        │   `body-lg`/bone
│                                            │
│  (◐)(◐)(◐)+9          3 spots left         │   avatar stack left, spots right
└────────────────────────────────────────────┘
   surface · radius card · padding 16 · no border
```

- **Whole card is the tap target.** No `View game →` (ruling E).
- **Spots figure** is `body-lg` weight 700 in its ladder colour. It is the only
  coloured text on the card.
- **Avatar stack**: up to 3 faces at 28px, −8px overlap, then `+N` in a
  `surface-avatar` circle. Replaces the deleted capacity bar (ruling D). Falls
  back to initials, which the product already does everywhere.
- **Format pill**: `pill`, `surface-raised` fill, `small`/muted. No level badge
  (ruling I).
- **No venue photo on the list.** v1.1.4 B stands; the photo is the detail's.

**States:**

| State | Change |
|---|---|
| Default | As drawn |
| Full | Spots figure → `Full` in `danger`. Card still tappable — the detail offers the waitlist |
| **Past** | Whole card at **45% opacity**, not tappable, no press state. New — the product has never drawn this |

## 2.2 Day strip (ruling H)

Exactly **8 boxes**, horizontally scrollable, today first.

```
┌──────┐  ┌──────┐
│ Fri  │  │ Sat  │      weekday `small`/muted
│  7   │  │  8   │      date `body-lg`/bone
│  1   │  │  4   │      game count `small`/faint — omitted when 0
└──────┘  └──────┘
 selected   rest
```

- `control` radius, `surface-raised` fill, **no border**.
- Selected: `volt` fill, `ink` text.
- A day with no games is drawn, greyed, and **not a link** (v1.2 A stands).
- Tapping a selected day clears the filter. An `All` affordance clears it too.
- **The strip filters; the list is never truncated by it** (ruling H).

## 2.3 Bottom nav (ruling K)

Floating pill, `surface-raised`, `pill` radius, 16px inset from the screen edge,
`env(safe-area-inset-bottom)` respected via the existing `--tabbar-h`.

Four items, in order: **Home · Games · Pass · Profile.**
Active item sits in a filled `volt` capsule with `ink` icon and label. Labels are
`small`, sentence case.

## 2.4 Claim bar (ruling G)

Fixed to the bottom, **above** the nav pill, `surface` at full opacity, `card`
radius on the top corners only, upward shadow. **It is present on every game
detail, in every state.**

| State | Left | Right |
|---|---|---|
| Open, signed in | `150 CZK` | Primary button `Claim your spot` |
| Open, signed out | `150 CZK` | Primary button `Sign in to claim` |
| Full | `150 CZK` | Secondary button `Join waitlist` |
| Holding, paid | `Paid` in volt | Text button `Cancel` |
| Holding, unpaid | `150 CZK due` in warn | Text button `Cancel` |
| Started / cancelled | `150 CZK` | `Kicked off 19:00` / `Cancelled` as `small`/faint text — **no button** |

Never transparent (the brief's bug 1), never absent.

## 2.5 Buttons

| Variant | Fill | Text | Radius | Height |
|---|---|---|---|---|
| Primary | `volt` | `ink`, `body-lg` 700 | `control` | 52 |
| Secondary | none, `hairline-strong` outline | `bone` | `control` | 52 |
| Text | none | `muted` | — | 44 min target |

Sentence case, always. One primary per screen region.

## 2.6 Info row

Icon (20px, `muted`) + label (`body`/muted) + value (`body`/bone, right).
Rows separated by `hairline`, not by gaps. Used by the detail's info card and
"Good to know".

## 2.7 Pass card (ruling N)

```
5 games pass          ← `body-lg`/bone
140 CZK per game      ← `title`-adjacent, volt
Save 50 CZK           ← `small`/muted
1 month expiration    ← `small`/faint
[ Get this pass ]     ← primary
```

No "you get X CZK of credit" line. No single-game tier (v1.2 E stands).

## 2.8 Form controls (ruling L)

Text field: `surface-raised` fill, `control` radius, no border at rest,
`hairline-volt` when focused. Label above in `small`/muted.
Multi-select chips: `pill`, `surface-raised` at rest, `volt`/`ink` when selected.
Display/edit toggle: the whole block swaps; `Edit details` → `Save profile`.

## 2.9 Empty state (ruling P)

Icon or nothing, `body-lg`/bone line, `body`/muted second line, one primary
action where an action exists. Never a bare centred sentence.

## 2.10 Skeleton (ruling P)

`surface-raised` blocks at the **exact geometry of the card they replace**, 1.2s
pulse. Note the trap this round is fixing: the deleted capacity bar looked like a
skeleton because it was a row of grey segments inside a real card. Skeletons must
never appear inside a populated card.

---

# 3. Screens

Mobile-first frames, 390px. `PROPOSAL` marks a frame the brief did not specify.

| # | Screen | States to draw |
|---|---|---|
| 1 | Home | Signed out, signed in with a booking |
| 2 | Games list | Default, day-filtered, `PROPOSAL` empty, `PROPOSAL` loading |
| 3 | Game detail | Open, full, holding a spot, started, `PROPOSAL` loading |
| 4 | `PROPOSAL` Claim confirmation | Success, insufficient balance |
| 5 | `PROPOSAL` Cancel booking | Confirm dialog, refunded-in-kind result (ruling O) |
| 6 | Pass / credits | Tiers, wallet with balance, `PROPOSAL` zero balance |
| 7 | Profile | Display mode, edit mode, My Games expanded |
| 8 | `PROPOSAL` Waitlist | Join confirmation, spot-opened state |
| 9 | Auth | Sign in, sign up, `PROPOSAL` restyled to the new system |
| 10 | `PROPOSAL` 404 / error | |

**Home order (ruling J):** hero (≥25% shorter) → three steps → Upcoming Games
(3 canonical cards + `All games →` primary button at the section's **bottom**) →
active-players banner → community card → FAQ → footer. No Player of the Month.
No equipment line.

**Game detail order (ruling G, M):** venue photo → venue name → info card (date,
time, format, level, `Open location in Maps`) → availability → organizer (with
locked state) → player list → `Good to know` → share on WhatsApp → claim bar.
No price in the info card. No `Copy link`. No "2 subs per team".

---

# 4. Copy — EN / CS / RU

New and changed strings only. These go into `lib/strings.ts` and the `lib/i18n/`
overlays **in the same commit as the English**, or `npm run test:unit` fails.

> **Money words are not translated.** Currency and payment terms follow the
> existing convention in `lib/strings.ts` in every language — a player is about
> to open a Czech banking app, and a translated `variabilní symbol` is a payment
> that arrives unmatched.

| Key | EN | CS | RU |
|---|---|---|---|
| home.heroTagline | Come for the game, stay for the crew | Přijď si zahrát, zůstaň kvůli partě | Приходи за игрой, оставайся ради компании |
| home.heroSubline | Weekly pickup football games near you. Find a game, book in seconds, show up & play! | Fotbal každý týden ve tvém okolí. Najdi zápas, rezervuj místo za pár vteřin, přijď a hraj! | Футбол каждую неделю рядом с тобой. Найди игру, забронируй место за секунды, приходи и играй! |
| home.step1Title | Find a game | Najdi zápas | Найди игру |
| home.step1Body | Matches near you every week. | Zápasy ve tvém okolí každý týden. | Матчи рядом с тобой каждую неделю. |
| home.step2Title | Book your spot | Rezervuj místo | Забронируй место |
| home.step2Body | Claim your spot in seconds. | Zabereš si místo za pár vteřin. | Займи место за считаные секунды. |
| home.step3Title | Show up and play | Přijď a hraj | Приходи и играй |
| home.step3Body | You're in. Time to play. | Jsi v sestavě. Jde se hrát. | Ты в составе. Пора играть. |
| home.upcomingGames | Upcoming games | Nadcházející zápasy | Ближайшие игры |
| home.allGames | All games | Všechny zápasy | Все игры |
| nav.home | Home | Domů | Главная |
| nav.games | Games | Zápasy | Игры |
| nav.pass | Pass | Permanentka | Абонемент |
| nav.profile | Profile | Profil | Профиль |
| games.spotsLeft | {n} spots left | Zbývá {n} míst | Осталось мест: {n} |
| games.full | Full | Obsazeno | Мест нет |
| games.past | Finished | Odehráno | Завершено |
| games.emptyTitle | No games scheduled | Žádné naplánované zápasy | Игр пока нет |
| games.emptyBody | New games go up every week. | Nové zápasy přibývají každý týden. | Новые игры появляются каждую неделю. |
| game.claimSpot | Claim your spot | Rezervovat místo | Забронировать место |
| game.signInToClaim | Sign in to claim | Přihlas se a rezervuj | Войди, чтобы забронировать |
| game.joinWaitlist | Join waitlist | Zapsat se na čekačku | Записаться в лист ожидания |
| game.paid | Paid | Zaplaceno | Оплачено |
| game.amountDue | {amount} due | K úhradě {amount} | К оплате {amount} |
| game.kickedOffAt | Kicked off {time} | Začalo v {time} | Начало в {time} |
| game.goodToKnow | Good to know | Dobré vědět | Полезно знать |
| game.organizerLocked | Contact unlocks when you book | Kontakt se odemkne po rezervaci | Контакт откроется после брони |
| pass.tierTitle | {n} games pass | Permanentka na {n} zápasů | Абонемент на {n} игр |
| pass.perGame | {amount} per game | {amount} za zápas | {amount} за игру |
| pass.saves | Save {amount} | Ušetříš {amount} | Экономия {amount} |
| pass.expiration | 1 month expiration | Platnost 1 měsíc | Срок действия 1 месяц |
| pass.getThisPass | Get this pass | Získat permanentku | Получить абонемент |
| wallet.credits | {n} credits | {n} kreditů | {n} кредитов |
| wallet.creditsOne | 1 credit | 1 kredit | 1 кредит |
| wallet.topUp | Top up credit | Dobít kredit | Пополнить кредит |
| wallet.empty | No credit yet | Zatím žádný kredit | Кредитов пока нет |
| profile.myGames | My games | Moje zápasy | Мои игры |
| profile.editDetails | Edit details | Upravit údaje | Изменить данные |
| profile.saveProfile | Save profile | Uložit profil | Сохранить профиль |
| profile.displayName | Display name | Zobrazované jméno | Отображаемое имя |
| profile.position | Preferred position | Preferovaný post | Предпочитаемая позиция |
| profile.nationality | Nationality | Národnost | Гражданство |
| profile.requestEmailChange | Request email change | Požádat o změnu e-mailu | Запросить смену e-mail |
| profile.noGames | You haven't joined a game yet | Zatím ses nepřihlásil na žádný zápas | Ты ещё не записался ни на одну игру |
| booking.cancelTitle | Cancel your spot? | Zrušit rezervaci? | Отменить бронь? |
| booking.refundCredit | Your credit goes back to your wallet. | Kredit se ti vrátí do peněženky. | Кредит вернётся в кошелёк. |
| booking.refundCash | We'll refund what you paid. | Vrátíme ti, co jsi zaplatil. | Мы вернём то, что ты заплатил. |

Czech uses informal *ty* throughout, matching the existing copy. Russian
follows it — the register is a pickup football game, not a bank.

`games.spotsLeft` needs Czech and Russian plural forms (`1 místo` / `2–4 místa` /
`5+ míst`; `1 место` / `2–4 места` / `5+ мест`). The current string table is
flat; this is the one string in the set that needs a plural helper, and it is
called out so it is not discovered at implementation time.

---

# 5. Build stages

| Stage | Contents | Verifiable by |
|---|---|---|
| **0** | Tokens and primitives only. No screen changes. | Strips — every existing screen inherits |
| **1** | Canonical game card, games list, 8-box strip, list empty + loading | TEST-2xx + strips |
| **2** | Game detail rebuild, five-state claim bar, organizer locked state | E2E per state |
| **3** | Nav: Home in, My Games into Profile, profile display/edit | E2E |
| **4** | Pass + wallet in credits, repricing to 150 | SQL + E2E |
| **5** | Home reorder + all copy, CS/RU | Unit (i18n walk) + strips |
| **6** | Claim confirmation, cancel + refund-in-kind, remaining empty states | E2E |

Stage 0 first, always. It is the stage that answers the actual complaint.
