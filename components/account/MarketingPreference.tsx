"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  setMarketingOptInAction,
  type MarketingActionState,
} from "@/app/account/actions";
import { useStrings } from "@/components/LocaleProvider";

const INITIAL: MarketingActionState = { status: "idle" };

/**
 * Email preferences — the one switch behind the signup box's "You can
 * unsubscribe at any time" (round 38).
 *
 * A SUBMIT BUTTON WITH `role="switch"`, not a checkbox that saves on change.
 * It works with no JavaScript, announces itself as on/off, and each press is
 * one explicit write — there is no "Save" to forget. The button submits the
 * value it is ASKING FOR, so the state shown is always the server's: the page
 * revalidates and `optedIn` arrives fresh on the next render.
 *
 * SEPARATE FROM THE DETAILS FORM on purpose. A consent choice that only saves
 * alongside a nickname edit is a choice people make by accident, or think they
 * made and did not.
 */
export function MarketingPreference({ optedIn }: { optedIn: boolean }) {
  const t = useStrings();
  const [state, formAction] = useActionState(setMarketingOptInAction, INITIAL);

  return (
    <section data-testid="marketing-preference" className="lifted rounded-card p-5">
      <form action={formAction} className="flex items-center justify-between gap-4">
        <input type="hidden" name="optIn" value={optedIn ? "false" : "true"} />
        <span id="marketing-toggle-label" className="text-body text-bone">
          {t.profile.marketingToggle}
        </span>
        <Switch on={optedIn} />
      </form>

      {state.status === "error" && state.message && (
        <p role="alert" className="mt-3 mb-0 text-small text-danger">
          {state.message}
        </p>
      )}
    </section>
  );
}

function Switch({ on }: { on: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-labelledby="marketing-toggle-label"
      aria-busy={pending}
      disabled={pending}
      data-testid="marketing-toggle"
      /* 44px tall hit area around a 24px track — the touch floor, not the art. */
      className="flex min-h-11 shrink-0 items-center disabled:opacity-60"
    >
      <span
        className={`flex h-6 w-11 items-center rounded-pill p-[3px] transition-colors ${
          on ? "bg-volt" : "bg-surface-raised ring-1 ring-inset ring-hairline-strong"
        }`}
      >
        <span
          className={`h-[18px] w-[18px] rounded-pill transition-transform ${
            on ? "translate-x-5 bg-ink" : "bg-muted"
          }`}
        />
      </span>
    </button>
  );
}
