import type { Metadata } from "next";
import { ToastFromQuery } from "@/components/ToastFromQuery";
import { confirmTopupAction } from "./actions";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { formatCzk } from "@/lib/format";
import { ExportCsvLink } from "@/components/admin/ExportCsvLink";
import { getStrings } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Top-ups",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * `/admin/topups` — pending wallet top-ups, sorted by variable symbol.
 *
 * VS-SORTED FOR THE SAME REASON THE BOOKING LIST IS: the admin is reading a
 * bank statement, which is a list of variable symbols. Sorting this screen the
 * same way turns reconciliation into a scan down two columns instead of a
 * search per line.
 *
 * The received-amount field is optional and usually left alone. It exists for
 * the case the bank disagrees with the request — and unlike a booking, there is
 * no under/overpayment rule to apply: whatever arrived is what gets credited.
 */
export default async function AdminTopupsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = searchParams ? await searchParams : {};
  const t = await getStrings();

  const admin = createServiceRoleSupabaseClient();
  const { data: topups } = await admin
    .from("credit_topups")
    .select("id, amount_czk, payment_code, created_at, player_id")
    .eq("status", "pending")
    .order("payment_code", { ascending: true });

  const playerIds = [...new Set((topups ?? []).map((row) => row.player_id))];
  const { data: players } = playerIds.length
    ? await admin.from("players").select("id, nickname").in("id", playerIds)
    : { data: [] };
  const nameById = new Map((players ?? []).map((p) => [p.id, p.nickname]));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
          {t.admin.topupsTitle}
        </h1>
        {/* The page is a worklist of PENDING top-ups; the file is every one of
            them. See the route handler — a CSV is opened to answer a question
            about the past, and one that omitted the confirmed rows would look
            complete and be useless. */}
        <ExportCsvLink href="/admin/topups/export" testId="export-topups" />
      </div>
      <p className="mt-2 text-sm text-white/60">{t.admin.topupsLede}</p>

      {(topups ?? []).length === 0 ? (
        <p className="mt-8 text-sm text-white/50" data-testid="topups-empty">
          {t.admin.topupsEmpty}
        </p>
      ) : (
        <ul className="mt-6 flex list-none flex-col gap-3 p-0">
          {(topups ?? []).map((topup) => (
            <li
              key={topup.id}
              data-testid="pending-topup"
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline-strong p-4"
            >
              <div className="flex flex-col">
                <span className="font-mono text-sm text-volt">{topup.payment_code}</span>
                <span className=" text-base font-bold text-white">
                  {nameById.get(topup.player_id) ?? topup.player_id}
                </span>
                <span className="text-sm text-white/60">{formatCzk(topup.amount_czk)}</span>
              </div>

              <form action={confirmTopupAction} className="flex items-center gap-2">
                <input type="hidden" name="topupId" value={topup.id} />
                <input
                  type="number"
                  name="receivedAmount"
                  placeholder={String(topup.amount_czk)}
                  min={1}
                  data-testid="received-amount"
                  className="w-24 rounded-control border border-hairline-strong bg-transparent px-3 py-2 text-sm outline-none focus:border-volt"
                />
                <button
                  type="submit"
                  data-testid="confirm-topup"
                  className="rounded-control bg-volt px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-surface"
                >
                  {t.admin.topupsConfirm}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {/* Confirmed — the admin is who acted, so the admin is who is told. The
          player learns by receipt email and by their balance. */}
      <ToastFromQuery query={query} />
    </div>
  );
}
