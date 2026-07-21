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
 * and has nothing to show in a header slot that renders a nickname. Sending
 * them to /login is correct — it forwards them on to /signup.
 */
export function authNavLink(session: { nickname: string | null }): NavLink {
  if (session.nickname) {
    return { href: "/account", label: session.nickname };
  }
  return { href: "/login", label: strings.nav.logIn };
}
