-- =============================================================================
-- Round 16 item 2 — a photo change has to change its URL
--
-- THE BUG THIS CLOSES. `set_profile_photo` and `set_cover_photo` derive a
-- DETERMINISTIC object key from the player id — `players/<id>.webp` and
-- `players/<id>.cover.webp` — so replacing a photo writes new bytes to a URL
-- every browser and CDN already holds. `lib/storage/avatar.ts` was written
-- knowing this: it appends `?v=<updatedAt>` and its docstring says the suffix
-- "moves whenever the row does".
--
-- It never moved. There is no `updated_at` on `players`, so every caller
-- passes `created_at` — the one timestamp that is guaranteed constant for the
-- life of the account. The cache-buster was a fixed string per player.
--
-- Measured before writing this: uploading a magenta banner and then a yellow
-- one left the screen magenta, both immediately and after a full reload.
--
-- WHY A TRIGGER AND NOT A `set` IN THE TWO RPCs. Those two are the callers
-- that exist today; the column answers "when did this row last change", which
-- is a property of the table rather than of the two functions that happen to
-- need it now. A future admin edit, a nickname change or a positions update
-- all move a photo URL's neighbours on the same page, and none of them would
-- have remembered to bump it by hand.
--
-- BACKFILL IS `created_at`, NOT `now()`. Setting every row to the moment of
-- the migration would change every existing photo URL at once and expire a
-- cache that is currently correct — a stampede in exchange for nothing. Rows
-- that have never been updated genuinely last changed when they were created.
--
-- ADDITIVE AND SAFE TO SHIP CODE AGAINST EITHER WAY. The application reads
-- `updated_at ?? created_at`, so before this runs it behaves exactly as it
-- does today and after it runs the URL moves.
--
-- Rollback: supabase/rollback/20260823100000_players_updated_at_down.sql
-- =============================================================================

alter table public.players
  add column if not exists updated_at timestamptz not null default now();

-- See the header: the moment of the migration is not when these rows changed.
update public.players set updated_at = created_at where updated_at > created_at;

comment on column public.players.updated_at is
  'Last modification. Read by lib/storage/avatar.ts as the photo URL cache '
  'buster: the object key never changes, so this is what makes a replaced '
  'photo a different URL.';

create or replace function public.touch_players_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists players_touch_updated_at on public.players;

create trigger players_touch_updated_at
  before update on public.players
  for each row
  execute function public.touch_players_updated_at();

-- -----------------------------------------------------------------------------
-- Verification — runs inside the same transaction as the migration.
--
-- IT EXERCISES THE TRIGGER rather than checking that it exists. A trigger that
-- is present and not firing looks identical in the catalog, and the whole
-- point of the column is that it MOVES.
-- -----------------------------------------------------------------------------
do $$
declare
  v_id     uuid;
  v_before timestamptz;
  v_after  timestamptz;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players'
      and column_name = 'updated_at'
  ) then
    raise exception 'players.updated_at was not created';
  end if;

  select id, updated_at into v_id, v_before from public.players limit 1;

  if v_id is null then
    raise notice 'no players to exercise the trigger against — column created';
    return;
  end if;

  -- A no-op UPDATE: the trigger must fire on the statement, not on a change
  -- in any particular column.
  update public.players set nickname = nickname where id = v_id;
  select updated_at into v_after from public.players where id = v_id;

  if v_after <= v_before then
    raise exception 'players_touch_updated_at did not fire (% -> %)', v_before, v_after;
  end if;

  raise notice 'trigger verified: % -> %', v_before, v_after;
end
$$;
