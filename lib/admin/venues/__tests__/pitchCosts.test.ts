import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PITCH_COST_MAX_CZK,
  parsePitchCostForm,
  parsePitchSeason,
  parseWholeCzk,
  pitchCostInForce,
} from "@/lib/admin/venues/pitchCosts";

/**
 * The venues page's pitch cost area and season switch (round 42, the admin
 * rebuild). The owner: two values per venue, "one for summer and another for
 * winter, with a simple toggle that either stays on winter or summer".
 *
 * These are the decisions the form makes before the RPC is asked: what counts
 * as a cost an admin typed, and which of a venue's two prices new games take.
 * `set_venue_pitch_costs` re-checks the range in SQL — this is the copy that
 * names the field, not the authority.
 */

describe("parseWholeCzk — what counts as a typed pitch cost", () => {
  it("reads a whole number of crowns", () => {
    // Arrange
    const typed = "1200";

    // Act
    const parsed = parseWholeCzk(typed);

    // Assert
    expect(parsed).toBe(1200);
  });

  it("ignores the spaces around a number and inside it, as a Czech thousands separator", () => {
    // Arrange — a plain space and a no-break space, both how 1 200 is written.
    const typed = [" 800 ", "1 200", "1 200"];

    // Act
    const parsed = typed.map(parseWholeCzk);

    // Assert
    expect(parsed).toEqual([800, 1200, 1200]);
  });

  it("accepts the two ends of the range, nothing and the ceiling", () => {
    // Arrange
    const ends = ["0", String(PITCH_COST_MAX_CZK)];

    // Act
    const parsed = ends.map(parseWholeCzk);

    // Assert
    expect(parsed).toEqual([0, PITCH_COST_MAX_CZK]);
  });

  it("refuses a cost above the ceiling, which is a typo rather than a price", () => {
    // Arrange
    const typed = String(PITCH_COST_MAX_CZK + 1);

    // Act
    const parsed = parseWholeCzk(typed);

    // Assert
    expect(parsed).toBeNull();
  });

  it("refuses a negative, a fraction, an exponent and a comma — none is a whole crown amount", () => {
    // Arrange — `1e3` is what a number input lets through; `1,200` is a decimal in Czech.
    const typed = ["-5", "12.5", "1e3", "1,200", "800 CZK"];

    // Act
    const parsed = typed.map(parseWholeCzk);

    // Assert
    expect(parsed).toEqual([null, null, null, null, null]);
  });

  it("refuses an empty field rather than reading it as zero", () => {
    // Arrange — a cleared box must not quietly make a pitch free.
    const empty = ["", "   ", null, undefined];

    // Act
    const parsed = empty.map(parseWholeCzk);

    // Assert
    expect(parsed).toEqual([null, null, null, null]);
  });

  it("refuses a value that is not text at all, such as an uploaded file", () => {
    // Arrange
    const file = new Blob(["1200"]);

    // Act
    const parsed = parseWholeCzk(file);

    // Assert
    expect(parsed).toBeNull();
  });
});

describe("parsePitchCostForm — the two inputs together", () => {
  it("returns both costs when both are whole crown amounts", () => {
    // Arrange
    const form = { summer: "800", winter: "1200" };

    // Act
    const result = parsePitchCostForm(form);

    // Assert
    expect(result).toEqual({ ok: true, summerCzk: 800, winterCzk: 1200 });
  });

  it("names the one field that is wrong, so the other keeps its value", () => {
    // Arrange
    const form = { summer: "800", winter: "twelve hundred" };

    // Act
    const result = parsePitchCostForm(form);

    // Assert
    expect(result).toEqual({ ok: false, invalid: ["winter"] });
  });

  it("names both fields, summer first, when both are wrong", () => {
    // Arrange
    const form = { summer: "", winter: "-1" };

    // Act
    const result = parsePitchCostForm(form);

    // Assert
    expect(result).toEqual({ ok: false, invalid: ["summer", "winter"] });
  });
});

describe("pitchCostInForce — which of a venue's two prices new games take", () => {
  const costs = { summerCzk: 800, winterCzk: 1200 };

  it("is the winter price while the switch is on winter", () => {
    // Act
    const cost = pitchCostInForce(costs, "winter");

    // Assert
    expect(cost).toBe(1200);
  });

  it("is the summer price while the switch is on summer", () => {
    // Act
    const cost = pitchCostInForce(costs, "summer");

    // Assert
    expect(cost).toBe(800);
  });
});

describe("parsePitchSeason — the switch's submitted value", () => {
  it("accepts summer and winter exactly", () => {
    // Act
    const seasons = ["summer", "winter"].map(parsePitchSeason);

    // Assert
    expect(seasons).toEqual(["summer", "winter"]);
  });

  it("refuses anything else rather than guessing a season", () => {
    // Arrange
    const submitted = ["Summer", "autumn", "", null, new Blob(["winter"])];

    // Act
    const seasons = submitted.map(parsePitchSeason);

    // Assert
    expect(seasons).toEqual([null, null, null, null, null]);
  });
});

/**
 * THE CEILING IS SQL'S, AND THIS IS A COPY OF IT — so it is pinned to the
 * newest definition of `pitch_cost_max_czk()` in the migrations. If the
 * ceiling moves there and not here, the form refuses a cost the RPC would
 * take (or lets through one it refuses, which only costs a round trip).
 */
describe("PITCH_COST_MAX_CZK", () => {
  it("is the ceiling the newest migration gives pitch_cost_max_czk()", () => {
    // Arrange
    const dir = "supabase/migrations";
    const definitions = readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .flatMap((file) => {
        const sql = readFileSync(`${dir}/${file}`, "utf8");
        const pattern =
          /function\s+public\.pitch_cost_max_czk\(\)[\s\S]*?\$\$\s*select\s+(\d+)\s*\$\$/gi;
        return [...sql.matchAll(pattern)].map((match) => Number(match[1]));
      });

    // Act
    const newest = definitions.at(-1);

    // Assert
    expect(definitions.length, "no migration defines pitch_cost_max_czk()").toBeGreaterThan(0);
    expect(PITCH_COST_MAX_CZK).toBe(newest);
  });
});
