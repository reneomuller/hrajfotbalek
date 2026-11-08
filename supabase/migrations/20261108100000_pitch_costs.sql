-- =============================================================================
-- ROUND 42 — what a pitch costs, and what each seat on it earned.
--
-- The owner, on the admin rebuild: "In the venues, let there be an area for
-- 'pitch cost' and have there be two values, one for summer and another for
-- winter, with a simple toggle that either stays on winter or summer. for now
-- the pitch cost can be, say, 1200 for winter and 800 for summer for all" —
-- and "I do want the profit and break-even per game", telling "someone
-- purchasing a single credit" from "a credit from a game pass that'd make
-- their entry cheaper". His rulings (2026-11-08): the cost is per game, flat;
-- one switch for every venue; a game keeps the cost it was created with and an
-- admin may correct it; a Credit seat is worth what the player PAID for it.
--
-- 1. `venue_pitch_costs` — a summer and a winter price per venue, 800 and
--    1200 to start; every venue has a row (backfilled, and a trigger gives a
--    new venue one).
-- 2. `pitch_settings` — the one season switch, winter to start;
--    `pitch_season()` reads it.
-- 3. `game_pitch_costs` — the cost a game was created with, taken from its
--    venue and the season by a trigger. Moving a game to another venue
--    re-prices it, unless an admin set the price by hand. Existing games are
--    backfilled at the CURRENT season's price, and each can be corrected.
-- 4. `set_venue_pitch_costs`, `set_pitch_season`, `set_game_pitch_cost` —
--    admin only.
-- 5. `booking_seat_values(games)` and `game_economics(games)` — admin only.
--    What every booking on those games earned, split by how it was paid, and
--    per game: seats, revenue, pitch cost, profit, break-even.
-- 6. `app_capabilities()` — every earlier flag probed, plus `pitchCosts`.
--
-- NONE OF THE THREE TABLES IS READABLE BY anon OR authenticated. `games`,
-- `venues` and `site_settings` all carry a table-wide SELECT to anon, so a
-- column on any of them would put what the owner pays for a pitch — and so
-- his margin — on the public API. The admin reads through the service role.
--
-- WHAT A SEAT IS WORTH. Card, QR and cash are the game's price — "single".
-- A Credit is worth what was paid for it:
--   * a pass batch: the price paid over the Credit it bought (750 for five
--     games is 150 a seat), linked to its `credit_topups` row the way
--     `confirm_topup` writes both — same player, `created_at = confirmed_at`;
--   * a refund batch: what was paid, so face value;
--   * an admin's gift: nothing — unless `grant_credit` recorded it as a
--     payment that arrived unmatched (its `payment_unmatched` event, written in
--     the same transaction), which is money;
--   * the unexpiring pool: the mix that flowed into it, per player.
-- Money kept from a late cancellation, or from an admin removal that returned
-- nothing, counts (the events record the kept amount); a refunded one does
-- not. An unpaid booking is OWED, not earned.
--
-- Additive, idempotent, NOT deploy-first, order-free. The deploy is safe
-- without it: every new admin control waits for `app_capabilities()` to say
-- `pitchCosts`.
--
--   node scripts/apply-migration.mjs \
--     supabase/migrations/20261108100000_pitch_costs.sql --production
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. The ceiling on a typed cost — one place, so the CHECKs and the RPCs agree.
-- -----------------------------------------------------------------------------

create or replace function public.pitch_cost_max_czk()
returns integer
language sql
immutable
set search_path = ''
as $$ select 100000 $$;

comment on function public.pitch_cost_max_czk() is
  'The highest pitch cost an admin may type (round 42) — a typo guard, not a price.';

-- -----------------------------------------------------------------------------
-- 1. A summer and a winter price per venue.
-- -----------------------------------------------------------------------------

create table if not exists public.venue_pitch_costs (
  venue_id    uuid primary key references public.venues (id) on delete cascade,
  summer_czk  integer not null default 800,
  winter_czk  integer not null default 1200,
  updated_at  timestamptz not null default now(),
  constraint venue_pitch_costs_range check (
    summer_czk between 0 and public.pitch_cost_max_czk()
    and winter_czk between 0 and public.pitch_cost_max_czk())
);

