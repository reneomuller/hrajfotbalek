import QRCode from "qrcode";
import { formatCzk } from "@/lib/format";
import { buildSpdString } from "@/lib/payments/spd";
import { strings } from "@/lib/strings";

export interface QrPaymentProps {
  iban: string;
  amountCzk: number;
  variableSymbol: number;
  nickname: string;
}

/**
 * SPD 1.0 payment QR plus a plain-text fallback.
 *
 * Rendered on the server: the SVG is produced during the render pass and
 * shipped as markup, so there is no client-side QR library, no layout shift,
 * and — more to the point — no path by which a client could influence the
 * encoded string.
 *
 * The text fallback is not decoration. Some players will not scan: a scuffed
 * phone camera, a banking app that hides its scanner, or simply preferring to
 * type. Account, amount and VS are all shown so a payment can be entered by
 * hand and still reconcile.
 */
export async function QrPayment({
  iban,
  amountCzk,
  variableSymbol,
  nickname,
}: QrPaymentProps) {
  const spd = buildSpdString({ iban, amountCzk, variableSymbol, nickname });

  // Error correction M is the SPD/QR-platba convention: enough resilience for
  // a phone screen photographed at an angle without inflating the module count.
  const svg = await QRCode.toString(spd, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#080808", light: "#FFFFFF" },
  });

  return (
    <section
      data-testid="qr-payment"
      className="rounded-card border border-hairline-volt bg-surface-card p-5"
    >
      <h2 className="m-0 font-condensed text-[17px] font-bold uppercase tracking-wide text-white">
        {strings.payment.qrTitle}
      </h2>
      <p className="mt-2 text-[13px] leading-snug text-muted">
        {strings.payment.qrHint}
      </p>

      {/*
        White quiet zone around the code. Scanners need the light background
        and the margin — rendering the QR directly on the near-black surface
        is the classic way to make a technically-valid code unscannable.
      */}
      <div className="mt-4 flex justify-center">
        <div
          className="w-[220px] max-w-full rounded-control bg-white p-3"
          // The SVG is generated server-side from a string this component
          // built itself; no user input reaches it unsanitized (the nickname
          // passes through sanitizeSpdMessage inside buildSpdString).
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {/* Plain-text fallback — everything needed to pay by hand. */}
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="font-mono text-[11px] uppercase tracking-eyebrow text-faint">
          {strings.payment.account}
        </dt>
        <dd
          data-testid="fallback-account"
          className="m-0 break-all text-right font-mono text-[12px] text-bone"
        >
          {iban}
        </dd>

        <dt className="font-mono text-[11px] uppercase tracking-eyebrow text-faint">
          {strings.payment.amount}
        </dt>
        <dd
          data-testid="fallback-amount"
          className="m-0 text-right font-mono text-[12px] text-bone"
        >
          {formatCzk(amountCzk)}
        </dd>

        <dt className="font-mono text-[11px] uppercase tracking-eyebrow text-faint">
          {strings.payment.variableSymbol}
        </dt>
        <dd
          data-testid="fallback-vs"
          className="m-0 text-right font-mono text-[12px] tracking-[1px] text-volt"
        >
          {variableSymbol}
        </dd>
      </dl>

      <p className="mt-4 text-[12px] leading-snug text-faint">
        {strings.payment.pendingConfirmation}
      </p>
    </section>
  );
}
