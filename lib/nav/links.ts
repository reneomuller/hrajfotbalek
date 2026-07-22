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

/**
 * Links shown in the header.
 *
 * The admin entry is DISPLAY ONLY, on exactly the same footing as every other
 * link here: showing it grants nothing and hiding it protects nothing, because
 * anyone can type `/admin`. What actually stops them is `requireAdmin()` in
 * `app/admin/layout.tsx`, which runs before any nested page reads a row, plus
 * the check inside every admin RPC.
 *
 * It is conditional anyway, for the reason any nav is conditional: a link that
 * bounces the person who clicks it is a broken link. Until now the panel had no
 * door at all and admins reached it by typing the URL from memory.
 */
export function primaryNavLinks(session: { isAdmin?: boolean } = {}): NavLink[] {
  const links: NavLink[] = [{ href: "/games", label: strings.nav.games }];
  if (session.isAdmin) links.push({ href: "/admin/games", label: strings.nav.admin });
  return links;
}

/**
 * The admin section switcher's links.
 *
 * Here rather than inline in the layout so the section list has one definition,
 * and so `AdminNav` — which has to be a client component to read the pathname —
 * does not become the place the sections are decided.
 */
export function adminNavLinks(): NavLink[] {
  return [
    { href: "/admin/games", label: strings.admin.navGames },
    { href: "/admin/players", label: strings.admin.navPlayers },
    { href: "/admin/stats", label: strings.admin.navStats },
  ];
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
