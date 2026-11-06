import { resolveDurationMinutes } from "@/lib/games/duration";
import { spotsLeftLabel, spotsTone, type SpotsTone } from "@/lib/games/urgency";
import type { Locale } from "@/lib/i18n/locales";
import type { Strings } from "@/lib/strings";

/**
 * What a game's 9:16 story image says (2026-11-06).
 *
 * ONE ROW: the format — players only, never the surface — and the length.
 *
 * THEN AVAILABILITY, THE APP'S WAY: "x spots left" above the capacity bar, as
 * the game page's availability card puts it (the owner, on the first draft,
 * where it was an "8/14" tile). Nothing at all while nobody has booked — "better
 * to show nothing than 0/x". A game with no format recorded shows none, rather
 * than an invented one.
 */
export interface StoryFact {
  key: "format" | "duration";
  label: string;
  value: string;
}

export function storyFacts(
  game: { format: string | null; durationMinutes: number | null },
  t: Strings,
): StoryFact[] {
  const facts: StoryFact[] = [];
  if (game.format) facts.push({ key: "format", label: t.story.formatLabel, value: game.format });
  facts.push({
    key: "duration",
    label: t.story.durationLabel,
    value: t.story.minutes.replace("{n}", String(resolveDurationMinutes(game.durationMinutes))),
  });
  return facts;
}

export function storyAvailability(
  game: { bookedCount: number; capacity: number },
  locale: Locale,
  t: Strings,
): { label: string; tone: SpotsTone } | null {
  if (game.bookedCount <= 0) return null;
  return {
    label: spotsLeftLabel(game.bookedCount, game.capacity, locale, t),
    tone: spotsTone(game.bookedCount, game.capacity),
  };
}
