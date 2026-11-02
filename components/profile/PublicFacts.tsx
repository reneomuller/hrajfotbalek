import { POSITIONS, type Position } from "@/lib/players/positions";
import type { Strings } from "@/lib/strings";

/**
 * Preferred position and level, on a stranger's profile (round 28, item 4 —
 * the owner's amendment to round 14's scope). ~~Country~~ moved up under the
 * player's name on 2026-11-02 (`PublicIdentity`), with its flag.
 *
 * WHAT MAKES THIS IN SCOPE where an email address is not: both are facts
 * a player states about their FOOTBALL, on a page that exists to answer "who
 * is this in the lineup". Round 14 drew the boundary at identity and contact,
 * and that half is untouched — no email, no phone, no join date.
 *
 * AN UNSET FIELD RENDERS NOTHING AT ALL. Not "Not set", not a grey dash. The
 * own-profile page shows `notSet` because it is a form and the reader can fix it; here the reader is a stranger who cannot, so the
 * row would be a fact about our database rather than about the player. A
 * profile with neither set renders no block, not an empty card.
 */
export function PublicFacts({
  skillLevel,
  positions,
  t,
}: {
  skillLevel: string | null;
  positions: string[];
  t: Strings;
}) {
  const known = positions.filter((p): p is Position =>
    (POSITIONS as readonly string[]).includes(p),
  );

  const skillLabel =
    skillLevel === "beginner"
      ? t.auth.skillBeginner
      : skillLevel === "intermediate"
        ? t.auth.skillIntermediate
        : skillLevel === "advanced"
          ? t.auth.skillAdvanced
          : null;

  const rows: { key: string; label: string; value: React.ReactNode }[] = [];

  if (known.length > 0) {
    rows.push({
      key: "positions",
      label: t.profile.position,
      value: known.map((p) => t.profile.positions[p]).join(" · "),
    });
  }

  if (skillLabel) {
    rows.push({ key: "skill", label: t.profile.skillLevel, value: skillLabel });
  }

  if (rows.length === 0) return null;

  return (
    <section data-testid="public-facts" className="mt-4 rounded-card bg-surface p-5">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt
              data-testid={`public-fact-${row.key}`}
              className="m-0 pt-[2px] text-[10px] uppercase tracking-eyebrow text-muted"
            >
              {row.label}
            </dt>
            <dd className="m-0 text-body text-bone">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
