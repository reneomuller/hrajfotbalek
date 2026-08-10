import { describe, expect, it } from "vitest";
import config from "@/tailwind.config";

/**
 * The v1.3 token table, asserted at its resolved values.
 *
 * WHY THIS FILE EXISTS. Six tokens survive ruling A by NAME and change VALUE.
 * A call site using one of them keeps compiling, keeps reading correctly in
 * review, and renders differently — so there is no grep that finds a missed
 * one, and no reviewer who can see the difference by reading a diff of `app/`.
 * The only place the change is visible is here, which makes this the one test
 * standing between the redesign and a port that looks like it worked.
 *
 * Three of the six are not named in `REDESIGN_V1.3_ANALYZE.md` §5 at all —
 * `hairline-strong`, `rounded-control` and `rounded-card` — and were found by
 * reconciling the design system against the config while measuring the change
 * surface. They are asserted here on exactly the same footing as F5 and F6,
 * because "the analysis mentioned it" is not what makes a delta dangerous.
 *
 * Every assertion below states the OLD value as well as the new one, so the
 * test reads as a migration record rather than as a list of constants. A test
 * that only asserted the new value would pass just as well if someone had
 * never changed anything and typed the new numbers into a fresh file.
 */

const colors = config.theme?.extend?.colors as Record<string, string>;
const radii = config.theme?.extend?.borderRadius as Record<string, string>;
const families = config.theme?.extend?.fontFamily as Record<string, string[]>;
const steps = config.theme?.extend?.fontSize as Record<string, unknown>;
const shadows = config.theme?.extend?.boxShadow as Record<string, string>;
const screens = config.theme?.extend?.screens as Record<string, string>;

describe("F5 — hairline-volt survives by name and changes value", () => {
  it("resolves to .30, not the .18 it carried in v1.2", () => {
    expect(colors["hairline-volt"]).toBe("rgba(200,255,0,.30)");
    expect(colors["hairline-volt"]).not.toBe("rgba(200,255,0,.18)");
  });

  it("took the value that used to belong to hairline-volt-strong", () => {
    // The point of F5: the new value is not new, it is a promotion. Anyone
    // porting by copying the old table forward keeps .18 and every selected
    // state in the product is simply too faint.
    expect(colors["hairline-volt"]).toBe("rgba(200,255,0,.30)");
  });
});

describe("F6 — the surfaces go opaque", () => {
  it("surface is #0F0F0F, not #0A0A0A", () => {
    expect(colors.surface).toBe("#0F0F0F");
    expect(colors.surface).not.toBe("#0A0A0A");
  });

  it("surface-raised is #161616, not #0D0D0D", () => {
    expect(colors["surface-raised"]).toBe("#161616");
    expect(colors["surface-raised"]).not.toBe("#0D0D0D");
  });

  it("neither carries an alpha channel any more", () => {
    // Two changes at once — the hex moves AND the translucent family collapses
    // into these. Getting only the opacity half produces cards that are the
    // right colour and still see-through.
    expect(colors.surface).not.toContain("rgba");
    expect(colors["surface-raised"]).not.toContain("rgba");
  });

  it("keeps translucency in exactly one place: the venue scrim", () => {
    // The one exception. A sweep that maps every surface-* to opaque `surface`
    // puts a solid block over the photograph it was supposed to sit on.
    expect(colors["surface-overlay"]).toContain("rgba");
  });
});

describe("the contrast repair — faint", () => {
  it("is #7E7E7E, not the #6F6F6F that failed AA", () => {
    expect(colors.faint).toBe("#7E7E7E");
    expect(colors.faint).not.toBe("#6F6F6F");
  });

  it("is not #8A8A8A, which would recreate the pair this round deletes", () => {
    // #8A8A8A clears AA more comfortably and is the wrong answer: the analysis
    // names #9A9A9A/#8A8A8A as THE example of two greys that are one colour at
    // 390px, and `muted` is #9A9A9A.
    expect(colors.faint).not.toBe("#8A8A8A");
    expect(colors.muted).toBe("#9A9A9A");
  });
});

