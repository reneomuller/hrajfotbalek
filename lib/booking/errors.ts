import { strings } from "@/lib/strings";

/**
 * RPC error code → friendly copy.
 *
 * The booking RPCs raise bare exception messages (`raise exception
 * 'CAPACITY_FULL'`), which PostgREST surfaces as `error.message`. Matching on
 * the code rather than the whole message keeps this stable against PostgREST
 * wrapping the text differently.
 *
 * Losing a capacity race is a NORMAL outcome in this product — two people
 * tapping the last spot is expected behaviour, not a fault. So every known
 * rejection has copy, and anything unmapped falls back to generic rather than
 * leaking a Postgres string to a player.
 */
export type BookingErrorCode =
  | "CAPACITY_FULL"
  | "DUPLICATE_ACTIVE_BOOKING"
  | "CREDIT_NEGATIVE_BLOCKED"
  | "GAME_NOT_BOOKABLE"
  | "GAME_ALREADY_STARTED"
  | "GAME_NOT_WAITLISTABLE"
  | "GAME_NOT_FOUND"
  | "PLAYER_NOT_FOUND"
  | "INSUFFICIENT_PERMISSION"
  | "CANCEL_WINDOW_CLOSED"
  | "BOOKING_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "UNKNOWN";

const KNOWN_CODES: BookingErrorCode[] = [
  "CAPACITY_FULL",
  "DUPLICATE_ACTIVE_BOOKING",
  "CREDIT_NEGATIVE_BLOCKED",
  "GAME_NOT_BOOKABLE",
  "GAME_ALREADY_STARTED",
  "GAME_NOT_WAITLISTABLE",
  "GAME_NOT_FOUND",
  "PLAYER_NOT_FOUND",
  "INSUFFICIENT_PERMISSION",
  "CANCEL_WINDOW_CLOSED",
  "BOOKING_NOT_FOUND",
  "INVALID_TRANSITION",
];

/** Extracts a known code from a PostgREST error message. */
export function toBookingErrorCode(message: string | null | undefined): BookingErrorCode {
  if (!message) return "UNKNOWN";
  return KNOWN_CODES.find((code) => message.includes(code)) ?? "UNKNOWN";
}

export interface FriendlyBookingError {
  code: BookingErrorCode;
  title: string;
  message: string;
}

export function describeBookingError(code: BookingErrorCode): FriendlyBookingError {
  switch (code) {
    case "CAPACITY_FULL":
      return {
        code,
        title: strings.errors.capacityFullTitle,
        message: strings.errors.capacityFull,
      };
    case "DUPLICATE_ACTIVE_BOOKING":
      return {
        code,
        title: strings.errors.duplicateActiveBookingTitle,
        message: strings.errors.duplicateActiveBooking,
      };
    case "CREDIT_NEGATIVE_BLOCKED":
      return { code, title: strings.errors.tryAgain, message: strings.errors.creditNegativeBlocked };
    case "GAME_NOT_BOOKABLE":
      return { code, title: strings.errors.tryAgain, message: strings.errors.gameNotBookable };
    case "GAME_ALREADY_STARTED":
      return { code, title: strings.errors.tryAgain, message: strings.errors.gameAlreadyStarted };
    case "GAME_NOT_WAITLISTABLE":
      return { code, title: strings.errors.tryAgain, message: strings.errors.gameNotWaitlistable };
    case "CANCEL_WINDOW_CLOSED":
      return { code, title: strings.errors.tryAgain, message: strings.errors.cancelWindowClosed };
    case "INSUFFICIENT_PERMISSION":
      return {
        code,
        title: strings.errors.tryAgain,
        message: strings.errors.insufficientPermission,
      };
    default:
      return { code, title: strings.errors.tryAgain, message: strings.errors.generic };
  }
}

/**
 * Waitlist-flow variant.
 *
 * Only CAPACITY_FULL differs, and it differs in a way that matters: losing a
 * conversion race leaves the player STILL on the waitlist, which is a true and
 * reassuring thing to say. The booking-flow copy deliberately does not claim
 * that, because a player who never joined a waitlist is not on one.
 */
export function describeWaitlistError(code: BookingErrorCode): FriendlyBookingError {
  if (code === "CAPACITY_FULL") {
    return {
      code,
      title: strings.errors.capacityFullTitle,
      message: strings.errors.capacityFullWaitlist,
    };
  }
  return describeBookingError(code);
}
