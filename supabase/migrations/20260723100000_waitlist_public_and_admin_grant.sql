-- =============================================================================
-- Migration 20 — game_waitlist_public, set_player_admin, two new event types
--
-- Two unrelated capabilities land together because both are prerequisites of
-- the same UI leg and neither is large enough to justify its own migration.
--
-- -----------------------------------------------------------------------------
-- 1. game_waitlist_public — the queue, visible to everyone
--
-- The product decision this encodes: a full game shows WHO is waiting, not just
-- how many. That is the same call already made for the roster — a pickup game
-- is a social object, and a queue you cannot see is a queue you do not trust.
--
-- SO THIS IS THE SECOND ANONYMOUS READ PATH INTO PLAYER DATA, and it carries
-- the same warning `game_roster_public` does: it is SECURITY DEFINER, it
-- bypasses the RLS that would otherwise constrain it, and its projection plus
-- its game-status filter are the only things between an anonymous visitor and
-- the waitlist. There is no second line of defence behind this view.
--
-- The projection is `game_id`, `nickname`, `position` and NOTHING ELSE. In
-- particular it does not project `player_id` (which would let a visitor join
-- the queue to a roster and to any other view keyed by player), `joined_at`
-- (a behavioural timestamp that says when someone is on their phone), or
-- `notified_at` (operational state that is nobody's business).
--
-- `position` is computed here rather than left to the caller because the row
-- order that produces it — `joined_at` — is exactly the column being withheld.
-- Exposing the rank while withholding the timestamp is the whole point.
--
-- Converted rows are excluded: a player who took a spot is on the roster now,
-- and showing them in both places would double-count the game's interest.
--
-- -----------------------------------------------------------------------------
-- 2. set_player_admin — admin granting, in the app
--
-- THIS DELIBERATELY SUPERSEDES THE "DASHBOARD ONLY" RULE. That rule bought a
-- real property — no in-app path to elevation — at a real cost: the only way to
-- make a second organizer was to open the Supabase dashboard and edit a row by
-- hand, which is not a thing the person running this can be asked to do, and
-- which hands out a credential far broader than "can run games" to accomplish
-- it.
--
-- What the rule was actually protecting against was SELF-elevation: a
-- non-admin turning themselves into one. That remains impossible, and this
-- function is written so it stays impossible:
--
--   * the caller must ALREADY be an admin — checked inside the function,
--     against `auth.uid()`, not against anything the client sends;
--   * a caller cannot change their OWN flag in either direction, so an admin
--     cannot lock themselves out and, more importantly, no path exists in
--     which the subject and the authorizer are the same person;
--   * every change writes an event naming both parties, so the grant chain is
--     reconstructable from the log.
--
-- Service role is NOT accepted here, unlike every other admin RPC in this
-- codebase. Elsewhere it is accepted because cron and future bank pollers are
-- legitimate machine callers; nothing about granting admin is ever a machine's
-- job, and accepting it would mean the one function that mints privilege is
-- also the one reachable by the widest credential.
--
-- Rollback: supabase/rollback/20260723100000_waitlist_public_and_admin_grant_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- events catalog — two new types
--
-- The catalog is a CHECK rather than an enum, so extending it is a drop and a
-- re-add of the constraint. Stated in full rather than patched, so the list in
-- the database is always readable as one thing.
-- -----------------------------------------------------------------------------

alter table public.events drop constraint events_event_type_catalog;

alter table public.events add constraint events_event_type_catalog check (
  event_type in (
    -- identity / auth
    'account_created',
    'auth_link_sent',
    'auth_completed',
    'player_claimed',
    -- games
    'game_published',
    'game_cancelled',
    'game_settled',
    -- bookings
    'booking_created',
    'admin_booking_created',
    'booking_cancelled',
    'booking_expired',
    'spot_released',
    -- payments / credit
    'payment_confirmed',
    'payment_unmatched',
    'credit_issued',
    'credit_redeemed',
    -- waitlist
    'waitlist_joined',
    'waitlist_notified',
    'waitlist_converted',
    -- lifecycle sweeps
    'nudge_sent',
    'reminder_sent',
    -- settlement
    'attendance_marked',
    -- administration (migration 20)
    'admin_granted',
    'admin_revoked'
  )
);

-- -----------------------------------------------------------------------------
-- game_waitlist_public
-- -----------------------------------------------------------------------------

create view public.game_waitlist_public
with (security_invoker = false) as
  select
    w.game_id,
    p.nickname,
    row_number() over (partition by w.game_id order by w.joined_at, w.id)::integer
      as position
  from public.waitlist w
  join public.players p on p.id = w.player_id
  join public.games g on g.id = w.game_id
  where g.status in ('published', 'full', 'played', 'settled')
    and w.converted_booking_id is null;

revoke all on public.game_waitlist_public from anon, authenticated;
grant select on public.game_waitlist_public to anon, authenticated;
grant select on public.game_waitlist_public to service_role;

comment on view public.game_waitlist_public is
  'Anonymous waitlist surface. Projects only game_id, nickname and position — '
  'never player_id, joined_at or notified_at. SECURITY DEFINER by design; the '
  'game-status filter and this projection are the sole enforcement point and '
  'must not be widened. Mirrors game_roster_public.';

-- -----------------------------------------------------------------------------
-- set_player_admin
-- -----------------------------------------------------------------------------

create function public.set_player_admin(
  p_player_id uuid,
  p_is_admin  boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller public.players%rowtype;
  v_target public.players%rowtype;
begin
  if p_is_admin is null then
    raise exception 'INVALID_ADMIN_FLAG';
  end if;

  -- The acting player, resolved from the session and never from an argument.
  select * into v_caller
    from public.players pl
   where pl.auth_user_id = auth.uid();

  if not found or not v_caller.is_admin then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'set_player_admin requires an admin session';
  end if;

  select * into v_target from public.players pl where pl.id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- The rule that keeps self-elevation impossible even for an admin: the
  -- subject and the authorizer are never the same person. It also means an
  -- admin cannot revoke themselves and leave the panel unreachable.
  if v_target.id = v_caller.id then
    raise exception 'CANNOT_CHANGE_OWN_ADMIN'
      using detail = 'an admin may not change their own admin flag';
  end if;

  -- Idempotent: setting a flag to what it already is is a no-op that writes no
  -- event, so a double-tap does not litter the audit trail with a change that
  -- did not happen.
  if v_target.is_admin = p_is_admin then
    return p_is_admin;
  end if;

  update public.players
     set is_admin = p_is_admin
   where id = p_player_id;

  insert into public.events (event_type, player_id, metadata)
  values (
    case when p_is_admin then 'admin_granted' else 'admin_revoked' end,
    p_player_id,
    jsonb_build_object('by_player_id', v_caller.id)
  );

  return p_is_admin;
end;
$$;

revoke execute on function public.set_player_admin(uuid, boolean) from public;
revoke execute on function public.set_player_admin(uuid, boolean) from anon;
-- Deliberately NOT granted to service_role — see the header.
grant execute on function public.set_player_admin(uuid, boolean) to authenticated;

comment on function public.set_player_admin(uuid, boolean) is
  'Admin-only. Grants or revokes players.is_admin and logs admin_granted / '
  'admin_revoked naming both parties. Refuses to change the caller''s own flag, '
  'which is what keeps self-elevation impossible. Not callable by service_role.';

notify pgrst, 'reload schema';
