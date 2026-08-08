import { BuyPassButton } from "@/components/pass/BuyPassButton";
import { formatCzk } from "@/lib/format";
import type { PassTier } from "@/lib/pass/queries";
import { getStrings } from "@/lib/i18n/server";

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

  const heading = t.pass.tierGames.replace("{count}", String(tier.games));

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
      className="rounded-card border border-hairline-volt bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-[20px] font-bold uppercase tracking-wide text-white">
          {heading}
        </h2>
        <span
          data-testid="pass-tier-price"
          className="font-display text-[26px] leading-none text-volt"
        >
          {formatCzk(tier.priceCzk)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        <span>{t.pass.tierPerGame.replace("{amount}", formatCzk(tier.perGameCzk))}</span>
        <span data-testid="pass-tier-credited">
          {t.pass.tierCredited.replace("{amount}", formatCzk(tier.creditedCzk))}
        </span>
      </div>

      <p data-testid="pass-tier-saving" className="mt-2 text-[12px] text-volt">
        {t.pass.tierSaving.replace("{amount}", formatCzk(tier.savingCzk))}
      </p>

      {/* LOUD, and above the button. */}
      <p
        data-testid="pass-tier-expiry"
        className="mt-3 rounded-control border border-hairline-strong px-3 py-2 text-[11px] uppercase tracking-[1px] text-bone"
      >
        {expiry}
      </p>

      <div className="mt-4">
        <BuyPassButton games={tier.games} label={t.pass.tierBuy} signedIn={signedIn} />
      </div>
    </article>
  );
}
