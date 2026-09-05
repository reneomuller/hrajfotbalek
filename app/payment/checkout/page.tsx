import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EmbeddedCheckoutFrame } from "@/components/payment/EmbeddedCheckoutFrame";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { getStrings } from "@/lib/i18n/server";
import {
  createEmbeddedSession,
  embeddedCheckoutEnabled,
} from "@/lib/payments/embeddedCheckout";
import { siteUrl } from "@/lib/site";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { formatCzk } from "@/lib/format";
import { policy } from "@/lib/policy";
import { rememberPendingPurchase } from "@/lib/payments/pendingPurchaseCookie";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return {
    title: t.payment.checkoutTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * `/payment/checkout` — the embedded payment form, on our own page
 * (round 25, item 2).
 *
 * THE AMOUNT IS COMPUTED HERE AND NOWHERE ELSE, which is the whole point of
 * the item. A Payment Link had one price and no idea how many seats were being
 * bought, so a party of three was told to set the quantity themselves — and
 * could type 1. This reads the row that already exists and charges what it
 * says: `price_czk` minus whatever wallet credit was already applied.
 *
 * OWNERSHIP IS CHECKED BEFORE A SESSION IS CREATED. The id is in the URL, so
 * the first thing this does is confirm the row belongs to the person asking.
 * Creating a Stripe session for somebody else's booking would be a way to pay
 * for a stranger's seat, which is not a feature.
 *
 * NOTHING HERE SETTLES ANYTHING. The session is created, the form is rendered,
 * and the database is untouched — `checkout.session.completed` reaching
 * `/api/stripe/webhook` is still the only thing that turns a booking into a
 * paid one. The player returning through `return_url` lands on
 * `/payment/return`, which polls rather than assumes.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = searchParams ? await searchParams : {};
  const gameId = typeof query.game === "string" ? query.game : null;
  const passId = typeof query.pass === "string" ? query.pass : null;
  const rawGuests = Number(query.guests);
  const guests =
    Number.isInteger(rawGuests) && rawGuests > 0
      ? Math.min(rawGuests, policy.booking.maxPartyGuests)
      : 0;

  if (!gameId && !passId) notFound();

  const [t, player] = await Promise.all([getStrings(), requireCurrentPlayer()]);

  /*
   * NOT ENABLED IS NOT AN ERROR PAGE. Somebody could reach this URL from a
   * stale tab after the keys were removed, and the right answer is the flow
   * that still works — not a dead end. `/games` for a booking, `/pass` for a
   * tier.
   */
  if (!embeddedCheckoutEnabled()) {
    redirect(gameId ? "/games" : "/pass");
  }

  const supabase = await createServerSupabaseClient();
  const origin = await siteUrl();
  const returnUrl = `${origin}/payment/return?session_id={CHECKOUT_SESSION_ID}`;

  let line: { name: string; description?: string; amountCzk: number };
  let reference: string;
  let backHref: string;

  if (gameId) {
    const { data: gameRow } = await supabase
      .from("games")
      .select("id, venue, status, price_czk, capacity")
      .eq("id", gameId)
      .maybeSingle();

    const game = gameRow as
      | { id: string; venue: string; status: string; price_czk: number; capacity: number }
      | null;

    if (!game) notFound();

    /*
     * THE GAME MUST STILL BE TAKING BOOKINGS, checked before a session is
     * created rather than after money moves. This is not the enforcement —
     * `settle_checkout_session` decides under the game's lock and credits
     * anybody it cannot seat — it is the courtesy of not opening a form that
     * is already doomed.
     */
    if (game.status !== "published" && game.status !== "full") {
      redirect(`/game/${game.id}`);
    }

    const { data: taken } = await supabase.rpc("game_seats_taken", {
      p_game_id: game.id,
    });
    const seats = 1 + guests;
    if ((taken ?? 0) + seats > game.capacity) {
      redirect(`/game/${game.id}`);
    }

    /*
     * THE WHOLE PARTY PRICE, COMPUTED HERE. No wallet credit is applied to an
     * online payment — credit is its own option on the booking form, and
     * mixing the two would mean the webhook had to reconstruct which half was
     * which from an amount.
     */
    line = {
      name: game.venue,
      description: t.payment.checkoutSeats.replace("{seats}", String(seats)),
      amountCzk: game.price_czk * seats,
    };
    reference = game.id;
    backHref = `/game/${game.id}`;
    } else {
    const { data } = await supabase
      .from("credit_topups")
      .select("id, player_id, status, amount_czk, pass_games")
      .eq("id", passId!)
      .maybeSingle();

    const topup = data as
      | {
          id: string;
          player_id: string;
          status: string;
          amount_czk: number;
          pass_games: number | null;
        }
      | null;

    if (!topup || topup.player_id !== player.id) notFound();
    if (topup.status !== "pending") redirect("/pass");

    /*
     * THE PRICE COMES FROM THE ROW, WHICH CAME FROM THE LIVE TIER TABLE.
     * `begin_pass_purchase` reads `pass_tiers` and stamps `amount_czk` — so
     * the number charged here is the tier's price at the moment the buyer
     * pressed the button, not a figure this page recomputed and could get
     * wrong.
     */
    line = {
      name: t.pass.panelTitle,
      description: t.payment.checkoutCredits.replace(
        "{credits}",
        String(topup.pass_games ?? 0),
      ),
      amountCzk: topup.amount_czk,
    };
    reference = topup.id;
    backHref = "/pass";
  }

  const session = await createEmbeddedSession({
    line,
    reference,
    kind: gameId ? "booking" : "pass",
    customerEmail: player.email ?? null,
    returnUrl,
    ...(gameId ? { gameId, guestCount: guests, playerId: player.id } : {}),
  });

  // Stripe refused, or the key was pulled between the gate above and here.
  if (!session) redirect(backHref);

  /*
   * REGISTERED, SO THE GAME CAN KILL IT. If this game fills while the form is
   * on screen, `expireOpenCheckouts` expires this session at Stripe and the
   * card is refused before any money moves — which is the primary defence, and
   * the reason the register exists at all.
   *
   * REGISTERED AFTER THE SESSION EXISTS, never before: a row naming a session
   * id Stripe never issued would be a row active expiry could not kill.
   */
  if (gameId) {
    await supabase.rpc("open_checkout", {
      p_game_id: gameId,
      p_guest_count: guests,
      p_stripe_session_id: session.sessionId,
      p_amount_czk: line.amountCzk,
    });
    await rememberPendingPurchase({ kind: "booking", id: session.sessionId });
  }

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <Link
        href={backHref}
        data-testid="checkout-back"
        className="text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {t.booking.backToGame}
      </Link>

      <h1 className="mt-4 font-display text-page-title uppercase tracking-wide text-white">
        {t.payment.checkoutTitle}
      </h1>

      {/*
        THE AMOUNT, IN OUR OWN TYPE, ABOVE THE FRAME. Stripe shows it too —
        inside an iframe whose styling is the dashboard's, not ours. Saying it
        here first means the number the player checks is set in the product's
        own voice, and it is the same number the session was created with
        because both read `line`.
      */}
      <p
        data-testid="checkout-amount"
        className="mt-2 font-display text-title uppercase leading-none text-volt"
      >
        {formatCzk(line.amountCzk)}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-muted">{line.description}</p>

      <div className="mt-6">
        <EmbeddedCheckoutFrame
          clientSecret={session.clientSecret}
          publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!}
        />
      </div>
    </main>
  );
}
