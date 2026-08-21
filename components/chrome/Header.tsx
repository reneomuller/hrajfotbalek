import Link from "next/link";
import { LanguageSwitcher } from "@/components/chrome/LanguageSwitcher";
import { primaryNavLinks } from "@/lib/nav/links";
import { initials } from "@/lib/roster/initials";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { BellState } from "@/lib/notifications/queries";
import { avatarUrl } from "@/lib/storage/avatar";
import { getStrings } from "@/lib/i18n/server";

/**
 * The site header, rendered once from the root layout, on every route.
 *
 * THREE THINGS AT EVERY WIDTH: the MARK (round 12: the mark alone, no
 * wordmark text beside it), the auth control and the language
 * switcher. The LINK ROW is the only part that is width-dependent, appearing at
 * and above `md` where the floating nav pill is not rendered. Below `md` the
 * pill carries navigation at thumb height, and two controls saying "Games" on
 * one screen is one of them being ignored.
 *
 * The language switcher in particular cannot move to the pill: someone who
 * cannot read the page must be able to find its way out without reading
 * anything, and burying that behind a nav toggle strands exactly the reader it
 * exists for (§3.1a).
 *
 * ONE "SIGN IN", WHICH REVERSED v1.1.2'S TWO DOORS. That ruling put Log in and
 * Sign up in the header as distinct entries, on the reasoning that with
 * passwords they are different acts and a returning player who taps Sign up
 * gets told their email is taken instead of getting in. The reasoning still
 * holds; the header is simply not where it earns its space. The LOGIN PAGE
 * carries the create-account path, which is where someone with no account is
 * already looking.
 *
 * SIGNED IN, THE ACCOUNT ENTRY IS AN AVATAR — the player's photo when they have
 * one, their initials otherwise. Not the word "profile": the photo already
 * exists, a circle is a smaller and more recognisable target than text on a
 * phone header, and it is fixed-width, which a nickname is not.
 *
 * RULING B applies here more than anywhere. The header was the densest
 * uppercase in the product — nav links, the sign-in button, the wordmark — and
 * `eyebrow` is now the only uppercase style. ~~The wordmark keeps its capitals
 * because it is a wordmark rather than a label:~~ the header's wordmark is
 * gone entirely (round 12, item 2a); the note survives because HRAJ FOTBAL is
 * written, not a heading that happens to be shouted.
 *
 * `nickname`, `photoPath` and `isAdmin` are resolved server-side in the layout
 * and used for DISPLAY only. Showing the Admin link grants nothing;
 * `requireAdmin()` in the admin layout is the gate.
 */

/**
 * The `data-testid` for a header nav link.
 *
 * Was `nav-${href.split("/")[1]}`, which breaks in two ways now that the row
 * carries the pill's four: `/` yields an empty slug (`nav-`), and `/account`
 * collides with the avatar control beside it, which already owns
 * `nav-account` — a collision Playwright reports as a strict-mode violation
 * rather than as a missing element, so it reads like a broken test.
 */
function navTestId(href: string): string {
  if (href === "/") return "nav-home";
  if (href === "/account") return "nav-profile";
  return `nav-${href.split("/")[1]}`;
}

