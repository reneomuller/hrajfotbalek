import type { Metadata } from "next";
import { PassTierCard } from "@/components/pass/PassTierCard";
import { getSessionUser } from "@/lib/auth/session";
import { listPassTiers } from "@/lib/pass/queries";
import { getStrings } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.pass.title, description: t.pass.lede };
}

export const dynamic = "force-dynamic";

/**
 * `/pass` — the tiers, with the expiry stated before the button (§4.2).
 *
 * A PASS IS DISCOUNTED WALLET CREDIT WITH AN EXPIRY. Not a ticket, not a
 * counter of games. The copy says so and the page shows CZK with a
 * games-equivalent beside it, because unit-credits were rejected for a good
 * reason: per-game pricing already varies, and a "5 games" balance starts
 * owing fractions of a game the moment two games cost differently.
 *
 * THE EXPIRY IS ON EVERY CARD, above the button, in its own line. §4.2 is
 * explicit: "An expiry discovered after purchase is a complaint; an expiry
 * read before purchase is a choice." That is the whole reason this page exists
 * rather than a dropdown on the top-up form.
 *
 * Readable signed out. Someone deciding whether this product is worth an
 * account should be able to see what it costs first; the buy button is what
 * needs a session, and it says so.
 */
export default async function PassPage() {
  const t = await getStrings();
  const [tiers, user] = await Promise.all([listPassTiers(), getSessionUser()]);

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      {/* `page-title`, the step every redesigned page heading uses since
          round 3 — the pass page was still on `section-title`, which clamps to
          24px at phone width and made this the one quiet title in the
          product. */}
      <h1 className="m-0 font-display text-page-title uppercase tracking-wide text-white">
        {t.pass.title}
      </h1>
      <p className="mt-3 max-w-[520px] text-[14px] leading-relaxed text-muted">
        {t.pass.lede}
      </p>

      {/*
        THE EQUIVALENCE, DIRECTLY ABOVE THE TIERS.

        Every figure below counts in credits, and this is the one line that
        makes them legible — without it "5 credits" is a unit the reader has
        to convert, and removing that conversion is the whole reason the
        product counts in credits rather than crowns.
      */}
      <p
        data-testid="credit-equivalence"
        /* A capsule with a `border-2` stroke: the frames give every outlined
           control both, and R11 forbids the sub-pixel widths this page never
           had but its neighbours did. */
        className="mt-6 inline-flex rounded-pill border-2 border-hairline-volt px-4 py-2 text-body-lg font-semibold text-volt"
      >
        {t.pass.creditEqualsGame}
      </p>

      <div className="mt-4 flex flex-col gap-3" data-testid="pass-tiers">
        {tiers.map((tier) => (
          <PassTierCard key={tier.games} tier={tier} signedIn={user !== null} />
        ))}
      </div>

      {/* `.lifted`, like every other panel in the redesign. `rounded-card
          bg-surface` was the pre-round-3 spelling — an edgeless box five points
          of luminance off the page, which is the exact problem `.lifted`
          exists to solve. */}
      <section className="lifted mt-10 rounded-card p-5">
        <h2 className="m-0 font-display text-community-title uppercase text-white">
          {t.pass.howItWorks}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-bone">
          {t.pass.howItWorksBody}
        </p>
        {/*
          ~~The reference price, stated once beneath the body.~~ REMOVED
          (round 13, item 15). Every tier card already shows its own per-game
          figure, so this was the seventh statement of the same arithmetic and
          the only one detached from a price it explained. The box shrinks by
          its height, which is the visible half of the change.
        */}
      </section>
    </main>
  );
}
