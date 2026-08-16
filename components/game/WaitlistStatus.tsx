import Link from "next/link";

/**
 * §3 screen 8's drawn states — joined, spot-open, not-on-the-list.
 *
 * ONE SHAPE FOR THREE STATES, because they are three answers to one question:
 * where do I stand on this list. Drawing them separately is how they drift
 * into three visual languages for one flow, which is what §2.9 objects to when
 * it says "never a bare centred sentence" — and a bare sentence in a grey box
 * is exactly what all three were.
 *
 * THE TONE CARRIES THE NEWS, and the sentence carries the meaning: colour is
 * never the only signal (§2.0). `open` is the one state with something to do,
 * so it is the one that takes the volt and the only one with a primary action.
 *
 * ORDER IS DELIBERATE: title, body, then the hint, then the action. The hint
 * is `waitlistHint` — "everyone waiting is told at the same moment" — and it
 * is what keeps a position number honest under notify-all FCFS. It reads as
 * reassurance beside a position and as an explanation beside a lost race, so
 * it belongs in both.
 *
 * NEITHER A SERVER NOR A CLIENT COMPONENT — it reads no strings of its own and
 * takes every word as a prop. That is deliberate: the joined state renders
 * inside `WaitlistButton`, which is `"use client"` because it holds action
 * state, while the other two render on server pages. A component that called
 * `getStrings()` here would typecheck and then fail at runtime inside the
 * client tree, which is exactly what the first version of this did.
 */
export function WaitlistStatus({
  tone,
  title,
  body,
  position,
  hint,
  action,
}: {
  tone: "waiting" | "open" | "absent";
  title: string;
  body?: string;
  /** Place in the queue. Rendered only when the RPC could answer. */
  position?: string | null;
  /** `games.waitlistHint`, passed in — see the note above. */
  hint?: string;
  action?: { href: string; label: string };
}) {

  const skin = {
    waiting: "border-hairline-strong",
    open: "border-hairline-volt bg-volt/[.06]",
    absent: "border-hairline",
  }[tone];

  return (
    <section
      data-testid="waitlist-status"
      data-tone={tone}
      className={`rounded-card border bg-surface p-5 ${skin}`}
    >
      <h2
        data-testid="waitlist-status-title"
        className={`m-0 text-body-lg font-semibold ${
          tone === "open" ? "text-volt" : "text-bone"
        }`}
      >
        {title}
      </h2>

      {body && (
        <p className="mt-2 mb-0 text-body leading-relaxed text-muted">{body}</p>
      )}

      {position && (
        <p
          data-testid="waitlist-position"
          className="mt-3 mb-0 font-display text-[28px] leading-none text-bone"
        >
          {position}
        </p>
      )}

      {/*
        THE HINT STAYS WITH THE POSITION, always. The number alone reads as a
        serving order, and notify-all FCFS is not one — everybody is told at
        once and the race is settled by `create_booking`'s capacity check.
        Rendering one without the other is how the product would come to
        promise a queue it does not run.
      */}
      {hint && tone !== "absent" && (
        <p className="mt-3 mb-0 text-small leading-snug text-faint">{hint}</p>
      )}

      {action && (
        <Link
          href={action.href}
          data-testid="waitlist-status-action"
          className={`mt-4 inline-flex min-h-11 items-center justify-center rounded-control px-5 text-body-lg font-bold no-underline transition-colors ${
            tone === "open"
              ? "bg-volt text-ink hover:bg-volt-dim"
              : "border border-hairline-strong text-bone hover:border-hairline-volt"
          }`}
        >
          {action.label}
        </Link>
      )}
    </section>
  );
}
