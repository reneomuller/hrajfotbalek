import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { isNotificationKind, type NotificationKind } from "@/lib/types/database";

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
  /**
   * The translation handle, when the product wrote this one (round 24, item
   * 2). Null for an admin broadcast, and null on any database that predates
   * `20260901110000_player_notifications` — in both cases `title`/`body` are
   * the message, which is what they have always been.
   */
  kind: NotificationKind | null;
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
    /*
     * `PGRST202` IS "no such function", which is the KNOWN pre-migration
     * state — expected, temporary, and already handled by returning an empty
     * bell. Logging it was wrong twice over: it fires on every render of
     * every page, and in dev Next surfaces a server `console.error` as an
     * overlay, which covered the nav bar and failed `nav-pill.spec.ts` with
     * "tab-home is covered by nextjs-portal". A known condition is not an
     * error channel's business.
     *
     * Everything else still logs. Once the migration is applied the only way
     * to reach this branch is a real fault, and that must be loud.
     */
    if (error.code !== "PGRST202") {
      console.error("my_notifications failed", error.code, error.message);
    }
    return EMPTY_BELL;
  }

  const rows = (data ?? []) as {
    id: string;
    title: string;
    body: string;
    kind?: string | null;
    created_at: string;
    is_read: boolean;
  }[];

  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      /*
       * NARROWED, NOT CAST. A kind this build does not know about — a newer
       * database, or a value someone added to the CHECK without adding the
       * copy — falls back to `title`/`body` rather than rendering a blank
       * notification, which is the failure a cast would produce silently.
       */
      kind: isNotificationKind(row.kind) ? row.kind : null,
      createdAt: row.created_at,
      isRead: row.is_read,
    })),
    unread: rows.filter((row) => !row.is_read).length,
    available: true,
  };
}
