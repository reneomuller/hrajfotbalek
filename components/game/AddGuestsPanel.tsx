"use client";

import { useActionState, useState } from "react";
import { useStrings } from "@/components/LocaleProvider";
import { formatCzk } from "@/lib/format";
import { addGuestsAction } from "@/app/game/[id]/add-guests/actions";
import { ADD_GUESTS_INITIAL } from "@/lib/booking/addGuests";

/**
 * ADD GUESTS TO A SPOT YOU HAVE ALREADY PAID FOR (round 27, item 2).
 *
 * WHO SEES IT: exactly one person per game — the holder of a paid booking on
 * it, while seats remain. Everybody else gets nothing in this slot, not an
 * empty state and not a disabled control. The page has enough on it, and a
 * panel that says "you cannot do this" to the ninety percent who were never
 * offered it is noise.
 *
 * THE DECISION IS THE SERVER'S. `canAdd` comes from `can_add_guests()`, which
 * bounds the picker; the same function runs again inside both writers under
 * the game's advisory lock, and that second answer is the one that counts.
 * This is the same split as the booking form's party control and for the same
 * reason: a number read to draw a control is a snapshot, and a snapshot must
 * never be the enforcement.
 *
 * THE SURFACE LANGUAGE IS ITS NEIGHBOURS'. `rounded-card bg-surface p-5` with
 * a `text-[17px]` uppercase heading is `PlayersList` above it; the volt pills
 * are the claim bar's. Nothing here invents a treatment — this panel sits
 * between two established ones and has to read as the same page.
 */
export function AddGuestsPanel({
  gameId,
  bookingId,
  canAdd,
  priceCzk,
  creditCzk,
  embeddedCheckout,
}: {
  gameId: string;
  bookingId: string;
  /** How many further guests fit, from `can_add_guests()`. Always ≥ 1 here. */
  canAdd: number;
  /** Per-seat price, for the guest-only total. */
  priceCzk: number;
  /** Wallet balance, read server-side from the ledger. */
  creditCzk: number;
  /** Whether the online rail is live; the link rail cannot do this. */
  embeddedCheckout: boolean;
}) {
  const t = useStrings();
  const [state, formAction] = useActionState(addGuestsAction, ADD_GUESTS_INITIAL);
  const [picked, setPicked] = useState(1);

  const options = Array.from({ length: canAdd }, (_, i) => i + 1);
  const cost = priceCzk * picked;
  const affordable = creditCzk >= cost;

  const guestLabel =
    picked === 1
      ? t.games.addGuests.guestOne
      : t.games.addGuests.guestMany.replace("{n}", String(picked));

  return (
    <section
      data-testid="add-guests"
      className="mt-4 rounded-card bg-surface p-5"
    >
      <h2 className="m-0 text-[17px] font-bold uppercase tracking-wide text-white">
        {t.games.addGuests.title}
      </h2>
      <p className="mt-2 mb-0 text-body leading-relaxed text-muted">
        {t.games.addGuests.body}
      </p>

      {/*
        THE PICKER IS RADIO BEHAVIOUR DRAWN AS PILLS, and it is a real
        `radiogroup` rather than a row of divs: this is a choice among a small
        set, so a keyboard reaches it and a screen reader announces it as one
        control with N options.
      */}
      <div
        role="radiogroup"
        aria-label={t.games.addGuests.title}
        data-testid="add-guests-picker"
        className="mt-4 flex flex-wrap gap-2"
      >
        {options.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={picked === n}
            data-testid={`add-guests-pick-${n}`}
            onClick={() => setPicked(n)}
            className={
              picked === n
                ? "rounded-control border-[1.5px] border-volt bg-volt px-4 py-2 text-body font-bold text-surface"
                : "rounded-control border-[1.5px] border-hairline bg-transparent px-4 py-2 text-body font-bold text-bone"
            }
          >
            {t.games.addGuests.pick.replace("{n}", String(n))}
          </button>
        ))}
      </div>

      <p
        data-testid="add-guests-cost"
        className="mt-3 mb-0 font-display text-title uppercase leading-none text-volt"
      >
        {t.games.addGuests.cost
          .replace("{amount}", formatCzk(cost))
          .replace("{n}", guestLabel)}
      </p>

      {/*
        TWO BUTTONS, TWO RAILS, AND THE WALLET ONE IS NEVER A DEFAULT.

        The owner's rule from item 1 applies to every place money can move: the
        wallet is spent only when somebody presses the wallet button. So both
        rails are equally weighted controls and neither is pre-selected —
        submitting without choosing is not possible.
      */}
      <div className="mt-4 flex flex-col gap-2">
        <form action={formAction}>
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="guests" value={picked} />
          <input type="hidden" name="rail" value="credit" />
          <button
            type="submit"
            disabled={!affordable}
            data-testid="add-guests-credit"
            className="w-full rounded-control bg-volt px-4 py-3 text-body font-bold text-surface disabled:opacity-40"
          >
            {t.games.addGuests.payCredit}
          </button>
        </form>

        {affordable ? (
          <p className="m-0 text-small text-faint">
            {t.games.addGuests.creditAfter.replace(
              "{amount}",
              formatCzk(creditCzk - cost),
            )}
          </p>
        ) : (
          <p data-testid="add-guests-poor" className="m-0 text-small text-faint">
            {t.games.addGuests.notEnoughCredit}
          </p>
        )}

        {embeddedCheckout && (
          <form action={formAction}>
            <input type="hidden" name="gameId" value={gameId} />
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="guests" value={picked} />
            <input type="hidden" name="rail" value="online" />
            <button
              type="submit"
              data-testid="add-guests-online"
              className="w-full rounded-control border-[1.5px] border-volt bg-transparent px-4 py-3 text-body font-bold text-volt"
            >
              {t.games.addGuests.payOnline}
            </button>
          </form>
        )}
      </div>

      {state.status === "error" && (
        <p data-testid="add-guests-error" className="mt-3 mb-0 text-small text-danger">
          {state.code === "CAPACITY_FULL"
            ? t.games.addGuests.capacityFull
            : state.code === "CREDIT_NEGATIVE_BLOCKED"
              ? t.games.addGuests.notEnoughCredit
              : t.games.addGuests.failed}
        </p>
      )}
    </section>
  );
}
