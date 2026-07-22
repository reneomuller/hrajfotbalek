import { redirect } from "next/navigation";

/**
 * `/admin` has no dashboard of its own — games are what an organizer opens the
 * panel to do. The stats page is one nav click away and is a reading surface,
 * not a landing one.
 */
export default function AdminIndexPage() {
  redirect("/admin/games");
}
