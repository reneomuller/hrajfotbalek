/**
 * Texty pro web 7 — the safety notice, on the booking page and at checkout.
 *
 * Shown in full rather than folded behind a disclosure: the lawyer's point is
 * that it is READ before somebody commits to playing, and a summary line that
 * has to be opened is a notice most people never see.
 */
export function SafetyNotice({ title, body }: { title: string; body: string }) {
  return (
    <aside
      data-testid="safety-notice"
      aria-label={title}
      className="mt-4 rounded-card border border-hairline-strong p-4"
    >
      <h2 className="m-0 text-[11px] uppercase tracking-eyebrow text-muted">{title}</h2>
      <p className="mt-2 mb-0 text-[12px] leading-snug text-muted">{body}</p>
    </aside>
  );
}
