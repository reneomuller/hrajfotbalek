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
-- Verification
-- -----------------------------------------------------------------------------
do $$
declare
  v_caps    jsonb;
  v_id      uuid;
  v_before  integer;
  v_after   integer;
  v_note    text;
begin
  select public.app_capabilities() into v_caps;
  if coalesce((v_caps ->> 'creditLedgerNote')::boolean, false) is not true then
    raise exception 'ledger note: the capability flag did not turn on';
  end if;

  select id into v_id from public.players where auth_user_id is not null order by created_at limit 1;
  if v_id is null then
    raise notice 'ledger note: no signed-up player — shape checked, behaviour NOT exercised';
    return;
  end if;

  begin
    set local request.jwt.claims = '{"role":"service_role"}';

    select coalesce(sum(delta_czk), 0) into v_before
      from public.credit_ledger where player_id = v_id;

    -- A GRANT CARRIES ITS MEMO.
    v_after := public.grant_credit(v_id, 500, 'admin_grant', false, '  round 28 probe  ');
    if v_after <> v_before + 500 then
      raise exception 'ledger note: grant returned % rather than %', v_after, v_before + 500;
    end if;

    /*
     * KEYED ON THE AMOUNT, NOT ON `created_at`. Every insert in this DO block
     * shares one transaction, and `now()` is TRANSACTION time — so every row
     * here has an identical timestamp and `order by created_at desc limit 1`
     * picks an arbitrary one. The first draft of this probe failed on exactly
     * that and blamed the function.
     */
    select note into v_note from public.credit_ledger
     where player_id = v_id and delta_czk = 500 and reason = 'admin_grant';
    if v_note is distinct from 'round 28 probe' then
      raise exception 'ledger note: the memo did not land trimmed (got %)', coalesce(v_note, '<null>');
    end if;

    -- A REMOVAL IS THE SAME CALL WITH A NEGATIVE DELTA, and it carries a memo too.
    v_after := public.grant_credit(v_id, -200, 'adjustment', false, 'took some back');
    if v_after <> v_before + 300 then
      raise exception 'ledger note: removal returned % rather than %', v_after, v_before + 300;
    end if;

    -- AND THE FLOOR HOLDS. A wallet never goes into debt.
    begin
      perform public.grant_credit(v_id, -(v_before + 100000), 'adjustment', false, 'too much');
      raise exception 'ledger note: the floor let a wallet go negative';
    exception
      when others then
        if sqlerrm not like '%CREDIT_NEGATIVE_BLOCKED%' then raise; end if;
    end;

    -- An empty memo is stored as NULL rather than as an empty string, so
    -- "has a note" is one test rather than two.
    perform public.grant_credit(v_id, 10, 'admin_grant', false, '   ');
    select note into v_note from public.credit_ledger
     where player_id = v_id and delta_czk = 10 and reason = 'admin_grant';
    if v_note is not null then
      raise exception 'ledger note: a blank memo was stored as a string';
    end if;

    raise notice 'ledger note: verified — memo lands trimmed, removal works, floor holds';
  end;
end $$;