comment on table public.venue_pitch_costs is
  'What the owner pays for one game at a venue, in summer and in winter (round 42). '
  'Not public: no grant to anon or authenticated.';

alter table public.venue_pitch_costs enable row level security;
revoke all on public.venue_pitch_costs from public, anon, authenticated;
grant select on public.venue_pitch_costs to service_role;

insert into public.venue_pitch_costs (venue_id)
select v.id from public.venues v
on conflict (venue_id) do nothing;

create or replace function public.venue_pitch_costs_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.venue_pitch_costs (venue_id) values (new.id)
  on conflict (venue_id) do nothing;
  return new;
end $$;

revoke execute on function public.venue_pitch_costs_default() from public, anon, authenticated;

drop trigger if exists venues_pitch_costs_default on public.venues;
create trigger venues_pitch_costs_default
  after insert on public.venues
  for each row execute function public.venue_pitch_costs_default();

-- -----------------------------------------------------------------------------
-- 2. The one season switch.
-- -----------------------------------------------------------------------------

create table if not exists public.pitch_settings (
  id          text primary key default 'singleton',
  season      text not null default 'winter',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.players (id) on delete set null,
  constraint pitch_settings_singleton check (id = 'singleton'),
  constraint pitch_settings_season check (season in ('summer', 'winter'))
);

comment on table public.pitch_settings is
  'The season every venue''s pitch cost is read for (round 42). One row.';

alter table public.pitch_settings enable row level security;
revoke all on public.pitch_settings from public, anon, authenticated;
grant select on public.pitch_settings to service_role;

insert into public.pitch_settings (id) values ('singleton')
on conflict (id) do nothing;

create or replace function public.pitch_season()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.season from public.pitch_settings s where s.id = 'singleton'), 'winter')
$$;

revoke execute on function public.pitch_season() from public, anon;
grant execute on function public.pitch_season() to authenticated, service_role;

comment on function public.pitch_season() is
  'The season new games take their pitch cost for: ''summer'' or ''winter'' (round 42).';