describe("the three silent deltas the analysis does not name", () => {
  it("hairline-strong moved .12 -> .14", () => {
    expect(colors["hairline-strong"]).toBe("rgba(255,255,255,.14)");
    expect(colors["hairline-strong"]).not.toBe("rgba(255,255,255,.12)");
  });

  it("rounded-control moved 8px -> 14px", () => {
    expect(radii.control).toBe("14px");
    expect(radii.control).not.toBe("8px");
  });

  it("rounded-card moved 16px -> 18px", () => {
    expect(radii.card).toBe("18px");
    expect(radii.card).not.toBe("16px");
  });
});

describe("focus is its own token, distinct from selection", () => {
  it("focus-ring is full-opacity volt", () => {
    expect(colors["focus-ring"]).toBe("#C8FF00");
    expect(colors["focus-ring"]).toBe(colors.volt);
  });

  it("and is NOT hairline-volt, which is too faint to be an indicator", () => {
    // hairline-volt at .30 over surface-raised is roughly 2.4:1, under the 3:1
    // WCAG 1.4.11 requires of a non-text indicator.
    expect(colors["focus-ring"]).not.toBe(colors["hairline-volt"]);
    expect(colors["focus-ring"]).not.toContain("rgba");
  });
});

describe("the three zero-call-site tokens are gone", () => {
  // Free deletions: all three existed only in the config, confirmed at 0 usages
  // across app/ and components/. They are also the evidence for ruling A's
  // thesis — a table carrying three tokens nothing ever used was a sampling of
  // a reference rather than a system.
  it("no longer defines the retired tertiary grey", () => {
    expect(colors).not.toHaveProperty("hint");
  });

  it("no longer defines hairline-panel", () => {
    expect(colors).not.toHaveProperty("hairline-panel");
  });

  it("no longer defines the panel radius", () => {
    expect(radii).not.toHaveProperty("panel");
  });
});

describe("the collapsed sets", () => {
  it("keeps three text tones as the only survivors", () => {
    expect(colors.bone).toBe("#E9E7E0");
    expect(colors.muted).toBe("#9A9A9A");
    expect(colors.faint).toBe("#7E7E7E");
  });

  it("keeps three hairlines", () => {
    expect(colors.hairline).toBe("rgba(255,255,255,.08)");
    expect(colors["hairline-strong"]).toBe("rgba(255,255,255,.14)");
    expect(colors["hairline-volt"]).toBe("rgba(200,255,0,.30)");
  });

  it("keeps three radii", () => {
    expect(radii.pill).toBe("999px");
    expect(radii.control).toBe("14px");
    expect(radii.card).toBe("18px");
  });

  it("keeps the scarcity ladder absolute and unchanged", () => {
    // Ruling D deleted the capacity bar; the ladder itself survives untouched
    // and now appears once per card, on the spots figure.
    expect(colors.volt).toBe("#C8FF00");
    expect(colors.warn).toBe("#FFA31A");
    expect(colors.danger).toBe("#FF5A4E");
  });
});

describe("elevation — exactly one shadow", () => {
  it("declares one entry and no more", () => {
    expect(Object.keys(shadows)).toHaveLength(1);
  });

  it("and it is the upward claim-bar/nav-pill lift", () => {
    // Upward, so content scrolling under the bar reads as UNDER it rather
    // than as cut off. A downward shadow here would say the opposite.
    expect(shadows.lift).toBe("0 -8px 24px rgba(0,0,0,.6)");
    expect(shadows.lift).toContain("-8px");
  });

  it("no longer defines either glow", () => {
    // Deleted rather than aliased: absence produces the intended result, which
    // is no glow. A glow on everything is the same problem as a border on
    // everything.
    expect(shadows).not.toHaveProperty("volt-glow");
    expect(shadows).not.toHaveProperty("volt-glow-lg");
  });
});

