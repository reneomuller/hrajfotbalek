import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { primaryNavLinks } from "@/lib/nav/links";
import { initials } from "@/lib/roster/initials";
import { avatarUrl } from "@/lib/storage/avatar";
import { getStrings } from "@/lib/i18n/server";

/**
 * Site-wide header, rendered once from the root layout.
 *
 * ONE "LOG IN" BUTTON — AND THIS REVERSES v1.1.2'S TWO DOORS (§3.1a, v1.1.4).
 * That ruling put Log in and Sign up in the header as distinct entries, on the
 * reasoning that with passwords they are different acts and a returning player
 * who taps Sign up gets told their email is taken instead of getting in. The
 * reasoning still holds; the header is simply not where it earns its space.
 * The LOGIN PAGE carries the create-account path, which is where someone with
 * no account is already looking. Recorded as a reversal rather than quietly
 * edited, because the earlier argument was sound and someone will make it
 * again.
 *
 * The language dropdown sits immediately right of the login button, for the
 * reason it always has: someone who cannot read the page must be able to find
 * its way out without reading anything.
 *
 * SIGNED IN, THE ACCOUNT ENTRY IS AN AVATAR — the player's photo when they
 * have one, their initials otherwise. Not the word "profile": the photo
 * already exists, and a circle is a smaller and more recognisable target than
 * text on a phone header. It is also fixed-width, which the nickname is not.
 *
 * `nickname`, `photoPath` and `isAdmin` are resolved server-side in the layout
 * and used for DISPLAY only — see the note in `lib/nav/links.ts`. Showing the
 * Admin link grants nothing; `requireAdmin()` in the admin layout is the gate.
 */
export async function SiteHeader({
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
    <header className="fixed inset-x-0 top-0 z-30 border-b border-hairline-chrome bg-ink/[.86] backdrop-blur-md">
      <div className="mx-auto flex max-w-shell items-center justify-between gap-2 px-gutter py-[11px]">
        <Link
          href="/"
          aria-label={nav.home}
          className="flex shrink-0 items-center gap-[10px] no-underline"
        >
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-badge border-[1.5px] border-volt bg-surface font-condensed text-[19px] font-extrabold italic tracking-[-1px]">
            <span className="text-white">{brand.monogramLead}</span>
            <span className="text-volt">{brand.monogramAccent}</span>
          </span>
          <span className="font-condensed text-[16px] font-bold leading-none tracking-wide text-bone">
            {brand.wordmarkLead}{" "}
            <span className="text-volt">{brand.wordmarkAccent}</span>
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-2">
          {primaryNavLinks({ isAdmin }, t).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`nav-${link.href.split("/")[1]}`}
              className="font-condensed text-[13px] font-bold uppercase tracking-wide text-bone no-underline transition hover:text-volt"
            >
              {link.label}
            </Link>
          ))}

          {signedIn ? (
            <Link
              href="/account"
              data-testid="nav-account"
              aria-label={nav.profile}
              title={nickname}
              className="flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border-[1.5px] border-volt bg-surface-avatar font-condensed text-[13px] font-bold text-volt no-underline"
            >
              {photo ? (
                /* A plain <img>, like the roster avatars: a 34px circle from a
                   public bucket does not need the optimizer's allow-list and
                   round trip. `alt` is empty because the link is already
                   labelled by `aria-label`. */
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
              className="rounded-control bg-volt px-[14px] py-2 font-condensed text-[13px] font-extrabold uppercase tracking-wide text-surface no-underline"
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
