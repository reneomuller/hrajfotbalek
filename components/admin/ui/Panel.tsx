/**
 * A titled admin section (round 42, the admin rebuild): the site's lifted card
 * with the eyebrow label every admin page already uses, an optional action at
 * the right of the title, and the content beneath.
 *
 * `<section>` with the title as its heading, so a screen reader can jump
 * between the parts of a long admin page the way a sighted admin scans them.
 */
export function Panel({
  title,
  action,
  children,
  testId,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <section data-testid={testId} className={`lifted rounded-card p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-[10px] font-normal uppercase tracking-eyebrow text-volt-dim">{title}</h2>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
