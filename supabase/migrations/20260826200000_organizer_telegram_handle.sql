-- =============================================================================
-- Round 19 item 2 — the organizer's Telegram USERNAME
--
-- WHAT THIS CORRECTS. Round 18 shipped `/api/tg/<gameId>` redirecting to
-- `t.me/+<phone digits>`, and its own comment said what was wrong with that:
-- the form resolves only if the number has a Telegram account AND its owner
-- has left "find me by phone number" on. Neither is checkable from here, and
-- the failure is silent and off-site — Telegram's own "user not found" page,
-- on their domain, after the player has already left this product.
--
-- A USERNAME HAS NO SUCH FAILURE. `t.me/<handle>` resolves because the handle
-- exists; it is the identifier its owner chose to be reachable by, and it
-- carries none of the number's privacy weight — a phone is a fact about a
-- person, a handle is a name they published.
--
-- SO THE PHONE FORM GOES ENTIRELY. Keeping it as a fallback would mean the
-- product still sometimes sends players to a dead page, which is the whole
-- defect. A game whose organizer has no handle offers WHATSAPP instead —
-- contact is always possible, and no link goes nowhere.
--
-- NULLABLE, because most organizers will not have one and a blank is a real
-- answer rather than missing data.
--
-- Rollback: supabase/rollback/20260826200000_organizer_telegram_handle_down.sql
-- =============================================================================

alter table public.game_organizer_contacts
  add column if not exists organizer_telegram text;

alter table public.game_organizer_contacts
  drop constraint if exists organizer_telegram_format;

/*
 * TELEGRAM'S OWN RULE, RESTATED: 5-32 characters, letters, digits and
 * underscores, starting with a letter. Constrained rather than free text for
 * the reason `games.format` is — the value is interpolated into a URL this
 * product hands a player, and a CHECK is what stops `../` or a query string
 * ever reaching it.
 *
 * THE `@` AND ANY `t.me/` PREFIX ARE STRIPPED BEFORE THIS SEES THEM, by
 * `set_game_organizer` below. Storing the bare handle means one canonical
 * form in the column and one place that knows how to get there — rather than
 * every reader having to strip whatever an admin happened to paste.
 */
alter table public.game_organizer_contacts add constraint organizer_telegram_format check (
  organizer_telegram is null
  or organizer_telegram ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'
);

comment on column public.game_organizer_contacts.organizer_telegram is
  'The organizer''s Telegram username, stored BARE — no @, no t.me/ prefix. '
  'Used by /api/tg/<gameId>. Null means this organizer is not reachable on '
  'Telegram, and the game offers WhatsApp instead.';

