import { strings, type Strings } from "@/lib/strings";

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
export function primaryNavLinks(
  session: { isAdmin?: boolean } = {},
  t: Strings = strings,
): NavLink[] {
  /*
   * DESKTOP CARRIES GAMES AND PASS ONLY (owner iteration, Section 1).
   *
   * `Home` and `Profile` come out because the header already has both, in
   * controls that are more recognisable than a word: the WORDMARK links to
   * `/` and the AVATAR links to `/account`. A logotype that goes home is a
   * convention every site on the web shares, and a face is a better profile
   * target than the word "Profile" — both were verified as real links before
   * the text entries were removed, rather than assumed.
   *
   * THE PILL IS UNCHANGED and still carries Home, Games and Profile. That is
   * not an inconsistency: a phone has no room for a wordmark row, and the
   * pill's four-cell geometry is ruling K's. Above `md` the header is the
   * navigation and it can lean on its own furniture.
   *
   * `Pass` IS STILL ABSENT, per the pass ruling — the games-list panel is its
   * sole entry point.
   */
  const links: NavLink[] = [{ href: "/games", label: t.nav.games }];

  if (session.isAdmin) links.push({ href: "/admin/games", label: t.nav.admin });
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
  // Not localized, and not parameterized: the admin panel is English. See
  // lib/i18n/locales.ts.
  return [
    /*
     * THE ORDER IS `p14`'s, READ OFF THE FRAME (round 10, item 1).
     *
     * The frame shows Games, Players, Top-ups, Financials, then a fifth chip
     * clipped at the right edge whose left border is VOLT where the other four
     * are grey — which in this system means CURRENT, and `p14` IS the
     * dashboard. So Dashboard is FIFTH, not first.
     *
     * Round 8 put it first on the reasoning that a landing page comes first.
     * That reasoning is fine and it is not what the frame does: on `/admin`
     * the current chip sits at the right edge, half out of view, exactly as
     * drawn. `Home page` follows it — the frame has no room to show a sixth,
     * and it is the one section that has to live somewhere.
     */
    { href: "/admin/games", label: strings.admin.navGames },
    { href: "/admin/players", label: strings.admin.navPlayers },
    /*
     * ~~Top-ups.~~ REMOVED (round 13, item 8). Its whole job was matching a
     * bank transfer to a `credit_topups` row by variable symbol, and there are
     * no bank transfers any more: a pass is paid by card and confirmed by the
     * Stripe webhook. Payments that cannot be settled automatically surface on
     * the DASHBOARD instead, which is where an exception belongs — a section
     * that is empty on every ordinary day is a section nobody opens.
     */
    { href: "/admin/stats", label: strings.admin.navStats },
    // Venues joined in round 13 item 24, after Financials so p14's four
    // leading chips keep the order the frame draws.
    { href: "/admin/venues", label: strings.admin.venuesTitle },
    { href: "/admin", label: strings.admin.navDashboard },
    { href: "/admin/site", label: strings.admin.navSite },
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
export function authNavLink(
  session: { nickname: string | null },
  t: Strings = strings,
): NavLink {
  if (session.nickname) {
    return { href: "/account", label: t.nav.profile };
  }
  return { href: "/login", label: t.nav.logIn };
}

/**
 * The signed-out pair: Log in AND Sign up, as two distinct entries.
 *
 * Contract §3.1 opens with this, and it is a real requirement rather than a
 * layout note. Until Phase 2 there was one door, because there was one flow —
 * an email address got you in whether or not you had been here before. With
 * passwords those are different acts with different outcomes, and a returning
 * player who taps "Sign up" hits "there is already an account with that email"
 * instead of getting in.
 *
 * Returns an empty list for a signed-in player: `authNavLink()` already carries
 * them to their profile, and offering signup to someone holding an account is
 * the same confusion in the other direction.
 */
export function signedOutNavLinks(
  session: { nickname: string | null },
  t: Strings = strings,
): NavLink[] {
  if (session.nickname) return [];
  return [
    { href: "/login", label: t.nav.logIn },
    { href: "/signup", label: t.auth.signUp },
  ];
}
