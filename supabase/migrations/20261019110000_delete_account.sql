-- =============================================================================
-- ROUND 40 — delete an account, alongside ban.
--
-- Obchodní podmínky 4.7 and 14.5: a player may close their account (in their
-- settings or by email) and the operator may close it; future bookings and
-- unused Credits then lapse without compensation. Zásady zpracování osobních
-- údajů 3.1: accounting records are kept 5 years and records for legal claims
-- 4 years after the account ends — so the PERSON goes and the BOOKS stay.
--
-- `delete_player_account(p_player_id)`, callable by an admin for anyone but an
-- admin, or by a player for themselves:
--   * future bookings are cancelled and their seats released (as ban does),
--     waitlist places removed;
--   * every unused Credit lapses — each batch's remainder, then the pool — as
--     `pass_expiry` rows noted 'account deleted' (not `adjustment`: that reason
--     is an admin minting money, which the ledger invariant polices);
--   * the row is ANONYMISED, never deleted: nickname 'Deleted <number>', no
--     email, phone, photos, country, level, positions or newsletter; the login
--     link is cut and `banned_at` stamped so every existing "can this player
--     act" guard (`current_player_id()`) already says no;
--   * `account_deleted` is logged with who did it.
-- It RETURNS the auth user id and the two photo paths, because SQL cannot
-- delete an auth user or a stored file — the server action does both.
--
-- Additive, idempotent, order-free. Shape-only verification at the foot; the
-- behaviour is drilled in supabase/tests/delete_account.sql.
-- =============================================================================

alter table public.players add column if not exists deleted_at timestamptz;

-- -----------------------------------------------------------------------------
-- 1. The event catalog, widened by one — READ from the live constraint, as
-- round 39 does, so the new list is a superset of whatever is there.
-- -----------------------------------------------------------------------------

do $$
declare
  v_def   text;
  v_types text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.events'::regclass
     and c.conname = 'events_event_type_catalog';

  if v_def is null then
    raise exception 'delete account: events_event_type_catalog is missing';
  end if;

  /*
   * BOTH SPELLINGS ARE READ. `pg_get_constraintdef` renders an `in (...)` list
   * as `ARRAY['a'::text, ...]` but an array-literal check as `'{a,b}'::text[]`,
   * and a parser that reads only one of them reads the other as EMPTY — which
   * rebuilds the catalog as two types. It did, on this file's own second local
   * run, and only the existing rows violating it stopped the commit.
   */
  select array_agg(distinct parsed.x) into v_types
    from (
      select m[1] as x
        from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m
      union
      select btrim(y)
        from regexp_matches(v_def, '\{([^}]*)\}', 'g') as b,
             unnest(string_to_array(b[1], ',')) as y
    ) parsed
   where parsed.x ~ '^[a-z_]+$';

  -- A FLOOR, so a parse that went wrong stops here instead of dropping types.
  if coalesce(array_length(v_types, 1), 0) < 30
     or not ('game_deleted' = any (v_types) and 'venue_deleted' = any (v_types)) then
    raise exception 'delete account: could not read the event catalog (% types parsed)',
      coalesce(array_length(v_types, 1), 0);
  end if;

  if 'account_deleted' = any (v_types) then
    raise notice 'delete account: the event catalog already carries account_deleted';
    return;
  end if;

  v_types := v_types || array['account_deleted'];

  -- Written as `in (...)`, the spelling every earlier migration used.
  alter table public.events drop constraint events_event_type_catalog;
  execute format(
    'alter table public.events add constraint events_event_type_catalog '
    'check (event_type in (%s))',
    (select string_agg(quote_literal(t.x), ', ' order by t.x) from unnest(v_types) as t(x))
  );
end $$;

-- -----------------------------------------------------------------------------
-- 2. The function
-- -----------------------------------------------------------------------------

