"use client";

import { useTransition } from "react";
import { setLocale } from "@/app/locale/actions";
import { useLocale } from "@/components/LocaleProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/locales";

/**
 * EN · CZ · RU, in the header.
 *
 * Three buttons rather than a `<select>`: with three options a dropdown costs
 * a tap to discover and a tap to choose, and hides the fact that the product
 * speaks the visitor's language at all. Visible is the point — someone who
 * cannot read the page needs to see the way out of it without reading
 * anything.
 *
 * Each button posts the language to a server action, because the language is
 * read server-side on the next render. `useTransition` keeps the page
 * interactive while the tree re-renders instead of blanking it.
 */
export function LanguageSwitcher() {
  const active = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="flex items-center gap-[2px] font-mono text-[10px] tracking-[1px]"
      // The control names itself in every language at once, so no translated
      // label is needed — and none would be right for the person who cannot
      // read the current one.
      aria-label="EN / CZ / RU"
    >
      {LOCALES.map((locale) => {
        const isActive = locale === active;

        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-current={isActive ? "true" : undefined}
            disabled={pending || isActive}
            data-testid={`locale-${locale}`}
            onClick={() => {
              const form = new FormData();
              form.set("locale", locale);
              startTransition(() => {
                void setLocale(form);
              });
            }}
            className={`rounded-chip px-[5px] py-[3px] uppercase transition ${
              isActive
                ? "bg-volt/[.12] text-volt"
                : "text-dim hover:text-bone disabled:opacity-50"
            }`}
          >
            {LOCALE_LABELS[locale].short}
          </button>
        );
      })}
    </div>
  );
}
