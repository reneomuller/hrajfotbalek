import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * THE HOME-PAGE FORMS KEEP WHAT WAS TYPED WHEN A SAVE IS REFUSED (round 42,
 * the admin rebuild).
 *
 * React resets an uncontrolled `<form action={…}>` once its action returns —
 * including an action that RETURNS an error rather than throwing. The contact
 * lists and the notify composer were `defaultValue` fields, so a refused save
 * (an address the RPC rejects, a send that fails) put the old lists back, or
 * emptied the message, and the admin's typing was gone with the error still on
 * screen. `SiteSettingsForms` documented the trap and avoided it; the other two
 * fell into it.
 *
 * Read off the source, the way `seatPrice.test.ts` reads `GameForm`: there is
 * no DOM in this suite, and the property is exactly "no field here is
 * uncontrolled".
 */
const FORMS = [
  "components/admin/SiteSettingsForms.tsx",
  "components/admin/ContactForm.tsx",
  "components/admin/NotifyForm.tsx",
];

describe("the home-page settings forms", () => {
  it.each(FORMS)("%s has no uncontrolled field", (path) => {
    // Arrange
    const source = readFileSync(path, "utf8");

    // Act
    const uncontrolled = source.match(/defaultValue=/g) ?? [];

    // Assert
    expect(uncontrolled, `${path} renders a defaultValue field`).toHaveLength(0);
  });
});
