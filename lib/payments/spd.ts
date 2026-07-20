/**
 * Czech SPD 1.0 ("QR platba") payment string.
 *
 * Format:
 *   SPD*1.0*ACC:<IBAN>*AM:<amount>.00*CC:CZK*X-VS:<VS>*MSG:<nickname>
 *
 * This is the product's core payment mechanism. A malformed string means a
 * player's money goes nowhere — or, in the worst case, somewhere else. Treat
 * every change here as a payments change.
 *
 * Payments stay Czech regardless of UI language: CZK, QR platba, and a
 * variable symbol as the reconciliation key.
 */

/** `*` is the SPD field delimiter. Everything below exists because of it. */
const SPD_DELIMITER = "*";
const MSG_MAX_LENGTH = 60;

export interface SpdPaymentInput {
  /** Payee IBAN, from the PAYMENT_IBAN environment variable. */
  iban: string;
  /** Whole crowns. Rendered with two decimal places per the SPD grammar. */
  amountCzk: number;
  /** Variable symbol — the reconciliation key the bank echoes back. */
  variableSymbol: number | string;
  /** Player nickname, used as the payment message. Sanitized before framing. */
  nickname: string;
}

/**
 * Sanitizes a nickname for the SPD `MSG` field.
 *
 * DEFENCE IN DEPTH. The nickname charset is already restricted at signup, so
 * in normal operation nothing here should ever fire. It fires anyway because
 * this is the render site that hands a string to a bank:
 *
 *  - `*` is the field delimiter. An unsanitized `*` breaks the framing and
 *    lets a crafted nickname inject arbitrary SPD fields — including `ACC:`,
 *    which would redirect the payment. This is the reason the function exists.
 *  - Control characters and non-ASCII are stripped because SPD is an ASCII
 *    grammar and banking apps disagree about how to handle anything else;
 *    a payment that fails to parse in one bank's app is a support ticket.
 *  - The result is capped at 60 characters, which is the field limit.
 *
 * Characters are removed rather than escaped: SPD has no escape mechanism, so
 * there is nothing to escape *to*.
 */
export function sanitizeSpdMessage(nickname: string): string {
  const stripped = [...nickname]
    .filter((char) => {
      if (char === SPD_DELIMITER) return false;
      const code = char.codePointAt(0) ?? 0;
      // Printable ASCII only: space (0x20) through tilde (0x7E). This drops
      // C0 controls, DEL, and everything non-ASCII in one predicate.
      return code >= 0x20 && code <= 0x7e;
    })
    .join("");

  return stripped.slice(0, MSG_MAX_LENGTH).trim();
}

/** Formats whole crowns as the SPD amount grammar requires. */
export function formatSpdAmount(amountCzk: number): string {
  return `${Math.round(amountCzk)}.00`;
}

/**
 * Builds the SPD 1.0 string.
 *
 * Throws when the amount is not payable. A zero-amount QR is not a valid
 * payment request, and the caller should be rendering the instant-confirmed
 * state instead — see `shouldRenderQr`.
 */
export function buildSpdString({
  iban,
  amountCzk,
  variableSymbol,
  nickname,
}: SpdPaymentInput): string {
  if (!iban) throw new Error("PAYMENT_IBAN is not configured");
  if (!Number.isFinite(amountCzk) || amountCzk <= 0) {
    throw new Error(`SPD amount must be positive, got ${amountCzk}`);
  }

  const fields = [
    "SPD",
    "1.0",
    `ACC:${iban}`,
    `AM:${formatSpdAmount(amountCzk)}`,
    "CC:CZK",
    `X-VS:${variableSymbol}`,
    `MSG:${sanitizeSpdMessage(nickname)}`,
  ];

  return fields.join(SPD_DELIMITER);
}

/**
 * The amount actually owed: price minus any credit the RPC applied.
 *
 * Both figures are read off the persisted booking, so this cannot disagree
 * with what `create_booking` decided.
 */
export function amountDueCzk(priceCzk: number, creditAppliedCzk: number): number {
  return Math.max(0, priceCzk - creditAppliedCzk);
}

/**
 * Whether a QR belongs on screen at all.
 *
 * No QR when credit covers the full price, when the method is not `qr`, or
 * when there is no variable symbol to reconcile against.
 */
export function shouldRenderQr(booking: {
  payment_method: string;
  payment_code: number | null;
  price_czk: number;
  credit_applied_czk: number;
}): boolean {
  return (
    booking.payment_method === "qr" &&
    booking.payment_code !== null &&
    amountDueCzk(booking.price_czk, booking.credit_applied_czk) > 0
  );
}

/** The configured payee IBAN. Server-only — never inline this into a client bundle. */
export function paymentIban(): string {
  const iban = process.env.PAYMENT_IBAN;
  if (!iban) throw new Error("Missing required environment variable: PAYMENT_IBAN");
  return iban;
}
