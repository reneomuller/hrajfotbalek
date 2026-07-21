import { strings } from "@/lib/strings";

/**
 * Two-letter initials for a roster avatar, ported from the `index.html`
 * reference.
 *
 * Unicode-aware on purpose: Czech nicknames carry diacritics, and a
 * `[A-Za-z]` filter would silently drop "Šimon" to an empty badge.
 */
export function initials(nickname: string): string {
  const letters = nickname
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return letters || strings.games.rosterUnknown;
}
