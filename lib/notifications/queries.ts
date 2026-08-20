import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * The bell's data (round 7, item 5).
 *
 * ON THE USER'S OWN SESSION, not the service role. `my_notifications` is
 * SECURITY DEFINER and resolves the caller from `auth.uid()`, so the read
 * receipts it joins are the caller's — handing it an elevated client would
 * make every player's `is_read` resolve against nobody.
 *
 * IT DEGRADES TO EMPTY RATHER THAN THROWING, and that is deliberate for
 * exactly one window: between this code shipping and the migration being
 * applied. PostgREST answers a missing function with a 404, which would
 * otherwise take down the header on every page of the product. An empty bell
 * is wrong; a blank site is worse.
 *
 * That tolerance is NOT permanent cover for a missing table — once the
 * migration is applied the only way to reach it is a real fault, which is why
 * it logs.
 */

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
}

export interface BellState {
  items: NotificationRow[];
  unread: number;
  /** False when the store is not reachable — the bell renders nothing. */
  available: boolean;
}

export const EMPTY_BELL: BellState = { items: [], unread: 0, available: false };

export async function getBellState(limit = 20): Promise<BellState> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("my_notifications", { p_limit: limit });

  if (error) {
    // A missing function is the pre-migration state; anything else is a fault.
    // Both produce an empty bell, and both say so in the log.
    console.error("my_notifications failed", error.message);
    return EMPTY_BELL;
  }

  const rows = (data ?? []) as {
    id: string;
    title: string;
    body: string;
    created_at: string;
    is_read: boolean;
  }[];

  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
      isRead: row.is_read,
    })),
    unread: rows.filter((row) => !row.is_read).length,
    available: true,
  };
}
