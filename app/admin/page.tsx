import type { Metadata } from "next";
import Link from "next/link";
import { getAdminDashboard } from "@/lib/admin/dashboard";
import { listPaymentsNeedingAttention } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.admin.dashboardTitle };
export const dynamic = "force-dynamic";

/**
 * `/admin` — THE DASHBOARD (round 8, item 2), from `p14`.
 *
 * ~~`/admin` has no dashboard of its own — games are what an organizer opens
 * the panel to do. The stats page is one nav click away and is a reading
 * surface, not a landing one.~~ **REVERSED.** That was true when the landing
 * choice was "a list of games or a page of percentages". `p14` is neither: it
 * is four numbers and the next six fixtures, which answers "is everything on
 * track" before you have decided what to open.
 *
 * EVERY ELEMENT LINKS TO ITS HOME ROUTE, which is the rule that keeps this a
 * dashboard rather than a fifth place facts live. The tiles are not
 * decoration: upcoming games and the game rows go to `/admin/games`, players
 * to `/admin/players`, revenue to the financials page. Nothing here is the
 * only way to reach anything.
 *
 * THE FIFTH CHIP IS THIS PAGE. Round 7 read the clipped chip in `p14` off its
 * pixels — volt-outlined where the other four are grey, which in this system
 * means CURRENT — and inferred a Dashboard entry. The owner ruled it so; it is
 * now first in `adminNavLinks` and volt on this route.
 *
 * `+ ADD VENUE` AND `EXPORT DATA` FROM THE FRAME ARE OMITTED. Adding a venue
 * is deliberately folded into the game form (item 0, and the reasoning in
 * `app/admin/games/actions.ts`), so a separate button would be a second door
 * to a sub-form. "Export data" has no defined scope — players, games, top-ups
 * and financials each already export their own CSV, and a button that means
 * "all of it" is a decision nobody has made.
 */
/*
 * p14 sets these in tracked capitals; the rest of the product does not, and
 * ruling B made `eyebrow` the only uppercase style. This is the frame's
 * treatment on the frame's own page — four capsules that read as one control
 * group — and it stops at the admin dashboard.
 */
