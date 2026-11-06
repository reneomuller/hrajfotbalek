/**
 * The game form's organizer phone after the admin picks an organizer (round
 * 42, the owner: "when choosing an organizer, pre-fill their phone number").
 *
 * The number is what the game's Message button dials, so the case to avoid is
 * a number left over from the organizer being replaced:
 *
 *   - the chosen organizer has a number on their profile → it fills in;
 *   - they have none, and the field holds the PREVIOUS organizer's number →
 *     it empties, rather than routing their players to somebody else;
 *   - they have none, and the field holds a number typed by hand → it stays.
 */
export function phoneAfterOrganizerChange(
  current: string,
  previousOrganizerPhone: string | null,
  chosenOrganizerPhone: string | null,
): string {
  if (chosenOrganizerPhone) return chosenOrganizerPhone;
  if (previousOrganizerPhone && current.trim() === previousOrganizerPhone.trim()) return "";
  return current;
}
