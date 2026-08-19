import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
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
  // Nested admin pages set a bare title ("Players") and this hangs the section
  // off it, so an admin with six tabs open can tell them apart.
  title: {
    default: strings.admin.title,
    template: `%s · ${strings.admin.title}`,
  },
  // The admin surface must never be indexed, linked or previewed.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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
      {/*
        THE SHELL, STACKED (admin restyle).

        It was one `flex-wrap` row holding a display-size title, the section
        switcher, the acting nickname and a back link. At 390px those four
        wrapped into an unpredictable block whose height changed with the
        section name, and the title — the thing that says where you are — could
        end up beside the nav rather than above it.

        Title row first, switcher beneath, and the two right-hand items ride
        with the title. The reference puts an `ADMIN` badge next to the mark;
        here the whole page is the admin panel, so the badge is the title.
      */}
      <header className="border-b border-hairline pb-4">
        {/* Column at phone width: `ADMIN` plus a nickname plus a back link is
            wider than 390px, and wrapping mid-row put the back link half off
            the screen. Row again from `sm`, where it fits. */}
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4">
          <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
            {strings.admin.title}
          </h1>

          <div className="flex items-baseline gap-4">
            {/* Whose session is acting. Free text, escaped by JSX. */}
            <span className="text-small text-faint">{admin.nickname}</span>
            <Link
              href="/"
              className="text-small text-muted no-underline transition-colors hover:text-volt"
            >
              {strings.admin.backToSite}
            </Link>
          </div>
        </div>

        <div className="mt-3">
          <AdminNav />
        </div>
      </header>

      <main className="pt-8">{children}</main>
    </div>
  );
}
