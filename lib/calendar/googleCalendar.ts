import { formatIcsDate } from "@/lib/calendar/ics";
import { gameEndsAt } from "@/lib/games/duration";

/**
 * "ADD TO CALENDAR" OPENS GOOGLE CALENDAR (the owner, 2026-11-13: "currently,
 * for android, it apparently downloads a file, and only then you can put it in
 * your calendar. for iphones it's fine, except it goes to apple calendar. I'd
 * like both android and iphone to prompt google calendar and make it a one
 * click addition").
 *
 * Google Calendar's own new-event link, with the game filled in: the venue as
 * the title and the place, the start and the end — the per-game length, or the
 * same fallback the .ics and the game page use — and a link back to the game.
 * The player taps Save. The .ics stays beside it for Apple and other calendars.
 *
 * Times in UTC (`Z`), the .ics's own format, so the two can never disagree;
 * `ctz` only sets the zone Google SHOWS them in.
 */
export interface GoogleCalendarEvent {
  venue: string;
  startsAt: string;
  durationMinutes: number | null;
  /** The game's page, written into the entry's description. */
  url: string;
}

const RENDER = "https://calendar.google.com/calendar/render";
const ZONE = "Europe/Prague";

export function googleCalendarUrl(game: GoogleCalendarEvent): string {
  const start = new Date(game.startsAt);
  const end = gameEndsAt(start, game.durationMinutes);
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: game.venue,
    dates: `${formatIcsDate(start)}/${formatIcsDate(end)}`,
    location: game.venue,
    details: game.url,
    ctz: ZONE,
  });
  return `${RENDER}?${query.toString()}`;
}
