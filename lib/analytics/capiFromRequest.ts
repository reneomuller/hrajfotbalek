import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { siteUrl } from "@/lib/site";
import { buildCapiEvent, capiConfig, sendCapiEvent, type CapiEventName } from "@/lib/analytics/metaCapi";

/**
 * Queues one Conversions API event for the current request (`lib/analytics/metaCapi.ts`).
 *
 * A no-op unless Meta is configured AND the reader's stored choice says
 * `marketing: true`. Reads cookies and headers only (legal in a Server
 * Component); the send itself runs in `after()`, once the page has been
 * delivered, so it can neither slow nor break the page.
 */
export async function queueCapiEvent(input: { name: CapiEventName; eventId: string; playerId: string; path: string; value?: number }): Promise<void> {
  const config = capiConfig();
  if (!config) return;
  const jar = await cookies();
  if (!parseConsent(jar.get(CONSENT_COOKIE)?.value)?.marketing) return;
  const h = await headers();
  const event = buildCapiEvent({
    name: input.name,
    eventId: input.eventId,
    playerId: input.playerId,
    sourceUrl: `${await siteUrl()}${input.path}`,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: h.get("user-agent"),
    fbp: jar.get("_fbp")?.value ?? null,
    fbc: jar.get("_fbc")?.value ?? null,
    value: input.value,
    atSeconds: Math.floor(Date.now() / 1000),
  });
  after(() => sendCapiEvent(config, event));
}
