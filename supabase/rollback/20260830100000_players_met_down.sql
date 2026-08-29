-- Rollback for 20260830100000_players_met.
--
-- DROP THE CAPABILITY FLAG FIRST if running by hand: `playersMet` is what tells
-- the application to render the new tile, and the tile reads a column that is
-- about to stop existing. With the flag off the deployed code falls back to
-- "Pitches played" on both profiles, exactly as it does before the migration is
-- applied — which is the same code path, not a special case.
create or replace function public.app_capabilities()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist', true, 'dismissNotifications', true, 'adminRemoveBooking', true,
    'adminDelete', true, 'cancelWithReason', true, 'gameLanguage', true,
    'organizerTelegram', true
  )
$$;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- The composite goes back to six columns, which means dropping the function
-- that returns it and restoring the round-14 body verbatim.
drop function if exists public.public_player_profile(text);
drop type if exists public.public_profile;

create type public.public_profile as (
  nickname     text,
  photo_path   text,
  cover_path   text,
  games_played integer,
  hours        numeric,
  venues       integer
);

create function public.public_player_profile(p_nickname text)
returns public.public_profile
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_default_minutes constant integer := 60;
  v_player public.players%rowtype;
  v_out    public.public_profile;
begin
  if p_nickname is null or btrim(p_nickname) = '' then
    return null;
  end if;

  select * into v_player
    from public.players p
   where lower(p.nickname) = lower(btrim(p_nickname))
     and p.auth_user_id is not null;

  if not found then
    return null;
  end if;

  v_out.nickname   := v_player.nickname;
  v_out.photo_path := v_player.photo_path;
  v_out.cover_path := v_player.cover_path;

  select
      count(*)::integer,
      round(sum(coalesce(g.duration_minutes, v_default_minutes))::numeric / 60.0, 1),
      count(distinct coalesce(g.venue_id::text, g.venue))::integer
    into v_out.games_played, v_out.hours, v_out.venues
    from public.bookings b
    join public.games g on g.id = b.game_id
   where b.player_id = v_player.id
     and b.status in ('reserved', 'confirmed')
     and g.status in ('played', 'settled');

  v_out.games_played := coalesce(v_out.games_played, 0);
  v_out.hours        := coalesce(v_out.hours, 0);
  v_out.venues       := coalesce(v_out.venues, 0);

  return v_out;
end;
$$;

revoke execute on function public.public_player_profile(text) from public;
grant execute on function public.public_player_profile(text) to anon, authenticated, service_role;

drop function if exists public.players_met(uuid);
