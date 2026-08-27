"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { setLocale } from "@/app/locale/actions";
import { useLocale } from "@/components/LocaleProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";

/**
 * The language menu, immediately right of the auth control (§3.1a).
 *
 * WHY IT SITS THERE, AND WHY IT SURVIVES ON A PHONE. Someone who cannot read
 * the page must be able to find its way out without reading anything. That is
 * the whole argument for the flag on the trigger, for each option naming its
 * language in its own alphabet — nobody looks for "Czech", they look for
 * "Čeština" — and for this being one of the three controls the header keeps at
 * every width while the link row disappears below `md`.
 *
 * NOT A NATIVE `<select>`. A select cannot show a flag beside each option on
 * any platform that matters, and its list is drawn by the OS — on a
 * volt-on-black header that means a white system sheet.
 *
 * KEYBOARD-COMPLETE, which is the part v1.3 adds. The previous version opened,
 * closed on Escape and closed on an outside tap, and that is where it stopped:
 * arrow keys did nothing, and Escape left focus stranded on a menu that no
 * longer existed, so the next Tab started from the top of the document. A menu
 * a keyboard cannot walk is a menu a keyboard user cannot use, and this is the
 * control whose entire purpose is being reachable by someone who is stuck.
 *
 *   Enter / Space   open (native to `<button>`)
 *   ArrowDown / Up  move between options, wrapping
 *   Home / End      first / last
 *   Escape          close AND return focus to the trigger
 *   Tab away        close, without stealing the focus move
 *
 * Each choice posts to a server action, because the language is read
 * server-side on the next render; `useTransition` keeps the page interactive
 * while the tree re-renders rather than blanking it.
 */

/** Flags as emoji rather than image assets: no request, and they scale. */
const FLAGS: Record<Locale, string> = {
  en: "🇬🇧",
  cs: "🇨🇿",
  ru: "🇷🇺",
};

export function LanguageSwitcher() {
  const active = useLocale();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<Array<HTMLButtonElement | null>>([]);

  /** Close, and put focus back where the user left it. */
  const closeAndRestore = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  // Opening moves focus onto the CURRENT language rather than the first one:
  // the list is three items, and starting on the active one means the arrow
  // keys move relative to where you are instead of relative to the top.
  useEffect(() => {
    if (!open) return;
    const index = LOCALES.indexOf(active);
    options.current[index === -1 ? 0 : index]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;

    // Captured once, and used for BOTH the subscribe and the unsubscribe.
    // Reading `root.current` again in the cleanup can return a different node
    // — or null, after unmount — and removeEventListener on the wrong node
    // silently does nothing, leaving a listener alive on a menu that no longer
    // exists.
    const node = root.current;
    if (!node) return;

    // `const` arrow functions rather than `function` declarations: a
    // declaration is hoisted above the null guard, so TypeScript will not
    // narrow `node` inside one and reports it as possibly null.
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      // Closing on an outside tap is not polish — a menu that can only be
      // closed by choosing from it is a trap on a phone, where there is no
      // cursor to move away. No focus restore here: the user is already
      // pointing somewhere else.
      if (!node.contains(event.target as Node)) setOpen(false);
    };

    const onFocusOut = (event: FocusEvent) => {
      // Tabbing out closes the menu without hijacking the focus move.
      const next = event.relatedTarget as Node | null;
      if (next && !node.contains(next)) setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    node.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      node.removeEventListener("focusout", onFocusOut);
    };
  }, [open]);

  function choose(locale: Locale) {
    closeAndRestore();
    if (locale === active) return;

    const form = new FormData();
    form.set("locale", locale);
    startTransition(() => {
      void setLocale(form);
    });
  }

  /** Arrow / Home / End / Escape, on the list. */
  function onListKeyDown(event: React.KeyboardEvent, index: number) {
    const last = LOCALES.length - 1;
    let next: number | null = null;

    if (event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestore();
      return;
    }

    if (next !== null) {
      // Without this the page scrolls under the menu while the arrow key is
      // also moving the selection, which reads as the menu jumping.
      event.preventDefault();
      options.current[next]?.focus();
    }
  }

  return (
    <div className="relative" ref={root}>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          // ArrowDown from the closed trigger opens and lands on an option,
          // which is what every other menu on a desktop does.
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        /*
         * The trigger names itself in every language at once. No translated
         * label is right here: the person who needs this control is the one who
         * cannot read the language the page is currently in, so a label in that
         * language is the one label guaranteed not to help.
         */
        aria-label="EN / CZ / RU"
        data-testid="locale-trigger"
        /*
          `min-h-11` — THE 44px FLOOR, IN THE CHROME (audit F15/F6).
          Measured 32.2px on 24-33 pages. The visual size is unchanged;
          only the hit area grows to the floor this product states for
          everything else.
        */
        className="flex min-h-11 items-center gap-1 rounded-pill border border-hairline-strong px-3 py-[6px] text-small text-bone transition hover:border-hairline-volt disabled:opacity-50"
      >
        <span aria-hidden>{FLAGS[active]}</span>
        {LOCALE_LABELS[active].short}
        <span aria-hidden className="text-faint">
          ▾
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="EN / CZ / RU"
          data-testid="locale-menu"
          className="absolute right-0 top-[calc(100%+6px)] z-40 m-0 min-w-[150px] list-none rounded-card bg-surface-raised p-1 shadow-lift"
        >
          {/* EN → CZ → RU, the order the contract names, English first because
              it is the only one all three groups read. */}
          {LOCALES.map((locale, index) => {
            const isActive = locale === active;
            return (
              <li key={locale}>
                <button
                  ref={(node) => {
                    options.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  lang={locale}
                  onClick={() => choose(locale)}
                  onKeyDown={(event) => onListKeyDown(event, index)}
                  data-testid={`locale-${locale}`}
                  className={`flex w-full items-center gap-2 rounded-pill px-2 py-2 text-left text-small transition ${
                    isActive ? "bg-volt/[.12] text-volt" : "text-bone hover:bg-white/[.05]"
                  }`}
                >
                  <span aria-hidden>{FLAGS[locale]}</span>
                  <span>{LOCALE_LABELS[locale].full}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
