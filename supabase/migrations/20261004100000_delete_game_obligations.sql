-- =============================================================================
-- ROUND 39, ITEM 1 — the delete guard counts OBLIGATIONS, not rows.
--
-- WHAT THE GUARD COUNTED. Round 35 v2 narrowed it from every booking row to
-- rows in `reserved` or `confirmed` — and stopped there, with no question asked
-- about the GAME. Probed on production 2026-10-04, every booking that blocked a
-- delete was on a game whose kickoff had passed:
--
--   * 11 `reserved` rows, all on SETTLED games — legacy cash/QR holds from
--     August that nothing ever expired or cancelled (`expires_at` and
--     `payment_pending_at` both null, so no sweep can touch them). Six games
--     carry ONLY these: the roster shows nobody, the delete says "this game
--     has bookings". That is the "no players" report.
--   * 41 `confirmed` rows, all on SETTLED games. That is the "completed games"
--     report — a played game is full of confirmed bookings by definition, and
--     the guard read a finished obligation as a live one.
--
-- So `reserved`/`confirmed` was the right question about a BOOKING and the
-- wrong one about a game: a seat on a game that has already kicked off holds
-- nothing anybody can lose by the game disappearing.
--
-- THE RULE NOW. A delete is refused only when the game is UPCOMING — kickoff in
-- the future and not played, settled or cancelled — AND somebody still holds a
-- seat on it (`reserved` or `confirmed`). That is the one case where "cancel it
-- first" protects anything: `cancel_game` returns credits and emails players,
-- and a delete does neither. `reserved` counts on an upcoming game because a
-- reserved booking there is a player on the lineup who has not paid yet — he is
-- coming, and he would not be told.
--
-- Everything else deletes: empty games, cancelled games, and past games. A
-- past game takes its bookings with it through the existing ON DELETE CASCADE,
-- so it leaves every player's history and stats — the admin page says so in
-- the confirm before the button is pressed. `credit_ledger.booking_id` is ON
-- DELETE SET NULL, so no wallet moves.
--
-- STILL NO HARD DELETE OF A BOOKING in any function body — the cascade does it,
-- and `supabase/tests/v13_conformance/rpc.sql` keeps asserting the absence.
--
-- A FULL REDEFINITION, not a substitution: the body below is the live one
-- (read from `pg_proc` on production, 2026-10-04) with the count replaced.
-- Additive, idempotent, order-free. Shape-only verification at the foot; the
-- behaviour is drilled in `supabase/tests/delete_game_obligations.sql`.
-- =============================================================================

create or replace function public.admin_delete_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game     public.games%rowtype;
  v_bookings integer;
begin
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  select * into v_game from public.games g where g.id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  -- ROUND 39: ONLY AN UPCOMING GAME WITH SOMEBODY STILL ON IT. A seat on a
  -- game that has kicked off — or been played, settled or cancelled — is
  -- history, and history goes with the game.
  if v_game.starts_at > now()
     and v_game.status not in ('played', 'settled', 'cancelled') then
    select count(*) into v_bookings
      from public.bookings b
     where b.game_id = p_game_id
       and b.status in ('reserved', 'confirmed');

    if v_bookings > 0 then
      raise exception 'GAME_HAS_BOOKINGS'
        using detail = v_bookings::text || ' live booking(s) — cancel the game first';
    end if;
  end if;

  delete from public.waitlist where game_id = p_game_id;

  /*
   * THE EVENT IS WRITTEN BEFORE THE DELETE, and its `game_id` is deliberately
   * NOT set: `events.game_id` references `games`, so a row pointing at a game
   * about to disappear would either block the delete or be cascaded away with
   * it — and the audit trail for a deletion is the one that must outlive the
   * thing deleted. The id goes in the metadata instead, where nothing
   * references it.
   */
  insert into public.events (event_type, metadata, city, brand)
  values ('game_deleted',
          jsonb_build_object('game_id', p_game_id, 'venue', v_game.venue,
                             'starts_at', v_game.starts_at, 'status', v_game.status),
          v_game.city, v_game.brand);

  delete from public.events where game_id = p_game_id;
  delete from public.games where id = p_game_id;
end
$$;

revoke execute on function public.admin_delete_game(uuid) from public;
grant execute on function public.admin_delete_game(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- VERIFICATION — SHAPE ONLY. NO GAME IS CREATED AND NONE IS DELETED.
-- -----------------------------------------------------------------------------

do $$
declare
  v_src text;
begin
  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_delete_game';

  if v_src is null then
    raise exception 'delete game obligations: admin_delete_game is missing';
  end if;

  if v_src not like '%v_game.starts_at > now()%' then
    raise exception 'delete game obligations: the guard does not ask whether the game is upcoming';
  end if;

  if v_src ~* 'delete\s+from\s+public\.bookings' then
    raise exception 'delete game obligations: the function hard-deletes a booking';
  end if;

  raise notice 'delete game obligations: shape verified — drilled in supabase/tests/delete_game_obligations.sql';
end $$;
