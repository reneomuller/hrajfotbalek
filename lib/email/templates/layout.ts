import type { EmailAttachment } from "@/lib/email/sendEmail";
import type { Locale } from "@/lib/i18n/locales";
import tailwindConfig from "@/tailwind.config";

/**
 * Shared email shell and the escaping primitive every template is built on.
 *
 * WHY NOT JSX + react-dom/server: Next.js refuses `react-dom/server` imports in
 * app code (it breaks the build outright), and these templates are reached from
 * server actions and cron routes. So escaping cannot be delegated to React —
 * it has to be structural here instead.
 *
 * THE RULE: `html` is a tagged template that escapes EVERY interpolation. The
 * only way to embed markup is to pass a value that is already a `SafeHtml`,
 * which only this module can produce. A raw string carrying "<script>" cannot
 * reach the output as markup by accident, which is the property that matters:
 * venue text is admin-supplied and nicknames are player-chosen.
 */

export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes a value for HTML text and attribute positions alike. */
export function esc(value: unknown): string {
  if (value instanceof SafeHtml) return value.value;
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

/** Tagged template that escapes every interpolation. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  const out = strings.reduce((acc, chunk, i) => {
    const value = i < values.length ? esc(values[i]) : "";
    return acc + chunk + value;
  }, "");
  return new SafeHtml(out);
}

/** Joins already-safe fragments. */
export function join(parts: (SafeHtml | null | undefined | false)[]): SafeHtml {
  return new SafeHtml(parts.filter(Boolean).join(""));
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

/**
 * Plain-text fallback, built from the same lines the HTML shows rather than by
 * stripping tags, so the two cannot drift into saying different things.
 */
export function textBody(lines: (string | null | undefined | false)[]): string {
  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

/* ---------------------------------------------------------------------------
 * THE DESIGN THE OWNER APPROVED (round 41) — the "Booking confirmed" draft of
 * 2026-10-19, applied to every email. Volt on black, the HF badge and the
 * wordmark, one headline card, the facts as rows, ONE button, the rule that
 * matters next, a receipt only when money moved, small print, and a footer
 * that says why the reader got it.
 *
 * COLOURS COME FROM THE TOKEN TABLE, like the share card's: a theme change in
 * `tailwind.config.ts` moves the emails too. Email clients support no CSS
 * variables, so they are written into inline styles here, once.
 *
 * TABLES AND INLINE STYLES, because that is what Gmail, Seznam, Outlook and
 * Apple Mail all render alike. The one <style> block only tightens the
 * padding on a phone; a client that strips it keeps a perfectly usable email.
 *
 * DROPPED FROM THE DRAFT, by the owner's later rulings: the safety notice and
 * the operator / Česká obchodní inspekce lines (2026-10-27, "we have it in the
 * ToS, that's enough"). The terms PDF still travels with every purchase.
 * ------------------------------------------------------------------------- */

const theme = (tailwindConfig.theme?.extend?.colors ?? {}) as Record<string, string>;

const C = {
  ink: theme.ink ?? "#080808",
  card: theme.surface ?? "#0F0F0F",
  line: theme["surface-seg"] ?? "#242424",
  bone: theme.bone ?? "#E9E7E0",
  muted: theme.muted ?? "#9A9A9A",
  faint: theme.faint ?? "#7E7E7E",
  volt: theme.volt ?? "#C8FF00",
  white: "#FFFFFF",
} as const;

const BODY_FONT = "Onest,'Helvetica Neue',Helvetica,Arial,sans-serif";
const DISPLAY_FONT = "Anton,'Arial Narrow','Helvetica Neue',Arial,sans-serif";

export interface EmailRow {
  label: string;
  /** Text, or markup this module produced (a Maps link). */
  value: string | SafeHtml;
  /** The same fact for the plain-text body, when `value` is markup. */
  text?: string;
}

export interface EmailReceipt {
  title: string;
  rows: EmailRow[];
  /** The waiver as the player ticked it, with the time — Texty 5.1. */
  note?: string | null;
}

export interface EmailParts {
  locale: Locale;
  /** Absolute origin for the badge and every link — `siteUrl()`. */
  baseUrl: string;
  subject: string;
  /** The line an inbox shows after the subject. */
  preheader: string;
  eyebrow: string;
  headline: string;
  lede: string;
  /** Somebody's own words — the organizer's reason — set apart as a quote. */
  quote?: string | null;
  rows?: EmailRow[];
  cta?: { href: string; label: string } | null;
  /** One quiet line under the button. */
  ctaNote?: string | null;
  /**
   * A code to type, big and spaced (round 41) — the Supabase sign-in email's
   * six digits, for the link that opens in the wrong app's browser.
   */
  code?: { label: string; value: string } | null;
  /** The rule that matters next, with `**bold**` allowed for one phrase. */
  rule?: string | null;
  receipt?: EmailReceipt | null;
  smallPrint?: (string | SafeHtml)[];
  /** Why this reader got this email. */
  footer: string;
  attachments?: EmailAttachment[];
}

/** `**phrase**` → bold, everything else escaped. The only markup copy may carry. */
function emphasis(text: string): SafeHtml {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return join(
    parts.map((part, i) =>
      i % 2 === 1 ? html`<strong style="color:${C.bone}">${part}</strong>` : html`${part}`,
    ),
  );
}

function plain(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

/** A link inside a row or the small print. */
export function emailLink(href: string, label: string, tone: "volt" | "quiet" = "volt"): SafeHtml {
  const color = tone === "volt" ? C.volt : C.muted;
  const decoration = tone === "volt" ? "none" : "underline";
  return html`<a href="${href}" style="color:${color};text-decoration:${decoration}">${label}</a>`;
}

function detailRows(rows: EmailRow[]): SafeHtml {
  const cell = `font-family:${BODY_FONT};vertical-align:top;padding:12px 0;border-top:1px solid ${C.line}`;
  return join(
    rows.map(
      (row) =>
        html`<tr><td style="${cell};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C.faint};width:96px">${row.label}</td><td style="${cell};font-size:15px;line-height:21px;color:${C.bone}">${row.value}</td></tr>`,
    ),
  );
}

function receiptBlock(receipt: EmailReceipt): SafeHtml {
  const cell = `font-family:${BODY_FONT};font-size:13px;padding:6px 0;vertical-align:top`;
  return html`<tr><td class="px" style="padding:26px 28px 0"><div style="font-family:${BODY_FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.faint};font-weight:600;padding-bottom:6px">${receipt.title}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${join(
    receipt.rows.map(
      (row) =>
        html`<tr><td style="${cell};color:${C.faint};width:96px">${row.label}</td><td style="${cell};line-height:19px;color:${C.bone}">${row.value}</td></tr>`,
    ),
  )}</table>${
    receipt.note
      ? html`<div style="margin-top:10px;font-family:${BODY_FONT};font-size:12px;line-height:18px;color:${C.faint}">${receipt.note}</div>`
      : ""
  }</td></tr>`;
}

/** The whole email, HTML and text, from its parts. */
export function renderEmail(parts: EmailParts): RenderedEmail {
  const badge = `${parts.baseUrl}/brand/hf-logo-96.png`;

  const header = html`<tr><td class="px" style="padding:0 28px 22px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="vertical-align:middle"><img src="${badge}" width="36" height="36" alt="Hraj Fotbal" style="display:block;border:0;border-radius:18px"></td><td style="vertical-align:middle;padding-left:10px;font-family:${BODY_FONT};font-size:13px;letter-spacing:3px;text-transform:uppercase;color:${C.bone}">Hraj <span style="color:${C.volt}">Fotbal</span></td></tr></table></td></tr>`;

  const card = html`<tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:30px 28px 6px"><div style="font-family:${BODY_FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.volt};font-weight:600">${parts.eyebrow}</div><div class="h1" style="margin-top:10px;font-family:${DISPLAY_FONT};font-size:48px;line-height:50px;text-transform:uppercase;color:${C.white}">${parts.headline}</div><div style="margin-top:12px;font-family:${BODY_FONT};font-size:16px;line-height:24px;color:${C.bone}">${parts.lede}</div>${
    parts.quote
      ? html`<div style="margin-top:14px;padding-left:12px;border-left:2px solid ${C.volt};font-family:${BODY_FONT};font-size:15px;line-height:22px;color:${C.bone}">${parts.quote}</div>`
      : ""
  }</td></tr>${
    parts.rows?.length
      ? html`<tr><td class="px" style="padding:18px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRows(parts.rows)}</table></td></tr>`
      : ""
  }${
    parts.cta
      ? html`<tr><td class="px" style="padding:18px 28px 30px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.volt}" style="background:${C.volt};border-radius:999px"><a href="${parts.cta.href}" style="display:inline-block;padding:14px 26px;font-family:${BODY_FONT};font-size:15px;font-weight:600;color:${C.ink};text-decoration:none">${parts.cta.label}&nbsp;→</a></td></tr></table>${
          parts.ctaNote
            ? html`<div style="margin-top:14px;font-family:${BODY_FONT};font-size:13px;color:${C.muted}">${parts.ctaNote}</div>`
            : ""
        }</td></tr>`
      : html`<tr><td style="padding:0 0 24px"></td></tr>`
  }${
    parts.code
      ? html`<tr><td class="px" style="padding:0 28px 30px"><div style="font-family:${BODY_FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.faint};font-weight:600">${parts.code.label}</div><div style="margin-top:8px;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:30px;letter-spacing:8px;color:${C.white}">${parts.code.value}</div></td></tr>`
      : ""
  }</table></td></tr>`;

  const rule = parts.rule
    ? html`<tr><td class="px" style="padding:22px 28px 0;font-family:${BODY_FONT};font-size:14px;line-height:21px;color:${C.muted}">${emphasis(parts.rule)}</td></tr>`
    : null;

  const smallPrint = parts.smallPrint?.length
    ? html`<tr><td class="px" style="padding:26px 28px 0"><div style="border-top:1px solid ${C.line};padding-top:20px;font-family:${BODY_FONT};font-size:12px;line-height:18px;color:${C.faint}">${join(
        parts.smallPrint.map((line, i) =>
          i === 0 ? html`<div>${line}</div>` : html`<div style="margin-top:8px">${line}</div>`,
        ),
      )}</div></td></tr>`
    : null;

  const footer = html`<tr><td class="px" style="padding:24px 28px 0;font-family:${BODY_FONT};font-size:12px;line-height:18px;color:${C.faint}">Hraj Fotbal · ${emailLink("mailto:support@hrajfotbal.com", "support@hrajfotbal.com", "quiet")}<br>${parts.footer}</td></tr>`;

  const page = html`<!doctype html><html lang="${parts.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${parts.subject}</title><link href="https://fonts.googleapis.com/css2?family=Anton&amp;family=Onest:wght@400;600&amp;display=swap" rel="stylesheet"><style>body{margin:0;padding:0;background:${C.ink}}@media (max-width:600px){.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:40px!important;line-height:42px!important}}</style></head><body style="margin:0;padding:0;background:${C.ink}"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${parts.preheader}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ink}" style="background:${C.ink}"><tr><td align="center" style="padding:28px 12px 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">${join([
    header,
    card,
    rule,
    parts.receipt ? receiptBlock(parts.receipt) : null,
    smallPrint,
    footer,
  ])}</table></td></tr></table></body></html>`;

  const rowText = (row: EmailRow) => `${row.label}: ${row.text ?? String(row.value)}`;
  const text = textBody([
    parts.eyebrow.toUpperCase(),
    parts.headline,
    "",
    parts.lede,
    parts.quote ? `“${parts.quote}”` : null,
    parts.rows?.length ? "" : null,
    ...(parts.rows ?? []).map(rowText),
    parts.cta ? "" : null,
    parts.cta ? `${parts.cta.label}: ${parts.cta.href}` : null,
    parts.ctaNote ?? null,
    parts.code ? `${parts.code.label}: ${parts.code.value}` : null,
    parts.rule ? "" : null,
    parts.rule ? plain(parts.rule) : null,
    parts.receipt ? "" : null,
    parts.receipt ? parts.receipt.title.toUpperCase() : null,
    ...(parts.receipt?.rows ?? []).map(rowText),
    parts.receipt?.note ?? null,
    parts.smallPrint?.length ? "" : null,
    ...(parts.smallPrint ?? []).map((line) =>
      line instanceof SafeHtml ? stripTags(line.value) : line,
    ),
    "",
    "Hraj Fotbal · support@hrajfotbal.com",
    parts.footer,
  ]);

  return {
    subject: parts.subject,
    html: page.value,
    text,
    attachments: parts.attachments?.length ? parts.attachments : undefined,
  };
}

/** For small-print lines that carry a link: the text version keeps the URL. */
function stripTags(markup: string): string {
  return markup
    // A link keeps its address in text — unless the label already IS it.
    .replace(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g, (_, href: string, label: string) =>
      href === label || href === `mailto:${label}` ? label : `${label} (${href})`,
    )
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
