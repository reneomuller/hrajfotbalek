import { sortRoster, type RosterAvatar } from "@/lib/games/queries";

/**
 * THE GAME PAGE'S LINEUP ORDER (the owner, 2026-11-12: "Let's have the guest
 * under the user that selected the guest instead, not all at the end").
 *
 * Every named seat in `sortRoster`'s order — signed-up players by name, then
 * the named shadows an admin booked — and straight under each one, the guests
 * they brought, by number. The house guests, who are nobody's, close the list.
 *
 * ONLY THE LIST. The overlapping faces on a game card keep `sortRoster`'s
 * guests-last order, where a row that alternated faces and monograms would
 * read as a rendering fault.
 */
export function lineupOrder(seats: readonly RosterAvatar[]): RosterAvatar[] {
  const sorted = sortRoster([...seats]);
  const hosts = sorted.filter((seat) => seat.nickname !== null);
  const hostNames = new Set(hosts.map((seat) => seat.nickname));

  const guestsOf = new Map<string, RosterAvatar[]>();
  const rest: RosterAvatar[] = [];
  for (const seat of sorted) {
    if (seat.nickname !== null) continue;
    if (seat.guestOf !== null && hostNames.has(seat.guestOf)) {
      const list = guestsOf.get(seat.guestOf) ?? [];
      list.push(seat);
      guestsOf.set(seat.guestOf, list);
    } else {
      rest.push(seat);
    }
  }

  return [
    ...hosts.flatMap((host) => [
      host,
      ...(guestsOf.get(host.nickname ?? "") ?? []).sort((a, b) => (a.guestIndex ?? 0) - (b.guestIndex ?? 0)),
    ]),
    ...rest,
  ];
}
