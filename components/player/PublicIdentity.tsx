import { initials } from "@/lib/roster/initials";
import { avatarUrl } from "@/lib/storage/avatar";
import { getStrings } from "@/lib/i18n/server";

/**
 * The name and face on a public profile.
 *
 * `ProfileIdentity` IS NOT REUSED, deliberately. It renders the country, the
 * join date and a `PhotoUpload` wrapper around the avatar — three things the
 * quarantine lift's scope excludes, and one of them is a control that would
 * offer a stranger the file picker for somebody else's picture. Passing nulls
 * to suppress them would leave that component one careless default away from
 * publishing a join date.
 *
 * So this is the same composition with only the two fields the scope allows:
 * an 80px avatar and the nickname.
 */
export async function PublicIdentity({
  nickname,
  photoPath,
}: {
  nickname: string;
  photoPath: string | null;
}) {
  const t = await getStrings();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const photo = supabaseUrl ? avatarUrl(supabaseUrl, photoPath) : null;

  return (
    /*
      `relative` IS LOAD-BEARING, AND ITS ABSENCE WAS INVISIBLE TO THE OBVIOUS
      TEST (round 16, item 3).

      `ProfileCover` is `absolute`, which makes it a POSITIONED element; this
      row was a plain in-flow `<section>`. In the painting order a positioned
      element and its descendants go above non-positioned in-flow content at
      the same stacking level regardless of source order — so the cover's two
      SCRIMS were painted over the avatar and the nickname. White on the ramp's
      55% ink is the grey Oliver reported as "invisible".

      `elementFromPoint` DID NOT CATCH IT and could not have. The cover layer is
      `pointer-events-none`, so hit-testing walks straight past the scrims and
      answers `public-nickname` — reachable, on top, and unreadable. That is
      the same lesson as the `z-50` nav pill in CLAUDE.md read from the other
      end: there, a thing that looked right was unreachable; here, a thing that
      IS reachable looks wrong. Reachability and legibility are different
      questions and need different instruments — the spec measures decoded
      pixels.

      The owner's own profile never had the bug because `ProfileIdentity`'s row
      is `relative` for its own reasons (the avatar's pencil badge is absolutely
      positioned against it). It was carrying this for free, which is why
      copying the composition without that class copied a latent defect.
    */
    <section data-testid="public-identity" className="relative flex items-end gap-4">
      <span
        data-testid="public-avatar"
        className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-volt bg-surface-avatar text-[26px] font-bold text-volt"
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(nickname, t)
        )}
      </span>

      {/* `pb-1` lifts the name off the circle's optical baseline, exactly as
          the owner's own profile does it. */}
      <div className="min-w-0 pb-1">
        <h1
          data-testid="public-nickname"
          className="m-0 truncate text-[26px] font-bold leading-tight text-white"
        >
          {nickname}
        </h1>
      </div>
    </section>
  );
}
