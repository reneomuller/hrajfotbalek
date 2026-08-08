import { formatCzk, formatDate } from "@/lib/format";
import { gamesEquivalent, type CreditBatch } from "@/lib/pass/queries";
import { getStrings } from "@/lib/i18n/server";

/**
 * The wallet, broken into batches (§4.2).
 *
 * "`/account` SHOWS BATCHES — amount, expiry date, and the games-equivalent —
 * rather than one opaque total." The reason is the expiry: a single number
 * cannot tell a player that 750 of their 900 runs out on the 3rd, and that is
 * precisely the thing they need to know in order to use it.
 *
 * NEVER-EXPIRING CREDIT IS NOT LISTED HERE. It has no date to show and no
 * urgency to convey, and it is already the headline balance above. Listing it
 * as a row called "never expires" would put the least interesting fact on the
 * page in the same visual weight as the most.
 *
 * The games-equivalent is approximate and says so with "≈". Per-game pricing
 * varies — that is exactly why the wallet is denominated in CZK — so this is a
 * mental model, not a promise.
 */
export async function CreditBatches({ batches }: { batches: CreditBatch[] }) {
  const t = await getStrings();

  if (batches.length === 0) return null;

  return (
    <section className="mt-6" data-testid="credit-batches">
      <h3 className="m-0 text-[15px] font-bold uppercase tracking-wide text-bone">
        {t.pass.batchesTitle}
      </h3>

      <ul className="mt-3 flex list-none flex-col gap-2 p-0">
        {batches.map((batch) => (
          <li
            key={batch.batchId}
            data-testid="credit-batch"
            className="flex flex-wrap items-baseline justify-between gap-3 rounded-card bg-surface px-4 py-3"
          >
            <span className="text-[13px] text-bone">
              {t.pass.batchesExpiring
                .replace("{amount}", formatCzk(batch.remainingCzk))
                .replace("{date}", formatDate(batch.expiresAt))}
            </span>
            <span className="text-[11px] text-volt-dim">
              {t.pass.equivalence.replace(
                "{count}",
                String(gamesEquivalent(batch.remainingCzk)),
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
