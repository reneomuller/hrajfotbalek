import { csvDateStamp, csvResponse, toCsv, type CsvColumn } from "@/lib/admin/csv";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * `/admin/topups/export` — every top-up, not just the pending ones.
 *
 * THE PAGE SHOWS PENDING; THE EXPORT SHOWS ALL, and that difference is the
 * point rather than an oversight. The page is a worklist — "what do I have to
 * confirm this evening" — so anything already dealt with is noise on it. A CSV
 * is opened to answer a question about the past: what came in, when, at what
 * amount, and whether the amount received matched the amount requested. A file
 * that silently omitted every confirmed row would be useless for exactly that
 * and would look complete.
 *
 * BOTH AMOUNTS ARE EXPORTED. `amount_czk` is what the player was asked for and
 * `received_czk` is what the bank actually credited; for a game pass the second
 * is the one the money rule keys on (§4.2, as clarified 2026-08-02), and a file
 * carrying only the request cannot show a mismatch — which is the single thing
 * anyone opens this file to look for.
 *
 * `pass_games` rides along because a 700 CZK top-up and a 5-game pass at 700
 * are the same amount and very different intents, which is the whole reason
 * that column exists.
 */
export const dynamic = "force-dynamic";

interface TopupExportRow {
  paymentCode: number | null;
  nickname: string;
  status: string;
  amountCzk: number;
  receivedCzk: number | null;
  passGames: number | null;
  createdAt: string;
  confirmedAt: string | null;
  id: string;
}

const COLUMNS: CsvColumn<TopupExportRow>[] = [
  { header: "payment_code", value: (r) => r.paymentCode },
  { header: "nickname", value: (r) => r.nickname },
  { header: "status", value: (r) => r.status },
  { header: "amount_requested_czk", value: (r) => r.amountCzk },
  { header: "amount_received_czk", value: (r) => r.receivedCzk },
  { header: "pass_games", value: (r) => r.passGames },
  { header: "created_at_utc", value: (r) => r.createdAt },
  { header: "confirmed_at_utc", value: (r) => r.confirmedAt },
  { header: "topup_id", value: (r) => r.id },
];

export async function GET() {
  await requireAdmin();

  const service = createServiceRoleSupabaseClient();
  const { data: topups } = await service
    .from("credit_topups")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = topups ?? [];
  const playerIds = [...new Set(rows.map((row) => row.player_id))];
  const { data: players } = playerIds.length
    ? await service.from("players").select("id, nickname").in("id", playerIds)
    : { data: [] };
  const nameById = new Map((players ?? []).map((p) => [p.id, p.nickname]));

  const exportRows: TopupExportRow[] = rows.map((row) => ({
    paymentCode: row.payment_code,
    nickname: nameById.get(row.player_id) ?? "",
    status: row.status,
    amountCzk: row.amount_czk,
    receivedCzk: row.received_amount_czk,
    passGames: row.pass_games,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    id: row.id,
  }));

  return csvResponse(toCsv(COLUMNS, exportRows), "topups", csvDateStamp());
}
