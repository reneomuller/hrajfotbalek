import { formatCzk } from "@/lib/format";
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
  /** What actually arrived and was credited — not necessarily what was asked for. */
  creditedCzk: number;
  /** The wallet total after crediting, so the receipt answers "and now?". */
  balanceCzk: number;
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
 * IT STATES THREE NUMBERS, in this order: what was credited, what the balance
 * is now, and the variable symbol it arrived under. The first is the answer to
 * "did my money land", the second to "how much have I got", and the third is
 * the only thing that ties this receipt to a line on a bank statement — which
 * is what someone reaches for when the first two disagree with their memory.
 */
export function topupReceiptEmail(props: TopupReceiptProps): RenderedEmail {
  const credited = formatCzk(props.creditedCzk);
  const balance = formatCzk(props.balanceCzk);

  return {
    subject: emails.topupReceipt.subject,
    html: emailShell(
      emails.topupReceipt.heading,
      join([
        paragraph(emails.topupReceipt.body.replace("{amount}", credited)),
        fact(emails.topupReceipt.creditedLabel, credited),
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
      `${emails.topupReceipt.creditedLabel}: ${credited}`,
      `${emails.topupReceipt.balanceLabel}: ${balance}`,
      `${emails.common.variableSymbol}: ${props.variableSymbol}`,
      "",
      emails.topupReceipt.spendNote,
      props.accountUrl,
    ]),
  };
}
