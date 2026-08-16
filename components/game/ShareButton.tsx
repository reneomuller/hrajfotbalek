import { whatsAppShareUrl } from "@/lib/games/share";
import { WhatsAppIcon } from "@/components/BrandIcon";
import { getStrings } from "@/lib/i18n/server";

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
export async function ShareButton({
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
    <a
      href={whatsAppShareUrl({ venue, when, url }, t)}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="share-whatsapp"
      aria-label={t.games.shareWhatsApp}
      /*
        BIGGER, WITH THE REAL LOGO (Section 4, item 8). It was a 10px green
        DOT beside tracked capitals at eyebrow size — a placeholder standing in
        for a mark the product already has, on the one control that sends a
        game to the group this product exists to replace. `WhatsAppIcon` is the
        same glyph the organizer row uses, so the two agree about what WhatsApp
        looks like.

        Sentence case with it (ruling B) — `eyebrow` is the only uppercase
        style, and a button is not one.
      */
      className={`inline-flex min-h-[52px] items-center gap-3 rounded-control border border-hairline-strong px-5 text-body-lg font-semibold text-bone no-underline transition-colors hover:border-whatsapp ${
        size === "slim" ? "text-[9px]" : "text-[10px]"
      }`}
    >
      <WhatsAppIcon className="h-6 w-6 shrink-0" />
      {t.games.shareWhatsApp}
    </a>
  );
}
