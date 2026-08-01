/**
 * Game create/edit — every field round-trips to the database.
 *
 * Run:  node --env-file=.env.local ./node_modules/vitest/vitest.mjs run \
 *         --config vitest.integration.config.ts
 *
 * WHY THIS EXISTS. The M4 gate reported that capacity and price did not
 * persist: whatever the organizer typed, the game came back at its stored
 * values. The cause was not the write path — it was that every game predating
 * the `venues` table carried a null `venue_id`, so the edit form opened with no
 * venue selected and `parseGameForm` rejected the submit before a single RPC
 * ran, while React's post-action form reset put the typed values back to the
 * stored ones. Migration 19 backfills `venue_id`; this proves the write path
 * that was always innocent, and guards the invariant that was not.
 *
 * WHAT IT ACTUALLY EXERCISES. The real `parseGameForm` over `FormData` built
 * exactly as the rendered form submits it, followed by the same RPC sequence,
 * in the same order, that `createGameAction` and `updateGameAction` perform —
 * including capacity going to `set_game_capacity` rather than to
 * `admin_update_game_v2`. Phase 13 moved it onto the v2 pair, which is what
 * the form actually calls — a check pointed at the orphaned v1 functions would
 * be green while the form was broken. What it does NOT exercise is `requireAdmin()` and the
 * session-bound client: those need a browser session, and they are what the
 * human verifies at the gate. Stated plainly so this is not read as covering
 * more than it does.
 *
 * Fixtures are created and removed here, including on failure.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseGameForm } from "@/lib/admin/gameForm";
import { allGameIds } from "./fixtures.ts";
import type { Database } from "@/lib/types/database";

const STAMP = Date.now();

/** Deliberately not one of the form's defaults (capacity 14, price 200). */
const CREATED = {
  venueName: `Check Venue A ${STAMP}`,
  venueImage: "prazacka.jpg",
  venueMapQuery: `Check Venue A ${STAMP}, Praha`,
  startsAtIso: new Date(STAMP + 9 * 24 * 3600_000).toISOString(),
  capacity: "18",
  priceCzk: "333",
  format: "9v9",
  surface: "sand",
  notes: "Gate code 4417, park on the north side.",
  organizerName: "Check Organizer A",
  organizerPhone: "+420 601 000 111",
  durationMinutes: "75",
  subsPerTeam: "3",
};

/** A second set, sharing no value with the first — an edit must move all of it. */
const EDITED = {
  venueName: `Check Venue B ${STAMP}`,
  startsAtIso: new Date(STAMP + 11 * 24 * 3600_000).toISOString(),
  capacity: "22",
  priceCzk: "444",
  format: "11v11",
  surface: "indoor",
  notes: "Moved to the indoor hall — bring flat shoes.",
  organizerName: "Check Organizer B",
  organizerPhone: "+420 601 999 888",
  durationMinutes: "120",
  subsPerTeam: "1",
};

let service: SupabaseClient<Database>;
let gameId: string | null = null;
const venueIds: string[] = [];

