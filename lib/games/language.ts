/**
 * Which pair of languages a game is run in (round 18, items 2, 3 and 8).
 *
 * A PROPERTY OF THE GAME, NOT OF THE READER, and the distinction is the whole
 * reason this is not `lib/i18n`'s `Locale`. The interface is translated into
 * three languages and which one you see is a cookie — a fact about a browser.
 * This says what you will HEAR on the pitch, and it is set by the organizer.
 * Reusing `Locale` would have made a game's language look assignable from a
 * dropdown in the header.
 *
 * TWO VALUES, EACH A PAIR. Nobody runs a game "in Czech": they run one where
 * Czech and English get you by, or one where Ukrainian and Russian do. The
 * pair is the unit the owner asked for and the unit the pill renders.
 *
 * THE FALLBACK IS `en-cs` AND IT IS LOAD-BEARING. `games.language` arrives
 * with round 18's migration; until the owner applies it, every read is
 * `undefined` and every game must still render. `en-cs` is also the column's
 * default and what every existing game has always been, so the fallback and
 * the backfill agree — there is no state where a pre-migration page and a
 * post-migration page disagree about an old game.
 */
export const GAME_LANGUAGES = ["en-cs", "uk-ru"] as const;

export type GameLanguage = (typeof GAME_LANGUAGES)[number];

export const DEFAULT_GAME_LANGUAGE: GameLanguage = "en-cs";

export function isGameLanguage(value: unknown): value is GameLanguage {
  return typeof value === "string" && (GAME_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Read a language off a row that may predate the column.
 *
 * ACCEPTS `unknown` DELIBERATELY. Before the migration the property is absent
 * and TypeScript would let `row.language` type-check as a `GameLanguage` while
 * being `undefined` at run time — the same trap `players.updated_at` set in
 * round 16, solved the same way: make the compiler route every read through a
 * function that cannot return a wrong answer.
 */
export function gameLanguageOf(value: unknown): GameLanguage {
  return isGameLanguage(value) ? value : DEFAULT_GAME_LANGUAGE;
}

/**
 * Which messaging app an organizer of this game is reachable on (item 8).
 *
 * ONE PLACE, because it is a RULE rather than a lookup: an English/Czech game
 * offers WhatsApp, a Ukrainian/Russian one offers Telegram. Spelled out at
 * each render site it would be two `=== "uk-ru"` checks that drift the first
 * time a third pair is added.
 */
export function messagingAppFor(language: GameLanguage): "whatsapp" | "telegram" {
  return language === "uk-ru" ? "telegram" : "whatsapp";
}
