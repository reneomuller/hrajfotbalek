"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { strings } from "@/lib/strings";

export interface NotifyState {
  status: "idle" | "sent" | "error";
  message?: string;
}

/**
 * Mark every notification the caller can see as read (round 7, item 5).
 *
 * NO ARGUMENTS AND NO IDS. The bell marks read on OPEN, so the alternative is
 * the client sending N ids and reconciling a partial failure. The RPC is
 * idempotent — opening the dropdown twice is not an error, and anything
 * published between two opens is picked up by the second.
 */
export async function markNotificationsReadAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("mark_notifications_read");
  // A failure here costs an unread dot that stays lit. Not worth an error
  // surface on a control whose whole job is to be unobtrusive.
  if (error) console.error("mark_notifications_read failed", error.message);
  revalidatePath("/", "layout");
}

/**
 * Publish a notification to every signed-in player.
 *
 * ADMIN ONLY, TWICE: `requireAdmin()` here because a server action is a POST
 * endpoint reachable without rendering an admin page, and again inside
 * `admin_create_notification`, because a route guard is skipped by anyone
 * using curl.
 *
 * FREE TEXT, DELIBERATELY. The owner writes the message. The prefilled forms
 * after admin actions supply a DRAFT and nothing more.
 */
export async function publishNotificationAction(
  _prevState: NotifyState,
  formData: FormData,
): Promise<NotifyState> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (title === "") return { status: "error", message: strings.admin.notifyTitleRequired };
  if (body === "") return { status: "error", message: strings.admin.notifyBodyRequired };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("admin_create_notification", {
    p_title: title,
    p_body: body,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  // Every surface renders the bell, so the whole layout is stale.
  revalidatePath("/", "layout");
  return { status: "sent" };
}