create or replace function public.venue_pitch_cost_now(p_venue_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case public.pitch_season() when 'summer' then c.summer_czk else c.winter_czk end
    from public.venue_pitch_costs c
   where c.venue_id = p_venue_id
$$;

revoke execute on function public.venue_pitch_cost_now(uuid) from public, anon, authenticated;

comment on function public.venue_pitch_cost_now(uuid) is
  'What a game at this venue costs if created now, for the current season (round 42).';

-- -----------------------------------------------------------------------------
-- 3. The cost each game was created with.
-- -----------------------------------------------------------------------------

create table if not exists public.game_pitch_costs (
  game_id      uuid primary key references public.games (id) on delete cascade,
  cost_czk     integer not null,
  set_by_hand  boolean not null default false,
  updated_at   timestamptz not null default now(),
  constraint game_pitch_costs_range check (cost_czk between 0 and public.pitch_cost_max_czk())
);

comment on table public.game_pitch_costs is
  'What a game''s pitch cost (round 42): its venue''s price for the season it was '
  'created in, or what an admin typed (set_by_hand). Not public.';

alter table public.game_pitch_costs enable row level security;
revoke all on public.game_pitch_costs from public, anon, authenticated;
grant select on public.game_pitch_costs to service_role;

create or replace function public.game_pitch_cost_follow_venue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost integer;
begin
  if tg_op = 'UPDATE' then
    if new.venue_id is not distinct from old.venue_id then
      return new;
    end if;
    if exists (select 1 from public.game_pitch_costs c
                where c.game_id = new.id and c.set_by_hand) then
      return new;
    end if;
    delete from public.game_pitch_costs c where c.game_id = new.id;
  end if;

  v_cost := public.venue_pitch_cost_now(new.venue_id);
  if v_cost is not null then
    insert into public.game_pitch_costs (game_id, cost_czk) values (new.id, v_cost)
    on conflict (game_id) do nothing;
  end if;
  return new;
end $$;

revoke execute on function public.game_pitch_cost_follow_venue() from public, anon, authenticated;

drop trigger if exists games_pitch_cost_on_insert on public.games;
create trigger games_pitch_cost_on_insert
  after insert on public.games
  for each row execute function public.game_pitch_cost_follow_venue();

drop trigger if exists games_pitch_cost_on_venue_change on public.games;
create trigger games_pitch_cost_on_venue_change
  after update of venue_id on public.games
  for each row execute function public.game_pitch_cost_follow_venue();

-- Backfill: every game with a venue, at the current season's price.
insert into public.game_pitch_costs (game_id, cost_czk)
select g.id, public.venue_pitch_cost_now(g.venue_id)
  from public.games g
 where g.venue_id is not null
   and public.venue_pitch_cost_now(g.venue_id) is not null
on conflict (game_id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. The admin's three writers.
-- -----------------------------------------------------------------------------

create or replace function public.set_venue_pitch_costs(
  p_venue_id uuid, p_summer_czk integer, p_winter_czk integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if p_summer_czk is null or p_winter_czk is null
     or p_summer_czk not between 0 and public.pitch_cost_max_czk()
     or p_winter_czk not between 0 and public.pitch_cost_max_czk() then
    raise exception 'PITCH_COST_OUT_OF_RANGE'
      using detail = 'between 0 and ' || public.pitch_cost_max_czk()::text || ' CZK';
  end if;

  if not exists (select 1 from public.venues v where v.id = p_venue_id) then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  insert into public.venue_pitch_costs (venue_id, summer_czk, winter_czk, updated_at)
  values (p_venue_id, p_summer_czk, p_winter_czk, now())
  on conflict (venue_id) do update
     set summer_czk = excluded.summer_czk,
         winter_czk = excluded.winter_czk,
         updated_at = now();

  return jsonb_build_object('summer_czk', p_summer_czk, 'winter_czk', p_winter_czk);
end $$;

revoke execute on function public.set_venue_pitch_costs(uuid, integer, integer) from public, anon;
grant execute on function public.set_venue_pitch_costs(uuid, integer, integer) to authenticated, service_role;

comment on function public.set_venue_pitch_costs(uuid, integer, integer) is
  'Admin-only. Sets a venue''s summer and winter pitch cost (round 42). '
  'Games already created keep theirs.';

create or replace function public.set_pitch_season(p_season text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if p_season is null or p_season not in ('summer', 'winter') then
    raise exception 'INVALID_PITCH_SEASON' using detail = 'summer or winter';
  end if;

  insert into public.pitch_settings (id, season, updated_at, updated_by)
  values ('singleton', p_season, now(), public.current_player_id())
  on conflict (id) do update
     set season = excluded.season,
         updated_at = now(),
         updated_by = excluded.updated_by;

  return p_season;
end $$;

revoke execute on function public.set_pitch_season(text) from public, anon;
grant execute on function public.set_pitch_season(text) to authenticated, service_role;

comment on function public.set_pitch_season(text) is
  'Admin-only. Switches every venue to its summer or winter pitch cost for games '
  'created from now on (round 42).';

create or replace function public.set_game_pitch_cost(p_game_id uuid, p_cost_czk integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
  v_cost  integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if p_cost_czk is not null and p_cost_czk not between 0 and public.pitch_cost_max_czk() then
    raise exception 'PITCH_COST_OUT_OF_RANGE'
      using detail = 'between 0 and ' || public.pitch_cost_max_czk()::text || ' CZK';
  end if;

  select g.venue_id into v_venue from public.games g where g.id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  -- An empty correction puts the game back on its venue's price for the
  -- season — or on none, for a game with no venue.
  if p_cost_czk is null then
    delete from public.game_pitch_costs c where c.game_id = p_game_id;
    v_cost := public.venue_pitch_cost_now(v_venue);
    if v_cost is not null then
      insert into public.game_pitch_costs (game_id, cost_czk) values (p_game_id, v_cost);
    end if;
    return v_cost;
  end if;

  insert into public.game_pitch_costs (game_id, cost_czk, set_by_hand, updated_at)
  values (p_game_id, p_cost_czk, true, now())
  on conflict (game_id) do update
     set cost_czk = excluded.cost_czk,
         set_by_hand = true,
         updated_at = now();

  return p_cost_czk;
end $$;

revoke execute on function public.set_game_pitch_cost(uuid, integer) from public, anon;
grant execute on function public.set_game_pitch_cost(uuid, integer) to authenticated, service_role;

comment on function public.set_game_pitch_cost(uuid, integer) is
  'Admin-only. Corrects one game''s pitch cost (round 42); null puts it back on '
  'its venue''s price for the current season.';

-- -----------------------------------------------------------------------------
-- 5. What every booking earned, and what every game made.
-- -----------------------------------------------------------------------------

create or replace function public.booking_seat_values(p_game_ids uuid[])
returns table (
  booking_id    uuid,
  game_id       uuid,
  player_id     uuid,
  status        public.booking_status,
  seats         integer,
  single_seats  numeric,
  pass_seats    numeric,
  credit_seats  numeric,
  free_seats    numeric,
  unpaid_seats  numeric,
  single_czk    numeric,
  pass_czk      numeric,
  credit_czk    numeric,
  kept_czk      numeric,
  owed_czk      integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_seat_price numeric := public.credit_seat_price_czk();
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  return query
  with b as (
    select bk.id, bk.game_id, bk.player_id, bk.status, bk.payment_method,
           bk.price_czk, bk.credit_applied_czk, bk.guest_count
      from public.bookings bk
     where bk.game_id = any(coalesce(p_game_ids, array[]::uuid[]))
       and bk.status in ('reserved', 'confirmed', 'cancelled')
  ),
  -- What a cancelled booking kept: `forfeited_czk` on a player's late
  -- cancellation, `withheld_czk` on an admin removal that returned nothing.
  kept as (
    select e.booking_id,
           max(greatest(coalesce((e.metadata ->> 'forfeited_czk')::numeric, 0),
                        coalesce((e.metadata ->> 'withheld_czk')::numeric, 0))) as face
      from public.events e
     where e.booking_id in (select b.id from b where b.status = 'cancelled')
       and e.event_type in ('booking_cancelled', 'admin_booking_removed')
     group by e.booking_id
  ),
  red as (
    select l.booking_id, l.player_id, l.batch_id, (-l.delta_czk)::numeric as face
      from public.credit_ledger l
     where l.booking_id in (select b.id from b)
       and l.reason = 'redemption'
       and l.delta_czk < 0
  ),
  -- Every inflow a redemption could have drawn on: the batches named, and the
  -- unexpiring pool of every player who drew on it.
  inflow as (
    select s.id, s.player_id, s.delta_czk::numeric as face,
           (s.expires_at is null) as in_pool,
           case
             when s.reason = 'topup' and t.pass_games is not null then 'pass'
             when s.reason in ('topup', 'cancellation_credit') then 'credit'
             when s.reason in ('admin_grant', 'adjustment') and paid.recorded then 'credit'
             when s.reason in ('admin_grant', 'adjustment') then 'free'
             else 'credit'
           end as kind,
           case
             when s.reason = 'topup' and t.id is not null
               then coalesce(t.received_amount_czk, t.amount_czk)::numeric
             when s.reason in ('admin_grant', 'adjustment') and not paid.recorded then 0
             else s.delta_czk::numeric
           end as paid
      from public.credit_ledger s
      left join lateral (
        select t.id, t.pass_games, t.received_amount_czk, t.amount_czk
          from public.credit_topups t
         where s.reason = 'topup'
           and t.player_id = s.player_id
           and t.status = 'confirmed'
           and t.confirmed_at = s.created_at
         order by t.id
         limit 1
      ) t on true
      cross join lateral (
        select exists (
          select 1 from public.events e
           where s.reason in ('admin_grant', 'adjustment')
             and e.event_type = 'payment_unmatched'
             and e.player_id = s.player_id
             and e.created_at = s.created_at
             and e.metadata ->> 'amount_czk' = s.delta_czk::text
        ) as recorded
      ) paid
     where s.delta_czk > 0
       and s.batch_id is null
       and (s.id in (select red.batch_id from red where red.batch_id is not null)
            or (s.expires_at is null
                and s.player_id in (select red.player_id from red where red.batch_id is null)))
  ),
  pool as (
    select i.player_id,
           sum(i.face) as face,
           coalesce(sum(i.face) filter (where i.kind = 'pass'), 0)   as pass_face,
           coalesce(sum(i.paid) filter (where i.kind = 'pass'), 0)   as pass_paid,
           coalesce(sum(i.face) filter (where i.kind = 'credit'), 0) as credit_face,
           coalesce(sum(i.paid) filter (where i.kind = 'credit'), 0) as credit_paid
      from inflow i
     where i.in_pool
     group by i.player_id
  ),
  -- Each redemption split into what it was, at what was paid for it.
  part as (
    select red.booking_id, red.face,
           case
             when bt.id is not null then case when bt.kind = 'pass' then red.face else 0 end
             when p.face > 0 then red.face * p.pass_face / p.face
             else 0
           end as pass_face,
           case
             when bt.id is not null then case when bt.kind = 'pass' then red.face * bt.paid / bt.face else 0 end
             when p.face > 0 then red.face * p.pass_paid / p.face
             else 0
           end as pass_value,
           case
             when bt.id is not null then case when bt.kind = 'credit' then red.face else 0 end
             when p.face > 0 then red.face * p.credit_face / p.face
             else red.face
           end as credit_face,
           case
             when bt.id is not null then case when bt.kind = 'credit' then red.face * bt.paid / bt.face else 0 end
             when p.face > 0 then red.face * p.credit_paid / p.face
             else red.face
           end as credit_value
      from red
      left join inflow bt on bt.id = red.batch_id and not bt.in_pool
      left join pool p on p.player_id = red.player_id and red.batch_id is null
  ),
  spent as (
    select part.booking_id,
           sum(part.face) as face,
           sum(part.pass_face) as pass_face, sum(part.pass_value) as pass_value,
           sum(part.credit_face) as credit_face, sum(part.credit_value) as credit_value
      from part
     group by part.booking_id
  ),
  -- The Credit face each booking still holds, and the money it took.
  basis as (
    select b.*,
           case when b.status = 'cancelled'
                then least(coalesce(k.face, 0), b.credit_applied_czk)
                else b.credit_applied_czk end::numeric as credit_face,
           case
             when b.status = 'cancelled'
               then greatest(coalesce(k.face, 0) - b.credit_applied_czk, 0)
             when b.status = 'confirmed' and b.payment_method <> 'seed_free'
               then greatest(b.price_czk - b.credit_applied_czk, 0)
             else 0
           end::numeric as cash,
           sp.face as r_face, sp.pass_face as r_pass_face, sp.pass_value as r_pass_value,
           sp.credit_face as r_credit_face, sp.credit_value as r_credit_value
      from b
      left join kept k on k.booking_id = b.id
      left join spent sp on sp.booking_id = b.id
  ),
  valued as (
    select x.*,
           case when coalesce(x.r_face, 0) > 0 then x.credit_face * x.r_pass_face / x.r_face else 0 end as c_pass_face,
           case when coalesce(x.r_face, 0) > 0 then x.credit_face * x.r_pass_value / x.r_face else 0 end as c_pass_value,
           case when coalesce(x.r_face, 0) > 0 then x.credit_face * x.r_credit_face / x.r_face else x.credit_face end as c_credit_face,
           case when coalesce(x.r_face, 0) > 0 then x.credit_face * x.r_credit_value / x.r_face else x.credit_face end as c_credit_value,
           case when x.status = 'cancelled' then 0 else 1 + x.guest_count end as held
      from basis x
  )
  select v.id,
         v.game_id,
         v.player_id,
         v.status,
         v.held,
         round(case
                 when v.status <> 'confirmed' then 0
                 when v.payment_method = 'seed_free' then 0
                 else greatest(v.held - least(v.credit_face / v_seat_price, v.held), 0)
               end, 2),
         round(case when v.status = 'cancelled' then 0 else v.c_pass_face / v_seat_price end, 2),
         round(case when v.status = 'cancelled' then 0 else v.c_credit_face / v_seat_price end, 2),
         round(case
                 when v.status = 'cancelled' then 0
                 when v.status = 'confirmed' and v.payment_method = 'seed_free' then v.held
                 else (v.credit_face - v.c_pass_face - v.c_credit_face) / v_seat_price
               end, 2),
         round(case
                 when v.status = 'reserved'
                   then greatest(v.held - least(v.credit_face / v_seat_price, v.held), 0)
                 else 0
               end, 2),
         round(case when v.status = 'cancelled' then 0 else v.cash end, 2),
         round(case when v.status = 'cancelled' then 0 else v.c_pass_value end, 2),
         round(case when v.status = 'cancelled' then 0 else v.c_credit_value end, 2),
         round(case when v.status = 'cancelled'
                    then v.cash + v.c_pass_value + v.c_credit_value else 0 end, 2),
         case when v.status = 'reserved'
              then greatest(v.price_czk - v.credit_applied_czk, 0) else 0 end
    from valued v;
end $$;

revoke execute on function public.booking_seat_values(uuid[]) from public, anon;
grant execute on function public.booking_seat_values(uuid[]) to authenticated, service_role;

comment on function public.booking_seat_values(uuid[]) is
  'Admin-only (round 42). What every booking on these games earned, by how it was '
  'paid: single (card, QR, cash at the game''s price), pass and balance Credits at '
  'what was paid for them, free (gifts, seed), kept (a cancellation that returned '
  'nothing) and owed (unpaid). Seats are fractional where a pool mixes paid and free.';

create or replace function public.game_economics(p_game_ids uuid[])
returns table (
  game_id           uuid,
  price_czk         integer,
  capacity          integer,
  seats_taken       integer,
  house_guests      integer,
  unpaid_seats      numeric,
  single_seats      numeric,
  pass_seats        numeric,
  credit_seats      numeric,
  free_seats        numeric,
  single_czk        numeric,
  pass_czk          numeric,
  credit_czk        numeric,
  kept_czk          numeric,
  owed_czk          integer,
  revenue_czk       numeric,
  pitch_cost_czk    integer,
  profit_czk        numeric,
  break_even_seats  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  return query
  with v as (
    select s.game_id,
           sum(s.unpaid_seats) as unpaid_seats,
           sum(s.single_seats) as single_seats, sum(s.pass_seats) as pass_seats,
           sum(s.credit_seats) as credit_seats, sum(s.free_seats) as free_seats,
           sum(s.single_czk) as single_czk, sum(s.pass_czk) as pass_czk,
           sum(s.credit_czk) as credit_czk, sum(s.kept_czk) as kept_czk,
           sum(s.owed_czk)::integer as owed_czk
      from public.booking_seat_values(p_game_ids) s
     group by s.game_id
  ),
  r as (
    select g.id, g.price_czk, g.capacity, coalesce(g.guest_count, 0) as house_guests,
           coalesce(st.seats_taken, 0) as seats_taken,
           coalesce(v.unpaid_seats, 0) as unpaid_seats,
           coalesce(v.single_seats, 0) as single_seats, coalesce(v.pass_seats, 0) as pass_seats,
           coalesce(v.credit_seats, 0) as credit_seats, coalesce(v.free_seats, 0) as free_seats,
           coalesce(v.single_czk, 0) as single_czk, coalesce(v.pass_czk, 0) as pass_czk,
           coalesce(v.credit_czk, 0) as credit_czk, coalesce(v.kept_czk, 0) as kept_czk,
           coalesce(v.owed_czk, 0) as owed_czk,
           c.cost_czk
      from public.games g
      left join public.game_seats_taken_many(p_game_ids) st on st.game_id = g.id
      left join v on v.game_id = g.id
      left join public.game_pitch_costs c on c.game_id = g.id
     where g.id = any(coalesce(p_game_ids, array[]::uuid[]))
  )
  select r.id, r.price_czk, r.capacity, r.seats_taken, r.house_guests, r.unpaid_seats,
         r.single_seats, r.pass_seats, r.credit_seats, r.free_seats,
         r.single_czk, r.pass_czk, r.credit_czk, r.kept_czk, r.owed_czk,
         r.single_czk + r.pass_czk + r.credit_czk + r.kept_czk,
         r.cost_czk,
         r.single_czk + r.pass_czk + r.credit_czk + r.kept_czk - r.cost_czk,
         case when r.cost_czk is not null and r.price_czk > 0
              then ceil(r.cost_czk::numeric / r.price_czk)::integer end
    from r;
end $$;

revoke execute on function public.game_economics(uuid[]) from public, anon;
grant execute on function public.game_economics(uuid[]) to authenticated, service_role;

comment on function public.game_economics(uuid[]) is
  'Admin-only (round 42). Per game: seats (taken, house guests, unpaid, and paid by '
  'single / pass / balance Credit / free), revenue at what was paid, money kept and '
  'owed, the pitch cost, profit, and break-even seats at the game''s price.';

-- -----------------------------------------------------------------------------
-- 6. app_capabilities() — every earlier flag probed, plus this file's one.
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
    'deleteAccount',     to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'delete_player_account')),
    'gameNumbers',       to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'games'
         and column_name = 'game_number')),
    'dismissOneNotification', to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'dismiss_notification')),
    'organizerPlayer',   to_jsonb(exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_game_organizer_player')),
    'adminRemoveCreditChoice', to_jsonb(exists (
      select 1 from information_schema.routines r
       join information_schema.parameters p on p.specific_name = r.specific_name
      where r.routine_schema = 'public' and r.routine_name = 'admin_remove_booking'
        and p.parameter_name = 'p_return_credit')),
    'venueAddress',      to_jsonb(exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'venues'
         and column_name = 'address')),
    -- Created by THIS file.
    'pitchCosts',              true
  )
