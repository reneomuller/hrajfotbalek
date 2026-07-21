import { renderToStaticMarkup } from "react-dom/server";
import type { EmailAttachment } from "@/lib/email/sendEmail";

/**
 * Shared email shell.
 *
 * WHY JSX RATHER THAN STRING CONCATENATION: every template interpolates
 * admin-supplied venue text and player-chosen nicknames. React escapes text
 * children by construction, so the escaping requirement is satisfied by the
 * rendering model rather than by remembering to call an escape helper at each
 * of several dozen interpolation sites. `dangerouslySetInnerHTML` must never
 * appear in this directory.
 *
 * Styling is inline and deliberately plain: email clients strip <style> blocks
 * and support no CSS variables, so the volt-on-black theme cannot be reused
 * here. Legibility in Gmail, Seznam and Apple Mail beats brand fidelity.
 */

const COLORS = {
  ink: "#0A0A0A",
  bone: "#E9E7E0",
  volt: "#C8FF00",
  muted: "#9A9A9A",
} as const;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

export function EmailShell({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: "24px",
          backgroundColor: COLORS.ink,
          color: COLORS.bone,
          fontFamily: "Helvetica, Arial, sans-serif",
          fontSize: "15px",
          lineHeight: 1.5,
        }}
      >
        <table role="presentation" width="100%" style={{ maxWidth: "520px", margin: "0 auto" }}>
          <tbody>
            <tr>
              <td>
                <div
                  style={{
                    fontSize: "13px",
                    letterSpacing: "2px",
                    color: COLORS.volt,
                    textTransform: "uppercase",
                  }}
                >
                  Hraj Fotbal
                </div>
                <h1 style={{ fontSize: "22px", margin: "12px 0 20px", color: "#FFFFFF" }}>
                  {heading}
                </h1>
                {children}
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <p style={{ margin: "6px 0", color: COLORS.muted }}>
      {label}:{" "}
      <span style={{ color: COLORS.bone, fontWeight: "bold" }}>{value}</span>
    </p>
  );
}

export function Button({ href, label }: { href: string; label: string }) {
  return (
    <p style={{ margin: "24px 0" }}>
      <a
        href={href}
        style={{
          backgroundColor: COLORS.volt,
          color: COLORS.ink,
          padding: "12px 20px",
          borderRadius: "10px",
          textDecoration: "none",
          fontWeight: "bold",
        }}
      >
        {label}
      </a>
    </p>
  );
}

/** Renders a template element to a full HTML document string. */
export function renderEmail(element: React.ReactElement): string {
  return `<!DOCTYPE html>${renderToStaticMarkup(element)}`;
}

/**
 * Plain-text fallback.
 *
 * Built from the same lines the HTML shows rather than by stripping tags, so
 * the two cannot drift into saying different things.
 */
export function textBody(lines: (string | null | undefined)[]): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}
