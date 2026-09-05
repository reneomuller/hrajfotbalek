"use client";

import { useActionState, useState } from "react";
import { createBookingAction, type BookingActionState } from "@/app/game/[id]/book/actions";
import { FormError } from "@/components/form/FormError";
import { PendingButton } from "@/components/form/PendingButton";
import { describeBookingError } from "@/lib/booking/errors";
import { useLocale, useStrings } from "@/components/LocaleProvider";
import { pluralise } from "@/lib/i18n/plural";
import Link from "next/link";
import { formatCzk } from "@/lib/format";
import { policy } from "@/lib/policy";

export interface PaymentMethodChoiceProps {
  gameId: string;
  /** This game's price PER SEAT, for deciding whether the wallet covers it. */
  priceCzk: number;
  /** The player's wallet balance, read server-side from the ledger. */
  creditCzk: number;
  /**
   * Seats still free on this pitch, INCLUDING the one this player is about to
   * take. Caps the party control: `+3` is offered only when four seats remain.
   *
   * Read on the server from the same roster count the page already renders. It
   * is a snapshot and can be stale by the time Confirm is pressed — which is
   * why it only bounds the CONTROL. `create_booking` counts seats under the
   * game's advisory lock and refuses the whole party with CAPACITY_FULL, and
   * that refusal is the one that is correct.
   */
  spotsLeft: number;
}

const INITIAL: BookingActionState = { status: "idle" };

/**
 * The payment choice: ONLINE or CASH, then one Confirm.
 *
 * ROUND 7, ITEM 10 — AND IT IS RULING R3 ARRIVING. R3 retired QR from the
 * redesigned UI and said the backend rails must not be touched, because they
 * are the substrate Stripe maps onto. Both halves hold here: the player sees
 * "Online payment", and what the server books is the existing unpaid QR rail
 * with its variable symbol, untouched and simply not shown.
 *
 * ONLINE IS A PLACEHOLDER, AND IT IS AN HONEST ONE. There is no Stripe
 * integration. `NEXT_PUBLIC_STRIPE_PAYMENT_URL` is the entire activation: set
 * it and choosing this option books the spot unpaid and hands the player to
 * that URL; leave it empty and the option renders fully styled, marked "Coming
 * soon", and CANNOT BE SELECTED.
 *
 * NOTHING IS PRESELECTED, which is the other half of "never pressable with a
 * dead path behind it". The previous version defaulted to QR, so a player
 * could press Confirm without having made a choice at all. Confirm is disabled
 * until an option is chosen, and the online option cannot be the chosen one
 * while its URL is empty — so there is no arrangement of clicks that submits a
 * method with nothing behind it.
 *
 * CREDIT STILL WINS FIRST, and these options do not mention it. `credit` and
 * `seed_free` are OUTCOMES `create_booking` derives under its own locks; a
 * player with a full wallet picks either option here and gets `credit` back
 * from the RPC. Predicting that from a balance this component does not hold
 * would be predicting it from a stale number. Nothing here blocks a booking to
 * upsell, and nothing here offers a pass.
 */
