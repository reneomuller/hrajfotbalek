/**
 * Database types.
 *
 * Hand-authored to match migrations 20260720100000, 20260720100100 and
 * 20260720100200. Migration 3 changes only EXECUTE privilege on
 * next_payment_code(), so it has no effect on any type below.
 *
 * VERIFIED against the live schema after those migrations were applied: every
 * table, column, SQL type, nullability, the view projection, all five enums
 * and the 22-value event_type catalog were introspected from pg_catalog and
 * matched this file exactly. So the contents are known-accurate — but they
 * were confirmed by comparison, not produced by the generator.
 *
 * Still to do: replace this file with genuine generated output. Neither route
 * works on this machine yet —
 *
 *   supabase gen types typescript --db-url ...   needs Docker (not installed)
 *   supabase gen types typescript --linked       needs a Supabase access token
 *
 * Once either is available, regenerate and treat the generated output as
 * authoritative from that point on. Any drift between this file and the
 * migrations is a bug in this file.
 *
 * One known difference from what the generator would emit: the
 * game_roster_public Row fields are typed non-nullable here, whereas the
 * generator widens every view column to `| null` because Postgres cannot prove
 * non-nullability through a join. The inner joins in the view body do
 * guarantee it, so the narrower type is the more useful one — but expect this
 * to be the line that changes when the file is genuinely regenerated.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type GameStatus =
  | "draft"
  | "published"
  | "full"
  | "played"
  | "settled"
  | "cancelled";

export type BookingStatus = "reserved" | "confirmed" | "cancelled" | "expired";

export type PaymentMethod = "qr" | "cash" | "credit" | "seed_free";

/** The narrowed domain a client may supply. `credit`/`seed_free` are derived. */
export type ClientPaymentMethod = Extract<PaymentMethod, "qr" | "cash">;

export type AttendanceStatus = "present" | "no_show";

export type CreditReason =
  | "cancellation_credit"
  | "admin_grant"
  | "redemption"
  | "adjustment";

export type EventType =
  | "account_created"
  | "auth_link_sent"
  | "auth_completed"
  | "player_claimed"
  | "game_published"
  | "game_cancelled"
  | "game_settled"
  | "booking_created"
  | "admin_booking_created"
  | "booking_cancelled"
  | "booking_expired"
  | "spot_released"
  | "payment_confirmed"
  | "payment_unmatched"
  | "credit_issued"
  | "credit_redeemed"
  | "waitlist_joined"
  | "waitlist_notified"
  | "waitlist_converted"
  | "nudge_sent"
  | "reminder_sent"
  | "attendance_marked";

/**
 * Return contract of create_booking / admin_create_booking (SQL composite
 * public.booking_result).
 *
 * `payment_method` is the DERIVED method, which may differ from what the
 * caller asked for: a seed player gets `seed_free`, a full balance gets
 * `credit`. The UI must branch on this value rather than on the choice it
 * sent — see the Phase 11 rule about never predicting the outcome from a
 * locally-held balance.
 */
export interface BookingResult {
  id: string;
  status: BookingStatus;
  payment_method: PaymentMethod;
  payment_code: number | null;
  price_czk: number;
  credit_applied_czk: number;
  amount_due_czk: number;
}

/** Return contract of cancel_booking (SQL composite public.cancel_result). */
export interface CancelResult {
  id: string;
  status: BookingStatus;
  /** Credit issued for money actually applied. 0 for an unpaid reservation. */
  credit_issued_czk: number;
  cancel_lead_hours: number;
}

/**
 * Return contract of confirm_booking and expire_booking (SQL composite
 * public.confirm_result).
 *
 * `status` is what the booking ended up as, which is NOT always what the
 * caller was driving toward: confirming a payment that landed after expiry
 * returns `expired` with a non-zero credit, because the spot is never
 * reinstated.
 */
export interface ConfirmResult {
  id: string;
  status: BookingStatus;
  credit_issued_czk: number;
}

