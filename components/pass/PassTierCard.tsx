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
 * The 1-game tier renders "the standard price" rather than a saving of 0 CZK.
 * It is deliberately not a discount and is listed so the discount on the
 * others is legible — printing "Save 0 CZK" would make it look like a broken
 * offer instead of the reference point it is.
 */
export async function PassTierCard({
  tier,
  signedIn,
}: {
  tier: PassTier;
  signedIn: boolean;
}) {
  const t = await getStrings();

  const heading =
    tier.games === 1
      ? t.pass.tierOneGame
      : t.pass.tierGames.replace("{count}", String(tier.games));

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
      className="rounded-card border border-hairline-volt bg-surface-panel p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 font-condensed text-[20px] font-bold uppercase tracking-wide text-white">
          {heading}
        </h2>
        <span
          data-testid="pass-tier-price"
          className="font-display text-[26px] leading-none text-volt"
        >
          {formatCzk(tier.priceCzk)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-muted">
        <span>{t.pass.tierPerGame.replace("{amount}", formatCzk(tier.perGameCzk))}</span>
        <span data-testid="pass-tier-credited">
          {t.pass.tierCredited.replace("{amount}", formatCzk(tier.creditedCzk))}
        </span>
      </div>

      <p
        data-testid="pass-tier-saving"
        className={`mt-2 font-mono text-[12px] ${
          tier.savingCzk > 0 ? "text-volt" : "text-faint"
        }`}
      >
        {tier.savingCzk > 0
          ? t.pass.tierSaving.replace("{amount}", formatCzk(tier.savingCzk))
          : t.pass.tierNoSaving}
      </p>

      {/* LOUD, and above the button. */}
      <p
        data-testid="pass-tier-expiry"
        className="mt-3 rounded-control border border-hairline-strong px-3 py-2 font-mono text-[11px] uppercase tracking-[1px] text-bone"
      >
        {expiry}
      </p>

      <div className="mt-4">
        <BuyPassButton games={tier.games} label={t.pass.tierBuy} signedIn={signedIn} />
      </div>
    </article>
  );
}