create or replace function public.delete_player_account(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid;
  v_self      boolean;
  v_player    public.players%rowtype;
  v_booking   public.bookings%rowtype;
  v_game      public.games%rowtype;
  v_batch     record;
  v_pool      integer;
  v_cancelled integer := 0;
  v_lapsed    integer := 0;
begin
  v_actor := public.current_player_id();
  v_self  := v_actor is not null and v_actor = p_player_id;
  if not (v_self or public.is_admin_caller()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text, 0));

  select * into v_player from public.players where id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if v_player.deleted_at is not null then
    return null;  -- already deleted; idempotent, and no second event
  end if;
  if v_player.is_admin then
    raise exception 'CANNOT_DELETE_ADMIN';
  end if;

  -- Future bookings: cancelled, seats released, nothing comes back (4.7).
  for v_booking in
    select b.* from public.bookings b
      join public.games g on g.id = b.game_id
     where b.player_id = p_player_id
       and b.status in ('reserved', 'confirmed')
       and g.starts_at > now()
  loop
    select * into v_game from public.games where id = v_booking.game_id;
    update public.bookings set status = 'cancelled' where id = v_booking.id;
    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('booking_cancelled', p_player_id, v_booking.game_id, v_booking.id,
            jsonb_build_object('reason', 'account_deleted', 'by_player_id', v_actor,
                               'credit_issued_czk', 0,
                               'previous_status', v_booking.status),
            v_game.city, v_game.brand);
    insert into public.events (event_type, player_id, game_id, booking_id, metadata, city, brand)
    values ('spot_released', p_player_id, v_booking.game_id, v_booking.id,
            jsonb_build_object('previous_status', v_booking.status, 'reason', 'account_deleted'),
            v_game.city, v_game.brand);
    perform public.sync_game_fullness(v_booking.game_id);
    v_cancelled := v_cancelled + 1;
  end loop;

  delete from public.waitlist where player_id = p_player_id;

  -- Unused Credits lapse (4.7): every batch's remainder, then the pool.
  for v_batch in
    select * from public.credit_batches(p_player_id) where remaining_czk > 0
  loop
    insert into public.credit_ledger (player_id, delta_czk, reason, batch_id, note)
    values (p_player_id, -v_batch.remaining_czk, 'pass_expiry', v_batch.batch_id, 'account deleted');
    v_lapsed := v_lapsed + v_batch.remaining_czk;
  end loop;

  select coalesce(sum(cl.delta_czk), 0)::integer into v_pool
    from public.credit_ledger cl
   where cl.player_id = p_player_id
     and cl.expires_at is null
     and cl.batch_id is null;
  if v_pool > 0 then
    insert into public.credit_ledger (player_id, delta_czk, reason, note)
    values (p_player_id, -v_pool, 'pass_expiry', 'account deleted');
    v_lapsed := v_lapsed + v_pool;
  end if;

  -- The person goes; the bookings and the ledger stay, for the books.
  update public.players
     set nickname         = 'Deleted ' || player_number::text,  -- unique by construction
         email            = null,
         phone            = null,
         photo_path       = null,
         cover_path       = null,
         country          = null,
         skill_level      = null,
         positions        = '{}',
         marketing_opt_in = false,
         auth_user_id     = null,
         banned_at        = coalesce(banned_at, now()),
         deleted_at       = now()
   where id = p_player_id;

  insert into public.events (event_type, player_id, metadata)
  values ('account_deleted', p_player_id,
          jsonb_build_object('by', case when v_self then 'self' else 'admin' end,
                             'by_player_id', v_actor,
                             'bookings_cancelled', v_cancelled,
                             'credits_lapsed_czk', v_lapsed));

  return jsonb_build_object(
    'auth_user_id', v_player.auth_user_id,
    'photo_path', v_player.photo_path,
    'cover_path', v_player.cover_path,
    'bookings_cancelled', v_cancelled);
end
$$;

revoke execute on function public.delete_player_account(uuid) from public, anon;
grant execute on function public.delete_player_account(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. app_capabilities() — restated as a superset of the 30 flags live after
-- 20261019100000, with that file's own two now probes, plus `deleteAccount`.
-- -----------------------------------------------------------------------------

create or replace function public.app_capabilities()
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',          true,
    'dismissNotifications',   true,
    'adminRemoveBooking',     true,
    'adminDelete',            true,
    'cancelWithReason',       true,
    'gameLanguage',           true,
    'organizerTelegram',      true,
    'playersMet',             true,
    'playedSweep',            true,
    'playerNotifications',    true,
    'pendingSeatAnonymous',   true,
    'payFirstCheckout',       true,
    'addGuestsAfterBooking',  true,
    'publicProfileScope',     true,
    'creditLedgerNote',       true,
    'autoSettle',             true,
    'adminRemoveCover',  to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'remove_profile_cover')),
    'venueMapUrl',       to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'venues'
         and column_name = 'map_url')),
    'playerNumbers',     to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'players'
         and column_name = 'player_number')),
    'adminRenamePlayer', to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'admin_set_display_name')),
    'partyUpToThirteen', to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'max_party_guests')),
    'cancelGuests',      to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'cancel_guests')),
    'creditsAreSeats',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'credit_seat_price_czk')),
    'seatsTakenMany',    to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'game_seats_taken_many')),
    'banProfile',        to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ban_player')),
    'addGuestsConfirmation', to_jsonb(exists (
      select 1 from information_schema.routines r
       join information_schema.parameters p on p.specific_name = r.specific_name
      where r.routine_schema = 'public' and r.routine_name = 'checkout_outcome'
        and p.parameter_name = 'guest_count')),
    'durationPricing',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'price_for_duration')),
    'venueArchive',      to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'venues'
         and column_name = 'archived_at')),
    'creditsSixtyDays',  to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'credit_validity_days')),
    'consentRecords',    to_jsonb(exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'consent_records')),
    -- Created by THIS file.
    'deleteAccount',     true
  )
$$;

-- -----------------------------------------------------------------------------
-- 4. VERIFICATION — SHAPE ONLY.
-- -----------------------------------------------------------------------------

do $$
declare v_caps jsonb := public.app_capabilities();
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'players'
                    and column_name = 'deleted_at') then
    raise exception 'delete account: players.deleted_at is missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'delete_player_account') then
    raise exception 'delete account: delete_player_account is missing';
  end if;
  if has_function_privilege('anon', 'public.delete_player_account(uuid)', 'execute') then
    raise exception 'delete account: anon can execute delete_player_account';
  end if;
  if (select count(*) from jsonb_object_keys(v_caps)) <> 31
     or exists (select 1 from jsonb_each(v_caps) where value <> 'true'::jsonb) then
    raise exception 'delete account: app_capabilities is not 31 flags, all true: %', v_caps;
  end if;
end $$;