/** FormData shaped exactly as `GameForm` submits it. */
function submission(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(() => {
  service = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
});

afterAll(async () => {
  if (gameId) await service.from("games").delete().eq("id", gameId);
  for (const id of venueIds) await service.from("venues").delete().eq("id", id);
});

describe("admin game form", () => {
  it("round-trips every field on create, at no default value", async () => {
    const parsed = parseGameForm(
      submission({
        venueId: "new",
        newVenueName: CREATED.venueName,
        newVenueImage: CREATED.venueImage,
        newVenueMapQuery: CREATED.venueMapQuery,
        startsAtIso: CREATED.startsAtIso,
        capacity: CREATED.capacity,
        priceCzk: CREATED.priceCzk,
        format: CREATED.format,
        surface: CREATED.surface,
        notes: CREATED.notes,
        organizerName: CREATED.organizerName,
        organizerPhone: CREATED.organizerPhone,
        durationMinutes: CREATED.durationMinutes,
        subsPerTeam: CREATED.subsPerTeam,
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const values = parsed.values;

    // --- the RPC sequence createGameAction performs ---------------------------
    expect(values.newVenueName).not.toBeNull();
    const { data: venueId, error: venueError } = await service.rpc("admin_create_venue", {
      p_name: values.newVenueName!,
      p_image_path: values.newVenueImagePath,
      p_map_query: values.newVenueMapQuery,
    });
    expect(venueError).toBeNull();
    venueIds.push(venueId as string);

    const { data: created, error } = await service.rpc("admin_create_game_v2", {
      p_venue_id: venueId as string,
      p_starts_at: values.startsAt,
      p_capacity: values.capacity,
      p_price_czk: values.priceCzk,
      p_organizer_name: values.organizerName,
      p_format: values.format,
      p_surface: values.surface,
      p_notes: values.notes,
      p_organizer_phone: values.organizerPhone,
      p_duration_minutes: values.durationMinutes,
      p_allowed_skill_levels: values.allowedSkillLevels,
      p_subs_per_team: values.subsPerTeam,
    });
    expect(error).toBeNull();
    gameId = created as string;

    const { data: row } = await service.from("games").select("*").eq("id", gameId).single();

    // Every field the form submits, checked against what the database stored.
    expect(row!.venue).toBe(CREATED.venueName);
    expect(row!.venue_id).toBe(venueId);
    expect(Date.parse(row!.starts_at)).toBe(Date.parse(CREATED.startsAtIso));
    expect(row!.capacity).toBe(Number(CREATED.capacity));
    expect(row!.price_czk).toBe(Number(CREATED.priceCzk));
    expect(row!.format).toBe(CREATED.format);
    expect(row!.surface).toBe(CREATED.surface);
    expect(row!.notes).toBe(CREATED.notes);
    expect(row!.duration_minutes).toBe(Number(CREATED.durationMinutes));
    expect(row!.subs_per_team).toBe(Number(CREATED.subsPerTeam));

    // The organizer is written in the same transaction as the game, and the
    // service-role client is the only way to read the table back — no session
    // holds a grant on it (§5.1).
    const { data: contact } = await service
      .from("game_organizer_contacts")
      .select("*")
      .eq("game_id", gameId)
      .single();
    expect(contact!.organizer_name).toBe(CREATED.organizerName);
    expect(contact!.organizer_phone).toBe(CREATED.organizerPhone);

    // Creation never publishes, and the venue keeps the filename-derived path.
    expect(row!.status).toBe("draft");
    const { data: venueRow } = await service
      .from("venues")
      .select("*")
      .eq("id", venueId as string)
      .single();
    expect(venueRow!.image_path).toBe(`/venues/${CREATED.venueImage}`);
    expect(venueRow!.map_query).toBe(CREATED.venueMapQuery);
  });

  it("round-trips every field on edit, moving all of them", async () => {
    expect(gameId).not.toBeNull();

    const parsed = parseGameForm(
      submission({
        gameId: gameId!,
        venueId: "new",
        newVenueName: EDITED.venueName,
        startsAtIso: EDITED.startsAtIso,
        capacity: EDITED.capacity,
        priceCzk: EDITED.priceCzk,
        format: EDITED.format,
        surface: EDITED.surface,
        notes: EDITED.notes,
        organizerName: EDITED.organizerName,
        organizerPhone: EDITED.organizerPhone,
        durationMinutes: EDITED.durationMinutes,
        subsPerTeam: EDITED.subsPerTeam,
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const values = parsed.values;

    // --- the RPC sequence updateGameAction performs ---------------------------
    expect(values.newVenueName).not.toBeNull();
    const { data: venueId, error: venueError } = await service.rpc("admin_create_venue", {
      p_name: values.newVenueName!,
      p_image_path: values.newVenueImagePath,
      p_map_query: values.newVenueMapQuery,
    });
    expect(venueError).toBeNull();
    venueIds.push(venueId as string);

    const { error } = await service.rpc("admin_update_game_v2", {
      p_game_id: gameId!,
      p_venue_id: venueId as string,
      p_starts_at: values.startsAt,
      p_price_czk: values.priceCzk,
      p_organizer_name: values.organizerName,
      p_format: values.format,
      p_surface: values.surface,
      p_notes: values.notes,
      p_organizer_phone: values.organizerPhone,
      p_duration_minutes: values.durationMinutes,
      p_allowed_skill_levels: values.allowedSkillLevels,
      p_subs_per_team: values.subsPerTeam,
    });
    expect(error).toBeNull();

    // Capacity is a separate RPC — it owns the active-bookings floor.
    const { error: capacityError } = await service.rpc("set_game_capacity", {
      p_game_id: gameId!,
      p_capacity: values.capacity,
    });
    expect(capacityError).toBeNull();

    const { data: row } = await service.from("games").select("*").eq("id", gameId!).single();

    expect(row!.venue).toBe(EDITED.venueName);
    expect(row!.venue_id).toBe(venueId);
    expect(Date.parse(row!.starts_at)).toBe(Date.parse(EDITED.startsAtIso));
    expect(row!.capacity).toBe(Number(EDITED.capacity));
    expect(row!.price_czk).toBe(Number(EDITED.priceCzk));
    expect(row!.format).toBe(EDITED.format);
    expect(row!.surface).toBe(EDITED.surface);
    expect(row!.notes).toBe(EDITED.notes);
    expect(row!.duration_minutes).toBe(Number(EDITED.durationMinutes));
    expect(row!.subs_per_team).toBe(Number(EDITED.subsPerTeam));

    const { data: contact } = await service
      .from("game_organizer_contacts")
      .select("*")
      .eq("game_id", gameId!)
      .single();
    expect(contact!.organizer_name).toBe(EDITED.organizerName);
    expect(contact!.organizer_phone).toBe(EDITED.organizerPhone);

    // No value survived from the create — an edit that silently kept one would
    // be the reported bug in miniature.
    expect(row!.capacity).not.toBe(Number(CREATED.capacity));
    expect(row!.price_czk).not.toBe(Number(CREATED.priceCzk));

    // Editing is not a status transition.
    expect(row!.status).toBe("draft");
  });

  /*
   * The regression itself. These are the games the organizer was editing when
   * the gate finding was raised: seeded before `venues` existed, and therefore
   * carrying a null `venue_id` that made the edit form unsavable. Scoped to the
   * fixture ids rather than asserted over the whole table, because the other
   * integration checks create short-lived games of their own and a table-wide
   * assertion would race them.
   */
  it("leaves no seeded game with a null venue_id — the edit form cannot save one", async () => {
    const { data, error } = await service
      .from("games")
      .select("id, venue, venue_id")
      .in("id", allGameIds);

    expect(error).toBeNull();
    if (!data?.length) return; // an unseeded database has nothing to check

    expect(data.filter((game) => game.venue_id === null)).toEqual([]);
  });
});
