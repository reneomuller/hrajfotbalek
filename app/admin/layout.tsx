import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { strings } from "@/lib/strings";

/**
 * The admin shell — and the gate for every route beneath it.
 *
 * ONE ADMIN CHECK EXISTS IN THIS CODEBASE: `lib/auth/requireAdmin.ts`, written
 * in Phase 18 for the cancel route and mounted here rather than reimplemented.
 * Two admin checks is how they drift, and the weaker one is the one that gets
 * found.
 *
 * WHAT THIS GATE DOES AND DOES NOT COVER. It covers page renders: every nested
 * route runs this layout first, so an unlisted URL is still a gated URL —
 * navigation is not access control. It does NOT cover server actions, which
 * are POST endpoints in their own right and are reachable without ever
 * rendering a page under this layout. Every admin action therefore calls
 * `requireAdmin()` itself, and every admin RPC re-checks inside the function.
 * Three layers, none of them load-bearing alone.
 */
export const metadata: Metadata = {
  title: strings.admin.title,
  // The admin surface must never be indexed, linked or previewed.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin/games", label: strings.admin.navGames },
  { href: "/admin/players", label: strings.admin.navPlayers },
  { href: "/admin/stats", label: strings.admin.navStats },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirects a signed-out visitor to /login and a non-admin to /, before any
  // nested page reads a single row.
  const admin = await requireAdmin();

  return (
    <div className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline-chrome pb-4">
        <div className="flex items-baseline gap-4">
          <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
            {strings.admin.title}
          </h1>
          <nav className="flex gap-4">
            {NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline hover:text-volt"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-baseline gap-4">
          {/* Whose session is acting. Free text, escaped by JSX. */}
          <span className="font-mono text-[11px] tracking-[1px] text-faint">
            {admin.nickname}
          </span>
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
          >
            {strings.admin.backToSite}
          </Link>
        </div>
      </header>

      <main className="pt-8">{children}</main>
    </div>
  );
}
