"use client";

/**
 * The fourth control on a guest picker, when the ceiling is bigger than the
 * pills (round 33, item 3).
 *
 * WHAT THE OWNER ASKED FOR, and the shape follows it exactly: `+1/+2/+3` stay
 * as pills, and the FOURTH control is a dropdown covering `+4` through `+13`,
 * drawn as a pill showing `+4` with a small down-arrow. Selecting from it
 * behaves exactly like tapping a pill.
 *
 * A NATIVE `<select>`, WHICH IS THE WHOLE REASON THIS IS SHORT. A custom
 * listbox here would need a portal — CLAUDE.md's modal law, because both
 * pickers render inside `main.relative.z-10` and would open UNDER the nav pill
 * — plus roving focus, Escape, outside-click and a scroll lock. The platform
 * has all of that, and on a phone it opens the OS wheel, which is a better
 * control for ten options than anything drawn in a page.
 *
 * THE PLACEHOLDER IS WHY THE VALUE IS `""` WHEN A PILL IS CHOSEN, and it is not
 * cosmetic. Bound to `String(min)` instead, the pill would read `+4` while the
 * picker's real answer was `+2`, and choosing `+4` from the list would fire no
 * `change` event at all — the select already held that value. So the closed
 * pill shows `+4` as a disabled placeholder, and picking `+4` is a real change
 * from `""`.
 *
 * THE CAP IS THE CALLER'S. `max` arrives already reduced by the free seats, so
 * a game with six spots left offers `+4` and `+5` and stops; when nothing is
 * left above the pills this renders nothing at all rather than an empty
 * dropdown.
 */
export function GuestOverflowSelect({
  min,
  max,
  value,
  onChange,
  label,
  ariaLabel,
  testId,
}: {
  /** First option, and the placeholder the closed pill shows. */
  min: number;
  /** Last option, already capped by the caller to what will fit. */
  max: number;
  /** The picker's current answer; `null` when a pill holds it. */
  value: number | null;
  onChange: (n: number) => void;
  /** Renders one option, e.g. `n => "+" + n`. */
  label: (n: number) => string;
  ariaLabel: string;
  testId: string;
}) {
  if (max < min) return null;

  const active = value !== null && value >= min;
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <span
      data-testid={`${testId}-wrap`}
      data-active={active ? "true" : "false"}
      className={[
        "relative inline-flex min-h-11 items-center rounded-pill border-2 transition-colors",
        active ? "border-volt text-volt" : "border-hairline-strong text-muted",
      ].join(" ")}
    >
      <select
        aria-label={ariaLabel}
        data-testid={testId}
        value={active ? String(value) : ""}
        onChange={(event) => onChange(Number(event.target.value))}
        /*
          `appearance-none` removes the platform's own arrow so the one drawn
          below is the only one; the right padding is the room it sits in.
          Transparent background and `currentColor` so the control takes the
          pill's selected/unselected treatment rather than carrying its own.
        */
        className="min-h-11 cursor-pointer appearance-none rounded-pill bg-transparent py-0 pl-4 pr-9 text-small font-bold text-current outline-none"
      >
        {/*
          `hidden` keeps it out of the list; `disabled` keeps it unselectable on
          the browsers that ignore `hidden` on an option. Either way it is only
          ever the CLOSED label.
        */}
        <option value="" disabled hidden>
          {label(min)}
        </option>
        {options.map((n) => (
          <option key={n} value={n}>
            {label(n)}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-3.5 text-[10px] leading-none"
      >
        ▾
      </span>
    </span>
  );
}
