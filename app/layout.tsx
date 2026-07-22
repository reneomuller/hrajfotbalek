import type { Metadata, Viewport } from "next";
import { Anton, Barlow_Condensed, JetBrains_Mono, Manrope } from "next/font/google";
import { SessionProvider } from "@/components/SessionProvider";
import { SiteBackground } from "@/components/SiteBackground";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentPlayer } from "@/lib/auth/session";
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

export const metadata: Metadata = {
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
   * Every page sets its own bare title ("Games", "My account") and the template
   * hangs the brand off it, so a tab strip or a shared link reads as this
   * product rather than as six unrelated pages. `default` covers routes that
   * set none.
   */
  title: {
    default: strings.meta.title,
    template: `%s — ${strings.brand.wordmarkLead} ${strings.brand.wordmarkAccent}`,
  },
  description: strings.meta.description,
  applicationName: "Hraj Fotbal",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hraj Fotbal",
  },
};

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

  return (
    <html
      lang="en"
      className={`${anton.variable} ${barlowCondensed.variable} ${manrope.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
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
      </body>
    </html>
  );
}
