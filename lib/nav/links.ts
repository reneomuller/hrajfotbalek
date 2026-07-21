import { strings } from "@/lib/strings";

/**
 * Navigation link resolution.
 *
 * Kept as pure functions rather than inline JSX so the auth-aware branch is
 * unit-testable without a DOM. Nothing here is access control: hiding a link
 * hides nothing, since anyone can type the URL. Routes are gated server-side in
 * `lib/auth/session.ts` and every write is authorized inside its RPC.
 */

export interface NavLink {
  href: string;
  label: string;
}

/** Links shown to everyone, signed in or not. */
export function primaryNavLinks(): NavLink[] {
  return [{ href: "/games", label: strings.nav.games }];
}

/**
 * The auth-aware slot at the end of the header.
 *
 * Keyed on the nickname rather than on "has a session": a user who has clicked
 * a magic link but not yet chosen a nickname has a session and no player row,
 * so they are not a player yet. Sending them to /login is correct — it forwards
 * them on to /signup.
 *
 * The label is fixed copy, not the nickname: a nickname is variable-width free
 * text, and fixed chrome is the wrong place for it.
 */
export function authNavLink(session: { nickname: string | null }): NavLink {
  if (session.nickname) {
    return { href: "/account", label: strings.nav.profile };
  }
  return { href: "/login", label: strings.nav.logIn };
}
