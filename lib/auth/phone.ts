import {
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";
import { COUNTRY_CODES, isKnownCountry, type CountryOption } from "@/lib/auth/countries";

/**
 * THE PHONE NUMBER, AS A COUNTRY AND A NATIONAL PART (round 41).
 *
 * The owner asked for "country code prefix at signup through dropdown flag
 * selection with the prefix next to it". The form now has two controls — a
 * country (shown as its flag and calling code) and the number as the player
 * would dial it at home — and what is STORED is still one string, now always in
 * international form, so every reader of `players.phone` is unchanged.
 *
 * SERVER-ONLY BY USE, not by marker: `libphonenumber-js` carries metadata worth
 * keeping out of the browser, so only server actions and server components
 * import this file. The client gets plain `{ code, name, flag, dial }` rows.
 *
 * WHY A LIBRARY. A calling-code table is 197 rows to type and get one wrong,
 * and the trunk prefix (the UK's leading 0, which an international number
 * drops) differs by country. `libphonenumber-js` is Google's metadata, and it
 * covers every country the signup list offers — a unit test says so.
 */

/** Prague: the number most players will type is Czech. */
export const DEFAULT_PHONE_COUNTRY = "CZ";

export interface PhoneCountryOption extends CountryOption {
  /** "+420" — the prefix the control shows beside the flag. */
  dial: string;
}

export function dialCode(country: string | null | undefined): string | null {
  if (!isKnownCountry(country)) return null;
  try {
    return `+${getCountryCallingCode(country!.toUpperCase() as CountryCode)}`;
  } catch {
    return null;
  }
}

/** The country list with each calling code, in the order it was given. */
export function phoneCountryOptions(countries: CountryOption[]): PhoneCountryOption[] {
  return countries.flatMap((country) => {
    const dial = dialCode(country.code);
    return dial ? [{ ...country, dial }] : [];
  });
}

/**
 * One international number from a country and what the player typed.
 *
 * A number typed in full (`+…` or `00…`) wins over the dropdown: somebody who
 * pastes their number with its prefix should not get a second one. An empty
 * entry stays empty, so the required-field check downstream still fires.
 */
export function composePhone(country: string | null | undefined, typed: string): string {
  const raw = typed.trim();
  if (raw === "") return "";

  const international = raw.startsWith("+") || raw.startsWith("00");
  if (international) {
    const plus = `+${raw.replace(/^00/, "").replace(/\D/g, "")}`;
    return parsePhoneNumberFromString(plus)?.number ?? plus;
  }

  const dial = dialCode(country);
  if (!dial) return raw;

  const parsed = parsePhoneNumberFromString(raw, country!.toUpperCase() as CountryCode);
  return parsed?.number ?? `${dial}${raw.replace(/\D/g, "").replace(/^0/, "")}`;
}

/**
 * A stored number back into the two controls, for editing.
 *
 * Numbers stored before round 41 are free text ("777 123 456"); those come
 * back whole under the fallback country rather than being guessed at.
 */
export function splitPhone(
  stored: string | null | undefined,
  fallbackCountry: string,
): { country: string; national: string } {
  const value = stored?.trim() ?? "";
  if (value === "") return { country: fallbackCountry, national: "" };

  const parsed = value.startsWith("+") ? parsePhoneNumberFromString(value) : undefined;
  if (!parsed) return { country: fallbackCountry, national: value };

  return {
    country: offeredCountry(parsed.country, `+${parsed.countryCallingCode}`, fallbackCountry),
    national: String(parsed.nationalNumber),
  };
}

/**
 * Which country of the dropdown a parsed number belongs under.
 *
 * The library's own answer when the list offers it. Otherwise — a calling code
 * several places share, like +44 (Guernsey, Jersey, the Isle of Man) or +1 —
 * the fallback if it shares the code, else the first listed country that does.
 */
function offeredCountry(
  parsedCountry: string | undefined,
  dial: string,
  fallbackCountry: string,
): string {
  if (parsedCountry && isKnownCountry(parsedCountry)) return parsedCountry;
  if (dialCode(fallbackCountry) === dial) return fallbackCountry;
  return SHARED_CODE_HOME[dial] ?? COUNTRY_CODES.find((code) => dialCode(code) === dial) ?? fallbackCountry;
}

/** Where a shared calling code is at home, for the codes the list shares. */
const SHARED_CODE_HOME: Record<string, string> = {
  "+1": "US",
  "+7": "RU",
  "+39": "IT",
  "+44": "GB",
};

/**
 * A copy of a submitted form whose `phone` is the composed number.
 *
 * A COPY: the original still holds what the player typed, which is what an
 * error path echoes back into the controls. A form with no `phone_country`
 * (an older page, a script) passes through as it was.
 */
export function withComposedPhone(form: FormData): FormData {
  const copy = new FormData();
  for (const [key, value] of form.entries()) copy.append(key, value);

  const country = form.get("phone_country");
  const typed = form.get("phone");
  if (typeof country !== "string" || typeof typed !== "string") return copy;

  copy.set("phone", composePhone(country, typed));
  return copy;
}

/** A stored number for reading — grouped as its country writes it. */
export function formatPhone(stored: string | null | undefined): string | null {
  const value = stored?.trim() ?? "";
  if (value === "") return null;
  const parsed = value.startsWith("+") ? parsePhoneNumberFromString(value) : undefined;
  return parsed ? parsed.formatInternational() : value;
}
