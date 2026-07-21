import type { EmailAttachment } from "@/lib/email/sendEmail";

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
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Tagged template that escapes every interpolation. */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SafeHtml {
  const out = strings.reduce((acc, chunk, i) => {
    const value = i < values.length ? esc(values[i]) : "";
    return acc + chunk + value;
  }, "");
  return new SafeHtml(out);
}

/** Joins already-safe fragments. */
export function join(parts: (SafeHtml | null | undefined)[]): SafeHtml {
  return new SafeHtml(parts.filter(Boolean).join(""));
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

const COLORS = {
  ink: "#0A0A0A",
  bone: "#E9E7E0",
  volt: "#C8FF00",
  muted: "#9A9A9A",
} as const;

/**
 * Styling is inline and deliberately plain: email clients strip <style> blocks
 * and support no CSS variables, so the volt-on-black theme cannot be reused
 * wholesale. Legibility in Gmail, Seznam and Apple Mail beats brand fidelity.
 */
export function emailShell(heading: string, body: SafeHtml): string {
  return `<!DOCTYPE html>${html`<html lang="en"><body style="margin:0;padding:24px;background-color:${COLORS.ink};color:${COLORS.bone};font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5"><table role="presentation" width="100%" style="max-width:520px;margin:0 auto"><tbody><tr><td><div style="font-size:13px;letter-spacing:2px;color:${COLORS.volt};text-transform:uppercase">Hraj Fotbal</div><h1 style="font-size:22px;margin:12px 0 20px;color:#FFFFFF">${heading}</h1>${body}</td></tr></tbody></table></body></html>`}`;
}

export function paragraph(text: string): SafeHtml {
  return html`<p style="margin:12px 0">${text}</p>`;
}

export function fact(label: string, value: string): SafeHtml {
  return html`<p style="margin:6px 0;color:${COLORS.muted}">${label}: <span style="color:${COLORS.bone};font-weight:bold">${value}</span></p>`;
}

export function button(href: string, label: string): SafeHtml {
  return html`<p style="margin:24px 0"><a href="${href}" style="background-color:${COLORS.volt};color:${COLORS.ink};padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${label}</a></p>`;
}

/**
 * Plain-text fallback, built from the same lines the HTML shows rather than by
 * stripping tags, so the two cannot drift into saying different things.
 */
export function textBody(lines: (string | null | undefined)[]): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}
