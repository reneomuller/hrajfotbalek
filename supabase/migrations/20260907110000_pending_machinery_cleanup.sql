-- =============================================================================
-- ROUND 27, ITEM 6(b) — the pending machinery goes, AS A MIGRATION.
--
-- ~~`docs/ops/round26-schema-cleanup.sql`~~ — deleted, and replaced by this
-- file. Round 26 handed the same SQL over as an ops script for the owner to
-- paste, and the round-26 end report flagged the consequence: a script is not
-- in the migration history, so running it would have put production's schema
-- outside the sequence and left every locally-migrated database disagreeing
-- with it.
--
-- READING IT PROPERLY FOUND SOMETHING WORSE THAN UNTIDINESS, and it is the
-- reason this is not a cosmetic change:
--
--   `lib/games/queries.ts` STILL SELECTED `is_pending`, in both roster reads.
--   Round 26 stopped USING the column and did not stop ASKING for it. Dropping
--   it from the view under the deployed code would have made PostgREST answer
--   both selects with an error — and both call sites read `if (error || !data)
--   return []`, so **every lineup on the site would have rendered EMPTY**,
--   silently, with no error page and nothing in a log.
--
--   That is exactly the failure class CLAUDE.md names about grants: a read
--   that returns empty rather than erroring looks like missing data, not like
--   a missing column. The ops script would have caused it on production.
--
-- So the drop and the two selects move in ONE change, together with the four
-- suites that enumerate the view's columns.
--
-- WHAT IS DELIBERATELY KEPT:
--
--   `payment_pending_at` — the only record that a legacy booking came through
--   the old rail. Nothing reads it for a decision. Dropping a column to tidy
--   is how an audit trail disappears.
--
--   `online_payment_window()` — the pay-first rollback restores a
--   `booking_holds_seat` body that calls it, and a rollback that fails on a
--   missing function is not a rollback.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The roster view returns to seven columns
--
-- RECREATED, NOT ALTERED: a column cannot be dropped from a view in place. The
-- body is restated in full, which is the same rule the column-boundary
-- assertions in `supabase/tests/` enforce — and those files move in this same
-- commit or the suite fails.
-- -----------------------------------------------------------------------------
drop view if exists public.game_roster_public;

create view public.game_roster_public
with (security_invoker = false)
as
  select b.game_id, p.nickname, p.photo_path,
         (select count(*)
            from public.bookings b2
            join public.games g2 on g2.id = b2.game_id
           where b2.player_id = p.id
             and b2.status in ('reserved', 'confirmed')
             and g2.status in ('played', 'settled'))::integer as games_played,
         p.auth_user_id is null as is_guest,
         null::text            as guest_of,
         null::integer         as guest_index
    from public.bookings b
    join public.players p on p.id = b.player_id
    join public.games   g on g.id = b.game_id
   where g.status in ('published', 'full', 'played', 'settled')
     and public.booking_holds_seat(b.status, b.payment_pending_at)
  union all
  select b.game_id, null::text, null::text, 0, true, p.nickname, seat.seat
    from public.bookings b
    join public.players p on p.id = b.player_id
    join public.games   g on g.id = b.game_id
    cross join lateral generate_series(1, b.guest_count) seat(seat)
   where g.status in ('published', 'full', 'played', 'settled')
     and public.booking_holds_seat(b.status, b.payment_pending_at)
     and b.guest_count > 0
  union all
  select g.id, null::text, null::text, 0, true, null::text, seat.seat
    from public.games g
    cross join lateral generate_series(1, g.guest_count) seat(seat)
   where g.status in ('published', 'full', 'played', 'settled')
     and g.guest_count > 0;

-- SUPABASE GRANTS NOTHING BY DEFAULT. A recreated view is a NEW object and
-- keeps none of the old one's privileges; forgetting this line is the "reads
-- return empty" failure in its other form.
grant select on public.game_roster_public to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. The predicate the column existed for
-- -----------------------------------------------------------------------------
drop function if exists public.booking_is_named(public.booking_status, timestamptz);

-- -----------------------------------------------------------------------------
-- 3. The pending machinery itself
--
-- Both have had no caller in the deployed application since round 26 removed
-- `AwaitingPaymentPanel`. `app/game/[id]/pay/actions.ts` — the retry action —
-- is deleted in this same commit; it had been unreachable dead code, and
-- dropping the function under it would have turned a dead path into a 404 on
-- a live one if anything ever linked to it again.
-- -----------------------------------------------------------------------------
drop function if exists public.expire_pending_online_payments();
drop function if exists public.retry_online_payment(uuid);

-- -----------------------------------------------------------------------------
-- 4. Verify
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'game_roster_public'
                and column_name = 'is_pending') then
    raise exception 'cleanup: the roster still projects is_pending';
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'game_roster_public') <> 7 then
    raise exception 'cleanup: the roster is not seven columns';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('expire_pending_online_payments',
                                  'retry_online_payment',
                                  'booking_is_named')) then
    raise exception 'cleanup: some of the pending machinery is still here';
  end if;

  -- KEPT, and asserted so a later tidy-up cannot quietly take them.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bookings'
                    and column_name = 'payment_pending_at') then
    raise exception 'cleanup: payment_pending_at was dropped — it is the audit trail';
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'online_payment_window') then
    raise exception 'cleanup: online_payment_window was dropped — the rollback needs it';
  end if;

  if not has_table_privilege('anon', 'public.game_roster_public', 'SELECT') then
    raise exception 'cleanup: the recreated view was not granted to anon';
  end if;

  raise notice 'cleanup: the roster is seven columns again and the pending machinery is gone';
end $$;
