import { strings, type Strings } from "@/lib/strings";
import { cs } from "@/lib/i18n/cs";
import { ru } from "@/lib/i18n/ru";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

/**
 * Merging a translation overlay onto the English table.
 *
 * THE OVERLAY IS PARTIAL BY DESIGN. Czech and Russian supply the player-facing
 * keys and nothing else — the admin section, the email templates and the
 * privacy copy stay English, and they stay English by simply not appearing in
 * the overlay rather than by being duplicated three times. A key that has no
 * translation resolves to English, so adding a new string to `lib/strings.ts`
 * can never produce a blank screen or a raw key name in Czech; it produces
 * English until someone translates it. That is the right failure.
 *
 * MONEY IS NOT TRANSLATED. Amounts stay CZK, the QR stays a Czech SPD payment
 * string, and the variable symbol stays a variable symbol — in all three
 * languages. That is not an oversight: the player is going to open a Czech
 * banking app, and the words on this screen have to match the words on that
 * one. A "reference number" in an English UI that appears as "VS" in the bank
 * is a payment that arrives unmatched. The payment keys are therefore
 * translated *around* the Czech terms, never away from them.
 */

/**
 * A recursively-optional view of the string table.
 *
 * Every key optional, at every depth, so an overlay says only what it
 * translates — but the KEYS are still checked, so a typo in a translation is a
 * compile error rather than a string that silently never appears. The literal
 * types are widened to `string`: the English table is `as const`, and a
 * translation is by definition not the same literal.
 *
 * Array ELEMENTS are `Required`, because arrays are replaced wholesale rather
 * than merged (see `merge` below) — a half-specified element would drop the
 * fields it left out instead of inheriting them.
 */
type Translated<T> = T extends string
  ? string
  : T extends readonly (infer E)[]
    ? readonly Required<Translated<E>>[]
    : T extends object
      ? { [K in keyof T]?: Translated<T[K]> }
      : T;

export type StringsOverlay = Translated<Strings>;

type Plain = Record<string, unknown>;

function isPlainObject(value: unknown): value is Plain {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep merge, overlay wins.
 *
 * Arrays are replaced wholesale rather than merged element-wise: the only
 * arrays in the table are ordered copy blocks (the landing steps, the privacy
 * outline), and half-translating one by index would produce a list that
 * changes language halfway down.
 */
function merge(base: Plain, overlay: Plain): Plain {
  const out: Plain = { ...base };

  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] =
      isPlainObject(current) && isPlainObject(value) ? merge(current, value) : value;
  }

  return out;
}

const OVERLAYS: Record<Locale, StringsOverlay | null> = {
  en: null,
  cs,
  ru,
};

/**
 * Resolved once per language, not once per request.
 *
 * The tables are immutable and the merge is pure, so the result is cached at
 * module scope. Re-merging a few hundred keys on every render of every page
 * would be a real cost on a server-rendered product with no page caching.
 */
const cache = new Map<Locale, Strings>();

export function resolveStrings(locale: Locale = DEFAULT_LOCALE): Strings {
  const overlay = OVERLAYS[locale];
  if (!overlay) return strings;

  const cached = cache.get(locale);
  if (cached) return cached;

  const resolved = merge(strings as unknown as Plain, overlay as Plain) as unknown as Strings;
  cache.set(locale, resolved);
  return resolved;
}