$$;

-- -----------------------------------------------------------------------------
-- VERIFICATION — SHAPE ONLY, and the result of this file's own backfills.
-- -----------------------------------------------------------------------------

do $$
declare v_caps jsonb := public.app_capabilities();
begin
  if to_regclass('public.venue_pitch_costs') is null
     or to_regclass('public.pitch_settings') is null
     or to_regclass('public.game_pitch_costs') is null then
    raise exception 'pitch costs: a table is missing';
  end if;
  if has_table_privilege('anon', 'public.venue_pitch_costs', 'select')
     or has_table_privilege('authenticated', 'public.venue_pitch_costs', 'select')
     or has_table_privilege('anon', 'public.game_pitch_costs', 'select')
     or has_table_privilege('authenticated', 'public.game_pitch_costs', 'select')
     or has_table_privilege('anon', 'public.pitch_settings', 'select')
     or has_table_privilege('authenticated', 'public.pitch_settings', 'select') then
    raise exception 'pitch costs: a pitch cost table is readable by anon or authenticated';
  end if;
  if has_function_privilege('anon', 'public.game_economics(uuid[])', 'execute')
     or has_function_privilege('anon', 'public.booking_seat_values(uuid[])', 'execute')
     or has_function_privilege('anon', 'public.set_venue_pitch_costs(uuid, integer, integer)', 'execute')
     or has_function_privilege('anon', 'public.set_pitch_season(text)', 'execute')
     or has_function_privilege('anon', 'public.set_game_pitch_cost(uuid, integer)', 'execute') then
    raise exception 'pitch costs: anon can execute an admin function';
  end if;
  if exists (select 1 from public.venues v
              where not exists (select 1 from public.venue_pitch_costs c where c.venue_id = v.id)) then
    raise exception 'pitch costs: a venue has no pitch cost row';
  end if;
  if exists (select 1 from public.games g
              where g.venue_id is not null
                and not exists (select 1 from public.game_pitch_costs c where c.game_id = g.id)) then
    raise exception 'pitch costs: a game with a venue has no pitch cost';
  end if;
  if (select count(*) from public.pitch_settings) <> 1 then
    raise exception 'pitch costs: pitch_settings is not one row';
  end if;
  if (select count(*) from jsonb_object_keys(v_caps)) <> 37
     or not (v_caps ->> 'pitchCosts')::boolean then
    raise exception 'round 42: app_capabilities is not 37 flags with pitchCosts: %', v_caps;
  end if;
end $$;
