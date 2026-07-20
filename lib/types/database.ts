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
