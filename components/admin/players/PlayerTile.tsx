import { initials } from "@/lib/roster/initials";

/**
 * A player's face in the list (round 35 v2, item 9; restyled round 42): the
 * photograph when there is one, the initials underneath it otherwise — never an
 * empty tile, which `round35v2.spec.ts` asserts over the whole list.
 *
 * A plain `<img>` over the public bucket, like every other avatar here; a 40px
 * tile does not need the optimizer. `aria-hidden` — the name is beside it.
 */
export function PlayerTile({ nickname, photoUrl }: { nickname: string; photoUrl: string | null }) {
  return (
    <span
      aria-hidden
      data-testid="admin-player-tile"
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-control border border-hairline-volt bg-volt/[.08] text-small font-bold text-volt"
    >
      {photoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={photoUrl} alt="" data-testid="admin-player-list-photo" className="h-full w-full object-cover" />
      ) : (
        initials(nickname)
      )}
    </span>
  );
}
