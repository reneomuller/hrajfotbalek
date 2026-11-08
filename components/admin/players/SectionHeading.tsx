/**
 * A panel's title on the player page, as `Panel` draws it — the eyebrow label —
 * but an `<h3>`.
 *
 * WHY NOT `Panel`'S OWN TITLE: `Panel` titles are `<h2>`, and on this page the
 * one `<h2>` is the player's name. The rename spec (`round33.spec.ts`) finds
 * the renamed player by `getByRole("heading", { level: 2 })`, and a second
 * level-2 heading would make that ambiguous. So the panels here are `Panel`s
 * without a title, carrying this inside.
 */
export function SectionHeading({
  title,
  lede,
  action,
}: {
  title: string;
  lede?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-[10px] font-normal uppercase tracking-eyebrow text-volt-dim">{title}</h3>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {lede && <p className="m-0 mt-1 max-w-[560px] text-small text-muted">{lede}</p>}
    </div>
  );
}
