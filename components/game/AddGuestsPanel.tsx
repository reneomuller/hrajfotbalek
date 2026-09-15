"use client";

import { useActionState, useState } from "react";
import { useLocale, useStrings } from "@/components/LocaleProvider";
import { formatCzk } from "@/lib/format";
import { addGuestsAction } from "@/app/game/[id]/add-guests/actions";
import { GuestCountPicker } from "@/components/game/GuestCountPicker";
import { ADD_GUESTS_INITIAL } from "@/lib/booking/addGuests";
import { pluralise } from "@/lib/i18n/plural";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/creditPrice";

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
  const locale = useLocale();
  const [state, formAction] = useActionState(addGuestsAction, ADD_GUESTS_INITIAL);
  const [picked, setPicked] = useState(1);

  /*
   * PILLS UP TO THREE, A DROPDOWN FOR THE REST (round 33, item 3).
   *
   * NO CAPABILITY FLAG HERE, AND THAT IS NOT AN OVERSIGHT. `canAdd` IS
   * `can_add_guests()`'s answer — computed by the same function the writers
   * bound themselves by — so before the migration it is at most three and the
   * dropdown never renders, and after it, it is already whatever the database
   * will allow. The booking-time picker needs a flag because it derives its
   * ceiling from `lib/policy.ts`; this one is told.
   */
  /*
   * WHAT THE GUESTS COST IN CREDITS — ONE EACH, FLAT (round 35's ruling).
   *
   * ~~`game.price_czk × guests`, shown in credits only when it divided
   * cleanly.~~ Round 34 found the credit rail charging the game's price and
   * reported it as a ruling rather than a bug; the owner ruled that a credit
   * buys a SEAT, whatever the game charges a card. So the arithmetic is the
   * guest count, the cost is always a whole number of credits, and the
   * crowns-when-uneven fallback round 34 added is unreachable and gone.
   *
   * `cost` STAYS IN CROWNS AND IS STILL THE CARD PRICE, because the online rail
   * really does charge the game's price — that half of the ruling did not move.
   * Two rails, two numbers, and the button each sits under says which.
   */
  const creditCost = PASS_REFERENCE_PRICE_CZK * picked;

  const creditsLabel = (n: number) =>
    pluralise(
      {
        one: t.games.addGuests.creditOne,
        few: t.games.addGuests.creditFew,
        many: t.games.addGuests.creditMany,
      },
      n,
      locale,
    );

  const cost = priceCzk * picked;
  const affordable = creditCzk >= creditCost;

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
        ONE PICKER COMPONENT, TWO PANELS (round 34, item 4). This markup used to
        live here; `CancelGuestsPanel` asks the identical question in the
        opposite direction and the owner asked for the same language, so the
        pills and the overflow dropdown moved into `GuestCountPicker` rather
        than being copied.
      */}
      <GuestCountPicker
        max={canAdd}
        value={picked}
        onChange={setPicked}
        label={(n: number) => t.games.addGuests.pick.replace("{n}", String(n))}
        ariaLabel={t.games.addGuests.title}
        testId="add-guests"
      />

      {/*
        THE HEADLINE IS IN THE UNIT OF THE RAIL THE PLAYER CAN USE (round 34,
        item 2). Credits when the balance covers it, crowns when it does not and
        the online rail is what is left — because the number has to be one the
        player can check against something they hold. "300 CZK" beside a credit
        button asks them to divide by the seat price before they know whether they can
        afford it.
      */}
      <p
        data-testid="add-guests-cost"
        className="mt-3 mb-0 font-display text-title uppercase leading-none text-volt"
      >
        {affordable
          ? t.games.addGuests.costCredits
              .replace("{credits}", creditsLabel(picked))
              .replace("{n}", guestLabel)
          : t.games.addGuests.cost
              .replace("{amount}", formatCzk(cost))
              .replace("{n}", guestLabel)}
      </p>

      {/*
        TWO BUTTONS, TWO RAILS, AND THE CREDIT ONE IS NEVER A DEFAULT.

        The owner's rule from round 27 item 1 applies to every place money can
        move: credits are spent only when somebody presses the credit button. So
        both rails are equally weighted controls and neither is pre-selected —
        submitting without choosing is not possible.

        ~~"Pay from wallet".~~ IT SAYS WHAT THE BOOKING PAGE SAYS, and it says
        it by rendering the BOOKING PAGE'S OWN KEY (round 34, item 2). There is
        no `addGuests.payCredit` any more: two keys for one act is two things to
        translate and two chances to drift, and they had already drifted — one
        surface called it redeeming a credit and the other called it paying from
        a wallet, which is the database's word for where the number is kept.
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
            {t.booking.payWithCredit}
          </button>
        </form>

        {/*
          ~~"{amount} left after", between Redeem credit and Pay online.~~
          REMOVED, NOT CONVERTED (round 35, the owner's word).
          
          It was a CZK preview of a credit balance, which is the thing the
          vocabulary law now forbids outright: a credit surface reads credits or
          it says nothing. Converting it to "2 credits left after" would have
          kept a running-total line nobody asked for between two buttons — the
          balance is on the account page, and this panel's job is to say what
          the guests cost, not to do arithmetic on somebody's wallet in front of
          them.

          THE REFUSAL STAYS, because it is not a preview: it is the reason the
          button above it is disabled.
        */}
        {!affordable && (
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
