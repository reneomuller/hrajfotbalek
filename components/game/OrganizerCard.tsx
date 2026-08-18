import { initials } from "@/lib/roster/initials";
import { getStrings } from "@/lib/i18n/server";

/**
 * Who is running this game, and — for the people who are actually coming — how
 * to reach them (§5.1).
 *
 * THE PHONE IS NOT DECIDED HERE. It arrives non-null only for a caller holding
 * a spot, decided inside `game_organizer_phone()` from the session. There is no
 * branch in this component that could be wrong about it, because there is
 * nothing here to branch on — which is the entire design of migration 27. The
 * note beside it says why they can see it, so the number does not read as
 * something that leaked.
 *
 * WHATSAPP AS WELL AS TEL, because the number is Czech and the conversation is
 * already in WhatsApp — that is what this product replaced. `wa.me` wants bare
 * digits with a country code and no `+`, so the displayed number and the link
 * are derived separately: the human reads the organizer's formatting, the link
 * gets what the API accepts.
 *
 * INITIALS, NOT A PHOTOGRAPH, and that is a correctness decision rather than a
 * missing feature. `game_organizer_contacts.organizer_name` is free text — it
 * is whoever the admin typed, who may not be a player row at all. Matching it
 * against `players.nickname` to find an avatar would be display-grade guessing
 * about identity, and the one it guessed wrong would be a stranger's face
 * beside a stranger's phone number.
 */
export async function OrganizerCard({
  name,
  phone,
}: {
  name: string;
  phone: string | null;
}) {
  const t = await getStrings();

  // Bare digits for wa.me. A leading `00` is the other way of writing `+`, so
  // it is stripped too; anything left that is not a digit was never dialable.
  const waNumber = phone ? phone.replace(/\D/g, "").replace(/^00/, "") : null;

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

          {phone && (
            <>
              <span aria-hidden className="text-faint">
                ·
              </span>
              <a
                href={`tel:${phone}`}
                data-testid="organizer-phone"
                className="text-body text-volt no-underline"
              >
                {phone}
              </a>
              {waNumber && (
                <>
                  <span aria-hidden className="text-faint">
                    ·
                  </span>
                  <a
                    href={`https://wa.me/${waNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="organizer-whatsapp"
                    className="inline-flex items-center gap-1 text-body text-bone no-underline transition-colors hover:text-whatsapp"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/brand/whatsapp-96.png"
                      alt=""
                      width={18}
                      height={18}
                      className="h-[18px] w-[18px] shrink-0"
                    />
                    {t.games.organizerWhatsApp}
                  </a>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {phone && (
        <p className="mt-3 text-[12px] leading-snug text-muted">
          {t.games.organizerPhoneNote}
        </p>
      )}
    </section>
  );
}
