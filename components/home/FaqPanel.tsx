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
 */
export async function FaqPanel() {
  const t = await getStrings();

  return (
    <div
      data-testid="faq-panel"
      className="flex min-w-[270px] flex-1 flex-col rounded-[20px] border border-hairline-volt-soft bg-surface-card-strong p-[22px]"
    >
      <h3 className="m-0 mb-3 font-display text-community-title uppercase text-white">
        {t.faq.title}
      </h3>

      <ul className="m-0 flex list-none flex-col gap-px p-0">
        {t.faq.items.map((item) => (
          <li key={item.q} className="border-b border-hairline last:border-b-0">
            <details className="group">
              <summary className="cursor-pointer list-none py-[10px] text-[13px] font-bold text-bone marker:content-none">
                <span className="mr-2 text-volt group-open:hidden">+</span>
                <span className="mr-2 hidden text-volt group-open:inline">−</span>
                {item.q}
              </summary>
              <p className="m-0 pb-[10px] pl-5 text-[13px] leading-relaxed text-muted-dim">
                {item.a}
              </p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
