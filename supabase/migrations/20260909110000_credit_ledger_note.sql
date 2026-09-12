-- =============================================================================
-- ROUND 28, ITEM 5(b) — the ledger row carries its own memo.
--
-- THE NOTE ALREADY EXISTED AND WAS IN THE WRONG PLACE. `grant_credit` has
-- taken a `p_note` since round 7 and wrote it into the `credit_issued` EVENT —
-- so the explanation for a movement lived in the audit log while the movement
-- itself lived in `credit_ledger`, and joining them means matching on player
-- and timestamp and hoping. The one question anybody actually asks of a wallet
-- is "why is this row here", and the row could not answer it.
--
-- SO THE COLUMN GOES ON THE LEDGER, and the event keeps its copy. That is
-- deliberate duplication rather than an oversight: the event stream is
-- append-only history and rewriting it to point at a column would be editing
-- the past. New rows carry both; old rows carry the event only, which is
-- exactly what they always had.
--
-- NULLABLE, BECAUSE MOST MOVEMENTS HAVE NOTHING TO SAY. A booking redemption
-- and a top-up explain themselves through `reason` and `booking_id`. The note
-- is for the ones a human made a judgement about — and the UI requires one on
-- a REMOVAL, which is enforced in the action rather than here: a NOT NULL
-- would break every automatic path that legitimately has no memo.
-- =============================================================================

alter table public.credit_ledger
  add column if not exists note text;

comment on column public.credit_ledger.note is
  'Why a human moved this money. Written by grant_credit; null for automatic '
  'movements (redemption, topup, cancellation credit), which explain '
  'themselves through reason and booking_id.';

-- -----------------------------------------------------------------------------
-- grant_credit, restated in full so the ledger insert carries the note
--
-- RESTATED RATHER THAN PATCHED. It is one authorization-and-arithmetic
-- procedure, and reading half of it here and half in round 7's migration is
-- how the two drift. Everything below is unchanged except the ledger insert
-- and the comment on it.
-- -----------------------------------------------------------------------------
create or replace function public.grant_credit(
  p_player_id         uuid,
  p_delta_czk         integer,
  /*
   * THE DEFAULTS ARE PART OF THE SIGNATURE AND MUST BE RESTATED. Postgres
   * refuses `create or replace` that drops a parameter default — "cannot
   * remove parameter defaults from existing function" — and callers rely on
   * them: the admin grant form passes three arguments.
   */
  p_reason            public.credit_reason default 'admin_grant',
  p_unmatched_payment boolean              default false,
  p_note              text                 default null
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
  -- THIS IS THE "FLOOR AT ZERO" the admin remove-credit control relies on, and
  -- it lives here rather than in the form: a floor enforced by a disabled
  -- button is not a floor.
  if v_balance + p_delta_czk < 0 then
    raise exception 'CREDIT_NEGATIVE_BLOCKED'
      using detail = 'balance ' || v_balance::text || ' cannot absorb ' || p_delta_czk::text;
  end if;

  -- THE NOTE TRAVELS WITH THE MONEY (round 28, item 5b).
  insert into public.credit_ledger (player_id, delta_czk, reason, note)
  values (p_player_id, p_delta_czk, p_reason, nullif(btrim(coalesce(p_note, '')), ''));

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

revoke execute on function public.grant_credit(uuid, integer, public.credit_reason, boolean, text) from public;
grant execute on function public.grant_credit(uuid, integer, public.credit_reason, boolean, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- The capability flag
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
    'creditLedgerNote',       true
  )
$$;

grant execute on function public.app_capabilities() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Verification — SHAPE ONLY
--
-- THIS BLOCK MAY NOT WRITE A ROW, AND THE REASON COST A PRODUCTION CLEANUP.
--
-- Migrations used to end with a behavioural DRILL: build a fixture, exercise
-- the new RPCs, assert the outcome. Every one of them was validated inside
-- `begin; … rollback;`, so the fixtures vanished on every test run — and
-- `scripts/apply-migration.mjs` COMMITS. On 2026-09-12 round 29's drill was
-- applied to production and left behind a fake venue, two fake games, two
-- bookings against a real player, a real "you were marked as a no-show"
-- notification in his bell, two games' worth of inflated stats, 150 CZK of
-- phantom money owed, and a game the nightly sweep would have reported as
-- needing attention every night for ever.
--
-- SO THE RULE IS: a migration asserts that the SHAPE it created exists —
-- objects, columns, constraints, grants, capability flags. It never inserts,
-- never updates, never calls an RPC that writes. Behaviour is drilled in
-- `supabase/tests/`, where `run.mjs` wraps every suite in `begin; … rollback;`
-- BY DESIGN and a committing drill is structurally impossible.
--
-- See CLAUDE.md, "A migration's verification block may not write a row".
-- -----------------------------------------------------------------------------

do $$
begin
  if coalesce((public.app_capabilities() ->> 'creditLedgerNote')::boolean, false) is not true then
    raise exception 'ledger note: the capability flag did not turn on';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='credit_ledger'
                    and column_name='note' and data_type='text') then
    raise exception 'ledger note: credit_ledger.note is missing';
  end if;

  -- NULLABLE ON PURPOSE: most movements explain themselves through `reason`
  -- and `booking_id`, and a NOT NULL would break every automatic path.
  if (select is_nullable from information_schema.columns
       where table_schema='public' and table_name='credit_ledger' and column_name='note')
     <> 'YES' then
    raise exception 'ledger note: the column must stay nullable';
  end if;

  -- The defaults are part of the signature; dropping one breaks the callers
  -- that pass three arguments, and Postgres refuses the replace anyway.
  if pg_get_function_arguments((select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                 where n.nspname='public' and p.proname='grant_credit'))
     not like '%DEFAULT%' then
    raise exception 'ledger note: grant_credit lost its parameter defaults';
  end if;

  raise notice 'ledger note: shape verified — behaviour is drilled in supabase/tests/credit_ledger_note.sql';
end $$;
