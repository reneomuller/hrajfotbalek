import type { PlayerKind } from "@/lib/admin/players/types";
import { strings } from "@/lib/strings";

/**
 * The small labels beside a player's name (round 42): what kind of account it
 * is, and what it may do. The same pills on the list and on the player's page,
 * so a shadow or a banned account reads the same in both places.
 *
 * Volt for a right someone holds, danger for a ban, a quiet outline for the
 * kinds that are counted nowhere.
 */
export interface PlayerTagFacts {
  kind: PlayerKind;
  isAdmin: boolean;
  isOrganizer: boolean;
  isBanned: boolean;
}

type Tone = "quiet" | "volt" | "danger";

const TONE: Record<Tone, string> = {
  quiet: "border-hairline-strong text-muted",
  volt: "border-hairline-volt text-volt",
  danger: "border-danger/60 text-danger",
};

function Tag({ tag, tone, label }: { tag: string; tone: Tone; label: string }) {
  return (
    <li
      data-testid="admin-player-tag"
      data-tag={tag}
      className={`shrink-0 rounded-pill border px-2 py-[2px] text-[9px] uppercase leading-normal tracking-eyebrow ${TONE[tone]}`}
    >
      {label}
    </li>
  );
}

export function PlayerTags({ player, className = "" }: { player: PlayerTagFacts; className?: string }) {
  const tags: { tag: string; tone: Tone; label: string }[] = [];
  if (player.kind === "shadow") tags.push({ tag: "shadow", tone: "quiet", label: strings.admin.shadowTag });
  if (player.kind === "seed") tags.push({ tag: "seed", tone: "quiet", label: strings.admin.seedTag });
  if (player.kind === "deleted") {
    tags.push({ tag: "deleted", tone: "quiet", label: strings.admin.playersHub.tags.deleted });
  } else if (player.isBanned) {
    tags.push({ tag: "banned", tone: "danger", label: strings.admin.playersHub.tags.banned });
  }
  if (player.isAdmin) tags.push({ tag: "admin", tone: "volt", label: strings.admin.adminTag });
  if (player.isOrganizer) tags.push({ tag: "organizer", tone: "volt", label: strings.admin.playersHub.tags.organizer });

  if (tags.length === 0) return null;
  return (
    <ul className={`m-0 flex list-none flex-wrap items-center gap-1 p-0 ${className}`}>
      {tags.map((tag) => (
        <Tag key={tag.tag} {...tag} />
      ))}
    </ul>
  );
}
