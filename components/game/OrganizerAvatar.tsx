import Image from "next/image";
import { initials } from "@/lib/roster/initials";
import type { Strings } from "@/lib/strings";

/**
 * The organizer's circle on the game page: their profile photo when an admin
 * has linked the organizer to a player (round 42), their initials otherwise.
 *
 * NEVER A GUESSED FACE. The photo comes only from the player an admin picked
 * (`game_organizer_contacts.organizer_player_id`), never from matching the
 * typed name against nicknames — a wrong match would put a stranger's face
 * beside a stranger's contact button.
 *
 * 48px rendered, so 144px requested: three device pixels per CSS pixel, the
 * same ratio the roster's 34px circle asks for at 96.
 */
const AVATAR_REQUEST_PX = 144;

export function OrganizerAvatar({
  name,
  photoUrl,
  t,
}: {
  name: string;
  /** Already versioned (`lib/storage/photoVersions.ts`), or null. */
  photoUrl: string | null;
  t: Strings;
}) {
  return (
    <span
      data-testid="organizer-avatar"
      aria-hidden
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-pill border-2 border-volt bg-surface-avatar text-[15px] font-bold text-volt"
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          width={AVATAR_REQUEST_PX}
          height={AVATAR_REQUEST_PX}
          data-testid="organizer-avatar-photo"
          className="h-full w-full object-cover"
        />
      ) : (
        initials(name, t)
      )}
    </span>
  );
}
