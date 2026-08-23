/**
 * The heading above a day's games — one component, both surfaces.
 *
 * WHY IT EXISTS AT ALL (round 16, item 7). Home and `/games` each rendered
 * their own `<h2>`/`<h3>` with a hand-copied class string. Round 14 item 4
 * corrected the games page — from an 11px uppercase eyebrow to the product's
 * section heading — on the reasoning that "a header that only looks like one
 * when it says Today is not a header". Home was not touched, so it kept the
 * eyebrow, and the owner reported the same complaint a second time about the
 * same thing on a different page.
 *
 * That is not a missed edit so much as a missing component: two files
 * expressing one intent in duplicated strings will diverge the first time one
 * of them is corrected. The fix for "it was wrong on the other page too" is
 * that there is no other place for it to be wrong.
 *
 * THE TREATMENT, and it is round 14's ruling unchanged: the section language
 * the rest of the product uses — the same white `body-lg` as "What's included"
 * and "Game information". At 11px with 3px tracking a bare "Sat 22 Aug" reads
 * as a caption on the box beneath it; only the word "Today" was holding the
 * eyebrow version up, and most days do not have one.
 *
 * SENTENCE CASE, NOT CAPS (ruling B). The product has exactly one uppercase
 * style and it is the eyebrow, which is what this stopped being.
 */
export function DayHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 data-testid="day-heading" className="m-0 mb-3 text-body-lg font-semibold text-white">
      {children}
    </h2>
  );
}
