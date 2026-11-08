import { isCountedPlayer, type PlayerScopeFields } from "@/lib/admin/playerScope";

/**
 * Who the Player of the Month picker offers (round 42, the admin rebuild).
 *
 * PLAYERS WHO COUNT, by `lib/admin/playerScope.ts`. The picker used to list
 * every `players` row, so the shadow names the owner books games under, the
 * anonymised rows of deleted accounts and the seed fixtures all sat in it
 * beside the people who play.
 *
 * THE CURRENT PICK STAYS, whoever it is. The form preselects it by nickname;
 * dropping it from the list would preselect "— nobody —", and the next save
 * of the form would clear a pick nobody meant to touch.
 */
export interface PotmRow extends Omit<PlayerScopeFields, "deleted_at"> {
  id: string;
  nickname: string;
  /** Optional in the generated row type; absent reads as "not deleted". */
  deleted_at?: string | null;
}

export function potmCandidates(
  rows: PotmRow[],
  currentNickname: string | null,
): { id: string; nickname: string }[] {
  return rows
    .filter(
      (row) =>
        isCountedPlayer({ ...row, deleted_at: row.deleted_at ?? null }) ||
        row.nickname === currentNickname,
    )
    .map(({ id, nickname }) => ({ id, nickname }));
}
