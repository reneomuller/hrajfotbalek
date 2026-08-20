/**
 * Stripe Payment Link resolution and parameter stamping (round 8, items 15/16).
 *
 * THERE IS NO STRIPE INTEGRATION. These are hosted Payment Links: the player
 * is handed to a URL Stripe serves, pays there, and reconciliation is MANUAL
 * for now. Nothing here creates a session, verifies a webhook, or flips a
 * booking to paid — the record is created UNPAID on the existing rail before
 * the redirect, exactly as the cash path leaves it, and an organizer settles
 * it the same way.
 *
 * TWO ENVIRONMENT VARIABLES, AND EACH IS THE WHOLE ACTIVATION FOR ITS SURFACE:
 *
 *   NEXT_PUBLIC_STRIPE_PAYMENT_URL   one link, per-game booking
 *   NEXT_PUBLIC_STRIPE_PASS_URLS     a JSON map of tier -> link
 *
 * Absent or empty, the surface behaves exactly as it did before Stripe was
 * mentioned. That is what makes this safe to ship dark.
 */

/**
 * The per-game booking link. Empty string and whitespace both mean "not
 * configured" — a variable set to `""` in a dashboard is the commonest way to
 * turn one of these off, and treating it as a URL would send players nowhere.
 */
export function stripeBookingUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_URL?.trim();
  return raw ? raw : null;
}

/**
 * The pass-tier map, keyed by the tier's GAME COUNT.
 *
 * WHY THE GAME COUNT IS THE IDENTIFIER: `pass_tiers` has no surrogate key that
 * outlives a price change, and `create_pass_topup` already takes `p_pass_games`
 * — so the count is what the purchase path speaks. Keys are read as strings so
 * `{"5": "..."}` and `{"12": "..."}` both work from a JSON object.
 *
 * MALFORMED JSON IS NOT A CRASH. A stray comma in a Vercel variable would
 * otherwise take down the pass page for everyone; instead every tier falls
 * back to the current rail, which is the behaviour with no variable set at
 * all. It logs once so the mistake is findable.
 */
export function stripePassUrls(): Record<string, string> {
  const raw = process.env.NEXT_PUBLIC_STRIPE_PASS_URLS?.trim();
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      // An empty value is the template's resting state — a key present with no
      // link yet. It must read as "not configured", not as a URL of "".
      if (typeof value === "string" && value.trim() !== "") out[key] = value.trim();
    }
    return out;
  } catch {
    console.error("NEXT_PUBLIC_STRIPE_PASS_URLS is not valid JSON — ignoring it");
    return {};
  }
}

/** The link for one tier, or null when that tier has no link configured. */
export function stripePassUrl(games: number): string | null {
  return stripePassUrls()[String(games)] ?? null;
}

/**
 * Stamp a Payment Link with the two parameters that make manual
 * reconciliation possible (item 16).
 *
 * `client_reference_id` is the id of the UNPAID record we just created —
 * a booking or a top-up. Stripe echoes it back on the payment, which is the
 * only thread tying a line in the Stripe dashboard to a row in this database
 * while reconciliation is done by hand.
 *
 * `prefilled_email` saves a step and, more usefully, makes the payer's
 * identity match the account when the two would otherwise be typed
 * differently.
 *
 * IT PRESERVES QUERY PARAMS ALREADY ON THE LINK. Stripe Payment Links commonly
 * carry `?locale=` or a UTM tag, and a naive `url + "?a=b"` produces a second
 * `?` that silently breaks the first set. `URL` handles the join, the
 * encoding, and a link that already carries one of these keys — `set`
 * overwrites rather than appending a duplicate the server would have to pick
 * between.
 *
 * A MALFORMED CONFIGURED URL RETURNS NULL rather than throwing. It is read
 * from an environment variable a human typed.
 */
export function withStripeParams(
  base: string,
  params: { reference: string; email?: string | null },
): string | null {
  try {
    const url = new URL(base);
    url.searchParams.set("client_reference_id", params.reference);
    if (params.email) url.searchParams.set("prefilled_email", params.email);
    return url.toString();
  } catch {
    console.error("Stripe payment link is not a valid URL — ignoring it");
    return null;
  }
}
