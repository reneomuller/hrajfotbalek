-- =============================================================================
-- HOTFIX — THE 15- AND 20-GAME PASSES COULD NOT BE BOUGHT
--
-- THE SYMPTOM, as reported: tiers 5, 8 and 12 complete; 15 and 20 answer
-- "Something went wrong. Please try again." The tile renders, the price is
-- right, the button does nothing useful.
--
-- THE CAUSE IS A CEILING, NOT THE ROWS. `credit_topups.amount_czk` is capped at
-- 2000 CZK, and round 35 v2 raised the pass prices past it:
--
--     5 games   840 CZK   under the cap, sells
--     8 games  1296 CZK   under the cap, sells
--    12 games  1879 CZK   under the cap, sells
--    15 games  2241 CZK   OVER THE CAP, refused
--    20 games  2772 CZK   OVER THE CAP, refused
--
-- The split is exactly 2000. Nothing about the failing rows is malformed:
-- `pass_tiers_credited_rule` holds for all five (credited = games x 180), every
-- column is populated, and the display and the purchase read the SAME table.
-- The divergence is that the purchase path applies a second validation the
-- display does not.
--
-- WHY THE CEILING EXISTS, AND WHY IT NEVER APPLIED HERE. 50-2000 bounds a
-- HAND-ENTERED amount: `create_topup` takes a number the player types, and a
-- typo of 20000 should not become a 20,000 CZK obligation. A TIER PRICE IS NOT
-- HAND-ENTERED. It comes from `pass_tiers`, a table only an admin writes, which
-- already constrains it to be positive and not to exceed what it credits. The
-- cap was copied onto a path whose input it was never guarding.
--
-- `create_pass_topup` SAYS SO ITSELF, and predicted this bug in a comment:
--
--     -- The same 50-2000 bounds the ordinary path enforces. A tier priced
--     -- outside them would be a tier nobody could pay for
--
-- Right about the consequence, wrong about which side should move.
--
-- THREE COPIES OF ONE NUMBER, which is how it got out of step: the CHECK
-- constraint, `create_topup`, and `create_pass_topup`. This migration leaves
-- ONE — `public.manual_topup_max_czk()` — and has the other two call it, on the
-- `credit_seat_price_czk()` precedent from round 35 and for the same stated
-- reason: a constant invites a copy; a function of something else has to be
-- called.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. THE BOUNDS, ONCE.
--
-- IMMUTABLE so a CHECK constraint may call it, which is the whole point — and
-- with the same cost round 35 recorded for `credit_seat_price_czk()`: Postgres
-- does NOT re-validate existing rows when the function's answer changes, so a
-- future change to these bounds must consider the rows already stored.
-- -----------------------------------------------------------------------------
create or replace function public.manual_topup_min_czk()
returns integer language sql immutable set search_path = '' as $$ select 50 $$;

create or replace function public.manual_topup_max_czk()
returns integer language sql immutable set search_path = '' as $$ select 2000 $$;

revoke execute on function public.manual_topup_min_czk() from public;
revoke execute on function public.manual_topup_max_czk() from public;
grant execute on function public.manual_topup_min_czk() to anon, authenticated, service_role;
grant execute on function public.manual_topup_max_czk() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. THE CONSTRAINT NOW SAYS WHICH ROWS IT IS ABOUT.
--
-- A row with `pass_games` set was priced by `pass_tiers`; a row without it was
-- priced by a person typing into a box. Only the second needs a ceiling, and
-- the floor stays on both — a 0 CZK top-up is meaningless whatever produced it.
--
-- DROP AND RE-ADD, restating in full: Postgres cannot alter a CHECK in place.
-- The new predicate is STRICTLY WIDER than the old one (every row the old
-- constraint admitted, the new one admits), so re-adding it cannot fail on
-- existing data — and it is validated against the table rather than added NOT
-- VALID, so if that reasoning were wrong this migration would say so.
-- -----------------------------------------------------------------------------
alter table public.credit_topups drop constraint if exists credit_topups_amount_range;

alter table public.credit_topups add constraint credit_topups_amount_range check (
  amount_czk >= public.manual_topup_min_czk()
  and (pass_games is not null or amount_czk <= public.manual_topup_max_czk())
);

