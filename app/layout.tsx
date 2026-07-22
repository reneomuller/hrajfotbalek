import type { Metadata, Viewport } from "next";
import { Anton, Barlow_Condensed, JetBrains_Mono, Manrope } from "next/font/google";
import { LocaleProvider } from "@/components/LocaleProvider";
import { SessionProvider } from "@/components/SessionProvider";
import { SiteBackground } from "@/components/SiteBackground";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentPlayer } from "@/lib/auth/session";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { strings } from "@/lib/strings";
import tailwindConfig from "@/tailwind.config";
import "./globals.css";

const themeColors = (tailwindConfig.theme?.extend?.colors ?? {}) as Record<string, string>;

/** Display face for the hero and section titles. */
const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin", "latin-ext"],
  weight: "400",
  display: "swap",
});

/** Condensed italic used for CTAs, card titles and the wordmark. */
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin", "latin-ext"],
  weight: ["700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});

/** Body copy. */
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/** Eyebrows, counters and numeric labels. */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/**
 * `generateMetadata` rather than a static `metadata` object: the title and
 * description are copy, and copy is now per-request. A module-level constant
 * is evaluated once at build time and would pin every language's tab title and
 * every shared link's description to English.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();

  return {
    /**
     * Base for resolving relative Open Graph and Twitter image URLs.
     *
     * WhatsApp and every other unfurler fetch `og:image` as an absolute URL and
     * will not resolve a relative path. Without this, Next falls back to
     * `http://localhost:3000`, which produces preview cards that render locally
     * and silently show no image once deployed — the failure appears only in
     * production, in someone else's chat window.
     *
     * Resolved from NEXT_PUBLIC_SITE_URL, the same variable the magic-link
     * origin uses, so both agree by construction.
     */
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000",
    ),
    /**
     * Every page sets its own bare title ("Games", "My account") and the
     * template hangs the brand off it, so a tab strip or a shared link reads as
     * this product rather than as six unrelated pages. `default` covers routes
     * that set none. The brand itself is not translated — it is a name.
     */
    title: {
      default: t.meta.title,
      template: `%s — ${strings.brand.wordmarkLead} ${strings.brand.wordmarkAccent}`,
    },
    description: t.meta.description,
    applicationName: "Hraj Fotbal",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Hraj Fotbal",
    },
  };
}

/**
 * `themeColor` paints the mobile browser chrome and the standalone splash. It
 * belongs on `viewport`, not `metadata` — Next warns and drops it otherwise.
 */
export const viewport: Viewport = {
  themeColor: themeColors.ink,
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved server-side and passed down for DISPLAY only. Route protection
  // lives in lib/auth/session.ts and authorization lives inside the RPCs —
  // see the note in components/SessionProvider.tsx.
  const player = await getCurrentPlayer();

  // The language, decided once per request. Server components read the same
  // table through `getStrings()`; client components get it from
  // `LocaleProvider`, so the two can never disagree and hydrate a flash of the
  // wrong language.
  const [locale, t] = await Promise.all([getLocale(), getStrings()]);

  return (
    <html
      lang={locale}
      className={`${anton.variable} ${barlowCondensed.variable} ${manrope.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={locale} t={t}>
          <SessionProvider
            value={{
              isAuthenticated: player !== null,
              nickname: player?.nickname ?? null,
              isAdmin: player?.is_admin ?? false,
            }}
          >
            {/* Mounted once, here, so navigating never restarts the field. */}
            <SiteBackground />
            <SiteHeader
              nickname={player?.nickname ?? null}
              isAdmin={player?.is_admin ?? false}
            />
            {children}
            <SiteFooter />
          </SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
