import { BuyPassButton } from "@/components/pass/BuyPassButton";
import { formatCzk } from "@/lib/format";
import { MOST_POPULAR_GAMES, PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/queries";
import type { PassTier } from "@/lib/pass/queries";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { creditsLabel } from "@/lib/pass/credits";

/**
 * One tier, with its per-game price, its saving, and ITS EXPIRY STATED LOUDLY.
 *
 * The expiry sits above the button in its own line rather than in small print
 * beside the price, because §4.2 rules that it is the thing a buyer has to
 * read before deciding: "An expiry discovered after purchase is a complaint;
 * an expiry read before purchase is a choice."
 *
 * EVERY TIER ON THIS PAGE IS A DISCOUNT, as of the 2026-08-02 ruling. The
 * 1-game tier — 150 for 150, no expiry — used to sit at the top as a reference
 * point, and the reference-point argument was wrong in practice: the first card
 * a reader saw was the one that saved them nothing, and the page read as "the
 * pass is not a discount". Tiers now start at five, the row is gone from
 * `pass_tiers` (migration 36), and the reference price is stated once in the
 * "How it works" panel where an explanation belongs.
 *
 * The saving is therefore unconditional here. There is no "standard price"
 * branch to fall back to, because a tier that saves nothing can no longer
 * exist: `pass_tiers_not_a_penalty` already forbade costing more than it
 * credits, and the seed no longer contains one at par.
 */
export async function PassTierCard({
  tier,
  signedIn,
}: {
  tier: PassTier;
  signedIn: boolean;
}) {
  const t = await getStrings();

  // The credits ruling: the tier is counted in credits, and one credit is one
  // game. Same quantity as the games count it replaces, under the noun the
  // wallet and the ledger also use.
  const locale = await getLocale();
  const heading = creditsLabel(tier.games, locale, t);

  /*
   * THE ANCHOR: what these games cost bought one at a time.
   *
   * `games x 150`, from the flat-150 fiat — not `creditedCzk`, which is the
   * wallet value a tier lands and is a different number. Struck through in
   * `danger` beside the price, because a discount nobody can see the original
   * of is not a discount, it is just a price.
   */
  const anchorCzk = tier.games * PASS_REFERENCE_PRICE_CZK;

  /*
   * COMPUTED, NEVER TABULATED. A hardcoded percent list drifts the first time
   * a tier price moves and nothing catches it, because a wrong percentage is
   * still a plausible percentage. One decimal, and a trailing `.0` dropped by
   * `maximumFractionDigits` so 10 % does not render as "10.0 %".
   */
  const discountPercent = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(((anchorCzk - tier.priceCzk) / anchorCzk) * 100);

  /** Ruled onto the 12-credit tier. */
  const mostPopular = tier.games === MOST_POPULAR_GAMES;

  const expiry =
    tier.expiresMonths === null
      ? t.pass.tierNeverExpires
      : tier.expiresMonths === 1
        ? t.pass.tierExpiresOne
        : t.pass.tierExpiresMany.replace("{count}", String(tier.expiresMonths));

  return (
    <article
      data-testid="pass-tier"
      data-games={tier.games}
      data-most-popular={mostPopular ? "true" : "false"}
      className="lifted relative rounded-card p-5"
    >
      {/*
        The tag, on the card's top corner. A volt OUTLINE rather than a fill:
        a filled volt pill here would outrank the per-game price, and the
        hierarchy this card exists to fix is exactly that — one loud thing.

        `lifted` FOR THE FILL, `border-volt` OVER IT. The tag straddles the
        card's top edge, so its fill has to be the card's fill or the half
        sitting on the card reads as a darker notch cut out of it — which is
        what `bg-surface` became the moment item 2 lifted the card to
        `surface-raised`. The utility border wins over the component layer, so
        this keeps its volt edge while taking the shared fill.
      */}
      {mostPopular && (
        <span
          data-testid="pass-tier-popular"
          className="lifted absolute -top-2 right-4 rounded-pill border-volt px-3 py-1 text-small font-semibold text-volt"
        >
          {t.pass.tierMostPopular}
        </span>
      )}

      <h2 className="m-0 text-body-lg font-semibold text-bone">{heading}</h2>

      {/* LOUDEST: what a game costs at this tier. It is the number that
          differs between tiers and the one a reader is comparing. */}
      <p
        data-testid="pass-tier-per-game"
        className="mt-2 mb-0 font-display text-[34px] leading-none text-volt"
      >
        {t.pass.tierPerGame.replace("{amount}", formatCzk(tier.perGameCzk))}
      </p>

      {/* Then the pass price, with the anchor struck beside it at the same
          size, and the discount quiet after both. */}
      <p className="mt-3 mb-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span data-testid="pass-tier-price" className="text-body-lg font-bold text-bone">
          {formatCzk(tier.priceCzk)}
        </span>
        <span
          data-testid="pass-tier-anchor"
          className="text-body-lg text-danger line-through"
        >
          {formatCzk(anchorCzk)}
        </span>
        <span data-testid="pass-tier-discount" className="text-small text-muted">
          {`\u2212${discountPercent}\u202f%`}
        </span>
      </p>

      {/* Then the expiry — still before the button, per §4.2: an expiry
          discovered after purchase is a complaint, read before it is a
          choice. Quieter than it was, because the price hierarchy above now
          carries the card. */}
      <p data-testid="pass-tier-expiry" className="mt-3 mb-0 text-small text-muted">
        {expiry}
      </p>

      {/* Quietest: the control. */}
      <div className="mt-4">
        <BuyPassButton
          games={tier.games}
          label={t.pass.tierPurchase}
          signedIn={signedIn}
          variant="quiet"
        />
      </div>
    </article>
  );
}
