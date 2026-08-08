import Link from "next/link";
import { strings } from "@/lib/strings";

/**
 * The one empty-state shape, used wherever a list has nothing in it.
 *
 * Every empty state in this product has the same job: say what is true, say
 * what happens next, and give one way out. Before this they were bare grey
 * one-liners ("You have no bookings yet."), which read as a dead end on the
 * two surfaces a new player sees first.
 *
 * `cta` may be an internal route or an external URL — the WhatsApp group is a
 * legitimate destination from an empty games list, and it is not a Next route,
 * so both are supported rather than forcing the caller to branch.
 */
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

      <h2 className="mt-5 mb-0 text-card-title font-bold uppercase italic tracking-wide text-bone">
        {title}
      </h2>

      <p className="mx-auto mt-3 mb-0 max-w-sm text-sm leading-relaxed text-muted">{body}</p>

      {ctaLabel && ctaHref ? (
        isExternal ? (
          <a
            href={ctaHref}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-block text-[11px] uppercase tracking-eyebrow text-volt no-underline"
          >
            {ctaLabel}
          </a>
        ) : (
          <Link
            href={ctaHref}
            className="mt-6 inline-block text-[11px] uppercase tracking-eyebrow text-volt no-underline"
          >
            {ctaLabel}
          </Link>
        )
      ) : null}
    </div>
  );
}
