import Link from "next/link";
import { LanguageSwitcher } from "@/components/chrome/LanguageSwitcher";
import { primaryNavLinks } from "@/lib/nav/links";
import { initials } from "@/lib/roster/initials";
import { avatarUrl } from "@/lib/storage/avatar";
import { getStrings } from "@/lib/i18n/server";

/**
 * The site header, rendered once from the root layout, on every route.
 *
 * THREE THINGS AT EVERY WIDTH: the wordmark, the auth control and the language
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
 * `eyebrow` is now the only uppercase style. The wordmark keeps its capitals
 * because it is a wordmark rather than a label: HRAJ FOTBAL is how the brand is
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
  nickname,
  isAdmin,
  photoPath = null,
  photoVersion = null,
}: {
  nickname: string | null;
  isAdmin: boolean;
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
  const { brand, nav } = t;
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
      <div className="mx-auto flex max-w-shell items-center justify-between gap-2 px-gutter py-[11px]">
        <Link
          href="/"
          aria-label={nav.home}
          className="flex shrink-0 items-center gap-[10px] no-underline"
        >
          {/*
            THE MONOGRAM, OPTICALLY CENTRED RATHER THAN GEOMETRICALLY.

            Measured in the browser, the glyph boxes were already dead centre
            in the circle — offset 0.0 on both axes. The mark still read as
            sitting right of centre, and both causes are things a bounding box
            cannot see:

              - THE ITALIC LEANS. The ink at the cap line sits right of the ink
                at the baseline, so a slanted pair of letters centred by its
                box reads as pushed right.
              - `tracking-[-1px]` APPLIES AFTER THE LAST GLYPH TOO. Letter
                spacing is an advance, not a gap, so the `F` carries a
                phantom -1px on its right and the ink is not where the box
                says it is.

            `pr-[2px]` shifts the inline content left by half its value inside
            a centred flex box, which cancels the lean; scoping the tracking to
            the first letter removes the trailing advance rather than
            compensating for it twice. Both are optical corrections and are
            commented as such, so nobody "fixes" them back to symmetric values
            and reintroduces a lean the numbers will keep calling centred.
          */}
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-pill border-[1.5px] border-volt bg-surface pr-[2px] text-[19px] font-extrabold italic leading-none">
            <span className="tracking-[-1px] text-white">{brand.monogramLead}</span>
            <span className="text-volt">{brand.monogramAccent}</span>
          </span>
          {/*
            THE WORDMARK ECHOES THE HERO, scaled for the header.

            The hero sets `HRAJ FOTBAL.` in the display face, uppercase, both
            words in white with the FULL STOP carrying the volt. The header set
            it in the body face at 16px with `FOTBAL` itself in volt — a
            different logotype for the same brand, on two surfaces a reader
            sees within one scroll of each other.

            So: `font-display`, uppercase, one line, and the accent moves off
            the second word and onto the period, which is what makes the hero
            version read as a mark rather than as two-tone text.

            `leading-none` because Anton carries a tall default line box that
            would otherwise push the 38px monogram out of alignment beside it.

            The brand is unchanged inside the football namespace — the rebrand
            renames the site, not the brand within it.
          */}
          <span className="font-display text-[20px] uppercase leading-none tracking-wide text-white">
            {brand.wordmarkLead} {brand.wordmarkAccent}
            <span className="text-volt">.</span>
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-2">
          {/*
            The link row, and ONLY the link row, is width-dependent. Sentence
            case per ruling B — these were tracked capitals, which is now the
            eyebrow style's exclusive job.
          */}
          <span className="hidden items-center gap-3 md:flex">
            {primaryNavLinks({ isAdmin }, t).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-testid={navTestId(link.href)}
                className="text-body font-semibold text-bone no-underline transition hover:text-volt"
              >
                {link.label}
              </Link>
            ))}
          </span>

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
              className="flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border-[1.5px] border-volt bg-surface-avatar text-small font-bold text-volt no-underline"
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
