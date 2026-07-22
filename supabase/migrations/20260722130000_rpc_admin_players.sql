-- =============================================================================
-- Migration 18 — grant_credit, merge_players
--
-- The identity and money-correction endpoints: where a payment that arrived
-- with the wrong variable symbol gets resolved, and where a duplicate identity
-- gets repaired.
--
-- BOTH ARE RPCs BECAUSE NEITHER CAN BE ASSEMBLED FROM APP QUERIES AND STILL
-- HOLD ITS GUARANTEE. `credit_ledger` has UPDATE and DELETE revoked for
-- clients, so a merge cannot repoint it from TypeScript at all; and a merge
-- that repointed three tables and failed on the fourth would strand a player's
-- credit on an orphaned row, which is precisely what the transaction boundary
-- exists to prevent.
--
-- grant_credit MINTS MONEY. It is the most privilege-sensitive write in the
-- system, and the one function where "admin-only, checked inside" matters most:
-- it must not be reachable by the player being credited.
--
-- Rollback: supabase/rollback/20260722130000_rpc_admin_players_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- grant_credit
-- -----------------------------------------------------------------------------

create function public.grant_credit(
  p_player_id          uuid,
  p_delta_czk          integer,
  p_reason             public.credit_reason default 'admin_grant',
  p_unmatched_payment  boolean default false,
  p_note               text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player  public.players%rowtype;
  v_balance integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'grant_credit requires an admin session or service role';
  end if;

  if p_delta_czk is null or p_delta_czk = 0 then
    raise exception 'INVALID_CREDIT_DELTA';
  end if;

  -- The reason set is the `credit_reason` enum, so an unknown value cannot
  -- reach here. `redemption` is excluded on purpose: that reason belongs to
  -- create_booking spending a balance, and an admin hand-writing one would put
  -- a spend in the ledger with no booking behind it.
  if p_reason = 'redemption' then
    raise exception 'INVALID_CREDIT_REASON'
      using detail = 'redemption rows are written by create_booking, not by hand';
  end if;

  select * into v_player from public.players p where p.id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- Player lock, matching create_booking's player-then-game order (there is no
  -- game here, so this is a prefix of it and cannot deadlock against it). The
  -- lock is what makes the balance re-read below meaningful: without it two
  -- concurrent negative adjustments could each see a sufficient balance.
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text, 0));

  select coalesce(sum(l.delta_czk), 0) into v_balance
    from public.credit_ledger l
   where l.player_id = p_player_id;

  -- Same non-negativity rule create_booking enforces, applied here because an
  -- adjustment may be negative. A wallet is never allowed to go into debt.
  if v_balance + p_delta_czk < 0 then
    raise exception 'CREDIT_NEGATIVE_BLOCKED'
      using detail = 'balance ' || v_balance::text || ' cannot absorb ' || p_delta_czk::text;
  end if;

  insert into public.credit_ledger (player_id, delta_czk, reason)
  values (p_player_id, p_delta_czk, p_reason);

  insert into public.events (event_type, player_id, metadata, city, brand)
  values ('credit_issued', p_player_id,
          jsonb_build_object(
            'amount_czk', p_delta_czk,
            'reason', p_reason::text,
            'note', p_note,
            'granted_by', public.current_player_id(),
            'via_service_role', public.is_service_role()),
          -- `players` carries no city/brand of its own; a grant is an act on a
          -- wallet rather than on a game, so the columns take the table
          -- defaults the same way the auth events do.
          'prague', 'hrajfotbal');

  -- The unmatched-payment trail lands in the SAME transaction as the money it
  -- explains. Split across two statements it could be missing from the very
  -- row it exists to justify — which is the one case anybody ever goes looking.
  if p_unmatched_payment then
    insert into public.events (event_type, player_id, metadata, city, brand)
    values ('payment_unmatched', p_player_id,
            jsonb_build_object(
              'amount_czk', p_delta_czk,
              'note', p_note,
              'resolved_by', public.current_player_id()),
            'prague', 'hrajfotbal');
  end if;

  return v_balance + p_delta_czk;
end;
$$;

-- -----------------------------------------------------------------------------
-- merge_players
-- -----------------------------------------------------------------------------

