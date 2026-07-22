import type { Metadata } from "next";
import Link from "next/link";
import { getStrings } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.notFound.title };
}

/**
 * The styled 404.
 *
 * Reached far more often than a 404 usually is, because game links travel
 * through WhatsApp: they get forwarded, screenshotted and re-shared long after
 * the game they point at has been played. So this is a signpost to the games
 * list, not an apology — the visitor is usually someone who wants to play and
 * followed a stale link to get here.
 *
 * `/game/[id]` handles its own missing-game copy (`games.notFound`); this
 * catches everything else, including mistyped URLs.
 */
export default async function NotFound() {
  const t = await getStrings();
  const { notFound } = t;

  return (
    <main className="relative z-10 mx-auto flex w-full max-w-shell flex-1 flex-col items-start justify-center px-gutter pb-16 pt-24">
      <p className="m-0 font-display text-hero leading-none text-volt">{notFound.code}</p>

      <h1 className="mt-4 mb-0 font-display text-section-title uppercase tracking-wide text-white">
        {notFound.title}
      </h1>

      <p className="mt-4 mb-0 max-w-md text-lede text-muted">{notFound.body}</p>

      <Link
        href="/games"
        className="mt-8 rounded-cta bg-volt px-6 py-[15px] font-condensed text-cta font-extrabold uppercase italic tracking-wide text-surface no-underline"
      >
        {notFound.cta}
      </Link>
    </main>
  );
}
