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
 * ~~ONE ANSWER IS NOT COPY: the cancellation window, rebuilt from the policy
 * so this entry cannot promise something `cancel_booking` refuses. An INDEX
 * (`CANCELLATION_ITEM = 3`) rather than a match on the question text, because
 * the question is translated and matching English would silently stop applying
 * in Czech and Russian.~~
 *
 * REMOVED (round 17, item 4), because it was answering a question nobody had
 * asked since round 13 — and this is the most instructive bug of the round.
 *
 * THE INDEX'S REASONING WAS CORRECT AND IS EXACTLY WHAT BROKE IT. Matching on
 * translated text would have failed in two languages; a positional index is
 * stable across languages and silent across EDITS. Round 13 item 11 cut this
 * list from six entries to four and deleted the cancellation question itself —
 * "it is on the booking screen already, above the button it concerns" — and
 * position 3, which had been "What if I can't make it?", became "Do I need to
 * be good?".
 *
 * SO THE HOME PAGE HAS BEEN SHIPPING THIS SINCE ROUND 13:
 *
 *     Q: Do I need to be good?
 *     A: Cancel up to 8h before kickoff for full wallet credit.
 *
 * AND MY OWN ROUND-16 CHECK READ IT AS CONFIRMATION. The policy-v3
 * contradiction test scanned this panel for the enforced hour count and found
 * one — in the wrong answer. A check that asks "is the number here" cannot
 * tell a right number in the wrong place from a right number in the right one.
 *
 * Every entry is human copy now. The cancellation window is stated where round
 * 13 said it belongs: on the booking screen, above the button it concerns, and
 * in the cancel dialog. `cancellationReassurance` still serves both.
 */

export async function FaqPanel() {
  const t = await getStrings();

  // Every entry is copy — see the note above on why one of them was not.
  const items = t.faq.items;

  return (
    <div
      data-testid="faq-panel"
      // `lifted rounded-card` — the neutral panel edge p01 draws, and the same
      // token the community panel beside it now uses. See CommunityPanel for
      // the sampled values.
      className="lifted w-full rounded-card p-[22px]"
    >
      <h3 className="m-0 mb-3 font-display text-community-title uppercase text-white">
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
