import { formatCzk, formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import {
  button,
  emailShell,
  fact,
  join,
  paragraph,
  textBody,
  type RenderedEmail,
} from "./layout";

const { emails } = strings;

export interface TopupReceiptProps {
  nickname: string;
  /** What actually arrived. Equal to `creditedCzk` unless a pass matched. */
  receivedCzk: number;
  /** What went into the wallet — the pass VALUE when a tier price matched. */
  creditedCzk: number;
  /** The wallet total after crediting, so the receipt answers "and now?". */
  balanceCzk: number;
  /** When the credited batch expires. Null for ordinary, unexpiring credit. */
  expiresAt: string | null;
  variableSymbol: number;
  accountUrl: string;
}

/**
 * Top-up receipt.
 *
 * NOT ROUTED THROUGH THE DISPATCH MAP, deliberately. `TEMPLATE_BY_EVENT` exists
 * to route game-lifecycle events to templates that all share one context —
 * venue, kickoff, a game URL. A wallet receipt has none of those, and putting
 * it through that map would mean inventing a venue and a start time to satisfy
 * a type. The admin action renders this and calls `sendRenderedEmail` directly.
 *
 * IT STATES WHAT WAS CREDITED, THE NEW BALANCE, AND THE VARIABLE SYMBOL. The
 * first answers "did my money land", the second "how much have I got", and the
 * third is the only thing tying this receipt to a line on a bank statement —
 * which is what someone reaches for when the first two disagree with their
 * memory.
 *
 * AND, WHEN A PASS MATCHED, IT ALSO STATES WHAT ARRIVED AND WHEN THE CREDIT
 * EXPIRES (§4.2, REQ-PASS-005). Those three numbers differ for a pass and only
 * for a pass — 700 arrived, 750 was credited, and it runs out in a month — and
 * "a receipt that showed only one would be the thing a dispute is argued
 * from". They are omitted for an ordinary top-up because there is nothing to
 * distinguish: repeating "received 300, credited 300" adds a line whose only
 * job is to be identical to the one above it.
 */
export function topupReceiptEmail(props: TopupReceiptProps): RenderedEmail {
  const credited = formatCzk(props.creditedCzk);
  const balance = formatCzk(props.balanceCzk);
  const received = formatCzk(props.receivedCzk);

  // A pass is exactly the case where received and credited differ.
  const isPass = props.creditedCzk !== props.receivedCzk || props.expiresAt !== null;
  const expiryLine = props.expiresAt
    ? formatDate(props.expiresAt)
    : emails.topupReceipt.noExpiry;

  return {
    subject: emails.topupReceipt.subject,
    html: emailShell(
      emails.topupReceipt.heading,
      join([
        paragraph(emails.topupReceipt.body.replace("{amount}", credited)),
        ...(isPass ? [fact(emails.topupReceipt.receivedLabel, received)] : []),
        fact(emails.topupReceipt.creditedLabel, credited),
        ...(isPass ? [fact(emails.topupReceipt.expiresLabel, expiryLine)] : []),
        fact(emails.topupReceipt.balanceLabel, balance),
        // Kept Czech in every language, like every other payment reference in
        // this product: the player is matching it against a Czech bank
        // statement, and a translated label is a reference nobody can find.
        fact(emails.common.variableSymbol, String(props.variableSymbol)),
        paragraph(emails.topupReceipt.spendNote),
        button(props.accountUrl, emails.topupReceipt.cta),
      ]),
    ),
    text: textBody([
      emails.topupReceipt.heading,
      "",
      emails.topupReceipt.body.replace("{amount}", credited),
      ...(isPass ? [`${emails.topupReceipt.receivedLabel}: ${received}`] : []),
      `${emails.topupReceipt.creditedLabel}: ${credited}`,
      ...(isPass ? [`${emails.topupReceipt.expiresLabel}: ${expiryLine}`] : []),
      `${emails.topupReceipt.balanceLabel}: ${balance}`,
      `${emails.common.variableSymbol}: ${props.variableSymbol}`,
      "",
      emails.topupReceipt.spendNote,
      props.accountUrl,
    ]),
  };
}

export interface PassExpiringProps {
  nickname: string;
  /** What is left in the batch — not what was bought. */
  remainingCzk: number;
  /** Roughly how many games that is, at the reference price. */
  gamesLeft: number;
  expiresAt: string;
  gamesUrl: string;
}

/**
 * The three-day heads-up before a batch expires (§4.2, REQ-PASS-004).
 *
 * IT NAMES THE AMOUNT AND THE DATE, and links to the games list rather than to
 * the account page. The player does not need to look at their balance — they
 * need to book something, and the whole point of warning them is that there is
 * still time to.
 *
 * Sent once per batch, guarded by `expiry_notified_at` written in the same
 * statement that selects the batch. A reminder that arrives twice teaches
 * people to ignore the first one.
 */
export function passExpiringEmail(props: PassExpiringProps): RenderedEmail {
  const remaining = formatCzk(props.remainingCzk);
  const date = formatDate(props.expiresAt);
  const body = emails.passExpiring.body
    .replace("{amount}", remaining)
    .replace("{date}", date);

  return {
    subject: emails.passExpiring.subject,
    html: emailShell(
      emails.passExpiring.heading,
      join([
        paragraph(body),
        fact(emails.passExpiring.remainingLabel, remaining),
        fact(emails.passExpiring.gamesLabel, String(props.gamesLeft)),
        fact(emails.passExpiring.expiresLabel, date),
        button(props.gamesUrl, emails.passExpiring.cta),
      ]),
    ),
    text: textBody([
      emails.passExpiring.heading,
      "",
      body,
      `${emails.passExpiring.remainingLabel}: ${remaining}`,
      `${emails.passExpiring.gamesLabel}: ${props.gamesLeft}`,
      `${emails.passExpiring.expiresLabel}: ${date}`,
      "",
      props.gamesUrl,
    ]),
  };
}
