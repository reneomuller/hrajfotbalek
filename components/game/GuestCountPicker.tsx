"use client";

import { policy } from "@/lib/policy";
import { GuestOverflowSelect } from "@/components/game/GuestOverflowSelect";
import { useStrings } from "@/components/LocaleProvider";

/**
 * How many guests — pills for the first few, a dropdown for the rest.
 *
 * EXTRACTED IN ROUND 34 BECAUSE THERE ARE NOW TWO OF THEM. Round 33 built this
 * shape once, inside `AddGuestsPanel`; item 4 adds a second panel that asks the
 * identical question in the opposite direction, and the owner's words were
 * "same v2 language". Two copies of a picker is two places for the pill count,
 * the overflow threshold and the accessible name to drift, and this product has
 * already paid for that once — `PhotoUpload` carried the same decision twice as
 * two ternaries and round 30 updated one of them.
 *
 * THE BOOKING-TIME PICKER IS DELIBERATELY NOT THIS COMPONENT. It offers a
 * "Just me" option at zero, its options are radio INPUTS inside labels because
 * it posts inside a bigger form, and its ceiling is the policy's rather than a
 * count it is handed. Folding those differences in would mean three booleans
 * and a conditional at the one place a mis-wire spends somebody's money.
 */
export function GuestCountPicker({
  max,
  value,
  onChange,
  label,
  ariaLabel,
  testId,
}: {
  /** The largest choice, already bounded by the caller. Always ≥ 1. */
  max: number;
  value: number;
  onChange: (n: number) => void;
  /** Renders one option, e.g. `n => "+" + n`. */
  label: (n: number) => string;
  ariaLabel: string;
  testId: string;
}) {
  const t = useStrings();
  const pillMax = Math.min(policy.booking.partyPills, max);
  const pills = Array.from({ length: pillMax }, (_, i) => i + 1);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {/*
        RADIO BEHAVIOUR DRAWN AS PILLS, and a real `radiogroup` rather than a row
        of divs: this is a choice among a small set, so a keyboard reaches it and
        a screen reader announces it as one control with N options.
      */}
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        data-testid={`${testId}-picker`}
        className="flex flex-wrap gap-2"
      >
        {pills.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            data-testid={`${testId}-pick-${n}`}
            onClick={() => onChange(n)}
            className={
              value === n
                ? "rounded-control border-[1.5px] border-volt bg-volt px-4 py-2 text-body font-bold text-surface"
                : "rounded-control border-[1.5px] border-hairline bg-transparent px-4 py-2 text-body font-bold text-bone"
            }
          >
            {label(n)}
          </button>
        ))}
      </div>

      {/*
        THE FOURTH CONTROL IS A SIBLING OF THE RADIOGROUP, NOT A MEMBER OF IT.
        A `<select>` is not a `radio`; inside the group it would make the group
        announce an option count that does not match what is in it.
      */}
      <GuestOverflowSelect
        min={policy.booking.partyPills + 1}
        max={max}
        value={value}
        onChange={onChange}
        label={label}
        ariaLabel={t.booking.partyMore}
        testId={`${testId}-more`}
      />
    </div>
  );
}
