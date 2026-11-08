import { paymentsBetween, totalCzk } from "@/lib/admin/money/payments";
import { readAllPages } from "@/lib/admin/money/readAll";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * REVENUE IS ALL THE MONEY THAT ARRIVED (the owner, 2026-11-08: "revenue
 * should count all the revenue including game pass. would be nice to have it
 * split so both are visible").
 *
 * ~~Game payments only.~~ A Game Pass or a Credit top-up never appeared in the
 * Revenue figure on the day it was paid, and the Credits it bought were then
 * spent on games that — rightly — add nothing, so the pass money appeared
 * NOWHERE. Now, on the day each arrived:
 *
 *   * games — every booking paid by card, QR or cash (`price − credit
 *     applied`: a booking paid from Credits moved no new money), and a card
 *     payment for a game that filled first, which became a Credit but was
 *     money all the same;
 *   * Game Pass — every confirmed pass purchase, at what was received;
 *   * top-ups — every other confirmed Credit purchase.
 *
 * One reader for the dashboard, the money page and its Operations tile, so the
 * three cannot disagree about what revenue is.
 */
export interface RevenueSplit {
  gamesCzk: number;
  passCzk: number;
  topupCzk: number;
}

export interface Revenue extends RevenueSplit {
  totalCzk: number;
  /** Every amount with the moment it arrived — for the week bars. */
  entries: { at: string; czk: number }[];
}

interface Bounds {
  from: string | null;
  to: string | null;
}

async function creditedCheckouts(bounds: Bounds) {
  const service = createServiceRoleSupabaseClient();
  return readAllPages("credited checkouts", (from, to) => {
    let query = service
      .from("checkout_sessions")
      .select("id,amount_czk,settled_at")
      .eq("status", "credited")
      .not("settled_at", "is", null);
    if (bounds.from) query = query.gte("settled_at", bounds.from);
    if (bounds.to) query = query.lt("settled_at", bounds.to);
    return query.order("settled_at").order("id").range(from, to);
  });
}

async function confirmedTopups(bounds: Bounds) {
  const service = createServiceRoleSupabaseClient();
  return readAllPages("confirmed top-ups", (from, to) => {
    let query = service
      .from("credit_topups")
      .select("id,amount_czk,received_amount_czk,pass_games,confirmed_at")
      .eq("status", "confirmed")
      .not("confirmed_at", "is", null);
    if (bounds.from) query = query.gte("confirmed_at", bounds.from);
    if (bounds.to) query = query.lt("confirmed_at", bounds.to);
    return query.order("confirmed_at").order("id").range(from, to);
  });
}

export async function revenueBetween(bounds: Bounds): Promise<Revenue> {
  const [payments, credited, topups] = await Promise.all([
    paymentsBetween(bounds),
    creditedCheckouts(bounds),
    confirmedTopups(bounds),
  ]);

  const entries: Revenue["entries"] = payments.map(({ at, czk }) => ({ at, czk }));
  let gamesCzk = totalCzk(payments);
  for (const row of credited) {
    if (!row.settled_at) continue;
    gamesCzk += row.amount_czk;
    entries.push({ at: row.settled_at, czk: row.amount_czk });
  }

  let passCzk = 0;
  let topupCzk = 0;
  for (const row of topups) {
    if (!row.confirmed_at) continue;
    const czk = row.received_amount_czk ?? row.amount_czk;
    if (row.pass_games !== null) passCzk += czk;
    else topupCzk += czk;
    entries.push({ at: row.confirmed_at, czk });
  }

  return { gamesCzk, passCzk, topupCzk, totalCzk: gamesCzk + passCzk + topupCzk, entries };
}
