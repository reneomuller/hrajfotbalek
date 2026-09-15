-- =============================================================================
-- ROUND 35 v2, ITEM 4 — a cancelled game can be deleted.
--
-- WHAT THE BUTTON DID BEFORE: nothing, with a message telling you to do the
-- thing you had already done. `admin_delete_game` counted EVERY booking row on
-- the game regardless of status and refused if there were any —
--
--     select count(*) into v_bookings from public.bookings b where b.game_id = …
--     if v_bookings > 0 then raise 'GAME_HAS_BOOKINGS'
--       using detail = … || ' booking(s) — cancel the game first';
--
-- — and `admin_cancel_game` CANCELS bookings rather than removing them, so the
-- rows are still there afterwards and the count is unchanged. **The refusal's
-- own advice could not work**: cancel the game first, and the guard fires
-- exactly as hard. The only reachable delete was on a game nobody had ever
-- booked, which is not the game anyone wants to delete.
--
-- THE FIX IS THE STATUS TEST EVERY OTHER SEAT COUNT IN THIS SCHEMA ALREADY
-- USES. A booking blocks a delete when it still HOLDS something — `reserved` or
-- `confirmed`. A `cancelled` or `expired` row is history, and history is what
-- the delete is allowed to take with it.
--
-- THE HISTORY THAT MUST OUTLIVE THE GAME IS THE LEDGER, and it does, for free:
-- `credit_ledger.booking_id` is ON DELETE SET NULL, so a refund issued when the
-- game was cancelled keeps its row, its amount and its player — it simply stops
-- pointing at a booking that no longer exists. No wallet moves when a game is
-- deleted, which is the property that makes this safe to allow at all.
--
-- SHAPE ONLY AT THE FOOT. The behaviour — cancel a game with bookings on it,
-- delete it, and find the refund still in the ledger — is drilled in
-- `supabase/tests/delete_cancelled_game.sql`, which `run.mjs` rolls back.
-- =============================================================================

do $$
declare
  v_def text;
  v_old constant text :=
    'select count(*) into v_bookings from public.bookings b where b.game_id = p_game_id;';
  v_new constant text :=
    E'-- ROUND 35: SEATS STILL HELD, not rows that exist. A cancelled booking is\n'
    '  -- history and does not block the delete — which is what made the old\n'
    '  -- refusal''s advice ("cancel the game first") impossible to follow.\n'
    '  select count(*) into v_bookings\n'
    '    from public.bookings b\n'
    '   where b.game_id = p_game_id\n'
    '     and b.status in (''reserved'', ''confirmed'');';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_delete_game';

  if v_def is null then
    raise exception 'delete cancelled game: admin_delete_game is missing';
  end if;

  if position('''reserved'', ''confirmed''' in v_def) > 0 then
    raise notice 'delete cancelled game: the guard already counts held seats';
  elsif position(v_old in v_def) = 0 then
    raise exception
      'delete cancelled game: admin_delete_game does not carry the expected count — '
      'it has changed and this substitution must be re-derived';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- AND NOTHING ELSE HAD TO CHANGE, WHICH IS WORTH SAYING OUT LOUD
--
-- The first version of this migration also deleted the cancelled bookings by
-- hand, on the assumption that something had to. **Every foreign key pointing at
-- `games` already cascades or nulls**: `bookings`, `checkout_sessions`,
-- `waitlist` and `game_organizer_contacts` are ON DELETE CASCADE, and `events`
-- is SET NULL so the audit trail outlives the game — which is the row the old
-- body was already careful to write before deleting.
--
-- THE CONFORMANCE SUITE CAUGHT THE EXTRA HALF, and it was right to: v1.3's rule
-- is that **no function anywhere hard-deletes a booking**, and
-- `supabase/tests/v13_conformance/rpc.sql` asserts exactly that by scanning
-- `prosrc`. A hand-written `delete from public.bookings` would have been the
-- first violation of it in the schema — to do something the database was
-- already doing.
--
-- THE LEDGER SURVIVES EITHER WAY. `credit_ledger.booking_id` is ON DELETE SET
-- NULL, so a refund issued when this game was cancelled keeps its row, its
-- amount and its player. No wallet moves when a game is deleted.
-- -----------------------------------------------------------------------------

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

  if v_src not like '%''reserved'', ''confirmed''%' then
    raise exception 'delete cancelled game: the guard still counts every booking row';
  end if;

  -- AND STILL NO HARD DELETE OF A BOOKING, which is v1.3's rule and which the
  -- cascade makes unnecessary to break.
  if v_src ~* 'delete\s+from\s+public\.bookings' then
    raise exception 'delete cancelled game: the function hard-deletes a booking';
  end if;

  raise notice 'delete cancelled game: shape verified — drilled in supabase/tests/delete_cancelled_game.sql';
end $$;
