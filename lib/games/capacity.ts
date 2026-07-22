/**
 * The segmented capacity bar, as a pure function of the count.
 *
 * The design reference renders one notch per spot — `for (let i = 0; i < cap;
 * i++)`, each segment `flex:1`, filled volt while `i < cur` and #242424 after
 * — rather than a single proportional bar. That is the whole visual: the
 * player counts notches, not percentages, so a 14-spot game always shows 14
 * notches whatever the fill.
 *
 * Extracted from the component so the "one notch per spot" invariant is
 * testable without rendering, and so an over-full game (an admin capacity
 * reduction below the current roster) cannot produce more notches than spots.
 */
export function capacitySegments(
  bookedCount: number,
  capacity: number,
): boolean[] {
  const spots = Math.max(0, Math.trunc(capacity));
  const filled = Math.min(Math.max(0, Math.trunc(bookedCount)), spots);
  return Array.from({ length: spots }, (_, i) => i < filled);
}