const QUICK_ACTION =
  "flex min-h-11 items-center justify-center rounded-pill border-2 border-hairline-volt px-4 py-3 text-[11px] font-bold uppercase tracking-[1.5px] text-volt no-underline transition-colors hover:border-volt";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const [d, attention] = await Promise.all([
    getAdminDashboard(),
    listPaymentsNeedingAttention(),
  ]);

  const tiles = [
    {
      label: strings.admin.tileUpcoming,
      value: String(d.upcomingGames),
      href: "/admin/games",
      testId: "tile-upcoming",
    },
    {
      label: strings.admin.tilePlayers,
      value: String(d.totalPlayers),
      href: "/admin/players",
      testId: "tile-players",
    },
    {
      label: strings.admin.tileNewPlayers,
      value: String(d.newPlayers7d),
      href: "/admin/players",
      testId: "tile-new-players",
    },
    {
      label: strings.admin.tileRevenue,
      value: formatCzk(d.revenueMonthCzk),
      href: "/admin/stats",
      testId: "tile-revenue",
    },
  ];

  return (
    <>
      {/*
        `page-title` — RESTORED IN ROUND 12 (R28).

        Round 10 moved every admin heading to `title` because `page-title`
        rendered a 28.2px cap where all nineteen frames draw 23.4, and `title`
        at 21.3 was the closest token the scale had. The finding it recorded —
        that `page-title` itself was the thing that was wrong — is now acted
        on: the step is 27.3px at 390, a 23.5px cap, and it IS the frames'
        number. So the closest token became the correct one.

        Admin still holds ONE page-title treatment across six pages, which is
        what round 10 was really fixing; only the step underneath it moved.
      */}
      <h2 className="m-0 font-display text-page-title uppercase tracking-wide text-white">
        {strings.admin.dashboardTitle}
      </h2>

      {/*
        Two-up, as p14 draws them — and on the frame's gaps, which are not
        square: 17px between the columns, 9.9px between the rows.
      */}
      {/*
        MONEY WITH NO SEAT, ABOVE EVERYTHING (round 12, item 5c).

        This list is expected to be empty. That is exactly why it is here and
        not behind a tab: a queue nobody visits is a queue that grows, and this
        one holds payments that have already left somebody's account. One line
        of dashboard on the ordinary day; impossible to miss on the day it is
        not.

        NOTHING RESOLVES IT AUTOMATICALLY. A sweep that refunded, or one that
        moved somebody off a seat to make room, would be the product deciding
        about a stranger's money.
      */}
      {attention.length > 0 && (
        <section
          data-testid="payment-attention"
          className="lifted mt-5 rounded-card border-2 border-hairline-volt p-4"
        >
          <h3 className="m-0 font-display text-body-lg uppercase tracking-wide text-volt">
            {strings.admin.attentionTitle.replace("{n}", String(attention.length))}
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            {strings.admin.attentionLede}
          </p>
          <ul className="mt-3 list-none space-y-3 p-0">
            {attention.map((row) => (
              <li key={row.bookingId} data-testid="payment-attention-row">
                <Link
                  href={`/admin/games/${row.gameId}`}
                  className="block no-underline"
                >
                  <span className="block text-body font-semibold text-white">
                    {row.nickname} · {row.venue}
                  </span>
                  <span className="mt-1 block text-small text-muted">
                    {formatGameDateTime(row.startsAt)} · {row.seats}{" "}
                    {strings.admin.attentionSeats} · {formatCzk(row.amountOwedCzk)}
                  </span>
                  <span className="mt-1 block text-small text-bone">{row.reason}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        data-testid="dashboard-tiles"
        className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2.5"
      >
        {tiles.map((tile) => (
          <Link
            key={tile.testId}
            href={tile.href}
            data-testid={tile.testId}
            /*
              `p-4`, NOT `p-5` (round 10, item 1). p14's tile is 93.5px tall
              and ours was 130. The frame spends its height on the numeral,
              not on padding.
            */
            className="lifted rounded-card p-4 no-underline transition-colors hover:border-hairline-volt"
          >
            {/*
              VOLT AND UNWRAPPED (round 8, item 12). p14 sets these labels in
              the accent, not in grey — that colour is a large part of what
              makes the frame's tiles read as a set rather than as four boxes.

              `tracking-[1.5px]` rather than `eyebrow`'s 3px: at 3px
              "UPCOMING GAMES" and "NEW PLAYERS (7D)" both wrap onto two lines
              in a half-width tile, which the frame keeps on one. This is the
              same collision round 6 accepted on the profile's stat captions;
              here it hits all four tiles at once and is worth the local
              override.
            */}
            {/*
              `volt/80`, NOT `volt-dim` (round 10, item 1). Sampled off p14
              and corrected for the export's black-lift: the frame renders
              pure volt as (201,248,47) and this label as (165,203,40), which
              is 82% of it in both live channels. `volt-dim` is 72%. The
              label is a dimmed volt, not the dim-volt token.
            */}
            <div className="text-[10px] font-semibold uppercase tracking-[1.5px] text-volt/80">
              {tile.label}
            </div>
            {/* Anton at display scale — R5's "large counters". */}
            {/*
              32px STANDS, and `mt-3` rather than `mt-2` (round 10, item 1).

              This was briefly 40px on a cap-height ratio taken from Anton's
              published metrics (0.72). The rendered ratio is 0.86 — measured
              off our own screenshot at a known font size, which is the only
              ratio that matters here. p14's numeral cap is 26.9px, so the em
              is ~31px and round 8's 32 was already right.

              `mt-3` closes the last of it: the frame leaves 17.3px between
              the label's baseline and the numeral's cap, and `mt-2` left 14.
            */}
            <div className="mt-3 font-display text-[32px] leading-none text-volt">
              {tile.value}
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-5">
        {/*
          NO `All games →` (round 10, item 1). p14 puts nothing beside this
          heading — the rows themselves are the way onward, and the Games chip
          is two centimetres up the screen. Round 8 added the link as a
          convenience; the frame is the acceptance test.
        */}
        {/*
          `body-lg`, NOT `section-title` (round 10, item 1). p14's section
          heading is a 16.4px cap — a ~18.5px em — where `section-title`
          renders 21.3. The frames' own title:section ratio is 0.70 and
          `body-lg` over `title` is 0.71, so this is the same step down the
          scale the frame takes, from the base the frame actually uses.
        */}
        <h3 className="m-0 font-display text-body-lg uppercase tracking-wide text-white">
          {strings.admin.dashboardUpcoming}
        </h3>

        {d.rows.length === 0 ? (
          <p data-testid="dashboard-empty" className="mt-4 text-small text-faint">
            {strings.admin.dashboardEmpty}
          </p>
        ) : (
          <ul className="lifted mt-3 list-none rounded-card p-0">
            {d.rows.map((row) => (
              <li key={row.id} className="border-b border-hairline last:border-b-0">
                <Link
                  href={`/admin/games/${row.id}`}
                  data-testid="dashboard-game-row"
                  /*
                    `py-3` AND p14's GEOMETRY, UNCHANGED. Item 20's "much
                    vertically shorter per row" is about the GAMES PILL LIST at
                    `/admin/games`, which was 137px a row; these are 64, which
                    is the pitch p14 draws and `strips-admin-dashboard` pins.
                    Shortening a row the frame specifies to satisfy a
                    complaint about a different list would trade one fidelity
                    for another.
                  */
                  className="flex items-center justify-between gap-3 px-5 py-3 no-underline"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body font-semibold text-white">
                      {row.venue}
                    </span>
                    {/*
                      `date · format · organizer`, which is p14's meta line
                      (round 10, item 1).
                    */}
                    <span className="block truncate text-small text-muted">
                      {[formatGameDateTime(row.startsAt), row.format, row.organizer]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {/*
                      `booked / capacity` — the one number that decides whether
                      an organizer has to do anything about this game today.
                    */}
                    <span className="block text-body font-bold text-volt">
                      {row.booked} / {row.capacity}
                    </span>
                    {/*
                      p14 colours the status rather than greying it —
                      `Confirmed` reads volt on the frame. Volt for a game
                      that is on, muted for anything else, so the row says
                      "nothing to do here" at a glance.

                      FULL VOLT AND SENTENCE CASE (round 10, item 1). Sampled
                      off p14: the status is (201,248,47), the same ink as the
                      `18 / 22` above it — not the dimmed volt round 8 used.
                      And it is `Confirmed`, not `CONFIRMED`; the tracked caps
                      were an eyebrow treatment applied to a value.
                    */}
                    <span
                      className={`block text-small font-semibold capitalize ${
                        row.status === "published" || row.status === "full"
                          ? "text-volt"
                          : "text-muted"
                      }`}
                    >
                      {strings.admin.dashboardStatus[row.status] ?? row.status}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        GAMES AND PLAYERS, BETWEEN THE BOARD AND THE ACTIONS (round 13,
        item 20).

        The chip row at the top of every admin page already reaches both, and
        that is the objection to putting them here — answered by what the
        dashboard is FOR. The rows above are the six games that need attention
        today; these are the two lists you go to when the answer is not on that
        board. A chip row is navigation you use when you know where you are
        going; this is the dashboard finishing its own sentence.

        SECTIONS, NOT PILLS. The duplicate pill row that used to sit at the
        bottom of this page was the chip row a second time, in a place that
        made it look like a different set of destinations.
      */}
      <section className="mt-5" data-testid="dashboard-sections">
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: "/admin/games", label: strings.admin.navGames, testId: "dashboard-to-games" },
            {
              href: "/admin/players",
              label: strings.admin.navPlayers,
              testId: "dashboard-to-players",
            },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-testid={link.testId}
              className="lifted flex min-h-11 items-center justify-between rounded-card px-4 py-3 text-body font-semibold text-bone no-underline transition-colors hover:border-hairline-volt"
            >
              {link.label}
              <span aria-hidden="true" className="text-volt">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/*
        ALL FOUR OF p14's QUICK ACTIONS (round 10, item 1).

        Round 8 shipped two, on the grounds that `+ ADD VENUE` and
        `EXPORT DATA` had no destination. Both do:

          · EXPORT DATA is `/admin/stats/transactions`, the CSV round 8 itself
            built for the financials page an item earlier.
          · ~~ADD VENUE is the new-venue block inside `/admin/games/new`,
            reached with `?venue=new`.~~ ROUND 13 ITEM 24: it is
            `/admin/venues`, a real management surface. Creating a venue as a
            side effect of making a game was backwards — a venue outlives
            every game played on it.

        The frame's two rows are two tiers and ours already read that way:
        the create/add pair sits on the brighter volt hairline, export and
        financials on the same rule at rest.
      */}
      <section className="mt-5">
        {/*
          `body-lg`, NOT `section-title` (round 10, item 1). p14's section
          heading is a 16.4px cap — a ~18.5px em — where `section-title`
          renders 21.3. The frames' own title:section ratio is 0.70 and
          `body-lg` over `title` is 0.71, so this is the same step down the
          scale the frame takes, from the base the frame actually uses.
        */}
        <h3 className="m-0 font-display text-body-lg uppercase tracking-wide text-white">
          {strings.admin.quickActions}
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link
            href="/admin/games/new"
            data-testid="quick-create-game"
            className={QUICK_ACTION}
          >
            {strings.admin.quickCreateGame}
          </Link>
          <Link
            href="/admin/venues"
            data-testid="quick-add-venue"
            className={QUICK_ACTION}
          >
            {strings.admin.quickAddVenue}
          </Link>
          <a href="/admin/stats/transactions" data-testid="quick-export" className={QUICK_ACTION}>
            {strings.admin.quickExportData}
          </a>
          <Link href="/admin/stats" data-testid="quick-financials" className={QUICK_ACTION}>
            {strings.admin.financialsTitle}
          </Link>
        </div>
      </section>
    </>
  );
}
