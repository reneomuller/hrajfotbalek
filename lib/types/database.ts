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

/**
 * Closed set, matching the `games_surface_known` CHECK.
 *
 * A closed set rather than free text: it is rendered as a label and drives
 * nothing today, but an open column here becomes something the stats surface
 * eventually tries to group by.
 */
export type GameSurface = "turf" | "grass" | "indoor" | "sand";

export type CreditReason =
  | "cancellation_credit"
  | "admin_grant"
  | "redemption"
  | "adjustment"
  // Phase 20a (migration 31). Credit a player bought at a discount and did not
  // spend inside the window they accepted at purchase. Distinct from
  // `adjustment` because filing it there would make it indistinguishable from
  // an admin fixing a mistake, on the one row a player is most likely to ask
  // about.
  | "pass_expiry"
  // Phase 2 (migration 22). The first reason that is a player putting money in
  // rather than a consequence of something else — deliberately distinct from
  // `admin_grant`, which is a gift the platform chose to make.
  | "topup";

/**
 * Self-declared player ability (Phase 2, migration 21).
 *
 * Display and social signalling only: `create_booking` never consults it, and
 * a restricted game does not refuse a player who does not match.
 */
export type SkillLevel = "beginner" | "intermediate" | "advanced";

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
  | "attendance_marked"
  // Phase 1 (migration 20). Present in the CHECK since then; absent from this
  // union until Phase 17, which is drift in this file rather than in the
  // database — the header of this file says as much: any disagreement between
  // the two is a bug here.
  | "admin_granted"
  | "admin_revoked"
  // Phase 2 (migration 24)
  | "profile_photo_removed"
  | "player_anonymized"
  // Phase 2 (migration 25)
  | "topup_requested"
  | "topup_confirmed"
  // Phase 2 (migration 30). Every site-setting change names the admin and the
  // new value: a public claim about the size of the community with no audit
  // trail is a number nobody can account for.
  | "site_setting_changed"
  // Phase 20a (migration 32). Written by the sweep, alongside the compensating
  // negative ledger row.
  | "credit_expired";

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

export type TopupStatus = "pending" | "confirmed" | "cancelled";

/** A row of `credit_topups`. Pending rows are NOT balance. */
export interface TopupRow {
  id: string;
  player_id: string;
  /** What the player asked for; after confirmation, a record of intent. */
  amount_czk: number;
  payment_code: number;
  status: TopupStatus;
  /** What actually arrived. Null until confirmed. */
  received_amount_czk: number | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
}