describe("families — two player-facing, plus the reserved mono", () => {
  it("declares exactly three", () => {
    expect(Object.keys(families).sort()).toEqual(["display", "mono", "sans"]);
  });

  it("no longer defines condensed", () => {
    // Deleted, not aliased. An ungenerated `font-condensed` inherits the body
    // font, which is Onest — exactly where its 117 call sites were headed.
    expect(families).not.toHaveProperty("condensed");
  });

  it("keeps mono, which is reserved rather than retired", () => {
    // The variabilní symbol is copied into a banking app and matched exactly;
    // a proportional font makes 0/O and 1/l confusable.
    expect(families.mono?.[0]).toContain("jetbrains");
  });
});

describe("one breakpoint", () => {
  it("declares md and nothing else", () => {
    expect(Object.keys(screens)).toEqual(["md"]);
    expect(screens.md).toBe("768px");
  });
});

describe("the seven-step scale", () => {
  it("hero shrank for ruling J", () => {
    // At least 25% off the hero's height so the three step cards clear the
    // fold. Deliberate and visible — this is the change, not a hazard.
    expect(steps.hero).toEqual([
      "clamp(44px,10vw,88px)",
      { lineHeight: "0.92", letterSpacing: "-1.5px" },
    ]);
  });

  it("carries all seven steps", () => {
    for (const step of ["hero", "title", "time", "body-lg", "body", "small", "eyebrow"]) {
      expect(steps).toHaveProperty(step);
    }
  });

  it("body-lg is ONE step — the 700 variant is a weight, not a scale step", () => {
    expect(steps["body-lg"]).toEqual(["17px", { lineHeight: "1.4" }]);
    expect(steps).not.toHaveProperty("body-lg-700");
    expect(steps).not.toHaveProperty("body-lg-bold");
  });

  it("eyebrow is the tracked one, being the only uppercase style", () => {
    expect(steps.eyebrow).toEqual(["11px", { letterSpacing: "3px" }]);
  });
});

describe("the retiring aliases still resolve, and point at their successors", () => {
  /*
   * Deleting these here would stop 83 files compiling, because the call-site
   * sweep is Phase 17. They are aliases pointing at the surviving VALUE, which
   * is what makes the appearance change land in this commit while Phase 17's
   * enormous rename changes nothing visible.
   *
   * The consequence worth stating: a strip taken before and after Phase 17
   * should be IDENTICAL. Any difference between them is a mistake in the
   * sweep, not a delta of the redesign.
   *
   * These assertions are deleted along with the aliases.
   */
  it("the retiring greys resolve to their surviving tone", () => {
    expect(colors.chalk).toBe(colors.bone);
    expect(colors["muted-dim"]).toBe(colors.muted);
    expect(colors.subtle).toBe(colors.muted);
    expect(colors["footer-dim"]).toBe(colors.muted);
    expect(colors.dim).toBe(colors.faint);
  });

  it("the retiring hairlines resolve to their surviving weight", () => {
    expect(colors["hairline-soft"]).toBe(colors.hairline);
    expect(colors["hairline-chrome"]).toBe(colors.hairline);
    expect(colors["hairline-link"]).toBe(colors["hairline-strong"]);
    expect(colors["hairline-volt-soft"]).toBe(colors["hairline-volt"]);
    expect(colors["hairline-volt-strong"]).toBe(colors["hairline-volt"]);
  });

  it("the translucent surfaces resolve to opaque surface", () => {
    expect(colors["surface-card"]).toBe(colors.surface);
    expect(colors["surface-card-strong"]).toBe(colors.surface);
    expect(colors["surface-panel"]).toBe(colors.surface);
  });

  it("the retiring radii resolve to pill or control", () => {
    expect(radii.chip).toBe(radii.pill);
    expect(radii.badge).toBe(radii.pill);
    expect(radii.cta).toBe(radii.control);
  });
});
