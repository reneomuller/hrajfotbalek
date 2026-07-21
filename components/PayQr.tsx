import QRCode from "qrcode";
import { siteUrl } from "@/lib/site";

/**
 * The illustrative QR tile in the landing page's "pay ahead" card.
 *
 * The reference ships a static QR bitmap. That image is a scannable code whose
 * payload cannot be verified from the bundle, and a landing page is the wrong
 * place to publish an unverified payment target — so the tile renders a code we
 * generate ourselves, encoding the site URL. Same 104px white tile, same
 * treatment; scanning it opens the site instead of a stranger's payment form.
 *
 * The real per-booking SPD payment code is `components/QrPayment.tsx`.
 */
export async function PayQr() {
  const url = await siteUrl();

  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#080808", light: "#FFFFFF" },
  });

  return (
    <div
      aria-hidden
      className="h-[104px] w-[104px] flex-none rounded-[14px] bg-white p-[6px]"
      // Generated server-side from the site's own URL — no user input reaches it.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