export function PaymentMethodChoice({
  gameId,
  priceCzk,
  creditCzk,
  spotsLeft,
}: PaymentMethodChoiceProps) {
  const t = useStrings();
  const locale = useLocale();
  const [state, formAction] = useActionState(createBookingAction, INITIAL);

  /*
   * THE PARTY (round 11, part B).
   *
   * `guests` is EXTRA seats, so the party is `guests + 1` people and the whole
   * of it rides on one booking: one price, one payment, one cancellation.
   *
   * The ceiling is the smaller of the policy window and what is left on the
   * pitch — `spotsLeft` counts the player's own seat, so a game with three
   * free spots offers `+1` and `+2` and stops.
   */
  const [guests, setGuests] = useState(0);
  const maxGuests = Math.max(0, Math.min(policy.booking.maxPartyGuests, spotsLeft - 1));
  const seats = guests + 1;
  const partyPrice = priceCzk * seats;

  /*
   * Build-time inline, like every `NEXT_PUBLIC_*`. Read here rather than
   * passed from the server so the enabled/disabled state and the redirect
   * cannot disagree — the action reads the same variable.
   */
  /*
   * EITHER RAIL COUNTS (round 25, item 2). The option is live when there is
   * somewhere to pay — the embedded form, which needs the PUBLISHABLE key in
   * the browser, or the Payment Link. `NEXT_PUBLIC_` on both, because this is
   * a client component and a server-only variable reads as undefined here,
   * which would disable the option on a perfectly working configuration.
   *
   * THE SERVER CHECKS THE PAIR. This sees only the publishable half; the
   * booking action calls `embeddedCheckoutEnabled()`, which also requires the
   * secret. A browser with one key and a server with neither is not a state
   * anyone can reach by configuring things in order, and the action refuses it
   * anyway.
   */
  const onlineReady = Boolean(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_STRIPE_PAYMENT_URL,
  );

  /*
   * THE WALLET COVERS THIS GAME, or it does not. One boolean decides three
   * things: whether the credit option can be chosen, whether it starts
   * chosen, and whether the box carries an "Add credits" pill instead.
   *
   * WHOLE GAMES ONLY, deliberately. A wallet holding less than the price is
   * still spent — `create_booking` applies what is there and leaves the rest
   * due — but that is the PARTIAL path, and offering "Redeem credit" for it
   * would promise a settled booking and deliver an amount owing. Partial
   * credit still happens; it just is not what this option says.
   */
  /*
   * THE WALLET COVERS THE WHOLE PARTY, or the option is not offered.
   *
   * `priceCzk` became `partyPrice` in round 11 and that is the entire change
   * to this rule — but it is the rule the owner named: credits are selectable
   * only when the balance covers all `N+1` seats. Partial credit still
   * happens inside `create_booking`, exactly as it did for a single booking;
   * what this boolean decides is whether the product OFFERS "Redeem credit"
   * and promises a settled booking, which it must not do for a party it can
   * only half pay for.
   */
  const creditCovers = creditCzk >= partyPrice;

  const [choice, setChoice] = useState<"credit" | "online" | null>(
    // DEFAULT TO CREDIT WHEN IT COVERS THE GAME (item 11). A player who has
    // already paid for this game should not have to say so.
    creditCovers ? "credit" : null,
  );

  /*
   * ADDING A GUEST CAN UN-CHOOSE "REDEEM CREDIT", and it must.
   *
   * `creditCovers` is a function of the party size, so a wallet that covered
   * one seat may not cover three — and the option was already selected when
   * that happened. Left alone, the disabled radio would keep `choice` at
   * "credit", Confirm would stay live, and the booking would go through as
   * the `cash` that "credit" maps to: an unpaid party with partial credit
   * applied, which is precisely what "selectable only when the balance covers
   * the full party" forbids.
   *
   * DERIVED, NOT AN EFFECT. `useEffect` would fix it one render late — the
   * frame in between is the one where Confirm is pressable — and this is a
   * pure function of two values the render already has.
   */
  const activeChoice = choice === "credit" && !creditCovers ? null : choice;

  /*
   * THE ERROR NO LONGER REPLACES THE FORM (§2.11).
   *
   * It used to `return <BookingError/>` in place of everything, so a player
   * who lost a capacity race lost their payment choice with it and had to
   * start again from the game page. A race is the commonest failure here and
   * the least deserving of that: someone simply tapped first. The block sits
   * above the button, the form stands, and trying again is one tap.
   */
  const failure =
    state.status === "error" && state.code
      ? describeBookingError(state.code, t)
      : null;

  const optionClass = (value: "credit" | "online", disabled: boolean) =>
    [
      "flex items-start gap-3 rounded-card border-2 p-4 transition-colors",
      disabled
        ? "cursor-not-allowed border-hairline bg-surface/60 opacity-60"
        : "cursor-pointer bg-surface " +
          (activeChoice === value ? "border-volt" : "border-hairline-strong hover:border-hairline-volt"),
    ].join(" ");

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="gameId" value={gameId} />

      <input type="hidden" name="guests" value={guests} />

      {/* ---- the party ------------------------------------------------- */}
      {maxGuests > 0 && (
        <fieldset className="m-0 border-0 p-0" data-testid="party-picker">
          <legend className="mb-1 text-body-lg font-semibold text-bone">
            {t.booking.partyTitle}
          </legend>
          <p className="mb-4 mt-0 text-[13px] leading-snug text-muted">
            {t.booking.partyHint}
          </p>

          {/*
            RADIOS, NOT A STEPPER. Four options at most, and every one of them
            is one tap from every other — a stepper makes "+3" three taps and
            gives a player who overshoots no way back that is not another tap.

            `name` is absent: the party rides on the hidden input above, so
            these controls never post a second value that could disagree with
            it.
          */}
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: maxGuests + 1 }, (_, n) => (
              <label
                key={n}
                data-testid={`party-${n}`}
                className={[
                  "flex min-h-11 cursor-pointer items-center rounded-pill border-2 px-4 text-small font-bold transition-colors",
                  guests === n
                    ? "border-volt text-volt"
                    : "border-hairline-strong text-muted hover:border-hairline-volt",
                ].join(" ")}
              >
                <input
                  type="radio"
                  checked={guests === n}
                  onChange={() => setGuests(n)}
                  data-testid={`party-${n}-input`}
                  className="sr-only"
                />
                {n === 0 ? t.booking.partyJustMe : t.booking.partyPlus.replace("{n}", String(n))}
              </label>
            ))}
          </div>

          {guests > 0 && (
            <p data-testid="party-summary" className="mt-3 text-[13px] text-bone">
              {/*
                `{spots}` ARRIVES AS A FINISHED PHRASE (round 22) — "3 spots",
                "3 місця" — already agreeing with its own number, so this
                sentence does not have to. It was `{seats} spots`, which put a
                count next to a fixed noun and rendered "2 míst" and "2 місць"
                in the middle of a party the product caps at four.
              */}
              {t.booking.partySummary
                .replace(
                  "{spots}",
                  pluralise(
                    {
                      one: t.booking.partySeatsOne,
                      few: t.booking.partySeatsFew,
                      many: t.booking.partySeatsMany,
                    },
                    seats,
                    locale,
                  ),
                )
                .replace("{total}", formatCzk(partyPrice))}
            </p>
          )}

          {/*
            Said only when the pitch is the binding constraint, not the policy.
            "Only 2 more can fit" beside a full set of buttons would be noise.
          */}
          {maxGuests < policy.booking.maxPartyGuests && (
            <p data-testid="party-limited" className="mt-2 text-[13px] text-muted">
              {t.booking.partyLimited.replace("{n}", String(maxGuests))}
            </p>
          )}
        </fieldset>
      )}

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-4 text-body-lg font-semibold text-bone">
          {t.booking.choosePayment}
        </legend>

        <div className="flex flex-col gap-3">
          {/* ---- credit -------------------------------------------------- */}
          <label data-testid="pay-credit" className={optionClass("credit", !creditCovers)}>
            <input
              type="radio"
              name="option"
              value="credit"
              disabled={!creditCovers}
              checked={activeChoice === "credit"}
              onChange={() => setChoice("credit")}
              data-testid="pay-credit-input"
              className="mt-1 accent-volt"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-body-lg font-semibold text-bone">
                {t.booking.payWithCredit}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">
                {creditCovers
                  ? t.booking.payWithCreditHint.replace("{seats}", String(seats))
                  : t.booking.payWithCreditNone}
              </span>

              {/*
                THE PILL IS INSIDE THE BOX (item 11), and it is a LINK, so it
                works while the option itself is unselectable. Nested inside a
                `<label>`, a click on it would otherwise be swallowed as a
                click on the label — `stopPropagation` is not available to a
                server-rendered anchor, so the label's `htmlFor` is absent and
                the input is a child instead, which scopes the label's activation
                to its own text.

                NEVER A GATE. The booking can still be completed with either of
                the two options below; this is an offer, and the round's rule
                is that nothing blocks a booking to upsell.
              */}
              {!creditCovers && (
                <Link
                  href="/pass"
                  data-testid="add-credits"
                  className="mt-3 inline-flex min-h-11 items-center rounded-pill border-2 border-hairline-volt px-4 text-small font-bold text-volt no-underline transition-colors hover:border-volt"
                >
                  {t.booking.addCredits}
                </Link>
              )}
            </span>
          </label>

          {/* ---- online ------------------------------------------------- */}
          <label data-testid="pay-online" className={optionClass("online", !onlineReady)}>
            <input
              type="radio"
              name="option"
              value="online"
              disabled={!onlineReady}
              checked={activeChoice === "online"}
              onChange={() => setChoice("online")}
              data-testid="pay-online-input"
              className="mt-1 accent-volt"
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-body-lg font-semibold text-bone">
                  {t.booking.payOnline}
                </span>
                {/*
                  The badge is the whole honesty of this control. Fully styled
                  and visibly not yet available beats a hidden option — a
                  player who has heard card payment is coming can see that it
                  is, rather than concluding it was removed.
                */}
                {!onlineReady && (
                  <span
                    data-testid="pay-online-soon"
                    className="rounded-pill border border-hairline-strong px-2 py-[2px] text-eyebrow font-semibold uppercase text-muted"
                  >
                    {t.booking.payOnlineComingSoon}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">
                {t.booking.payOnlineHint}
              </span>
              {/*
                THE ONE THING A PAYMENT LINK CANNOT DO FOR US.
                
                A Stripe Payment Link has a fixed quantity of one and no
                parameter presets it — `client_reference_id` and
                `prefilled_email` are the two we can stamp (round 7, item 16),
                and quantity is not among them. So the player is told, on the
                option itself and before they commit, that the number has to
                be changed on Stripe's page.

                Shown for a party only. On a single booking the quantity is
                already right and the sentence would be an instruction to do
                nothing.
              */}
              {seats > 1 && (
                <span
                  data-testid="party-online-quantity"
                  className="mt-2 block text-[13px] font-semibold leading-snug text-volt"
                >
                  {t.booking.partyOnlineQuantity.replace("{seats}", String(seats))}
                </span>
              )}
            </span>
          </label>

          {/*
            ~~---- cash ----~~ REMOVED (round 23, item 7).

            Round 18 asked for this and STOPPED AT ITS OWN GATE: the item said
            remove cash only once the online rail was proven end to end on
            production, and it was not — no `stripe_session_id` had ever
            existed. The gate did its job and the reprieve was recorded.
            Round 23 closes it on the owner's explicit authorization, with the
            evidence stated rather than implied: the online rail is proven on
            the PASS half (`cs_live_…`, confirmed by webhook in 24 seconds) and
            has still never carried a BOOKING. The owner accepted that as
            shared-rail proof; the remaining risk is his to take and is written
            down here rather than left to be inferred.

            THE `cash` RAIL SURVIVES THIS AND MUST. "Redeem credit" still sends
            `cash` to `create_booking` — see `OPTION_TO_METHOD`, where the RPC
            derives `credit` itself — and seven unpaid cash bookings exist on
            production that the admin roster must still settle. What is gone is
            the CHOICE, not the column.
          */}
        </div>
      </fieldset>

      {failure && (
        <FormError title={failure.title} message={failure.message} code={state.code}>
          {/*
            The way forward §2.11 asks for. Retrying is the button below, so
            this is the OTHER exit — back to the game, which is where a player
            goes when the answer is "this one is gone".
          */}
          <Link
            href={`/game/${gameId}`}
            data-testid="booking-error-back"
            className="text-body font-semibold text-volt no-underline"
          >
            {t.booking.backToGame}
          </Link>
        </FormError>
      )}

      <PendingButton
        label={t.booking.confirmBooking}
        testId="confirm-booking"
        className="w-full"
        disabled={activeChoice === null}
      />
    </form>
  );
}
