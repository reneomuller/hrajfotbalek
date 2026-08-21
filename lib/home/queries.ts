import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/clients";
import { pragueDayKey } from "@/lib/games/days";
import { pitchHours } from "@/lib/home/pitchHours";

/**
 * The home page's content reads (§6).
 *
 * EVERYTHING HERE RUNS FOR A SIGNED-OUT VISITOR, which is the constraint that
 * shapes it: the stats strip and the Player of the Month panel render on the
 * landing page, and the landing page is what a shared WhatsApp link opens for
 * someone with no account. So every read below has to be anon-legal, and each
 * one has an explicit grant behind it (`site_settings` in migration 30,
 * `games` and `players` since migration 1).
 *
 * A MISSING GRANT WOULD RETURN EMPTY RATHER THAN ERRORING, which on this
 * surface reads as "no content yet" rather than "cannot read" — so the SQL
 * suite asserts the grant by reading as `anon`, and these functions treat an
 * absent value as absent rather than trying to distinguish the two.
 */

export interface HomeContent {
  /**
   * Admin-editable community size. Null when never set.
   *
   * ONE PLACE ON THE PAGE, and one only: the stats panel. It briefly lived in
   * the community heading as well, and the same number in two places invites
   * the reader to check whether they agree — a job the page should not be
   * handing out. v1.2 §6 moved it out of the heading and gave it a peer.
   */
  activePlayers: number | null;
  /**
   * Admin-editable games-per-week claim. Null when never set.
   *
   * A CLAIM, NOT A MEASUREMENT (migration 37). This was computed from published
   * games in the trailing seven days until v1.2, which answered a different
   * question: "7+ games every week" is a promise about what a visitor will
   * find, and a trailing count is a report on the fortnight just gone. A quiet
   * August would have advertised "2 games every week" to every shared link.
   */
  gamesPerWeek: number | null;
  /** The admin's pick, or null. */
  playerOfMonth: {
    nickname: string;
    photoPath: string | null;
    /** Hours on the pitch this calendar month, from attended games. */
    pitchHours: number;
  } | null;
}

interface SettingsShape {
  active_players?: unknown;
  games_per_week?: unknown;
  player_of_month?: unknown;
}

export async function getHomeContent(): Promise<HomeContent> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("site_settings")
    .select("settings")
    .eq("id", "singleton")
    .maybeSingle();

  const settings = (data?.settings ?? {}) as SettingsShape;

  const playerOfMonthId =
    typeof settings.player_of_month === "string" ? settings.player_of_month : null;

  return {
    activePlayers: wholeNumber(settings.active_players),
    gamesPerWeek: wholeNumber(settings.games_per_week),
    playerOfMonth: playerOfMonthId ? await getPlayerCard(playerOfMonthId) : null,
  };
}

/**
 * A jsonb value as a whole number, or null.
 *
 * GUARDED RATHER THAN CAST. The column is jsonb and `set_site_setting`
 * validates on the way in, but this is a public page reached from a shared
 * WhatsApp link: a value that somehow is not a number has to render as absent,
 * never as `NaN` or `[object Object]`. Shared by both numeric settings for the
 * same reason the RPC validates them in one branch — two copies of this rule is
 * how one of them ends up printing a decimal.
 */
function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

/**
 * The nickname and photo for the Player of the Month.
 *
 * READS `players` DIRECTLY, and that is only legal because of what it selects.
 * `players` grants `anon` nothing, so this returns null for a signed-out
 * visitor — which would leave the panel empty on exactly the page it is meant
 * to render on.
 *
 * So it goes through the service-role client, and the projection is the whole
 * safety argument: nickname and photo path, both of which are already public
 * on every roster this player appears on (§4a). No email, no phone, no id
 * beyond the one the caller already supplied.
 */
