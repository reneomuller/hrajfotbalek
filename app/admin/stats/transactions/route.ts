import { csvDateStamp, csvResponse, toCsv, type CsvColumn } from "@/lib/admin/csv";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * `/admin/stats/transactions` — the financials page's EXPORT CSV (round 8,
 * item 3).
 *
 * `p19` DRAWS THIS BUTTON AND ROUND 7 OMITTED IT, on the grounds that the
 * columns were a decision nobody had made. They are made now, by the item:
 * date, player, game/pass reference, amount, method, status.
 *
 * IT IS NOT THE ON-SCREEN LIST. The page shows the last eight CREDIT LEDGER
 * movements, because that is the one ordered place a refund, a grant and a
 * redemption sit together. The named columns describe something wider — a
 * "method" of credit/cash/online and a "game/pass reference" are properties of
 * a PAYMENT, not of a ledger row — so this file is the money itself: every
 * booking and every top-up.
 *
 * A ledger-only export would have had an empty method column on every row and
 * would have omitted every cash payment, which is most of them.
 *
 * THE METHOD VOCABULARY IS THE UI'S, NOT THE DATABASE'S. `qr` reads as
 * `online`, because ruling R3 retired QR from the surfaces and the online
 * option books onto exactly that rail — a reconciler comparing this file to
 * what the player saw should read the same word. `credit` and `seed_free` both
 * read `credit`: the second is seeded data and never appears on production.
 *
 * DATES ARE ISO-8601 UTC, per `lib/admin/csv.ts` — a CSV is read by a
 * spreadsheet or a script, and an unambiguous instant beats a friendly one.
 * BOM and formula-escaping come from the same module, so Excel opens it
 * without mojibake and without executing a venue name.
 */
export const dynamic = "force-dynamic";

interface TransactionRow {
  at: string;
  player: string;
  reference: string;
  amountCzk: number;
  method: string;
  status: string;
}

const COLUMNS: CsvColumn<TransactionRow>[] = [
  { header: "date", value: (r) => r.at },
  { header: "player", value: (r) => r.player },
  { header: "reference", value: (r) => r.reference },
  { header: "amount_czk", value: (r) => r.amountCzk },
  { header: "method", value: (r) => r.method },
  { header: "status", value: (r) => r.status },
];

/** The database's payment methods in the vocabulary the product speaks. */
function methodLabel(method: string): string {
  if (method === "qr") return "online";
  if (method === "credit" || method === "seed_free") return "credit";
  return method;
}

export async function GET(): Promise<Response> {
  await requireAdmin();

  const service = createServiceRoleSupabaseClient();

  const [bookingsResult, topupsResult] = await Promise.all([
    service
      .from("bookings")
      .select("id,player_id,game_id,price_czk,credit_applied_czk,payment_method,status,created_at")
      .order("created_at", { ascending: false }),
    service
      .from("credit_topups")
      .select("id,player_id,amount_czk,received_amount_czk,pass_games,status,created_at")
      .order("created_at", { ascending: false }),
  ]);

  const bookings = bookingsResult.data ?? [];
  const topups = topupsResult.data ?? [];

  // Names and fixtures resolved in two queries for the whole file rather than
  // one pair per row — this can be thousands of rows.
  const playerIds = [
    ...new Set([...bookings.map((b) => b.player_id), ...topups.map((t) => t.player_id)]),
  ];
  const gameIds = [...new Set(bookings.map((b) => b.game_id))];

  const [playersResult, gamesResult] = await Promise.all([
    playerIds.length
      ? service.from("players").select("id,nickname").in("id", playerIds)
      : Promise.resolve({ data: [] as { id: string; nickname: string }[] }),
    gameIds.length
      ? service.from("games").select("id,venue,starts_at").in("id", gameIds)
      : Promise.resolve({
          data: [] as { id: string; venue: string; starts_at: string }[],
        }),
  ]);

  const nameById = new Map((playersResult.data ?? []).map((p) => [p.id, p.nickname]));
  const gameById = new Map((gamesResult.data ?? []).map((g) => [g.id, g]));

  const rows: TransactionRow[] = [
    ...bookings.map((b) => {
      const game = gameById.get(b.game_id);
      return {
        at: b.created_at,
        player: nameById.get(b.player_id) ?? "",
        // Venue and kick-off, so a row identifies a fixture rather than a uuid.
        reference: game ? `${game.venue} ${game.starts_at}` : b.game_id,
        /*
         * WHAT MOVED, not what it cost. A booking part-paid from a wallet
         * moved only the remainder in new money; the credit half was paid for
         * in the period the top-up landed and is already a row of its own
         * below. Exporting the full price would double-count every pass.
         */
        amountCzk: Math.max(0, b.price_czk - b.credit_applied_czk),
        method: methodLabel(b.payment_method),
        status: b.status,
      };
    }),
    ...topups.map((t) => ({
      at: t.created_at,
      player: nameById.get(t.player_id) ?? "",
      reference: t.pass_games ? `Pass ${t.pass_games} games` : "Top-up",
      // What the bank actually credited when it has, otherwise what was asked.
      amountCzk: t.received_amount_czk ?? t.amount_czk,
      method: "online",
      status: t.status,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return csvResponse(toCsv(COLUMNS, rows), "transactions", csvDateStamp());
}
