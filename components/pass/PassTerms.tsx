"use client";

import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from "react";
import { TermsCheckbox } from "@/components/form/TermsCheckbox";
import { useStrings } from "@/components/LocaleProvider";

/**
 * ONE TERMS BOX FOR FIVE TIER FORMS (round 38).
 *
 * Each tier is its own `<form>`, and a checkbox belongs to exactly one form —
 * so a box inside one card would guard one tier, and a box per card would put
 * five identical legal lines on a page whose job is comparing prices. The box
 * sits once above the tiers and every buy button reads it from here.
 *
 * A PRESS WITHOUT THE TICK IS STOPPED IN THE BROWSER and pointed at the box,
 * rather than disabling five buttons — a disabled button on a price list reads
 * as "sold out" (see `BuyPassButton`). `buyPassAction` refuses it anyway.
 */
interface PassTermsValue {
  accepted: boolean;
  setAccepted: (accepted: boolean) => void;
  /** Called by a buy button pressed without the tick. */
  demand: () => void;
  demanded: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}

const PassTermsContext = createContext<PassTermsValue | null>(null);

export function PassTermsProvider({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(false);
  const [demanded, setDemanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const demand = () => {
    setDemanded(true);
    inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <PassTermsContext.Provider value={{ accepted, setAccepted, demand, demanded, inputRef }}>
      {children}
    </PassTermsContext.Provider>
  );
}

export function usePassTerms(): PassTermsValue {
  const value = useContext(PassTermsContext);
  if (!value) throw new Error("usePassTerms must be used inside PassTermsProvider");
  return value;
}

export function PassTermsCheckbox() {
  const t = useStrings();
  const { accepted, setAccepted, demanded, inputRef } = usePassTerms();

  return (
    <div data-testid="pass-terms" className="mt-4">
      <TermsCheckbox
        checked={accepted}
        onChange={setAccepted}
        inputRef={inputRef}
        error={demanded && !accepted ? t.auth.tosRequired : undefined}
      />
    </div>
  );
}
