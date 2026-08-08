"use client";

import { useState } from "react";
import { ChangeEmailForm, ChangePasswordForm } from "@/components/account/SecurityForms";
import { useStrings } from "@/components/LocaleProvider";

/**
 * Change password and change email, as COMPACT TEXT LINKS (§3.3, REQ-AUTH-020).
 *
 * THE TWO-COLUMN PANEL THIS REPLACES IS A RECORDED DEFECT, and the contract
 * says why: these are controls someone uses roughly once, and giving them more
 * vertical space than the wallet and the fixture list pushed the things people
 * actually came for below the fold. The resting state is one line each.
 *
 * STYLED AND SIZED EXACTLY LIKE "DELETE MY ACCOUNT", which is the third link in
 * the stack directly beneath them. That is the whole visual idea: three
 * small grey text links, no card, no panel, no heading of their own — three
 * things you can do to your account, none of them shouting.
 *
 * The form is disclosed in place rather than on its own route. A route would
 * be another page to gate, another back button to get wrong, and would put the
 * password field one navigation away from the thing that prompted it.
 */
export function SecurityLinks() {
  const t = useStrings();
  const [open, setOpen] = useState<"password" | "email" | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Row
        label={t.account.changePasswordLink}
        isOpen={open === "password"}
        onToggle={() => setOpen(open === "password" ? null : "password")}
        testId="change-password-link"
      >
        <ChangePasswordForm />
      </Row>

      <Row
        label={t.account.changeEmailLink}
        isOpen={open === "email"}
        onToggle={() => setOpen(open === "email" ? null : "email")}
        testId="change-email-link"
      >
        <ChangeEmailForm />
      </Row>
    </div>
  );
}

function Row({
  label,
  isOpen,
  onToggle,
  testId,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onToggle}
        data-testid={testId}
        aria-expanded={isOpen}
        /*
          The same typography as the delete link below it, deliberately: same
          size, same weight, same grey. A button that looked like a button here
          would make two rarely-used controls the loudest thing on the page.
          `py-2` keeps the touch target honest without adding visual weight.
        */
        className="block w-full bg-transparent py-2 text-left text-[12px] text-muted no-underline transition hover:text-bone"
      >
        {label}
      </button>

      {isOpen && (
        <div className="mb-4 mt-1 max-w-[420px]">{children}</div>
      )}
    </div>
  );
}