/** Return contract of confirm_topup (SQL composite public.topup_result). */
export interface TopupResult {
  id: string;
  status: TopupStatus;
  /** Always the amount RECEIVED — a top-up has no price to be short of. */
  credited_czk: number;
  /** The wallet total afterwards, so the receipt needs no second query. */
  balance_czk: number;
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
          // Phase 2 (migration 21). Nullable without exception: the players who
          // predate Phase 2 supplied none of this, and a default would assert a
          // nationality and an ability on their behalf. Written by
          // `complete_signup_v2` and the storage flow — never by a client, which
          // is why none of them joins the per-column UPDATE grant.
          country: string | null;
          skill_level: SkillLevel | null;
          tos_accepted_at: string | null;
          tos_version: string | null;
          photo_path: string | null;
          /**
           * Preferred positions (ruling L). Closed catalog, never null — the
           * column defaults to an empty array, which is the normal state for
           * every player who predates it. See lib/players/positions.ts.
           */
          positions: string[];
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
          country?: string | null;
          skill_level?: SkillLevel | null;
          tos_accepted_at?: string | null;
          tos_version?: string | null;
          photo_path?: string | null;
          positions?: string[];
        };
        /**
         * The client-writable columns, and this list IS the column grant.
         *
         * Migration `20260810120000_player_positions` widened the grant from
         * three to six for ruling L's edit form: `country`, `skill_level` and
         * `positions` joined `nickname`, `phone` and `marketing_opt_in`. The
         * first two had been withheld since migration 21 because nothing but
         * `complete_signup_v2` wrote them; ruling L gives them an edit surface,
         * so the reason expired.
         *
         * STILL DELIBERATELY ABSENT: `is_admin`, `is_seed`, `email`,
         * `auth_user_id`, `tos_accepted_at`, `tos_version` and `photo_path`.
         * Consent evidence and the photo path are written by RPCs and the
         * storage flow; a player editing their own `tos_accepted_at` is not a
         * feature, and a client-writable `is_admin` is a privilege escalation
         * with a form in front of it.
         *
         * This type and the GRANT must change together — the type is what
         * stops a mistake at compile time, and the grant is what stops it at
         * the database. Neither substitutes for the other, and `positions` also
         * answers to `players_positions_catalog`.
         */
        Update: {
          nickname?: string;
          phone?: string | null;
          marketing_opt_in?: boolean;
          country?: string | null;
          skill_level?: SkillLevel | null;
          positions?: string[];
        };
        Relationships: [];
      };

      /**
       * Wallet top-ups (migration 25).
       *
       * No Insert/Update shapes: `authenticated` holds SELECT and nothing else,
       * and both writers are SECURITY DEFINER RPCs. A client that could insert
       * here could mint its own variable symbol.
       */
      credit_topups: {
        Row: {
          id: string;
          player_id: string;
          /** What the player asked for; after confirmation, a record of intent. */
          amount_czk: number;
          payment_code: number;
          status: TopupStatus;
          /** What actually arrived. Null until confirmed. */
          received_amount_czk: number | null;
          confirmed_by: string | null;
          confirmed_at: string | null;
          city: string;
          brand: string;
          policy_version: string;
          created_at: string;
          /**
           * Phase 20a. The tier the player chose, when they chose one. Null
           * for an ordinary top-up. Recorded for the receipt and the audit
           * trail; the pass treatment itself keys on the RECEIVED amount, per
           * §4.2.
           */
          pass_games: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      games: {
        Row: {
          id: string;
          venue: string;
          /** Structured link to `venues`; null for games created before M4. */
          venue_id: string | null;
          starts_at: string;
          capacity: number;
          price_czk: number;
          status: GameStatus;
          /** "6v6" — CHECK-constrained to `<n>v<n>`. */
          format: string | null;
          surface: GameSurface | null;
          /** Organizer logistics, ≤500 chars. */
          notes: string | null;
          city: string;
          brand: string;
          created_at: string;
          /**
           * Phase 2, migration 26. Nullable, 30–180. DISPLAY ONLY — nothing
           * transitions on it. Null falls back to `policy.game.durationMinutes`.
           */
          duration_minutes: number | null;
          /**
           * Phase 2, migration 26. NULL means all levels and NO badge anywhere;
           * `normalize_skill_levels` collapses the empty array and the
           * all-three array to NULL so there is one way to say it.
           */
          allowed_skill_levels: SkillLevel[] | null;
          /**
           * Phase 2, migration 26. Descriptive: renders beside the format.
           * Constrains nothing — capacity is the sole booking limit.
           */
          subs_per_team: number | null;
        };
        Insert: {
          id?: string;
          venue: string;
          venue_id?: string | null;
          starts_at: string;
          capacity: number;
          price_czk: number;
          status?: GameStatus;
          format?: string | null;
          surface?: GameSurface | null;
          notes?: string | null;
          city?: string;
          brand?: string;
          created_at?: string;
          duration_minutes?: number | null;
          allowed_skill_levels?: SkillLevel[] | null;
          subs_per_team?: number | null;
        };
        Update: never;
        Relationships: [];
      };

      venues: {
        Row: {
          id: string;
          name: string;
          /** `/venues/<file>` under `public/`, CHECK-constrained. Never a URL. */
          image_path: string | null;
          map_query: string | null;
          /**
           * Closed catalog (migration 38) — `venues_amenities_catalog` is the
           * enforcement and `lib/venues/amenities.ts` is the render list. Never
           * null: the column defaults to an empty array, because "no amenities
           * recorded" and "we do not know" are the same thing here.
           */
          amenities: string[];
          city: string;
          brand: string;
          created_at: string;
        };
        /** Written only by `admin_create_venue` and `set_venue_amenities`. */
        Insert: never;
        Update: never;
        Relationships: [];
      };

      /**
       * Phase 2, migration 27. NO GRANTS to `anon` or `authenticated` — the
       * name exits through `game_organizer_public()` and the phone only
       * through `game_organizer_phone()` to a caller holding an active
       * booking. Reachable from TypeScript with the service-role client only,
       * which is what the admin edit form uses to pre-fill the field.
       */
      game_organizer_contacts: {
        Row: {
          game_id: string;
          organizer_name: string;
          organizer_phone: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Written only by `set_game_organizer` / the v2 admin game RPCs. */
        Insert: never;
        Update: never;
        Relationships: [];
      };

      /**
       * Phase 20a, migration 32. The six game-pass tiers. Anon-readable — the
       * pass panel renders on the games list for a signed-out visitor.
       */
      pass_tiers: {
        Row: {
          games: number;
          price_czk: number;
          /** Always `games * 150`, CHECKed. */
          credited_czk: number;
          /** Null = never expires. Only the 1-game tier. */
          expires_months: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      /**
       * Phase 2, migration 30. ONE ROW, id `singleton`, readable by `anon` —
       * the stats strip and Player of the Month render for signed-out
       * visitors, and without the explicit grant those reads return empty
       * rather than erroring, which on that surface looks like missing content
       * rather than a missing permission.
       */
      site_settings: {
        Row: {
          id: string;
          settings: Json;
          updated_at: string;
          updated_by: string | null;
        };
        /** Written only by `set_site_setting`. */
        Insert: never;
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
          /**
           * Phase 20a, migration 32. Set on a positive BATCH row (a pass
           * purchase); null everywhere else, which is what "does not expire"
           * means. BALANCE IS STILL SUM(delta_czk) — no reader filters on this.
           */
          expires_at: string | null;
          /** The batch a redemption, refund or expiry row belongs to. */
          batch_id: string | null;
          /** Idempotency guard for the three-day heads-up, on the batch row. */
          expiry_notified_at: string | null;
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
      /**
       * Anonymous roster surface — game_id, nickname, photo_path,
       * games_played, and nothing else.
       *
       * The PII boundary. Projects these four columns and NO OTHERS — no
       * player_id, no email, no phone. `photo_path` joined in Phase 15
       * (migration 29) under contract §4a, ratified in advance, shipping with
       * the rendering that consumes it. Any further column is a new ruling.
       *
       * `status` LEFT in migration 20260808150000, and it is the cautionary
       * one. The booking status told a signed-out stranger whether a named
       * player had paid; `PlayersList.tsx` had stopped rendering it long
       * before, but the view kept projecting it and this type kept declaring
       * it, so `?select=nickname,status&status=eq.reserved` returned a list of
       * people who had not paid. A column removed from a render is still on
       * the wire until it is removed from the projection.
       */
      game_roster_public: {
        Row: {
          game_id: string;
          nickname: string;
          /** Nullable: most players never upload one, and initials are the fallback. */
          photo_path: string | null;
          /**
           * PLAYED and SETTLED games only (migration 39) — never bookings on
           * upcoming ones. Nullable because `count(*)` through the correlated
           * subquery is typed nullable by Postgres even though it cannot be;
           * the render site treats a null as "do not print a count" rather than
           * as zero.
           */
          games_played: number | null;
        };
        Relationships: [];
      };
      /**
       * Anonymous waitlist surface — game_id, nickname, position and nothing
       * else. Never player_id or joined_at: `position` exists precisely so the
       * rank can be shown without the timestamp that produces it.
       */
      game_waitlist_public: {
        Row: {
          game_id: string;
          nickname: string;
          position: number;
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

      /** Admin-only. Returns the new venue id; raises VENUE_EXISTS on a clash. */
      admin_create_venue: {
        Args: { p_name: string; p_image_path?: string | null; p_map_query?: string | null };
        Returns: string;
      };
      /** Admin-only. Always creates a `draft`; returns the new game id. */
      admin_create_game: {
        Args: {
          p_venue_id: string;
          p_starts_at: string;
          p_capacity: number;
          p_price_czk: number;
          p_format?: string | null;
          p_surface?: GameSurface | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      /**
       * Admin-only. Edits venue/time/price/format/surface/notes. Writes no
       * status (transitions belong to the functions below) and no capacity
       * (that is `set_game_capacity`, which owns the active-bookings floor).
       */
      admin_update_game: {
        Args: {
          p_game_id: string;
          p_venue_id: string;
          p_starts_at: string;
          p_price_czk: number;
          p_format?: string | null;
          p_surface?: GameSurface | null;
          p_notes?: string | null;
        };
        Returns: string;
      };

      publish_game: { Args: { p_game_id: string }; Returns: GameStatus };
      mark_game_played: { Args: { p_game_id: string }; Returns: GameStatus };
      settle_game: { Args: { p_game_id: string }; Returns: GameStatus };
      /** Returns the number of bookings cancelled by the fan-out. */
      cancel_game: { Args: { p_game_id: string }; Returns: number };

      /**
       * Waitlist join. `already_joined` distinguishes a fresh row from a
       * duplicate tap deduped by the unique constraint.
       */
      join_waitlist: {
        Args: { p_game_id: string };
        Returns: { id: string; already_joined: boolean };
      };
      /**
       * Owner-only read. The caller's 1-based position on a game's waitlist,
       * or null when they are not on it. Informational: notification is
       * notify-all FCFS, so this is how many joined ahead, not a serving order.
       */
      waitlist_position: {
        Args: { p_game_id: string };
        Returns: number | null;
      };
      /**
       * Cron-only fan-out. Stamps `notified_at` and emits one
       * `waitlist_notified` event per active waitlisted player, in one
       * transaction, returning the players to mail.
       */
      notify_waitlist: {
        Args: { p_game_id: string };
        Returns: {
          player_id: string;
          email: string | null;
          nickname: string;
          waitlist_id: string;
        }[];
      };
      /**
       * Admin-only. Writes `bookings.attendance` and its `attendance_marked`
       * event in one transaction. Re-marking appends a correcting event rather
       * than rewriting the first.
       */
      mark_attendance: {
        Args: { p_booking_id: string; p_attendance: AttendanceStatus };
        Returns: AttendanceStatus;
      };

      /**
       * Admin-only. Appends the ledger row and its `credit_issued` event (plus
       * `payment_unmatched` when resolving one) in a single transaction, and
       * refuses any delta that would drive the balance below zero. Returns the
       * balance after the grant.
       */
      grant_credit: {
        Args: {
          p_player_id: string;
          p_delta_czk: number;
          p_reason?: CreditReason;
          p_unmatched_payment?: boolean;
          p_note?: string | null;
        };
        Returns: number;
      };
      /**
       * Admin-only. Repoints bookings, waitlist, credit_ledger and events onto
       * the surviving player and deletes the shadow, in one transaction.
       * Returns the number of rows moved.
       */
      merge_players: {
        Args: { p_shadow_id: string; p_surviving_id: string };
        Returns: number;
      };

      /** Cron-only stamps. Both no-op when the column is already set. */
      mark_nudged: {
        Args: { p_booking_id: string; p_grace_hours: number };
        Returns: boolean;
      };
      mark_reminder_sent: { Args: { p_booking_id: string }; Returns: boolean };
      set_game_capacity: {
        Args: { p_game_id: string; p_capacity: number };
        Returns: number;
      };

      /**
       * Admin-only, and NOT callable by service_role — see migration 20.
       * Refuses to change the caller's own flag, which is what keeps
       * self-elevation impossible now that granting happens in-app.
       */
      set_player_admin: {
        Args: { p_player_id: string; p_is_admin: boolean };
        Returns: boolean;
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

      /**
       * Phase 2 signup (migration 23). Supersedes `complete_signup`, which
       * stays only because dropping it needs a gated migration.
       *
       * The two consents are separate arguments with separate errors because
       * they are separate legal acts — accepting terms is not consenting to
       * data processing, and one box covering both makes the consent
       * non-specific. Identity comes from `auth.uid()`; there is no player-id
       * argument and there must never be one.
       */
      /** Owner-only. Draws a 27-series VS and inserts a pending top-up. */
      create_topup: {
        Args: { p_amount_czk: number };
        Returns: TopupRow;
      };
      /**
       * Admin-or-service-role. Credits the amount RECEIVED — a null received
       * amount means the amount asked for. Ledger, status and event land in one
       * transaction under a per-player advisory lock.
       */
      confirm_topup: {
        Args: {
          p_topup_id: string;
          p_confirmed_by?: string | null;
          p_received_amount_czk?: number | null;
        };
        Returns: TopupResult;
      };

      /** Owner-only. Derives players/<own id>.<ext>; never takes a path. */
      set_profile_photo: {
        Args: { p_extension: string };
        Returns: string;
      };
      /**
       * Phase design-1, migration 34. Admin-only. Derives
       * `venues/<venue id>.<ext>`, records it, and returns the key for the
       * caller to upload to — the client never chooses the path.
       */
      set_venue_photo: {
        Args: { p_venue_id: string; p_extension: string };
        Returns: string;
      };
      /** Admin-only. Clears the reference; returns a BUCKET key to delete, or null. */
      clear_venue_photo: {
        Args: { p_venue_id: string };
        Returns: string | null;
      };
      /**
       * Admin-only. REPLACES the venue's amenity set — unticking a box has to
       * be a real operation — and returns it deduplicated and sorted.
       */
      set_venue_amenities: {
        Args: { p_venue_id: string; p_amenities: string[] };
        Returns: string[];
      };

      /** Admin-only moderation. Returns the path the caller must delete. */
      remove_profile_photo: {
        Args: { p_player_id: string };
        Returns: string | null;
      };
      /**
       * Admin-only. v2.5 §8 anonymization plus the Phase 2 photo rule. Returns
       * the storage path to delete; the row itself is retained so `events` and
       * `credit_ledger` stay keyed to it.
       */
      anonymize_player: {
        Args: { p_player_id: string };
        Returns: string | null;
      };

      /**
       * Phase 2, migration 28. NEW FUNCTIONS rather than replacements: the v1
       * pair cannot be `create or replace`d into a different parameter list,
       * and adding DEFAULTed parameters would create an ambiguous overload
       * that fails at call time on the admin form rather than at migration.
       *
       * The organizer contact is written in the same transaction as the game,
       * so a required field cannot be skipped by a failed second call.
       */
      admin_create_game_v2: {
        Args: {
          p_venue_id: string;
          p_starts_at: string;
          p_capacity: number;
          p_price_czk: number;
          p_organizer_name: string;
          p_format?: string | null;
          p_surface?: GameSurface | null;
          p_notes?: string | null;
          p_organizer_phone?: string | null;
          p_duration_minutes?: number | null;
          p_allowed_skill_levels?: SkillLevel[] | null;
          p_subs_per_team?: number | null;
        };
        Returns: string;
      };
      admin_update_game_v2: {
        Args: {
          p_game_id: string;
          p_venue_id: string;
          p_starts_at: string;
          p_price_czk: number;
          p_organizer_name: string;
          p_format?: string | null;
          p_surface?: GameSurface | null;
          p_notes?: string | null;
          p_organizer_phone?: string | null;
          p_duration_minutes?: number | null;
          p_allowed_skill_levels?: SkillLevel[] | null;
          p_subs_per_team?: number | null;
        };
        Returns: string;
      };

      /** The organizer NAME for any published game. Null for draft/cancelled. */
      game_organizer_public: {
        Args: { p_game_id: string };
        Returns: string | null;
      };
      /**
       * The organizer PHONE, only for a caller holding a reserved/confirmed
       * booking on that game. Null — never an error — for everyone else, so
       * refusal and absence are indistinguishable.
       */
      game_organizer_phone: {
        Args: { p_game_id: string };
        Returns: string | null;
      };

      /**
       * Admin-only. Closed key set (`active_players`, `player_of_month`),
       * per-key validation, and an event naming the admin and the new value.
       */
      set_site_setting: {
        Args: { p_key: string; p_value: Json };
        Returns: undefined;
      };

      /**
       * Phase 20a. Requests a pass at the tier's OWN price — a separate
       * function rather than a defaulted parameter on `create_topup`, which
       * would create an ambiguous overload that breaks every existing
       * one-argument call at runtime.
       */
      create_pass_topup: {
        Args: { p_pass_games: number };
        Returns: TopupRow;
      };

      /**
       * Service-role only. Writes a compensating negative row per expired
       * batch remainder, so balance stays SUM(delta_czk). Returns how many
       * batches it closed; idempotent, so a second run returns 0.
       */
      expire_credit_batches: {
        Args: Record<string, never>;
        Returns: number;
      };

      /**
       * Service-role only. Batches expiring within `p_days` that have not been
       * warned about, STAMPED by the same statement that selects them — so a
       * cron route that runs twice sends once.
       */
      batches_expiring_soon: {
        Args: { p_days?: number };
        Returns: {
          batch_id: string;
          player_id: string;
          remaining_czk: number;
          expires_at: string;
        }[];
      };

      /** The calling player's own expiring batches, soonest first. */
      my_credit_batches: {
        Args: Record<string, never>;
        Returns: {
          batch_id: string;
          original_czk: number;
          remaining_czk: number;
          expires_at: string;
          created_at: string;
        }[];
      };

      complete_signup_v2: {
        Args: {
          p_nickname: string;
          p_gdpr_consent: boolean;
          p_tos_accepted: boolean;
          p_tos_version: string;
          p_country: string;
          p_skill_level: SkillLevel;
          p_marketing_opt_in?: boolean;
          p_phone?: string | null;
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
      skill_level: SkillLevel;
    };

    CompositeTypes: Record<string, never>;
  };
}
