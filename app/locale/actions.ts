"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
} from "@/lib/i18n/locales";

/**
 * Sets the language cookie.
 *
 * A server action rather than a client-side `document.cookie` write: every
 * page is server-rendered, so the new language only takes effect on the next
 * render, and that render has to see the cookie. Writing it on the client
 * would need a reload to take effect and would flash the old language on the
 * way through.
 *
 * NOT an authorization surface and nothing to guard: the worst a forged call
 * can do is render the caller's own page in Czech. The value is still
 * validated against the supported set, because an unvalidated cookie value
 * would be reflected into `<html lang>`.
 */
export async function setLocale(formData: FormData): Promise<void> {
  const requested = formData.get("locale");
  if (!isLocale(requested)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, requested, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    // Readable by the client is fine — it carries no identity. HttpOnly would
    // buy nothing here and would rule out ever reading it in a client-side
    // formatter.
    httpOnly: false,
  });

  // Every surface renders copy, so the whole tree is stale after a switch.
  revalidatePath("/", "layout");
}