async function getPlayerCard(
  playerId: string,
): Promise<{ nickname: string; photoPath: string | null; pitchHours: number } | null> {
  const service = createServiceRoleSupabaseClient();

  const { data, error } = await service
    .from("players")
    .select("nickname, photo_path")
    .eq("id", playerId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    nickname: data.nickname,
    photoPath: data.photo_path,
    pitchHours: await getPitchHours(service, playerId),
  };
}

/**
 * Hours the Player of the Month spent on a pitch THIS CALENDAR MONTH.
 *
 * NO SCHEMA CHANGE, and that is worth stating because the obvious reading of
 * "add a stat" is a new column. Everything needed is already recorded:
 * `bookings.attendance` is written by `mark_attendance`, and
 * `games.duration_minutes` is the same value every other surface resolves.
 *
 * `present` ONLY. A `no_show` is a booking, not an hour, and counting it would
 * make the stat a measure of intent — the same error the games-played counter
 * on the roster deliberately avoids by counting played rather than booked.
 *
 * THE MONTH IS PRAGUE'S, matching every other date in this product: a game at
 * 00:30 on the 1st belongs to the month the players would name it in. The
 * boundary is computed from the Prague day key rather than from the host
 * clock, for the reason `lib/games/days.ts` gives at length — a boundary in
 * the server's zone looks right locally and renders wrong on Vercel.
 *
 * Read through the service role, like the card above it: `players` and
 * `bookings` grant `anon` nothing, and this renders on the page a signed-out
 * visitor reaches from a shared link.
 */
async function getPitchHours(
  service: ReturnType<typeof createServiceRoleSupabaseClient>,
  playerId: string,
): Promise<number> {
  const monthStart = `${pragueDayKey(new Date()).slice(0, 7)}-01T00:00:00Z`;

  /*
   * TWO QUERIES, NOT AN EMBED. The generated types carry no declared relation
   * between `bookings` and `games`, so a PostgREST embed does not type-check
   * and would be a cast over a shape the client cannot verify. Two plain reads
   * are honest, and the first is narrow enough that the second is a short
   * `in` list.
   */
  const { data: attended, error: bookingsError } = await service
    .from("bookings")
    .select("game_id")
    .eq("player_id", playerId)
    .eq("attendance", "present");

  if (bookingsError || !attended || attended.length === 0) return 0;

  const { data: games, error: gamesError } = await service
    .from("games")
    .select("duration_minutes")
    .in(
      "id",
      attended.map((booking) => booking.game_id),
    )
    .gte("starts_at", monthStart);

  if (gamesError || !games) return 0;

  return pitchHours(games.map((game) => game.duration_minutes));
}



/**
 * The contact details the footer's dialog shows (round 13, item 18).
 *
 * READ SEPARATELY FROM `getHomeContent`, because the footer is on every page
 * and the home content is on one. Same singleton row and the same
 * `site_settings` grant — Supabase dedupes neither, so this is one extra
 * round trip on pages that render both, which is the price of not making
 * every page load the player-of-the-month card.
 *
 * GUARDED RATHER THAN CAST, for the reason `wholeNumber` is: this renders to
 * every visitor, and a value that somehow is not an array of strings has to
 * become "no contact listed", never `[object Object]` in a `mailto:`.
 */
export interface ContactDetails {
  emails: string[];
  phones: string[];
}

export async function getContactDetails(fallbackEmail: string): Promise<ContactDetails> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("site_settings")
    .select("settings")
    .eq("id", "singleton")
    .maybeSingle();

  const settings = (data?.settings ?? {}) as {
    contact_emails?: unknown;
    contact_phones?: unknown;
  };

  const emails = stringList(settings.contact_emails);
  return {
    // NEVER AN EMPTY EMAIL LIST. A contact dialog with no way to make contact
    // is worse than the `mailto:` it replaced, so the built-in address stands
    // in until the owner sets one.
    emails: emails.length > 0 ? emails : [fallbackEmail],
    phones: stringList(settings.contact_phones),
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}