-- -----------------------------------------------------------------------------
-- The rule, as its own function
--
-- EXTRACTED SO IT CAN BE TESTED. The verification block at the foot of this
-- file runs as the migration OWNER, who is neither an admin nor
-- `service_role` — so it cannot call `set_game_organizer` to check the
-- normalisation, and round 13 records what happens when a migration tries: the
-- self-test failed on the authorization check, and had it passed it would have
-- written real data.
--
-- Naming the rule fixes both problems at once. It is `immutable` and has no
-- authorization of its own because it decides nothing and touches nothing — it
-- turns four spellings of a handle into one.
-- -----------------------------------------------------------------------------
create or replace function public.normalize_telegram_handle(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select nullif(
    btrim(
      ltrim(
        regexp_replace(
          btrim(coalesce(p_raw, '')),
          '^(https?://)?(www\.)?t\.me/', '', 'i'
        ),
        '@'
      )
    ),
    ''
  )
$fn$;

comment on function public.normalize_telegram_handle(text) is
  'Turns @oliver, t.me/oliver, https://t.me/oliver and oliver into the bare '
  'handle. One rule, one place — the admin form does not repeat it.';

grant execute on function public.normalize_telegram_handle(text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- The write path
--
-- RESTATED IN FULL, from the migration that defines it, with one parameter and
-- one normalisation added. `create or replace` needs the whole body; copying
-- it from the source rather than retyping it is the round-13 lesson, where
-- rebuilding `set_site_setting` from memory silently changed three unrelated
-- branches.
-- -----------------------------------------------------------------------------
create or replace function public.set_game_organizer(
  p_game_id uuid,
  p_organizer_name text,
  p_organizer_phone text default null,
  p_organizer_telegram text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone    text;
  v_telegram text;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
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

  /*
   * NORMALISED HERE, AND ONLY HERE. An admin will paste `@oliver`,
   * `t.me/oliver`, `https://t.me/oliver` or `oliver` — all four mean the same
   * account, and the column holds one of them. Doing this in the form as well
   * would be two implementations of one rule; doing it ONLY in the form would
   * leave the RPC accepting whatever a hand-made call sent.
   */
  v_telegram := public.normalize_telegram_handle(p_organizer_telegram);

  if v_telegram is not null and v_telegram !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then
    raise exception 'INVALID_TELEGRAM_HANDLE' using detail = v_telegram;
  end if;

  insert into public.game_organizer_contacts (
    game_id, organizer_name, organizer_phone, organizer_telegram
  )
  values (p_game_id, btrim(p_organizer_name), v_phone, v_telegram)
  on conflict (game_id) do update
    set organizer_name      = excluded.organizer_name,
        organizer_phone     = excluded.organizer_phone,
        organizer_telegram  = excluded.organizer_telegram,
        updated_at          = now();
end $$;

revoke execute on function public.set_game_organizer(uuid, text, text, text) from public;
grant execute on function public.set_game_organizer(uuid, text, text, text)
  to authenticated, service_role;

/*
 * THE THREE-ARGUMENT FORM IS DROPPED, and that is deliberate rather than
 * tidying. `admin_create_game_v2` calls `set_game_organizer(id, name, phone)`;
 * leaving both would make that call ambiguous to Postgres — two candidates,
 * one with a default for the fourth — and it would resolve to whichever the
 * planner picked. Dropping it means the existing internal call binds to the
 * new function with `p_organizer_telegram` defaulting to null, which is
 * exactly the behaviour it had.
 */
drop function if exists public.set_game_organizer(uuid, text, text);

-- -----------------------------------------------------------------------------
-- Reading it
--
-- ITS OWN FUNCTION, mirroring `game_organizer_phone`. A handle is less
-- sensitive than a number — it is a published name — but it is read by the
-- same route on the same page, and giving it a different access shape would
-- be one more thing to reason about at the wrong moment.
-- -----------------------------------------------------------------------------
create or replace function public.game_organizer_telegram(p_game_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select organizer_telegram from public.game_organizer_contacts where game_id = p_game_id
$$;

revoke execute on function public.game_organizer_telegram(uuid) from public, anon;
grant execute on function public.game_organizer_telegram(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- The capability flag
--
-- Restated in full — `create or replace` needs the whole body — and every
-- earlier flag is repeated EXACTLY, so applying this cannot switch one off.
-- -----------------------------------------------------------------------------
create or replace function public.app_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'leaveWaitlist',        true,
    'dismissNotifications', true,
    'adminRemoveBooking',   true,
    'adminDelete',          true,
    'cancelWithReason',     true,
    'gameLanguage',         true,
    'organizerTelegram',    true
  )
$$;

revoke execute on function public.app_capabilities() from public;
grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification — same transaction as the migration.
--
-- IT EXERCISES THE NORMALISATION rather than reading the regex out of the
-- catalog. Four spellings of one handle must land as one value, and a CHECK
-- that lists a pattern is not the same thing as a function that reaches it.
-- -----------------------------------------------------------------------------
do $ver$
declare
  v_spelling text;
  v_caps     jsonb;
begin
  /*
   * THE NORMALISATION, EXERCISED. Four spellings of one handle must land as
   * one value — a CHECK that lists a pattern is not the same thing as a
   * function that reaches it.
   *
   * Run against `normalize_telegram_handle` rather than through
   * `set_game_organizer`, because this block runs as the migration OWNER, who
   * is neither an admin nor `service_role`. Round 13's contact migration
   * learned that the hard way: its self-test called an admin-gated RPC, failed
   * on the authorization check, and would have written real data if it had
   * passed.
   */
  foreach v_spelling in array array[
    'oliver_hf', '@oliver_hf', 't.me/oliver_hf',
    'https://t.me/oliver_hf', 'https://www.t.me/oliver_hf', '  @oliver_hf  '
  ]
  loop
    if public.normalize_telegram_handle(v_spelling) is distinct from 'oliver_hf' then
      raise exception '% normalised to %, not the bare handle',
        v_spelling, public.normalize_telegram_handle(v_spelling);
    end if;
  end loop;

  -- A blank is the ABSENCE of a handle, not an empty one.
  if public.normalize_telegram_handle('   ') is not null
     or public.normalize_telegram_handle(null) is not null
     or public.normalize_telegram_handle('@') is not null then
    raise exception 'a blank handle normalised to something other than null';
  end if;

  /*
   * AND THE COLUMN REFUSES WHAT A URL COULD NOT SURVIVE. Written directly
   * rather than through the RPC — this is the CHECK being tested, and the
   * CHECK is what holds when a hand-made call skips the function.
   */
  begin
    insert into public.game_organizer_contacts (game_id, organizer_name, organizer_telegram)
    values (gen_random_uuid(), 'Probe', '../admin');
    raise exception 'organizer_telegram_format accepted a path';
  exception
    when check_violation then null;
    when foreign_key_violation then
      raise exception 'the CHECK did not fire before the foreign key — pattern too loose';
  end;

  select public.app_capabilities() into v_caps;
  if (v_caps ->> 'organizerTelegram') is distinct from 'true'
     or (v_caps ->> 'gameLanguage') is distinct from 'true' then
    raise exception 'app_capabilities lost a flag: %', v_caps;
  end if;

  raise notice 'round 19 verified: six spellings normalise to one, CHECK refuses a path';
end
$ver$;
