import { BookingList } from "@/components/BookingList";
import { formatGameDateTime } from "@/lib/format";
import { getStrings } from "@/lib/i18n/server";
import type { PlayerHistory as History } from "@/lib/booking/history";

/**
 * Two tenses, two lists.
 *
 * Upcoming keeps the existing `BookingList`, because that is where the cancel
 * button and the payment state live and none of that changes. Past is a
 * deliberately flatter thing — venue, date, whether you turned up — since there
 * is no action left to take on a game that has been played.
 */
export async function PlayerHistory({ history }: { history: History }) {
  const t = await getStrings();

  return (
    <>
      <section className="mt-10 flex flex-wrap gap-6" data-testid="history-counts">
        <div>
          <p className="m-0 text-[11px] uppercase tracking-eyebrow text-faint">
            {t.account.gamesPlayedLabel}
          </p>
          <p
            className="m-0 font-display text-3xl text-volt"
            data-testid="games-played"
          >
            {history.gamesPlayed}
          </p>
        </div>

        {/* Shown only when there is one. A zero here is a reproach nobody
            earned, and most players will never have a single no-show. */}
        {history.noShows > 0 ? (
          <div>
            <p className="m-0 text-[11px] uppercase tracking-eyebrow text-faint">
              {t.account.noShowsLabel}
            </p>
            <p className="m-0 font-display text-3xl text-white/70" data-testid="no-shows">
              {history.noShows}
            </p>
          </div>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="m-0 mb-4 text-[17px] font-bold uppercase tracking-wide text-white">
          {t.account.upcomingTitle}
        </h2>
        <BookingList rows={history.upcoming} />
      </section>

      <section className="mt-10">
        <h2 className="m-0 mb-4 text-[17px] font-bold uppercase tracking-wide text-white">
          {t.account.pastTitle}
        </h2>

        {history.past.length === 0 ? (
          <p className="m-0 text-sm text-white/50" data-testid="past-empty">
            {t.account.pastEmpty}
          </p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0" data-testid="past-games">
            {history.past.map(({ booking, game }) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline py-3"
              >
                <span className="text-base font-bold text-white">
                  {game.venue}
                </span>
                <span className="text-xs text-white/50">
                  {formatGameDateTime(game.starts_at)}
                </span>
                {booking.attendance ? (
                  <span
                    className={`text-[11px] uppercase tracking-eyebrow ${
                      booking.attendance === "no_show" ? "text-white/40" : "text-volt"
                    }`}
                  >
                    {booking.attendance === "no_show"
                      ? t.account.attendanceNoShow
                      : t.account.attendancePresent}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
