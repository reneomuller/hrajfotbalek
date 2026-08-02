import { strings } from "@/lib/strings";

/**
 * "Export CSV", beside the table it exports.
 *
 * A PLAIN `<a>`, NOT A `<Link>`. The target is a route handler returning a
 * file, and `next/link` would try to client-navigate to it — which either
 * downloads nothing or replaces the app with a text response depending on how
 * the router feels about the content type. `download` is set for the same
 * reason the handler sets `Content-Disposition`: belt and braces on the one
 * behaviour the control exists for.
 *
 * ONE COMPONENT FOR ALL FIVE EXPORTS, so they are the same control in the same
 * place with the same words. Five hand-rolled links is how one of them ends up
 * a button, one ends up below the table, and one ends up saying "Download".
 *
 * Admin copy is English only — see `lib/i18n/locales.ts`.
 */
export function ExportCsvLink({
  href,
  /** Distinguishes the five in a spec; the label is identical on all of them. */
  testId,
}: {
  href: string;
  testId: string;
}) {
  return (
    <a
      href={href}
      download
      data-testid={testId}
      className="inline-flex min-h-11 shrink-0 items-center rounded-control border border-hairline-strong px-4 font-mono text-[11px] uppercase tracking-[1px] text-muted no-underline transition hover:border-hairline-volt hover:text-volt"
    >
      {strings.admin.exportCsv}
    </a>
  );
}
