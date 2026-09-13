-- =============================================================================
-- ROUND 33, ITEMS 1 AND 2 — the admin can rename a player, and every player
-- carries a permanent number.
--
-- ONE MIGRATION FOR TWO ITEMS, and the reason is not tidiness: both alter
-- `public.players`, both are admin-only reads of the same page, and the owner
-- applies these by hand. Two files is two chances to apply one and not the
-- other, and the half-applied state — numbers with no rename, or a rename
-- control whose capability flag also claims numbers exist — is worse than
-- either.
--
-- SHAPE ONLY AT THE FOOT OF THIS FILE. The verification block asserts that the
-- objects exist and says nothing about what they do, because a migration's
-- verification block MAY NOT WRITE A ROW: on 2026-09-09 one did, against
-- production, and left a fake venue, two fake games, two bookings, a real
-- no-show notification in the owner's bell and an inflated stats page. The
-- behaviour is drilled in `supabase/tests/player_number.sql` and
-- `supabase/tests/admin_rename_player.sql`, which `run.mjs` wraps in
-- `begin; … rollback;`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. THE PLAYER NUMBER (item 2)
--
-- ASSIGNED BY SIGNUP ORDER, PERMANENT, NEVER RENUMBERED, NEVER REUSED. The
-- owner's words, and each clause is a different mechanism:
--
--   assigned by signup order  — the backfill orders by `created_at`, and new
--                               rows take the next value at INSERT time
--   permanent                 — nothing in this schema ever writes the column
--                               again; there is no UPDATE path and no grant
--                               that would permit one
--   never renumbered          — which is why this is NOT `row_number()` read at
--                               query time: a computed ordinal shifts under
--                               every deletion, and the whole point is a key
--                               that a spreadsheet from March still matches
--   never reused              — which is why it is a SEQUENCE and not
--                               `max(n) + 1`. Delete player 40 and the next
--                               signup is 41, not 40; the gap is the record
--                               that somebody was there.
--
-- THIS IS DELIBERATELY THE OPPOSITE OF THE GAMES LIST'S ORDINALS, which are
-- rendered positions and renumber freely. That surface answers "how many"; this
-- one answers "which one", across exports taken months apart, and the two
-- requirements are incompatible in one number.
-- -----------------------------------------------------------------------------

create sequence if not exists public.player_number_seq as integer minvalue 1;

alter table public.players add column if not exists player_number integer;

-- THE BACKFILL COMES FIRST, AND THAT ORDERING IS LOAD-BEARING. A UNIQUE index
-- and a NOT NULL are both validated at ADD time against every existing row, so
-- adding either before the values exist fails on a populated table — the same
-- trap the round-31 CHECK hit.
--
-- `id` BREAKS THE TIE. `created_at` is a timestamp and the seed writes several
-- rows inside one transaction, where `now()` is identical for all of them; an
-- unstable sort would make the numbering depend on which row the planner
-- happened to emit first.
with ordered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.players
)
update public.players p
   set player_number = o.rn
  from ordered o
 where o.id = p.id
   and p.player_number is null;

-- THE SEQUENCE RESUMES AFTER THE BACKFILL'S HIGH-WATER MARK, AND NEVER MOVES
-- BACKWARD. A bare `setval(max + 1)` is correct on the first run and is a
-- number-REUSING bug on a second one: a rolled-back insert consumes a sequence
-- value without leaving a row, so `max` can lag `last_value`, and re-running
-- this file would hand the next signup a number an earlier one already had.
-- "Never reused" has to survive the migration being applied twice.
do $$
declare
  v_max  integer;
  v_next integer;
begin
  select coalesce(max(player_number), 0) into v_max from public.players;
  select last_value + (case when is_called then 1 else 0 end) into v_next
    from public.player_number_seq;

  if v_max >= v_next then
    perform setval('public.player_number_seq', v_max + 1, false);
  end if;
end $$;

-- THE DEFAULT IS THE ASSIGNMENT, rather than a trigger or a line added to each
-- signup RPC. There are two insert paths in this schema today (`complete_signup`
-- and `complete_signup_v2`) plus the seed and the admin scaffolding, and a
-- column default is the only mechanism that covers a path nobody has written
-- yet — which is the failure mode that matters, because a player with a null
-- number is invisible until an export is compared against another one.
alter table public.players alter column player_number set default nextval('public.player_number_seq');
alter table public.players alter column player_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'players_player_number_key'
  ) then
    alter table public.players
      add constraint players_player_number_key unique (player_number);
  end if;
end $$;

comment on column public.players.player_number is
  'Permanent signup-order number, admin-only. Assigned once from '
  'player_number_seq and never rewritten; gaps are deletions and are meant to '
  'stay. Never rendered on a player-facing surface.';

-- The default is evaluated as the INSERTING role, so every role that inserts a
-- player needs the sequence. `complete_signup_v2` is security definer and runs
-- as the owner; the seed and the scaffolding insert as service_role.
grant usage on sequence public.player_number_seq to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. THE RENAME (item 1)
--
-- WHY AN RPC AND NOT AN UPDATE. `players_update_own` is an own-row policy, so
-- an admin editing SOMEBODY ELSE'S name cannot go through the table at all —
-- and the column-scoped grant that lets a player rename themselves is exactly
-- the grant that must not be widened. Authorization lives inside the function,
-- where curl meets it too.
--
-- IT RE-STATES THE FORMAT AND THE UNIQUENESS RULES rather than leaning on the
-- constraints, because a constraint violation surfaces as `23514` /
-- `players_nickname_format`, which the admin error mapper would print at the
-- owner as a constraint name. The CHECK and the unique index are still there
-- and still the truth; this is the message.
-- -----------------------------------------------------------------------------

