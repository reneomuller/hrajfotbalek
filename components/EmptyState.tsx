import Link from "next/link";
import { strings } from "@/lib/strings";

/**
 * The one empty-state shape (v1.3 §2.9, ruling P), used wherever a list has
 * nothing in it: the games list at zero, home's upcoming section at zero, My
 * Games at zero, the wallet at zero balance, the game detail's lineup at zero.
 *
 * Every empty state in this product has the same job: say what is true, say
 * what happens next, and give one way out. "Never a bare centred sentence" is
 * §2.9's phrasing and it is the failure this replaced — grey one-liners
 * ("You have no bookings yet.") on the two surfaces a new player sees first.
 *
 * WHAT V1.3 CHANGED HERE, and both are ruling B:
 *
 *   - THE TITLE IS SENTENCE CASE. It was uppercase italic at `card-title`,
 *     which is one of the tracked-capital headings ruling B removes from the
 *     product. `body-lg`/bone, per §2.9.
 *   - THE ACTION IS A BUTTON, not an 11px tracked-caps link. §2.9 asks for
 *     "one primary action where an action exists", and a primary action that
 *     is drawn as a footnote is not one. It is also the only element here that
 *     a thumb has to hit, so it gets a 44px target (§2.0).
 *
 * `cta` may be an internal route or an external URL — the WhatsApp group is a
 * legitimate destination from an empty games list, and it is not a Next route,
 * so both are supported rather than forcing the caller to branch.
 */
/** §2.5's primary button, at the 44px target floor (§2.0). */
const CTA =
  "mt-6 inline-flex min-h-11 items-center justify-center rounded-control bg-volt px-5 text-body-lg font-semibold text-ink no-underline transition-colors hover:bg-volt-dim";

export function EmptyState({
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const isExternal = ctaHref?.startsWith("http") ?? false;

  return (
    <div className="rounded-card bg-surface px-6 py-10 text-center">
      {/* The mark, quiet. Volt at this size reads as a wink, not an error. */}
      <p className="m-0 text-[34px] font-extrabold italic leading-none tracking-[-1px] text-volt-dim opacity-40">
        {strings.brand.monogramLead}
        {strings.brand.monogramAccent}
      </p>

      <h2 className="mt-5 mb-0 text-body-lg font-semibold text-bone">{title}</h2>

      <p className="mx-auto mt-2 mb-0 max-w-sm text-body text-muted">{body}</p>

      {ctaLabel && ctaHref ? (
        isExternal ? (
          <a
            href={ctaHref}
            target="_blank"
            rel="noreferrer"
            data-testid="empty-state-cta"
            className={CTA}
          >
            {ctaLabel}
          </a>
        ) : (
          <Link href={ctaHref} data-testid="empty-state-cta" className={CTA}>
            {ctaLabel}
          </Link>
        )
      ) : null}
    </div>
  );
}
