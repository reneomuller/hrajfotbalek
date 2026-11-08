import { formatSeats } from "@/lib/admin/seatBar";

/**
 * "1 seat", "12 seats", "2.5 seats" — a count with the copy table's singular
 * or plural around it. Seats can be fractional where a Credit pool mixed paid
 * and gifted money, so the number goes through the seat bar's own formatter.
 * Admin copy is English only, so one and many are the whole rule.
 */
export function countLabel(n: number, copy: { one: string; many: string }): string {
  const shown = formatSeats(n);
  return (shown === "1" ? copy.one : copy.many).replace("{n}", shown);
}
