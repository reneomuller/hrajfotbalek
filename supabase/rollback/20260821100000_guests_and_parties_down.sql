-- Rollback for 20260821100000_guests_and_parties.
--
-- DESTRUCTIVE IN ONE DIRECTION ONLY, and it is worth naming: dropping
-- `guest_count` discards every house guest and every party seat. A party
-- booking becomes a single-seat booking still priced for the whole party, so
-- its `price_czk` will read as a multiple of the game price with nothing to
-- explain it. Cancel outstanding parties before running this.

drop view public.game_roster_public;

create view public.game_roster_public as
  select
    b.game_id,
    p.nickname,
    p.photo_path,
    (
      select count(*)
        from public.bookings b2
        join public.games g2 on g2.id = b2.game_id
       where b2.player_id = p.id
         and b2.status in ('reserved', 'confirmed')
         and g2.status in ('played', 'settled')
    )::integer as games_played
  from public.bookings b
  join public.players p on p.id = b.player_id
  join public.games   g on g.id = b.game_id
  where g.status in ('published', 'full', 'played', 'settled')
    and b.status in ('reserved', 'confirmed');

grant select on public.game_roster_public to anon, authenticated;

drop function if exists public.create_booking(uuid, public.payment_method, uuid, uuid, integer);
drop function if exists public.create_booking_internal(uuid, uuid, public.payment_method, uuid, boolean, integer);
drop function if exists public.set_game_guests(uuid, integer);
drop function if exists public.game_seats_taken(uuid);

alter table public.games    drop column if exists guest_count;
alter table public.bookings drop column if exists guest_count;

-- The prior definitions of create_booking, create_booking_internal,
-- sync_game_fullness and set_game_capacity must be re-applied from
-- 20260720110000_rpc_create_booking.sql, 20260720130000_booking_rpcs_b.sql and
-- 20260802160000_pass_money_path.sql, in that order.