-- -----------------------------------------------------------------------------
-- 3. AND THE WRITERS STOP CARRYING THEIR OWN COPIES.
--
-- BY SUBSTITUTION, and RAISING rather than overwriting if the text is absent —
-- the round 35/36 precedent. `prosrc` keeps the comments, so what these
-- functions say about themselves stays true.
-- -----------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  -- 3a. The ordinary path keeps the ceiling, but reads it from one place.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_topup';

  -- THE DETAIL STRING IS A COPY TOO, and it is the copy a PLAYER sees — left
  -- alone it would go on saying "between 50 and 2000" for a year after the
  -- bound moved. Both the test and the message now read the same function.
  v_old := '  if p_amount_czk is null or p_amount_czk < 50 or p_amount_czk > 2000 then'
    || chr(10) || '    raise exception ''AMOUNT_OUT_OF_RANGE'''
    || chr(10) || '      using detail = ''top-ups are between 50 and 2000 CZK'';';
  v_new := '  if p_amount_czk is null'
    || chr(10) || '     or p_amount_czk < public.manual_topup_min_czk()'
    || chr(10) || '     or p_amount_czk > public.manual_topup_max_czk() then'
    || chr(10) || '    raise exception ''AMOUNT_OUT_OF_RANGE'''
    || chr(10) || '      using detail = format(''top-ups are between %s and %s CZK'','
    || chr(10) || '                            public.manual_topup_min_czk(),'
    || chr(10) || '                            public.manual_topup_max_czk());';

  if v_def is null then
    raise exception 'pass ceiling: create_topup is missing';
  elsif position('manual_topup_max_czk' in v_def) > 0 then
    raise notice 'pass ceiling: create_topup already reads the shared bounds';
  elsif position(v_old in v_def) = 0 then
    raise exception 'pass ceiling: create_topup does not carry the literal bounds';
  else
    execute replace(v_def, v_old, v_new);
  end if;

  -- 3b. The PASS path drops the ceiling entirely. The floor stays: a tier
  --     priced under 50 CZK is a data error worth refusing by name rather than
  --     writing a row nobody can pay.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_pass_topup';

  v_old := '  -- The same 50–2000 bounds the ordinary path enforces. A tier priced outside'
    || chr(10) || '  -- them would be a tier nobody could pay for, and the check belongs where the'
    || chr(10) || '  -- row is written rather than only in the table''s constraints.'
    || chr(10) || '  if v_tier.price_czk < 50 or v_tier.price_czk > 2000 then'
    || chr(10) || '    raise exception ''AMOUNT_OUT_OF_RANGE'''
    || chr(10) || '      using detail = ''top-ups are between 50 and 2000 CZK'';';
  v_new := '  -- ~~The same 50–2000 bounds the ordinary path enforces.~~ THE CEILING WAS'
    || chr(10) || '  -- NEVER THIS PATH''S TO ENFORCE. Those bounds guard an amount a PERSON'
    || chr(10) || '  -- TYPES; a tier price comes from `pass_tiers`, which only an admin writes'
    || chr(10) || '  -- and which already constrains it. Copying the cap here made the 15- and'
    || chr(10) || '  -- 20-game passes unbuyable the day round 35 v2 priced them over 2000 — the'
    || chr(10) || '  -- "tier nobody could pay for" the old comment warned about, caused by the'
    || chr(10) || '  -- check that was warning about it.'
    || chr(10) || '  --'
    || chr(10) || '  -- THE FLOOR STAYS. A tier priced under the minimum is a data error, and'
    || chr(10) || '  -- refusing it by name beats writing a row nobody can pay.'
    || chr(10) || '  if v_tier.price_czk < public.manual_topup_min_czk() then'
    || chr(10) || '    raise exception ''AMOUNT_OUT_OF_RANGE'''
    || chr(10) || '      using detail = format(''a tier must cost at least %s CZK'','
    || chr(10) || '                            public.manual_topup_min_czk());';

  if v_def is null then
    raise exception 'pass ceiling: create_pass_topup is missing';
  elsif position('manual_topup_min_czk' in v_def) > 0 then
    raise notice 'pass ceiling: create_pass_topup already drops the ceiling';
  elsif position(v_old in v_def) = 0 then
    raise exception 'pass ceiling: create_pass_topup does not carry the expected bounds check';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. VERIFICATION — SHAPE ONLY. NO TOP-UP IS CREATED AND NO TIER IS REPRICED.
--
-- Behaviour is drilled in `supabase/tests/pass_tiers_payable.sql`, which drives
-- all five tiers through `begin_pass_purchase` inside the suite's own
-- transaction. A migration may not write a row (CLAUDE.md, 2026-09-12).
-- -----------------------------------------------------------------------------
do $$
declare
  v_unpayable int;
begin
  if to_regprocedure('public.manual_topup_max_czk()') is null then
    raise exception 'pass ceiling: the shared bound is missing';
  end if;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_pass_topup')
     like '%> 2000%' then
    raise exception 'pass ceiling: create_pass_topup still caps a tier price';
  end if;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_topup')
     not like '%manual_topup_max_czk%' then
    raise exception 'pass ceiling: create_topup does not read the shared bound';
  end if;

  /*
   * THE ASSERTION THAT WOULD HAVE CAUGHT THIS. Every tier in the table must be
   * writable as a top-up row. It reads the CONSTRAINT's own predicate rather
   * than restating a number, so it cannot drift from what the database
   * enforces the way three copies of "2000" did.
   */
  select count(*) into v_unpayable
    from public.pass_tiers
   where not (price_czk >= public.manual_topup_min_czk());
  if v_unpayable > 0 then
    raise exception 'pass ceiling: % tier(s) are priced below the floor', v_unpayable;
  end if;

  raise notice 'pass ceiling: all % tiers are payable', (select count(*) from public.pass_tiers);
end $$;
