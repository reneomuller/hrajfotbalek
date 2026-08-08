"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setLocale } from "@/app/locale/actions";
import { useLocale } from "@/components/LocaleProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";

/**
 * The language dropdown, immediately right of the login button (§3.1a,
 * v1.1.4, REQ-AUTH-019).
 *
 * A DROPDOWN, WHICH REVERSES PHASE 1'S THREE BUTTONS. The earlier reasoning
 * was that three visible buttons cost no tap to discover, and it was sound —
 * but the header now also carries a login button and an account avatar, and
 * three always-visible language chips beside them is what pushed "Log in" onto
 * two lines at Pixel-7 width. A dropdown is one control instead of three.
 *
 * WHAT SURVIVES THE CHANGE is the property that mattered: the trigger shows a
 * FLAG and the current code, so someone who cannot read the page can still see
 * what it is set to and find the way out without reading anything. Each option
 * names its language in its own alphabet, for the same reason — nobody looks
 * for "Czech" in a list, they look for "Čeština".
 *
 * NOT A NATIVE `<select>`. A select cannot show a flag beside each option on
 * any platform that matters, and its options are styled by the OS — on a dark
 * volt-on-black header that means a white system sheet. This is a button and a
 * list, closed on outside click, on Escape, and on choosing.
 *
 * Each choice posts to a server action, because the language is read
 * server-side on the next render; `useTransition` keeps the page interactive
 * while the tree re-renders instead of blanking it.
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

  // Closing on an outside tap and on Escape is not polish — a dropdown that
  // can only be closed by choosing from it is a trap on a phone, where there
  // is no cursor to move away.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(locale: Locale) {
    setOpen(false);
    if (locale === active) return;

    const form = new FormData();
    form.set("locale", locale);
    startTransition(() => {
      void setLocale(form);
    });
  }

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        // The control names itself in every language at once, so no translated
        // label is right for the person who cannot read the current one.
        aria-label="EN / CZ / RU"
        data-testid="locale-trigger"
        className="flex items-center gap-1 rounded-pill border border-hairline-strong px-2 py-[6px] text-[10px] tracking-[1px] text-bone transition hover:border-hairline-volt disabled:opacity-50"
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
          data-testid="locale-menu"
          className="absolute right-0 top-[calc(100%+6px)] z-40 m-0 min-w-[130px] list-none rounded-card border border-hairline-strong bg-surface-overlay p-1"
        >
          {/* EN → CZ → RU, the order the contract names. */}
          {LOCALES.map((locale) => {
            const isActive = locale === active;
            return (
              <li key={locale}>
                <button
                  type="button"
                  role="option"aria-selected={isActive} lang={locale} onClick={() => choose(locale)} data-testid={`locale-${locale}`} className={`flex w-full items-center gap-2 rounded-pill px-2 py-2 text-left text-[11px] tracking-[1px] transition ${ isActive ?"bg-volt/[.12] text-volt" : "text-bone hover:bg-white/[.05]"
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
