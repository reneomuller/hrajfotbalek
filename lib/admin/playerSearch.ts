import type { AdminPlayerRow } from "@/lib/admin/queries";

/**
 * Filters the player list by a free-text query.
 *
 * A PURE FUNCTION OVER THE LIST ALREADY LOADED, not a new query. `listPlayers`
 * fetches every player with their ledger and booking counts in three round
 * trips and folds them together; adding a `?q=` to that would mean either a
 * fourth round trip or pushing the filter into SQL and losing the folded
 * counts. At this roster's size — hundreds, not millions — filtering the array
 * costs nothing measurable and keeps the search testable without a database.
 *
 * WHEN THAT STOPS BEING TRUE it will be obvious: `listPlayers` itself becomes
 * the slow thing long before this does, because it is already unbounded.
 *
 * MATCHES NICKNAME, EMAIL AND PHONE, which is what an organizer has to hand —
 * a name from the WhatsApp thread, an address from a payment, or a number from
 * a message. Substring rather than prefix, because "guillaume" is as likely to
 * be searched by "gui" as a surname is by its start.
 *
 * CASE- AND DIACRITIC-INSENSITIVE. Czech and Russian names carry diacritics
 * this keyboard may not produce in a hurry: `Řehoř` has to be findable by
 * typing "rehor". `NFD` splits a letter from its accent and the range strip
 * removes the accent, which is the standard trick and needs no table.
 */
export function normaliseForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function filterPlayers<T extends Pick<AdminPlayerRow, "nickname" | "email">>(
  players: T[],
  query: string,
  phoneOf: (player: T) => string | null = () => null,
): T[] {
  const needle = normaliseForSearch(query);
  if (needle === "") return players;

  return players.filter((player) => {
    const haystack = [player.nickname, player.email, phoneOf(player)]
      .filter((part): part is string => typeof part === "string" && part !== "")
      .map(normaliseForSearch)
      .join(" ");
    return haystack.includes(needle);
  });
}
