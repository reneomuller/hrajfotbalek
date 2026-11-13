import { createHash } from "node:crypto";

/**
 * Meta Conversions API — the server half of the Meta Pixel (GTM v4, item 9).
 *
 * DORMANT UNTIL BOTH `META_PIXEL_ID` AND `META_CAPI_TOKEN` ARE SET. The token
 * lives in Vercel only (Production), entered by the owner; it never appears in
 * code, logs or a URL (it travels in the request body).
 *
 * MARKETING CONSENT ONLY. Callers pass the reader's stored choice; nothing is
 * sent without `marketing: true`, the same rule GTM's Pixel tag obeys.
 *
 * ONE EVENT, TWO SENDERS, COUNTED ONCE. The browser's Pixel (fired by GTM from
 * the dataLayer push) and this call carry the same `event_id`, so Meta
 * deduplicates: a Purchase uses the Stripe Checkout Session id, a registration
 * `signup_<player id>`.
 *
 * NO EMAIL, NO PHONE, NO RAW ID. Matching uses Meta's own `_fbp`/`_fbc`
 * cookies, the request's IP and user agent, and a SHA-256 of the internal
 * player id as `external_id`.
 *
 * NEVER IN THE WAY. `sendCapiEvent` is called from `after()`, so it runs once
 * the response has gone; it has its own timeout and reports failure by
 * returning false. A Meta outage cannot slow or break a page.
 */

/**
 * The Conversions API runs on the MARKETING API's versions, which Meta retires
 * far sooner than the Graph API's: the first draft's v21.0 had already expired
 * there. v25.0 was current on 2026-11-12 (developers.facebook.com, "Graph API
 * and Marketing API Versions") — bump it when Meta schedules its retirement.
 */
export const GRAPH_VERSION = "v25.0";
const SEND_TIMEOUT_MS = 4_000;
const CURRENCY = "CZK";

export type CapiEventName = "Purchase" | "CompleteRegistration";

export interface CapiConfig { pixelId: string; token: string }

export function capiConfig(env: NodeJS.ProcessEnv = process.env): CapiConfig | null {
  const pixelId = env.META_PIXEL_ID?.trim() ?? "";
  const token = env.META_CAPI_TOKEN?.trim() ?? "";
  if (!/^\d{6,20}$/.test(pixelId) || token.length === 0) return null;
  return { pixelId, token };
}

export const registrationEventId = (playerId: string): string => `signup_${playerId}`;

export interface CapiInput {
  name: CapiEventName;
  eventId: string;
  playerId: string;
  sourceUrl: string;
  ip: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  /** CZK, for a Purchase. */
  value?: number;
  atSeconds: number;
}

export interface CapiEvent {
  event_name: CapiEventName;
  event_id: string;
  event_time: number;
  action_source: "website";
  event_source_url: string;
  user_data: Record<string, string>;
  custom_data?: { value: number; currency: string };
}

const sha256 = (value: string): string => createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

export function buildCapiEvent(input: CapiInput): CapiEvent {
  const userData: Record<string, string> = { external_id: sha256(input.playerId) };
  if (input.ip) userData.client_ip_address = input.ip;
  if (input.userAgent) userData.client_user_agent = input.userAgent;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  const event: CapiEvent = {
    event_name: input.name,
    event_id: input.eventId,
    event_time: input.atSeconds,
    action_source: "website",
    event_source_url: input.sourceUrl,
    user_data: userData,
  };
  if (input.value != null) event.custom_data = { value: input.value, currency: CURRENCY };
  return event;
}

/** Posts one event. Returns whether Meta accepted it; never throws. */
export async function sendCapiEvent(config: CapiConfig, event: CapiEvent): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.pixelId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: [event], access_token: config.token }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) console.error("meta capi rejected", event.event_name, res.status);
    return res.ok;
  } catch (error) {
    console.error("meta capi failed", event.event_name, error instanceof Error ? error.name : "unknown");
    return false;
  }
}
