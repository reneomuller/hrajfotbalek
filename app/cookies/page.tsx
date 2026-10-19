import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { getStrings } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.legal.cookiesTitle };
}

/**
 * `/cookies` — Zásady používání cookies, version 2.0.
 *
 * WHERE THE COOKIE BANNER WENT. The site sets only necessary cookies (sign-in,
 * language, Stripe at payment), which need no consent, so the lawyer's brief
 * (item 9.1) says no banner should show and the footer should link here
 * instead. The consent machinery is kept, unmounted, for the day analytics
 * arrives — see `app/layout.tsx`.
 */
export default function CookiesPage() {
  return <LegalPage name="cookies" />;
}