create function public.merge_players(
  p_shadow_id    uuid,
  p_surviving_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shadow    public.players%rowtype;
  v_surviving public.players%rowtype;
  v_first     uuid;
  v_second    uuid;
  v_moved     integer := 0;
  v_n         integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'merge_players requires an admin session or service role';
  end if;

  if p_shadow_id is null or p_surviving_id is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if p_shadow_id = p_surviving_id then
    raise exception 'MERGE_SELF'
      using detail = 'a player cannot be merged into themselves';
  end if;

  -- Fixed lock order by uuid, so two admins merging overlapping pairs at once
  -- cannot deadlock.
  if p_shadow_id < p_surviving_id then
    v_first := p_shadow_id; v_second := p_surviving_id;
  else
    v_first := p_surviving_id; v_second := p_shadow_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_first::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_second::text, 0));

  select * into v_shadow from public.players p where p.id = p_shadow_id;
  if not found then raise exception 'PLAYER_NOT_FOUND' using detail = 'shadow'; end if;

  select * into v_surviving from public.players p where p.id = p_surviving_id;
  if not found then raise exception 'PLAYER_NOT_FOUND' using detail = 'surviving'; end if;

  -- Only a shadow may be merged AWAY. Merging a player who has signed in would
  -- orphan their auth user: the row carrying `auth_user_id` would be deleted
  -- and that person could never sign in to anything again.
  if v_shadow.auth_user_id is not null then
    raise exception 'NOT_A_SHADOW'
      using detail = 'the merged-away player has an auth user';
  end if;

  -- Both holding an active booking on the same game would violate
  -- `bookings_one_active_per_player_per_game` on repoint. The constraint would
  -- roll the whole merge back correctly — this check exists so the admin gets
  -- a sentence instead of a constraint name.
  if exists (
    select 1
      from public.bookings a
      join public.bookings b on b.game_id = a.game_id
     where a.player_id = p_shadow_id
       and b.player_id = p_surviving_id
       and a.status in ('reserved', 'confirmed')
       and b.status in ('reserved', 'confirmed')
  ) then
    raise exception 'MERGE_CONFLICT'
      using detail = 'both identities hold an active booking on the same game';
  end if;

  -- Same story for the waitlist's one-entry-per-player-per-game constraint. The
  -- shadow's duplicate row is dropped rather than repointed: the surviving
  -- player is already in that queue, and two rows would be two notifications.
  delete from public.waitlist w
   where w.player_id = p_shadow_id
     and exists (
       select 1 from public.waitlist s
        where s.game_id = w.game_id and s.player_id = p_surviving_id
     );

  update public.bookings      set player_id = p_surviving_id where player_id = p_shadow_id;
  get diagnostics v_n = row_count; v_moved := v_moved + v_n;

  update public.waitlist      set player_id = p_surviving_id where player_id = p_shadow_id;
  get diagnostics v_n = row_count; v_moved := v_moved + v_n;

  -- Only reachable from here: credit_ledger has UPDATE revoked for clients, so
  -- the balance genuinely cannot be moved by app code.
  update public.credit_ledger set player_id = p_surviving_id where player_id = p_shadow_id;
  get diagnostics v_n = row_count; v_moved := v_moved + v_n;

  -- History follows the person. Repointed rather than left behind, so the
  -- surviving player's funnel and stats include what the shadow did.
  update public.events        set player_id = p_surviving_id where player_id = p_shadow_id;
  get diagnostics v_n = row_count; v_moved := v_moved + v_n;

  insert into public.events (event_type, player_id, metadata, city, brand)
  values ('player_claimed', p_surviving_id,
          jsonb_build_object(
            'merged_player_id', p_shadow_id,
            'merged_nickname', v_shadow.nickname,
            'rows_moved', v_moved,
            'merged_by', public.current_player_id(),
            'source', 'admin_merge'),
          'prague', 'hrajfotbal');

  -- Nothing references it now, which is the assertion this makes checkable.
  delete from public.players where id = p_shadow_id;

  return v_moved;
end;
$$;

revoke execute on function public.grant_credit(uuid, integer, public.credit_reason, boolean, text) from public, anon;
revoke execute on function public.merge_players(uuid, uuid) from public, anon;

grant execute on function public.grant_credit(uuid, integer, public.credit_reason, boolean, text) to authenticated, service_role;
grant execute on function public.merge_players(uuid, uuid) to authenticated, service_role;

comment on function public.grant_credit(uuid, integer, public.credit_reason, boolean, text) is
  'Admin-only. Appends a credit_ledger row and its credit_issued event in one '
  'transaction, plus payment_unmatched when resolving an unmatched payment. '
  'Refuses any delta that would drive the balance below zero.';
comment on function public.merge_players(uuid, uuid) is
  'Admin-only. Repoints bookings, waitlist, credit_ledger and events from a '
  'shadow player to a surviving one in one transaction, then deletes the '
  'shadow. Refuses a self-merge, a non-shadow source, or a pair holding active '
  'bookings on the same game.';
