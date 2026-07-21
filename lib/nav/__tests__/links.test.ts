import { describe, expect, it } from "vitest";
import { authNavLink, primaryNavLinks } from "@/lib/nav/links";
import { strings } from "@/lib/strings";

describe("primaryNavLinks", () => {
  it("links the games list", () => {
    expect(primaryNavLinks()).toEqual([
      { href: "/games", label: strings.nav.games },
    ]);
  });

  it("sources every label from the strings table", () => {
    const labels = Object.values(strings.nav) as string[];
    for (const link of primaryNavLinks()) {
      expect(labels).toContain(link.label);
    }
  });
});

describe("authNavLink", () => {
  it("offers log in when signed out", () => {
    expect(authNavLink({ nickname: null })).toEqual({
      href: "/login",
      label: strings.nav.logIn,
    });
  });

  it("shows the nickname linking to the account page when signed in", () => {
    expect(authNavLink({ nickname: "Player_1" })).toEqual({
      href: "/account",
      label: "Player_1",
    });
  });

  it("falls back to log in for a session with no player row yet", () => {
    // Authenticated via magic link but pre-signup: there is no nickname to
    // render, and /login forwards on to /signup.
    expect(authNavLink({ nickname: "" }).href).toBe("/login");
  });
});
