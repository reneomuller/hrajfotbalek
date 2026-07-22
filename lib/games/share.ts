import { strings } from "@/lib/strings";

/**
 * The share-to-WhatsApp link.
 *
 * `https://wa.me/?text=…` rather than `whatsapp://send`: the wa.me form works
 * on desktop, on iOS and on Android, and falls back to a web page that offers
 * the app rather than to a dead scheme handler on a machine without WhatsApp.
 *
 * ENCODING HAPPENS EXACTLY ONCE, here, over the finished message. That is the
 * whole reason this is a function and not an inline template at three call
 * sites: `venue` is admin-supplied free text that routinely contains `&`, `?`
 * and `#` (and, in the seed's hostile fixture, a good deal worse), and a
 * message assembled from separately-encoded fragments either double-encodes
 * the safe parts or leaves the dangerous ones raw. Neither is recoverable at
 * the render site.
 *
 * The template lives in `lib/strings.ts` with the rest of the copy, so the
 * message can be reworded without touching this file.
 */
export function whatsAppShareUrl(params: {
  venue: string;
  when: string;
  url: string;
}): string {
  const text = strings.games.shareMessage
    .replace("{venue}", params.venue)
    .replace("{when}", params.when)
    .replace("{url}", params.url);

  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
