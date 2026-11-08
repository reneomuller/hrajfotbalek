/**
 * The top of every admin page (round 42, the admin rebuild): the one
 * `page-title` treatment admin has held since round 12, a one-line summary of
 * what the page is for or what is true right now, and the page's own actions
 * at the right — or under the title at phone width, where both do not fit.
 *
 * Still an `<h2>`: the site header owns the document's `<h1>`, and every admin
 * spec that finds a page by its heading finds it at this level.
 */
export function PageHeader({
  title,
  lede,
  actions,
  testId = "admin-page-header",
}: {
  title: string;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="m-0 font-display text-page-title uppercase tracking-wide text-white">{title}</h2>
        {lede && <p className="mt-1 text-small text-muted">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}
