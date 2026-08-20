import { initials } from "@/lib/roster/initials";
import { getStrings } from "@/lib/i18n/server";

/**
 * Who is running this game, and one way to reach them (§5.1, round 8 item 8).
 *
 * ONE CONTROL, VISIBLE TO EVERYONE. The card used to print the organizer's
 * phone number as a `tel:` link beside a WhatsApp link, both shown only to a
 * player holding a spot, with a caption explaining why they could see it.
 * That is three affordances and a paragraph where the owner's ruling asks for
 * one button.
 *
 * ~~The phone is not decided here: it arrives non-null only for a caller
 * holding a spot.~~ **REVERSED by the owner.** The organizer is reachable by
 * anyone looking at the game, including someone who has not booked and someone
 * who is not signed in — a person deciding whether to cross Prague for a
 * pickup game should be able to ask a question first. The disclosure change
 * lives in `lib/games/queries.ts`, where its cost is written down; this file
 * only stopped hiding the button.
 *
 * THE NUMBER ITSELF IS NEVER RENDERED. It is the href and nothing else. That
 * is not a privacy measure — the href is readable — it is a copy decision: a
 * raw number on the page invites a phone call, and the ruling is WhatsApp.
 *
 * THE MESSAGE IS PREFILLED WITH THE GAME. An organizer running four fixtures a
 * week gets "Hi, about Praha 7 • Letná on Thu 20 Aug" instead of "Hi", which
 * is the difference between answering and asking which game.
 *
 * INITIALS, NOT A PHOTOGRAPH, and that is a correctness decision rather than a
 * missing feature. `game_organizer_contacts.organizer_name` is free text — it
 * is whoever the admin typed, who may not be a player row at all. Matching it
 * against `players.nickname` to find an avatar would be display-grade guessing
 * about identity, and the one it guessed wrong would be a stranger's face
 * beside a stranger's contact button.
 */
export async function OrganizerCard({
  name,
  phone,
  /** For the prefilled message — "about <game> on <when>". */
  gameLabel,
}: {
  name: string;
  phone: string | null;
  gameLabel: string;
}) {
  const t = await getStrings();

  // Bare digits for wa.me. A leading `00` is the other way of writing `+`, so
  // it is stripped too; anything left that is not a digit was never dialable.
  const waNumber = phone ? phone.replace(/\D/g, "").replace(/^00/, "") : null;
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        t.games.organizerWhatsAppMessage.replace("{game}", gameLabel),
      )}`
    : null;

  return (
    <section
      data-testid="game-organizer"
      className="mt-4 rounded-card bg-surface p-5"
    >
      {/* WHITE (Section 4, item 6) — these section labels were grey. */}
      <div className="text-[10px] uppercase tracking-eyebrow text-white">
        {t.games.organizerLabel}
      </div>

      {/*
        NAME · PHONE · WHATSAPP ON ONE LINE (Section 4, item 4).

        The three were a name over a phone with the WhatsApp button floated
        opposite; they are one row of contact facts and now read as one. The
        separators are `aria-hidden` — a screen reader announcing "middot"
        between a name and a number is noise, and the elements are already
        distinct links.

        THE UNLOCK RULE IS UNTOUCHED. `phone` arrives non-null only for a
        caller holding a spot, decided inside `game_organizer_phone()` from the
        session — there is no branch here that could be wrong about it, because
        there is nothing here to branch on. A viewer without a booking sees the
        name and the role line exactly as before.
      */}
      <div className="mt-3 flex items-center gap-3">
        <span
          data-testid="organizer-avatar"
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-volt bg-surface-avatar text-[15px] font-bold text-volt"
        >
          {initials(name, t)}
        </span>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {/*
            LARGER — `body-lg`, the size of the "What's included" heading
            (item 3). "Runs this game" is gone from beneath it: the section is
            already labelled ORGANIZER, so the line restated the heading.
          */}
          <p
            data-testid="organizer-name"
            className="m-0 min-w-0 truncate text-body-lg font-semibold text-white"
          >
            {name}
          </p>

        </div>
      </div>

      {/*
        THE ONE CONTROL. Full width and beneath the name rather than squeezed
        onto its row: it is the only thing on this card anyone taps, and on a
        390px screen a name plus a button on one line makes the button the
        width of the leftover space.

        Absent when the organizer has no number recorded — a "Message on
        WhatsApp" button with no number behind it is the dead affordance the
        redesign keeps refusing to ship.
      */}
      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="organizer-whatsapp"
          className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-pill border-2 border-hairline-strong px-4 py-3 text-body font-bold text-bone no-underline transition-colors hover:border-whatsapp hover:text-whatsapp"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/whatsapp-96.png"
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 shrink-0"
          />
          {t.games.organizerWhatsApp}
        </a>
      )}
    </section>
  );
}