export interface Database {
  public: {
    Tables: {
      players: {
        Row: {
          id: string;
          nickname: string;
          email: string | null;
          phone: string | null;
          auth_user_id: string | null;
          is_admin: boolean;
          is_seed: boolean;
          marketing_opt_in: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          nickname: string;
          email?: string | null;
          phone?: string | null;
          auth_user_id?: string | null;
          is_admin?: boolean;
          is_seed?: boolean;
          marketing_opt_in?: boolean;
          created_at?: string;
        };
        /** Clients may only update nickname/phone/marketing_opt_in (column grants). */
        Update: {
          nickname?: string;
          phone?: string | null;
          marketing_opt_in?: boolean;
        };
        Relationships: [];
      };

      games: {
        Row: {
          id: string;
          venue: string;
          starts_at: string;
          capacity: number;
          price_czk: number;
          status: GameStatus;
          city: string;
          brand: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          venue: string;
          starts_at: string;
          capacity: number;
          price_czk: number;
          status?: GameStatus;
          city?: string;
          brand?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };

      events: {
        Row: {
          id: string;
          event_type: EventType;
          player_id: string | null;
          game_id: string | null;
          booking_id: string | null;
          metadata: Json;
          city: string;
          brand: string;
          playbook_version: string;
          policy_version: string;
          created_at: string;
        };
        /** No client access: writes happen inside SECURITY DEFINER RPCs only. */
        Insert: never;
        Update: never;
        Relationships: [];
      };

      bookings: {
        Row: {
          id: string;
          game_id: string;
          player_id: string;
          status: BookingStatus;
          payment_method: PaymentMethod;
          payment_code: number | null;
          price_czk: number;
          credit_applied_czk: number;
          is_seed: boolean;
          booked_by_admin: boolean;
          attendance: AttendanceStatus | null;
          nudge_sent_at: string | null;
          reminder_sent_at: string | null;
          expires_at: string | null;
          cancel_lead_hours: number | null;
          created_at: string;
        };
        /** No client writes: all transitions go through RPCs. */
        Insert: never;
        Update: never;
        Relationships: [];
      };

      credit_ledger: {
        Row: {
          id: string;
          player_id: string;
          delta_czk: number;
          reason: CreditReason;
          booking_id: string | null;
          created_at: string;
        };
        /** Append-only, and appends happen inside RPCs. */
        Insert: never;
        Update: never;
        Relationships: [];
      };

      waitlist: {
        Row: {
          id: string;
          game_id: string;
          player_id: string;
          joined_at: string;
          notified_at: string | null;
          converted_booking_id: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };

    Views: {
      /** Anonymous roster surface — game_id, nickname, status and nothing else. */
      game_roster_public: {
        Row: {
          game_id: string;
          nickname: string;
          status: BookingStatus;
        };
        Relationships: [];
      };
    };

    Functions: {
      next_payment_code: {
        Args: Record<string, never>;
        Returns: number;
      };

      /**
       * Owner-only. Identity comes from auth.uid(); p_player_id exists only to
       * be rejected when it names anyone else, so it is deliberately absent
       * from the client-facing arg type below.
       */
      create_booking: {
        Args: {
          p_game_id: string;
          p_payment_method: ClientPaymentMethod;
          p_from_waitlist_id?: string | null;
        };
        Returns: BookingResult;
      };

      /** Admin/service-role act-on-behalf entry point. */
      admin_create_booking: {
        Args: {
          p_game_id: string;
          p_player_id: string;
          p_payment_method: ClientPaymentMethod;
        };
        Returns: BookingResult;
      };

      /** Owner-only. Issues credit for money actually applied; never cash. */
      cancel_booking: {
        Args: { p_booking_id: string };
        Returns: CancelResult;
      };

      /**
       * Admin-or-service-role. The single automation seam: the admin UI omits
       * p_received_amount_czk (confirm at the expected amount), while a future
       * bank poller passes the bank-reported figure. Same entry point.
       */
      confirm_booking: {
        Args: {
          p_booking_id: string;
          p_confirmed_by?: string | null;
          p_received_amount_czk?: number | null;
        };
        Returns: ConfirmResult;
      };

      /** Admin-or-cron. Never reinstates a spot. */
      expire_booking: {
        Args: { p_booking_id: string };
        Returns: ConfirmResult;
      };

      publish_game: { Args: { p_game_id: string }; Returns: GameStatus };
      mark_game_played: { Args: { p_game_id: string }; Returns: GameStatus };
      settle_game: { Args: { p_game_id: string }; Returns: GameStatus };
      /** Returns the number of bookings cancelled by the fan-out. */
      cancel_game: { Args: { p_game_id: string }; Returns: number };
      set_game_capacity: {
        Args: { p_game_id: string; p_capacity: number };
        Returns: number;
      };

      /** Callable by anon — the caller has not signed in yet, by definition. */
      record_auth_link_sent: {
        Args: { p_game_id?: string | null; p_action?: string | null };
        Returns: void;
      };
      /** Returns whether the session already has a player row. */
      record_auth_completed: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      /** Returns the claimed/existing player id, or null if there was nothing to claim. */
      claim_shadow_player: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      complete_signup: {
        Args: {
          p_nickname: string;
          p_gdpr_consent: boolean;
          p_marketing_opt_in?: boolean;
        };
        Returns: string;
      };
    };

    Enums: {
      game_status: GameStatus;
      booking_status: BookingStatus;
      payment_method: PaymentMethod;
      attendance_status: AttendanceStatus;
      credit_reason: CreditReason;
    };

    CompositeTypes: Record<string, never>;
  };
}