create or replace function public.admin_set_display_name(
  p_player_id uuid,
  p_nickname  text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_old   text;
  v_new   text;
begin
  if not public.is_admin_caller() then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  v_new := btrim(coalesce(p_nickname, ''));

  -- Mirrors players_nickname_format exactly. Checked here so the error names
  -- the field rather than the constraint.
  if v_new !~ '^[A-Za-z0-9 _-]{1,20}$' then
    raise exception 'NICKNAME_INVALID';
  end if;

  select nickname into v_old from public.players where id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- NO WRITE AND NO EVENT WHEN NOTHING CHANGES, which is `remove_profile_photo`'s
  -- rule as well: an audit log that records non-events is an audit log nobody
  -- reads. Case-sensitive, so fixing someone's capitalisation IS a change.
  if v_old = v_new then
    return v_new;
  end if;

  -- The unique index is on lower(nickname), so a player may re-case their own
  -- name but may not take somebody else's.
  if exists (
    select 1 from public.players
     where lower(nickname) = lower(v_new)
       and id <> p_player_id
  ) then
    raise exception 'NICKNAME_TAKEN';
  end if;

  update public.players set nickname = v_new where id = p_player_id;

  v_actor := public.current_player_id();
  insert into public.events (event_type, player_id, metadata)
  values ('player_renamed', p_player_id,
          jsonb_build_object('by_player_id', v_actor, 'from', v_old, 'to', v_new));

  return v_new;
end;
$$;

revoke execute on function public.admin_set_display_name(uuid, text) from public;
grant execute on function public.admin_set_display_name(uuid, text)
  to authenticated, service_role;

comment on function public.admin_set_display_name(uuid, text) is
  'Admin rename of a player display name. Returns the stored name. Emits '
  'player_renamed unless the name is unchanged.';

-- -----------------------------------------------------------------------------
-- 3. THE EVENT CATALOG
--
-- `events.event_type` is one CHECK and Postgres cannot extend a CHECK in place:
-- it is dropped and re-added with the list restated in full. That drop/re-add
-- is pre-approved (2026-08-01) as long as the new list is a STRICT SUPERSET,
-- and it is — `player_renamed` is the only addition.
--
-- FORGETTING THIS FAILS AT THE FIRST WRITE, NOT AT THE MIGRATION, and the error
-- names a constraint with nothing to do with the feature. It has been missed
-- once already (migration 24).
-- -----------------------------------------------------------------------------

alter table public.events drop constraint if exists events_event_type_catalog;
alter table public.events add constraint events_event_type_catalog check (
  event_type in (
    'account_created', 'auth_link_sent', 'auth_completed', 'player_claimed',
    'game_published', 'game_cancelled', 'game_settled', 'game_guests_changed',
    'game_deleted', 'booking_created', 'admin_booking_created',
    'booking_cancelled', 'booking_expired', 'spot_released',
    'admin_booking_removed', 'payment_confirmed', 'payment_unmatched',
    'credit_issued', 'credit_redeemed', 'credit_expired', 'topup_requested',
    'topup_confirmed', 'waitlist_joined', 'waitlist_notified',
    'waitlist_converted', 'waitlist_left', 'nudge_sent', 'reminder_sent',
    'attendance_marked', 'admin_granted', 'admin_revoked',
    'profile_photo_removed', 'player_anonymized', 'site_setting_changed',
    'venue_deleted', 'booking_guests_added',
    -- Round 33, item 1.
    'player_renamed'
  )
);

-- -----------------------------------------------------------------------------
-- 4. THE CAPABILITY FLAGS
--
-- Two flags rather than one, because the two halves fail differently. Without
-- `adminRenamePlayer` a control would 404; without `playerNumbers` a SELECT
-- naming a column that does not exist makes PostgREST error, and BOTH admin
-- reads answer an error by rendering nothing. Same family as the missing-GRANT
-- trap: the page looks empty rather than broken.
-- -----------------------------------------------------------------------------

create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security definer
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
    'adminRemoveCover',       true,
    'playerNumbers',          true,
    'adminRenamePlayer',      true
  )
$$;

-- -----------------------------------------------------------------------------
-- 5. VERIFICATION — SHAPE ONLY. NOT ONE ROW IS WRITTEN.
-- -----------------------------------------------------------------------------

do $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'players'
       and column_name = 'player_number' and is_nullable = 'NO'
  ) then
    raise exception 'player number: the column is missing or nullable';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_player_number_key'
  ) then
    raise exception 'player number: the uniqueness constraint is missing';
  end if;

  select count(*) into v_count from public.players where player_number is null;
  if v_count > 0 then
    raise exception 'player number: % rows were not backfilled', v_count;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'admin_set_display_name'
  ) then
    raise exception 'rename: admin_set_display_name is missing';
  end if;

  if (select pg_get_constraintdef(oid) from pg_constraint
       where conname = 'events_event_type_catalog') not like '%player_renamed%' then
    raise exception 'rename: the event catalog was not widened';
  end if;

  if not (public.app_capabilities() ->> 'playerNumbers')::boolean
     or not (public.app_capabilities() ->> 'adminRenamePlayer')::boolean then
    raise exception 'capabilities: the round-33 flags are not set';
  end if;

  raise notice 'round 33: shape verified — behaviour is drilled in supabase/tests/';
end $$;
