"use client";

import { useState } from "react";
import { CountryFlag } from "@/components/flags/CountryFlag";

export interface PhoneCountryChoice {
  code: string;
  name: string;
  /** The emoji flag — only inside the native list, where nothing else renders. */
  flag: string;
  /** "+420". */
  dial: string;
}

/**
 * A phone number as a country code and the number (round 41, owner: "country
 * code prefix at signup through dropdown flag selection with the prefix next
 * to it").
 *
 * THE CLOSED CONTROL IS DRAWN, THE OPEN ONE IS NATIVE. The visible part is the
 * flag (an SVG — an emoji flag is two letters on Windows) and the calling code;
 * a transparent native `<select>` lies exactly over it, so a tap opens the
 * platform's own picker with its own search, and the screen reader meets a
 * real labelled combobox. Same reasoning as the country `<select>` above it on
 * the signup form: nobody reimplements a listbox correctly.
 *
 * TWO FIELDS ARE SUBMITTED, `phone_country` and `phone`. The server joins them
 * into one international number (`withComposedPhone`), so a number typed WITH
 * its prefix still works and nothing that reads `players.phone` changes.
 */
export function PhoneField({
  options,
  defaultCountry,
  defaultNumber,
  countryLabel,
  inputId,
  required = false,
  minLength,
  maxLength,
  inputClassName,
}: {
  options: PhoneCountryChoice[];
  defaultCountry: string;
  defaultNumber: string;
  /** The select's accessible name — it has no visible label of its own. */
  countryLabel: string;
  inputId?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  inputClassName: string;
}) {
  const [country, setCountry] = useState(defaultCountry);
  const selected = options.find((option) => option.code === country) ?? options[0];

  return (
    <div className="flex gap-2">
      <div
        data-testid="phone-country"
        data-country={selected?.code ?? ""}
        className="relative flex shrink-0 items-center gap-2 rounded-control border border-hairline-strong bg-surface pl-3 pr-8 text-base text-bone transition-colors focus-within:border-volt"
      >
        <CountryFlag code={selected?.code} size="profile" />
        <span data-testid="phone-dial" className="tabular-nums">
          {selected?.dial ?? ""}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 10 6"
          width="10"
          height="6"
          className="pointer-events-none absolute right-3 text-muted"
        >
          <path d="M0 0h10L5 6z" fill="currentColor" />
        </svg>
        <select
          name="phone_country"
          aria-label={countryLabel}
          data-testid="phone-country-select"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        >
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.flag} {option.name} ({option.dial})
            </option>
          ))}
        </select>
      </div>

      <input
        id={inputId}
        type="tel"
        name="phone"
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        autoComplete="tel-national"
        inputMode="tel"
        defaultValue={defaultNumber}
        className={`${inputClassName} min-w-0 flex-1`}
      />
    </div>
  );
}
