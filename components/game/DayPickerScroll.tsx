"use client";

import { useEffect, useRef } from "react";

/**
 * Scrolls the selected day tab into view.
 *
 * WHY THIS EXISTS AS A SEPARATE CLIENT COMPONENT. The strip itself is server
 * -rendered links, deliberately: the selection is shareable, the back button
 * is correct, and the page costs no JavaScript on the anonymous path someone
 * reaches from a WhatsApp link. Turning it into a client component to fix a
 * scroll position would trade all of that away.
 *
 * THE BUG IT FIXES IS REAL AND WAS FOUND ON A STRIP. Each tab is a link, so
 * tapping one navigates — and the horizontal scroll of the strip resets to the
 * start on the new render. Tap a day far enough to the right and the page
 * comes back with the day you chose selected and off-screen, which reads as
 * the tap not having worked. With one day-tab visible per ~90px and a week of
 * football on the strip, that is not an edge case.
 *
 * PROGRESSIVE ENHANCEMENT, not a dependency. With JavaScript off the strip
 * still filters correctly and the selected tab is simply where it is; nothing
 * here is required for the control to work.
 *
 * `block: "nearest"` keeps the page's VERTICAL scroll where it is — the
 * default `"start"` would jump the list under the reader's thumb, which is a
 * worse bug than the one being fixed.
 */
export function DayPickerScroll({ selected }: { selected: string | null }) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !selected) return;
    done.current = true;

    const tab = document.querySelector<HTMLElement>(`[data-day="${CSS.escape(selected)}"]`);
    tab?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);

  return null;
}
