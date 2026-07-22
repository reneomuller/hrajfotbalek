import { whatsAppShareUrl } from "@/lib/games/share";
import { strings } from "@/lib/strings";

/**
 * Share to WhatsApp.
 *
 * A plain `<a>`, not a button with an onClick: this is a link to somewhere, so
 * it should middle-click, long-press and open-in-new-tab like one. It also
 * means the whole card can stay server-rendered — no client component in the
 * list for a link that never changes after render.
 *
 * WhatsApp specifically, rather than the Web Share API: the entire pre-app
 * booking process lived in a WhatsApp group, so "share" here means one thing to
 * the people using it. `navigator.share` would be a strictly worse version of
 * that on desktop and an extra tap on mobile.
 *
 * `stopPropagation` is not needed and not used — where this sits inside a card
 * that is itself a link, the card is built so the anchors are siblings rather
 * than nested, because an `<a>` inside an `<a>` is invalid HTML that browsers
 * silently un-nest in different ways.
 */
export function ShareButton({
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
  return (
    <a
      href={whatsAppShareUrl({ venue, when, url })}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="share-whatsapp"
      aria-label={strings.games.shareWhatsApp}
      className={`inline-flex items-center gap-2 rounded-control border border-hairline-link px-3 py-2 font-mono uppercase tracking-eyebrow text-bone no-underline transition hover:border-whatsapp ${
        size === "slim" ? "text-[9px]" : "text-[10px]"
      }`}
    >
      <span aria-hidden className="inline-block h-[10px] w-[10px] rounded-full bg-whatsapp" />
      {strings.games.shareWhatsApp}
    </a>
  );
}