export async function Header({
  bell,
  nickname,
  isAdmin,
  photoPath = null,
  photoVersion = null,
}: {
  nickname: string | null;
  isAdmin: boolean;
  /** The bell's rows and unread count — see lib/notifications/queries.ts. */
  bell: BellState;
  /** `players.photo_path` for the signed-in player, when they have one. */
  photoPath?: string | null;
  /**
   * A value that changes when the photo does, appended to bust the CDN cache.
   * The object key is derived from the player id and never changes, so without
   * this a re-upload shows the old face and reads as a failed upload.
   */
  photoVersion?: string | null;
}) {
  const t = await getStrings();
  const { nav } = t;
  const signedIn = nickname !== null;
  const photo = avatarUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    photoPath,
    photoVersion,
  );

  return (
    <header
      data-testid="site-header"
      className="fixed inset-x-0 top-0 z-30 border-b border-hairline bg-ink/[.86] backdrop-blur-md"
    >
      {/*
        A THREE-PART GRID ABOVE `md`, so the link row is centred IN THE BAR
        rather than in the space left over between the wordmark and the
        controls (owner iteration, Section 1).

        `justify-between` on a flex row centres nothing: the middle child sits
        wherever the two outer children leave it, and the outer children here
        are different widths — a wordmark on one side, an avatar and a
        language menu on the other. `grid-cols-[1fr_auto_1fr]` gives the
        middle a column of its own with equal gutters, which is what "centred"
        means. Below `md` the row is hidden, so the grid collapses to the same
        two-child flex it always was.
      */}
      <div className="mx-auto flex max-w-shell items-center justify-between gap-2 px-gutter py-[11px] md:grid md:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          aria-label={nav.home}
          className="flex shrink-0 items-center gap-[10px] no-underline"
        >
          {/*
            THE MARK — the owner's artwork, not a monogram assembled from type.

            WHAT IT REPLACES, and why the replacement is a simplification
            rather than a swap. This was two spans in an italic weight inside a
            volt-ringed circle, plus two optical corrections: a `pr-[2px]` to
            cancel the italic's lean, and a `tracking-[-1px]` scoped to the
            first letter so the second did not carry a phantom advance on its
            right. Both were real — measured in the browser, where the glyph
            boxes read as dead centre while the ink did not — and both were
            fixing a problem that only existed because the mark was being
            SIMULATED. A drawn mark has its own optical centre baked in.

            `public/brand/hf-logo-96.png`, generated by
            `scripts/generate-icons.mjs` from the 512px master alongside the
            favicon and the PWA icons, so the tab, the home screen and this
            header cannot drift apart.

            A PLAIN `<img>`, like the roster avatars: a 38px mark from our own
            `public/` needs neither the optimizer's round trip nor its
            allow-list. 96px of source for a 38px box is 2.5x, which is what
            keeps it crisp on a phone.

            `rounded-full` CROPS THE CORNERS. The master has no alpha — the
            roundel sits on baked-in black — and while black on `ink/[.86]` is
            nearly invisible, "nearly" is a square edge that catches the light
            on an OLED screen at exactly the angle a phone is held.

            `alt=""`: the link is already labelled by `aria-label`, which is
            now the ONLY thing naming it — ~~the wordmark beside it says the
            name in text~~ (round 12). Losing that label would leave a screen
            reader announcing an unnamed link to `/`.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/hf-logo-96.png"
            alt=""
            width={38}
            height={38}
            data-testid="brand-mark"
            className="h-[38px] w-[38px] shrink-0 rounded-full"
          />
          {/*
            ~~THE WORDMARK ECHOES THE HERO, scaled for the header.~~
            THE MARK STANDS ALONE (round 12, item 2a).

            The header set `HRAJ FOTBAL.` in the display face beside the
            monogram, so site identity was stated twice in one 38px row — a
            roundel that already says the name, and the name.

            IT MOVED RATHER THAN LEFT. Round 3 took the wordmark out of the
            hero on the reasoning that the header carried it eighty pixels
            above; round 12 reverses which half survives. The hero's first
            line is `HRAJ FOTBAL.` in every language now, at display scale
            where a brand line is worth its space — and with that there, the
            header repeating it is the duplication round 3 was complaining
            about, pointing the other way.

            The `aria-label` on this link is untouched and is what names it.
          */}
        </Link>

        {/*
          ~~THE `ADMIN` BADGE, exactly as p14/p17/p18/p19 draw it: a
          volt-outlined pill immediately right of the wordmark, on admin
          sessions only.~~ REMOVED (round 13, item 22).

          The frames draw it because in the frames the admin panel and the
          player site share one chrome. They do not here: `/admin` carries its
          own chip row, its own page titles and its own everything, so the
          badge told an admin what mode they were in on the pages where they
          were NOT in it — and said nothing at all on the pages where they
          were, because the panel's own furniture already does.

          What it cost, on every player-facing page an admin ever looks at, was
          a volt pill in the header competing with the one control up there
          that matters. The door into the panel is unchanged: the `md:` link
          row and the Profile tab's entry, which is the two-tap path the admin
          spec asserts.
        */}

        {/*
          THE MIDDLE COLUMN. Lifted out of the right-hand `<nav>` so it can
          occupy a grid track of its own — nested inside that flex row it
          could only ever be centred within the controls, which is not the
          bar.

          Its own `<nav>` with a name, because it is now a landmark separate
          from the auth controls beside it rather than a span inside them.
        */}
        <nav
          aria-label={nav.primary}
          className="hidden items-center justify-center gap-8 md:flex"
        >
          {/*
            LARGER AND WIDER (owner iteration): `body-lg` rather than 13px,
            `tracking-wide`, and a real gap. These are the only text links in
            the bar now, so they can afford the room — at one or two items a
            tight setting reads as a leftover rather than a navigation.
          */}
          {primaryNavLinks({ isAdmin }, t).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-testid={navTestId(link.href)}
              className="text-body-lg font-semibold tracking-wide text-bone no-underline transition-colors hover:text-volt"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/*
          `justify-end` so the controls sit at the END of their track. In the
          three-column grid this is a `1fr` column, not a shrink-wrapped flex
          child — without it the controls sit at its START, which pulls them
          leftward against the centred links and makes the middle column look
          right-aligned even though it is not.
        */}
        <nav className="flex shrink-0 items-center justify-end gap-2">
          {/*
            THE BELL, LEFT OF THE AVATAR (p10, p12, p14, p16 — every signed-in
            frame draws it there). Rendered only for a signed-in player, and
            the component itself renders nothing when the store is unreachable,
            so an unmigrated deployment shows the header it always had.
          */}
          {signedIn && (
            <NotificationBell
              items={bell.items}
              unread={bell.unread}
              available={bell.available}
            />
          )}
          {signedIn ? (
            <Link
              href="/account"
              data-testid="nav-account"
              /*
               * The accessible name, which the avatar has no text to supply.
               * A photo with an empty alt and no label is an unlabelled link,
               * and axe reports it as one.
               */
              aria-label={nav.profile}
              title={nickname}
              /* 38px, matching the brand mark at the other end of the bar — the frames
                 draw the two circles the same size, and at 34 the avatar read as
                 a smaller class of object than the logo rather than its pair. */
              className="flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-full border-[1.5px] border-volt bg-surface-avatar text-small font-bold text-volt no-underline"
            >
              {photo ? (
                /* A plain <img>, like the roster avatars: a 34px circle from a
                   public bucket does not need the optimizer's allow-list and
                   round trip. `alt` is empty because the link is already
                   labelled by `aria-label`, and a second name would make a
                   screen reader announce the control twice. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt=""
                  data-testid="nav-account-photo"
                  className="h-full w-full object-cover"
                />
              ) : (
                initials(nickname, t)
              )}
            </Link>
          ) : (
            <Link
              href="/login"
              data-testid="nav-login"
              className="rounded-control bg-volt px-[14px] py-2 text-body font-bold text-surface no-underline"
            >
              {nav.logIn}
            </Link>
          )}

          {/* Immediately right of the auth control, per §3.1a. */}
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
