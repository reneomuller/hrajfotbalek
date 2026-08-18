import { cancellationReassurance } from "@/lib/booking/reassurance";
import { policy } from "@/lib/policy";
import { getStrings } from "@/lib/i18n/server";

/**
 * The six FAQ entries (§6, REQ-HOME-007), one of the three community panels.
 *
 * `<details>`/`<summary>` rather than a JavaScript accordion: it opens with no
 * client bundle, it is keyboard-accessible and screen-reader-correct for free,
 * and — the part that matters on this page — a browser find-in-page still
 * matches text inside a closed `<details>` and opens it. A div-and-state
 * accordion has none of those properties and would be the only interactive
 * component on an otherwise static landing page.
 *
 * The copy is a HUMAN DELIVERABLE in all three languages (§6, F8), already
 * supplied — nothing here generates it, and the completeness test walks every
 * key.
 *
 * ONE ANSWER IS NOT COPY: the cancellation window. It read "Cancel anytime
 * before kickoff", which is TRUE under policy v1 and is a hardcoded statement
 * of a rule that lives in `lib/policy.ts` — so a v2 policy with a cutoff would
 * move `cancel_booking`, move the booking screen's reassurance line, and leave
 * this FAQ entry quietly promising something the RPC now refuses. Stage 5
 * requires the window to come from the policy, and it does: the same helper
 * the booking flow uses, so the two sentences cannot disagree.
 */
/**
 * Which FAQ entry states the cancellation window.
 *
 * An INDEX rather than a match on the question text, because the question is
 * translated and matching English would silently stop applying in Czech and
 * Russian — leaving those two languages with the hardcoded answer this exists
 * to remove. The i18n overlays replace `items` wholesale and in order (there
 * is a unit test asserting exactly that), so the position is stable across
 * languages in a way the wording is not.
 */
const CANCELLATION_ITEM = 3;

export async function FaqPanel() {
  const t = await getStrings();

  /*
   * The cancellation answer, rebuilt from the policy rather than read from the
   * table. Everything else in `faq.items` is human copy and is used verbatim.
   */
  const items = t.faq.items.map((item, index) =>
    index === CANCELLATION_ITEM
      ? { q: item.q, a: cancellationReassurance(policy.cancellation.refundCutoffHoursBeforeStart, t) }
      : item,
  );

  return (
    <div
      data-testid="faq-panel"
      className="w-full rounded-[20px] border border-hairline-volt bg-surface p-[22px]"
    >
      <h3 className="m-0 mb-3 font-display text-community-title text-white">
        {t.faq.title}
      </h3>

      {/*
        THREE AND THREE, above `md` (Section 2, item 10). `columns-2` rather
        than a grid: a CSS column flow keeps the six in READING ORDER down the
        first column and then the second, which a two-track grid would break
        into 1-2 / 3-4 / 5-6 across the rows. `break-inside-avoid` stops an
        open dropdown being split across the fold between columns.
      */}
      <ul className="m-0 list-none p-0 md:columns-2 md:gap-8">
        {items.map((item) => (
          <li
            key={item.q}
            className="break-inside-avoid border-b border-hairline last:border-b-0"
          >
            <details className="group">
              <summary className="cursor-pointer list-none py-[10px] text-[13px] font-bold text-bone marker:content-none">
                <span className="mr-2 text-volt group-open:hidden">+</span>
                <span className="mr-2 hidden text-volt group-open:inline">−</span>
                {item.q}
              </summary>
              <p className="m-0 pb-[10px] pl-5 text-[13px] leading-relaxed text-muted">
                {item.a}
              </p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
