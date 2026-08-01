-- =============================================================================
-- Migration 27 — organizer contact, kept off `games` on purpose
--
-- Phase 2 §5.1, and risk R2. This is the migration whose entire reason for
-- existing is a grant that was made in Phase 1 and is still correct:
--
--     grant select on public.games to anon, authenticated;
--
-- That is TABLE-WIDE. Every column of `games` is readable by anyone through
-- PostgREST, and a table-level grant covers columns added in the future — so an
-- `organizer_phone` column on `games` would be a world-readable phone number
-- the moment this migration ran, no matter what the application did with it.
-- An application-side check would gate the render and leave the number one API
-- call away.
--
-- So the phone lives in its own table with no client grants at all, and reaches
-- the page through a `SECURITY DEFINER` function that checks the caller's own
-- booking. That is the `game_roster_public` pattern: public projection over a
-- private base.
--
-- THE NAME AND THE PHONE ARE DIFFERENT KINDS OF FACT. The organizer's name is
-- published on the card and the detail — it tells a player who is running the
-- game. The phone is for the people who are actually coming, on the day, and
-- for nobody else. One table, two very different exits.
--
-- Rollback: supabase/rollback/20260802100100_game_organizer_contacts_down.sql
-- =============================================================================

create table public.game_organizer_contacts (
  game_id uuid primary key references public.games (id) on delete cascade,
  organizer_name text not null,
  organizer_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organizer_name_length check (
    length(btrim(organizer_name)) between 1 and 60
  ),
  constraint organizer_phone_length check (
    organizer_phone is null or length(btrim(organizer_phone)) between 3 and 32
  )
);

-- =============================================================================
-- RLS — deny by default, and NOT A SINGLE CLIENT GRANT
--
-- No policy is written for `anon` or `authenticated` because no grant is made
-- to them. Both exits below are SECURITY DEFINER functions, which is the only
-- way this data leaves the table.
-- =============================================================================

alter table public.game_organizer_contacts enable row level security;

revoke all on public.game_organizer_contacts from anon, authenticated;

grant select on public.game_organizer_contacts to service_role;

comment on table public.game_organizer_contacts is
  'Organizer name and phone. NO client grants: the name exits through '
  'game_organizer_public, the phone only through game_organizer_phone() to a '
  'caller holding an active booking. Kept off `games` because SELECT there is '
  'granted table-wide to anon.';

-- =============================================================================
-- The public exit: the name, for a published game
-- =============================================================================

create function public.game_organizer_public(p_game_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.organizer_name
  from public.game_organizer_contacts c
  join public.games g on g.id = c.game_id
  where c.game_id = p_game_id
    and g.status in ('published', 'full', 'played', 'settled');
$$;

-- REVOKE FIRST. Postgres grants EXECUTE on a new function to PUBLIC by default,
-- so "who may call this" is decided by what is revoked, not by what is granted.
-- Granting without revoking looks deliberate and changes nothing.
revoke execute on function public.game_organizer_public(uuid) from public;
grant execute on function public.game_organizer_public(uuid) to anon, authenticated, service_role;

comment on function public.game_organizer_public(uuid) is
  'The organizer NAME for a game anyone may see. Draft and cancelled games '
  'return null: an unpublished game is not public, and neither is who is '
  'running it.';

-- =============================================================================
-- The gated exit: the phone, only to someone who is actually coming
--
-- Returns NULL rather than raising for every refusal. A raise would let a
-- caller distinguish "no phone recorded" from "you are not allowed" — which is
-- itself information about the game, and useless to the person asking either
-- way.
-- =============================================================================

create function public.game_organizer_phone(p_game_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.organizer_phone
  from public.game_organizer_contacts c
  where c.game_id = p_game_id
    and exists (
      select 1
      from public.bookings b
      join public.players p on p.id = b.player_id
      where b.game_id = p_game_id
        and p.auth_user_id = auth.uid()
        and b.status in ('reserved', 'confirmed')
    );
$$;

-- `anon` is deliberately absent — and the REVOKE is what makes that true.
-- Without it the default PUBLIC grant leaves an anonymous caller able to invoke
-- this all day; it would return null every time, but "the answer is null" and
-- "you may not ask" are different properties, and only the second one survives
-- a future edit to the function body.
revoke execute on function public.game_organizer_phone(uuid) from public, anon;
grant execute on function public.game_organizer_phone(uuid) to authenticated, service_role;

comment on function public.game_organizer_phone(uuid) is
  'The organizer PHONE, only for a caller holding a reserved or confirmed '
  'booking on that game. Null for everyone else, and null rather than an error '
  'so refusal and absence are indistinguishable.';

-- =============================================================================
-- The admin writer
-- =============================================================================

create function public.set_game_organizer(
  p_game_id uuid,
  p_organizer_name text,
  p_organizer_phone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  if not public.is_admin_caller() then
    raise exception 'INSUFFICIENT_PERMISSION' using detail = 'admin only';
  end if;

  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'GAME_NOT_FOUND';
  end if;

  if p_organizer_name is null or btrim(p_organizer_name) = '' then
    raise exception 'ORGANIZER_NAME_REQUIRED';
  end if;

  -- Empty string is not a phone number; it is the absence of one, and storing
  -- it would make "has a phone" true for a game with nothing to call.
  v_phone := nullif(btrim(coalesce(p_organizer_phone, '')), '');

  insert into public.game_organizer_contacts (game_id, organizer_name, organizer_phone)
  values (p_game_id, btrim(p_organizer_name), v_phone)
  on conflict (game_id) do update
    set organizer_name = excluded.organizer_name,
        organizer_phone = excluded.organizer_phone,
        updated_at = now();
end $$;

revoke execute on function public.set_game_organizer(uuid, text, text) from public, anon;
grant execute on function public.set_game_organizer(uuid, text, text) to authenticated, service_role;

comment on function public.set_game_organizer(uuid, text, text) is
  'Admin-only upsert of a game''s organizer contact. Blank phone is stored as '
  'NULL: an empty string would make "has a phone" true with nothing to call.';
