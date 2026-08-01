import { describe, expect, it } from "vitest";
import {
  adminNavLinks,
  authNavLink,
  primaryNavLinks,
  signedOutNavLinks,
} from "@/lib/nav/links";
import { strings } from "@/lib/strings";

describe("primaryNavLinks", () => {
  it("links the games list", () => {
    expect(primaryNavLinks()).toEqual([
      { href: "/games", label: strings.nav.games },
    ]);
  });

  it("shows the admin door only to an admin session", () => {
    expect(primaryNavLinks({ isAdmin: true })).toEqual([
      { href: "/games", label: strings.nav.games },
      { href: "/admin/games", label: strings.nav.admin },
    ]);
  });

  it("hides the admin link from a non-admin and from a signed-out visitor", () => {
    for (const session of [{ isAdmin: false }, {}]) {
      expect(primaryNavLinks(session).map((l) => l.href)).not.toContain("/admin/games");
    }
  });

  /*
   * Worth stating outright, because a nav test is exactly where someone later
   * reads "hidden" as "protected": this function is display logic. The gate is
   * `requireAdmin()` in the admin layout, and every admin RPC re-checks. A
   * non-admin who types /admin/games is redirected by that gate, not by this.
   */
  it("is display logic — the admin route is gated server-side, not by this list", () => {
    expect(primaryNavLinks({ isAdmin: false })).not.toEqual(
      primaryNavLinks({ isAdmin: true }),
    );
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

  it("links the account page under fixed copy when signed in", () => {
    expect(authNavLink({ nickname: "Player_1" })).toEqual({
      href: "/account",
      label: strings.nav.profile,
    });
  });

  it("never renders the nickname itself in the nav", () => {
    expect(authNavLink({ nickname: "Player_1" }).label).not.toContain("Player_1");
  });

  it("falls back to log in for a session with no player row yet", () => {
    // Authenticated via magic link but pre-signup: there is no nickname to
    // render, and /login forwards on to /signup.
    expect(authNavLink({ nickname: "" }).href).toBe("/login");
  });
});

describe("adminNavLinks", () => {
  it("covers every admin section, in order", () => {
    // Top-ups joined in Phase 2: reconciling a wallet payment is a routine
    // admin job, and a section reachable only by typing the URL is a section
    // nobody uses.
    expect(adminNavLinks()).toEqual([
      { href: "/admin/games", label: strings.admin.navGames },
      { href: "/admin/players", label: strings.admin.navPlayers },
      { href: "/admin/topups", label: strings.admin.navTopups },
      { href: "/admin/stats", label: strings.admin.navStats },
    ]);
  });

  it("keeps every section under /admin, so the layout gate covers all of them", () => {
    for (const link of adminNavLinks()) {
      expect(link.href.startsWith("/admin/")).toBe(true);
    }
  });
});

describe("signedOutNavLinks", () => {
  it("offers Log in and Sign up as two distinct doors", () => {
    const links = signedOutNavLinks({ nickname: null });
    expect(links.map((l) => l.href)).toEqual(["/login", "/signup"]);
    expect(links[0].label).toBe(strings.nav.logIn);
    expect(links[1].label).toBe(strings.auth.signUp);
  });

  it("offers neither to someone who already has an account", () => {
    // Signup is not a thing you offer a person holding an account, and
    // authNavLink already carries them to their profile.
    expect(signedOutNavLinks({ nickname: "Runner" })).toEqual([]);
  });

  it("treats a session without a nickname as signed out", () => {
    // A verified account with no player row yet is mid-signup, not a player.
    expect(signedOutNavLinks({ nickname: null })).toHaveLength(2);
  });
});
