import type { Metadata, Viewport } from "next";
import { Anton, Archivo, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import { NavPill } from "@/components/chrome/NavPill";
import { LocaleProvider } from "@/components/LocaleProvider";
import { SessionProvider } from "@/components/SessionProvider";
import { SiteBackground } from "@/components/SiteBackground";
import { Footer } from "@/components/chrome/Footer";
import { Header } from "@/components/chrome/Header";
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

/**
 * Body copy — Archivo, restored from the design-pass-2 mockups.
 *
 * A TOKEN-LEVEL SWAP AND NOTHING ELSE. v1.3's `sans` step pointed at Manrope;
 * the mockups this product is being built against use Archivo under the same
 * Anton display face, and the pairing is the thing that was reverted, not the
 * scale. Every other v1.3 token — surfaces, spacing, colour, radii — is
 * untouched, and so is ruling B: the faces changed, the sentence case did not.
 *
 * The weight range is loaded rather than a fixed list because §1.4 uses four
 * of them (400 body, 500 small, 600 body-lg default, 700 the spots-figure
 * variant), and a variable font serves all four from one file.
 */
const archivo = Archivo({
  variable: "--font-archivo",
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
      className={`${anton.variable} ${barlowCondensed.variable} ${archivo.variable} ${jetbrainsMono.variable} h-full`}
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
            <Header
              nickname={player?.nickname ?? null}
              isAdmin={player?.is_admin ?? false}
              photoPath={player?.photo_path ?? null}
              /* `created_at` moves when the row does, which is when the photo
                 bytes changed — the same cache-busting value `/account` uses. */
              photoVersion={player?.created_at ?? null}
            />
            {/*
              `--tabbar-h` is the bottom bar's footprint including the iPhone
              home indicator, and 0 at `md` where the bar is not rendered. One
              number, read here and by the game page's fixed CTA, so the last
              line of a page can never end up permanently behind the bar — see
              app/globals.css.
            */}
            {/*
              THE READING COLUMN. Full width below `md`, capped at 720px and
              centred at and above it.

              Imposed here rather than on each page because every page already
              opens with `mx-auto w-full max-w-shell px-gutter`, and editing
              twenty of them to say a different number is twenty chances to
              miss one — the missed one then being the single screen that
              stretches to 1280px while the rest do not.

              The gutter stays on the pages. This wrapper adds no padding, so
              nothing is padded twice.
            */}
            <div
              className="mx-auto w-full flex-1 md:max-w-content"
              style={{ paddingBottom: "var(--tabbar-h)" }}
            >
              {children}
              <Footer />
            </div>

            {/* Phone widths only. On a desktop this would be a phone
                affordance pinned to the bottom of a large screen, miles from
                anything — the header's link row carries navigation there, and
                the two are mutually exclusive at every width. */}
            <NavPill />
          </SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
