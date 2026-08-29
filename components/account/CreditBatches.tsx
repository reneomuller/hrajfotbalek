import { formatDate } from "@/lib/format";
import { gamesEquivalent, type CreditBatch } from "@/lib/pass/queries";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { creditsLabel } from "@/lib/pass/credits";

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
/*
 * A LIST, NOT A SECTION, SINCE ROUND 23 ITEM 3.
 *
 * ~~`<section className="mt-6">` with a "Your credit" heading of its own.~~ It
 * sat under the Credit balance card and said the same noun again: the card
 * above already carries the eyebrow CREDIT BALANCE and a 40px figure, and then
 * a second heading announced "Your credit" over one chip reading "5 credits
 * remaining · expires 29 Sept". Two headings, one fact, 136px of page.
 *
 * The heading is gone and the list moved INSIDE the balance card, where the
 * expiry is what it always was: a footnote on the number above it, not a
 * section of its own. `t.pass.batchesTitle` is now unused by this component
 * and stays in the string table — it is still the pass page's own heading.
 */
export async function CreditBatches({ batches }: { batches: CreditBatch[] }) {
  const t = await getStrings();
  const locale = await getLocale();

  if (batches.length === 0) return null;

  return (
    <div data-testid="credit-batches">
      <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
        {batches.map((batch) => (
          <li
            key={batch.batchId}
            data-testid="credit-batch"
            className="flex flex-wrap items-baseline justify-between gap-3 rounded-control bg-surface-raised px-3 py-2"
          >
            {/*
              ~~"600 CZK left · expires 20 Oct", with "≈ 4 games" beside it.~~
              CREDITS ONLY (round 14, item 10).

              A crown figure here re-introduced the unit the credits ruling
              removed, on the screen whose job is to say what a credit is — and
              then the chip beside it translated the crowns BACK into games, so
              the row said the same thing twice in two units.
            */}
            <span className="text-small text-bone">
              {t.pass.batchesExpiring
                .replace("{credits}", creditsLabel(gamesEquivalent(batch.remainingCzk), locale, t))
                .replace("{date}", formatDate(batch.expiresAt))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
