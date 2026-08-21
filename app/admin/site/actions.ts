"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * The two site settings (§6, REQ-HOME-004).
 *
 * `supabase.rpc()` on the ADMIN'S OWN session client, not the service-role
 * one: `set_site_setting` accepts `is_admin_caller() OR is_service_role()`, so
 * a service-role call would satisfy the check no matter which human triggered
 * the route — leaving "knowing the URL" as the only real gate. Same rule as
 * every other admin action in this codebase.
 *
 * `requireAdmin()` runs here rather than being inherited from the admin
 * layout: a server action is a POST endpoint and can be invoked without ever
 * rendering a page under that layout.
 */

export interface SiteSettingState {
  status: "idle" | "saved" | "error";
  message?: string;
}

export async function setActivePlayersAction(
  _prev: SiteSettingState,
  formData: FormData,
): Promise<SiteSettingState> {
  return setNumberSetting("active_players", formData.get("activePlayers"));
}

export async function setGamesPerWeekAction(
  _prev: SiteSettingState,
  formData: FormData,
): Promise<SiteSettingState> {
  return setNumberSetting("games_per_week", formData.get("gamesPerWeek"));
}

/**
 * The shared body of the two numeric settings.
 *
 * ONE FUNCTION, because they are one rule: a whole number, not negative,
 * written through the RPC and revalidating the home page. Two copies of it is
 * how `games_per_week` ends up accepting a decimal a year from now because only
 * `active_players` was fixed — the same reasoning that put both keys in one
 * validation branch inside `set_site_setting`.
 *
 * The RPC validates independently and is the actual enforcement. This check
 * exists so the admin is told in the form rather than by a Postgres error
 * string, which is a different job.
 */
async function setNumberSetting(
  key: "active_players" | "games_per_week",
  raw: FormDataEntryValue | null,
): Promise<SiteSettingState> {
  await requireAdmin();

  const text = String(raw ?? "").trim();
  const value = Number(text);
  if (!text || !Number.isInteger(value) || value < 0) {
    return { status: "error", message: toAdminErrorMessage("SETTING_VALUE_INVALID") };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_site_setting", { p_key: key, p_value: value });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  // Both numbers render on the home page's stats panel, from these values.
  revalidatePath("/");
  revalidatePath("/admin/site");
  return { status: "saved" };
}

export async function setPlayerOfMonthAction(
  _prev: SiteSettingState,
  formData: FormData,
): Promise<SiteSettingState> {
  await requireAdmin();

  const playerId = String(formData.get("playerId") ?? "").trim();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_site_setting", {
    p_key: "player_of_month",
    // An empty selection CLEARS the pick, which is a real thing an admin does
    // between months — the RPC accepts a JSON null for exactly that.
    p_value: playerId === "" ? null : playerId,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath("/");
  revalidatePath("/admin/site");
  return { status: "saved" };
}


/**
 * The contact lists the footer's dialog shows (round 13, item 18).
 *
 * ONE TEXTAREA PER LIST, one entry per line. Not a repeating field set with
 * add/remove buttons: the owner edits this twice a year, the values are short,
 * and a textarea is the control that needs no explanation and no JavaScript.
 *
 * EMPTY IS A VALID PHONE LIST and means "show no phone". It is not a valid
 * EMAIL list — `getContactDetails` falls back to the built-in address rather
 * than rendering a contact dialog with no way to make contact — but the RPC
 * accepts an empty array for both, because a store should not encode a
 * rendering preference.
 */
export async function setContactAction(
  _prev: SiteSettingState,
  formData: FormData,
): Promise<SiteSettingState> {
  await requireAdmin();

  const emails = toLines(formData.get("contactEmails"));
  const phones = toLines(formData.get("contactPhones"));

  const supabase = await createServerSupabaseClient();

  for (const [key, value] of [
    ["contact_emails", emails],
    ["contact_phones", phones],
  ] as const) {
    const { error } = await supabase.rpc("set_site_setting", {
      p_key: key,
      p_value: value,
    });
    if (error) {
      return { status: "error", message: toAdminErrorMessage(error.message) };
    }
  }

  // Every page renders the footer, so the whole site is stale after this.
  revalidatePath("/", "layout");

  return { status: "saved" };
}

/**
 * A textarea into a list of trimmed, non-empty lines.
 *
 * The blank-line filter is what makes a trailing newline harmless — and a
 * trailing newline is what a textarea produces when somebody presses enter
 * before saving, which is most of the time.
 */
function toLines(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
