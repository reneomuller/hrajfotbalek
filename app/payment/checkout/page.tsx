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
import { amountDueCzk } from "@/lib/payments/spd";
import { siteUrl } from "@/lib/site";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { formatCzk } from "@/lib/format";

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
  const bookingId = typeof query.booking === "string" ? query.booking : null;
  const passId = typeof query.pass === "string" ? query.pass : null;

  if (!bookingId && !passId) notFound();

  const [t, player] = await Promise.all([getStrings(), requireCurrentPlayer()]);

  /*
   * NOT ENABLED IS NOT AN ERROR PAGE. Somebody could reach this URL from a
   * stale tab after the keys were removed, and the right answer is the flow
   * that still works — not a dead end. `/games` for a booking, `/pass` for a
   * tier.
   */
  if (!embeddedCheckoutEnabled()) {
    redirect(bookingId ? "/games" : "/pass");
  }

  const supabase = await createServerSupabaseClient();
  const origin = await siteUrl();
  const returnUrl = `${origin}/payment/return?session_id={CHECKOUT_SESSION_ID}`;

  let line: { name: string; description?: string; amountCzk: number };
  let reference: string;
  let backHref: string;

  if (bookingId) {
    const { data } = await supabase
      .from("bookings")
      .select("id, player_id, status, price_czk, credit_applied_czk, guest_count, game_id")
      .eq("id", bookingId)
      .maybeSingle();

    const booking = data as
      | {
          id: string;
          player_id: string;
          status: string;
          price_czk: number;
          credit_applied_czk: number;
          guest_count: number;
          game_id: string;
        }
      | null;

    // Own-row RLS already scopes this read; the explicit check is the second
    // layer and the one that survives somebody widening a policy.
    if (!booking || booking.player_id !== player.id) notFound();

    /*
     * ONLY AN OPEN BOOKING HAS ANYTHING TO PAY. A confirmed one is done, and a
     * cancelled or expired one must never be payable — taking money for a seat
     * that was released is the worst failure this page could have.
     */
    if (booking.status !== "reserved") redirect(`/game/${booking.game_id}`);

    const due = amountDueCzk(booking.price_czk, booking.credit_applied_czk);
    if (due <= 0) redirect(`/game/${booking.game_id}/book/confirmation?booking=${booking.id}`);

    const { data: gameRow } = await supabase
      .from("games")
      .select("venue")
      .eq("id", booking.game_id)
      .maybeSingle();

    const seats = 1 + (booking.guest_count ?? 0);
    line = {
      name: (gameRow as { venue: string } | null)?.venue ?? t.payment.checkoutTitle,
      /*
       * THE SEAT COUNT IS IN THE DESCRIPTION, NOT IN A QUANTITY FIELD. It is
       * what the buyer needs to see to know the number is right, and it cannot
       * be edited into something cheaper.
       */
      description: t.payment.checkoutSeats.replace("{seats}", String(seats)),
      amountCzk: due,
    };
    reference = booking.id;
    backHref = `/game/${booking.game_id}`;
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
    kind: bookingId ? "booking" : "pass",
    customerEmail: player.email ?? null,
    returnUrl,
  });

  // Stripe refused, or the key was pulled between the gate above and here.
  if (!session) redirect(backHref);

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
