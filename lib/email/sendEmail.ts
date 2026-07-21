/**
 * The single email seam.
 *
 * Every transactional email in the system goes through `sendEmail()`. The one
 * deliberate exception is the Supabase magic-link email, which Supabase
 * delivers via its own SMTP configuration and which stays outside this seam
 * until the Phase 30 cutover — do not route it through here.
 *
 * `EMAIL_DRY_RUN` gates delivery so the whole system is buildable and testable
 * before Resend's DNS verifies. The default is deliberately conservative: a
 * missing or unrecognised value LOGS rather than SENDS. Getting that backwards
 * means a misconfigured environment mails real players.
 */

export interface EmailAttachment {
  filename: string;
  /** UTF-8 content. The only attachment type in Phase 1 is a `.ics` file. */
  content: string;
  contentType: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export type SendEmailResult =
  | { delivered: false; reason: "dry_run"; payload: EmailPayload }
  | { delivered: true; id: string };

const TRUTHY_OFF = new Set(["off", "false", "0", "no"]);

/**
 * Dry-run is ON unless the environment explicitly turns it off.
 * Only an explicit off-value ("off" / "false" / "0" / "no") enables delivery.
 */
export function isDryRun(): boolean {
  const raw = process.env.EMAIL_DRY_RUN?.trim().toLowerCase();
  if (raw === undefined || raw === "") return true;
  return !TRUTHY_OFF.has(raw);
}

export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  if (isDryRun()) {
    // The dry-run log IS the M3 verification surface: the whole lifecycle is
    // observed through these lines before Resend's DNS verifies. They carry
    // enough to identify which email fired for whom, and never the body.
    console.info("[sendEmail:dry-run] would send", {
      to: payload.to,
      subject: payload.subject,
      bytes: payload.html.length,
      attachments: payload.attachments?.map((a) => a.filename) ?? [],
    });
    return { delivered: false, reason: "dry_run", payload };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "EMAIL_DRY_RUN is off but RESEND_API_KEY is not set — refusing to attempt delivery.",
    );
  }

  const from = process.env.EMAIL_FROM ?? "Hraj Fotbal <noreply@hrajfotbal.com>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      ...(payload.text ? { text: payload.text } : {}),
      ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
      ...(payload.attachments?.length
        ? {
            attachments: payload.attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content, 'utf8').toString('base64'),
              content_type: a.contentType,
            })),
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend rejected the message (${response.status}): ${detail}`);
  }

  const body = (await response.json()) as { id: string };
  return { delivered: true, id: body.id };
}

/**
 * Renders a template and sends it through the same seam.
 *
 * Templates are pure functions of their props with no knowledge of when they
 * fire — that is the dispatch layer's job — so this is the only place a
 * rendered email meets a recipient address.
 */
export async function sendRenderedEmail(
  to: string,
  rendered: {
    subject: string;
    html: string;
    text?: string;
    attachments?: EmailAttachment[];
  },
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    attachments: rendered.attachments,
  });
}
