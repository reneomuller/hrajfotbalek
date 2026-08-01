import { describe, expect, it } from "vitest";
import { isToastKind, readToast, TOAST_KINDS, withToast } from "@/lib/ux/toast";
import { strings } from "@/lib/strings";

/**
 * Contract §8 / REQ-UX-002.
 *
 * The property worth testing is that the set is CLOSED. A toast crosses a
 * navigation as a query parameter, which means the value arriving is
 * attacker-controlled in the ordinary sense that any query parameter is — so
 * an unrecognised one has to render nothing, not whatever the URL said.
 */

describe("readToast", () => {
  it("reads a recognised kind", () => {
    expect(readToast({ toast: "bookingCreated" })).toBe("bookingCreated");
  });

  it("returns null for anything unrecognised, rather than passing it through", () => {
    // This is the whole point of the closed set: without it, `?toast=<text>`
    // would put arbitrary text on the page in the product's own voice.
    expect(readToast({ toast: "You have won a prize" })).toBeNull();
    expect(readToast({ toast: "<script>alert(1)</script>" })).toBeNull();
    expect(readToast({ toast: "" })).toBeNull();
    expect(readToast({})).toBeNull();
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(readToast({ toast: ["signedIn", "bookingCreated"] })).toBe("signedIn");
  });

  it("ignores a repeated parameter whose first value is junk", () => {
    expect(readToast({ toast: ["nope", "signedIn"] })).toBeNull();
  });
});

describe("withToast", () => {
  it("adds the parameter to a bare path", () => {
    expect(withToast("/account", "signedIn")).toBe("/account?toast=signedIn");
  });

  it("appends to a path that already carries a query", () => {
    expect(withToast("/game/x/book/confirmation?booking=y", "bookingCreated")).toBe(
      "/game/x/book/confirmation?booking=y&toast=bookingCreated",
    );
  });

  it("round-trips through readToast for every kind", () => {
    for (const kind of TOAST_KINDS) {
      const url = withToast("/games", kind);
      const query = Object.fromEntries(new URL(url, "https://x.test").searchParams);
      expect(readToast(query)).toBe(kind);
    }
  });
});

describe("the toast vocabulary", () => {
  it("covers exactly the five moments the contract names", () => {
    expect([...TOAST_KINDS].sort()).toEqual([
      "bookingCancelled",
      "bookingCreated",
      "linkCopied",
      "signedIn",
      "topupConfirmed",
    ]);
  });

  it("has copy for every kind, so no kind can render an empty toast", () => {
    for (const kind of TOAST_KINDS) {
      expect(strings.toast[kind]).toBeTruthy();
    }
  });

  it("rejects a non-string", () => {
    expect(isToastKind(undefined)).toBe(false);
    expect(isToastKind(42)).toBe(false);
    expect(isToastKind(null)).toBe(false);
  });
});
