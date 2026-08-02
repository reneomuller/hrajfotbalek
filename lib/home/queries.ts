import { createServerSupabaseClient } from "@/lib/supabase/clients";

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
  playerOfMonth: { nickname: string; photoPath: string | null } | null;
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
): Promise<{ nickname: string; photoPath: string | null } | null> {
  const { createServiceRoleSupabaseClient } = await import("@/lib/supabase/clients");
  const service = createServiceRoleSupabaseClient();

  const { data, error } = await service
    .from("players")
    .select("nickname, photo_path")
    .eq("id", playerId)
    .maybeSingle();

  if (error || !data) return null;
  return { nickname: data.nickname, photoPath: data.photo_path };
}
