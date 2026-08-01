import { CopyLinkButton } from "@/components/game/CopyLinkButton";
import { ShareButton } from "@/components/game/ShareButton";
import { getStrings } from "@/lib/i18n/server";

/**
 * Copy link (primary) and WhatsApp (secondary), in that order — §5.4,
 * REQ-GAME-014.
 *
 * The order is the requirement, not a layout preference: a copied link goes
 * wherever the sender is already talking, and WhatsApp is one of those places
 * rather than all of them. WhatsApp keeps its place beside it because the
 * group this product replaced is still where a game actually gets filled.
 *
 * A server component that mounts one client component, so the copy button's
 * strings are resolved in the reader's locale on the server and the page keeps
 * shipping the smallest client bundle that does the job.
 */
export async function SharePair({
  venue,
  when,
  url,
  size = "default",
}: {
  venue: string;
  when: string;
  url: string;
  size?: "default" | "slim";
}) {
  const t = await getStrings();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <CopyLinkButton
        url={url}
        label={t.games.copyLink}
        copiedMessage={t.toast.linkCopied}
        failedMessage={t.games.copyLinkFailed}
        closeLabel={t.common.dismiss}
        size={size}
      />
      <ShareButton venue={venue} when={when} url={url} size={size} />
    </div>
  );
}
