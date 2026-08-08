"use client";

import { useActionState, useState } from "react";
import { createTopupAction, type TopupFormState } from "@/app/account/topup/actions";
import { TOPUP_MAX_CZK, TOPUP_MIN_CZK, TOPUP_PRESETS } from "@/lib/payments/topup";
import { formatCzk } from "@/lib/format";
import { useStrings } from "@/components/LocaleProvider";

const initialState: TopupFormState = { status: "idle" };

/**
 * Amount chooser.
 *
 * Presets and free entry share ONE field rather than being two inputs that can
 * disagree: tapping a preset fills the field, and typing overrides it. Two
 * inputs would mean deciding which wins when both are set, and that decision is
 * about money.
 */
export function TopupForm() {
  const t = useStrings();
  const [amount, setAmount] = useState<string>(String(TOPUP_PRESETS[1]));
  const [state, formAction, pending] = useActionState(createTopupAction, initialState);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs uppercase tracking-widest opacity-60">
        {t.account.topupAmountLabel}
      </span>

      <div className="flex flex-wrap gap-2">
        {TOPUP_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount(String(preset))}
            data-testid={`topup-preset-${preset}`}
            className={`rounded-control border px-4 py-2 font-condensed text-sm font-bold transition ${
              amount === String(preset)
                ? "border-volt text-volt"
                : "border-hairline-strong text-bone hover:border-volt"
            }`}
          >
            {formatCzk(preset)}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-xs opacity-50">{t.account.topupCustomLabel}</span>
        <input
          type="number"
          name="amount"
          inputMode="numeric"
          min={TOPUP_MIN_CZK}
          max={TOPUP_MAX_CZK}
          step={10}
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          data-testid="topup-amount"
          className="rounded-control border border-hairline-strong bg-transparent px-4 py-3 text-base outline-none transition-colors focus:border-volt"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        data-testid="topup-submit"
        className="rounded-control bg-volt px-4 py-[15px] font-condensed text-cta font-extrabold uppercase tracking-wide text-surface transition disabled:opacity-50"
      >
        {pending ? t.common.loading : t.account.topupSubmit}
      </button>

      {state.status === "error" && state.message ? (
        <p role="alert" data-testid="topup-error" className="text-sm text-red-400">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
