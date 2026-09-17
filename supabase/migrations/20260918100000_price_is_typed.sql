-- =============================================================================
-- ROUND 36, ITEM 2 — the price is a field again, and the duration only
-- suggests it.
--
-- ~~THE PRICE COMES FROM THE LENGTH.~~ Round 35 v5 made `price_for_duration()`
-- the authority and had both writers ignore what the caller sent. The owner has
-- refined it: **the mapping is a DEFAULT, not a law.** An organizer types a
-- price, the duration PREFILLS it, and whatever they leave in the box is what
-- the card is charged.
--
-- WHAT DOES NOT MOVE, AND THIS IS THE POINT OF THE ROUND: **credit eligibility
-- stays keyed on the DURATION**. A 90-minute game offers Redeem credit at
-- exactly one credit per seat whatever its price; a 60-minute game is
-- online-only however it is priced. Price and credit-eligibility are now
-- independent, which they were not an hour ago — and that is the whole shape of
-- this change.
--
-- `price_for_duration()` SURVIVES AND CHANGES MEANING. It is no longer what the
-- database stores; it is what the form proposes. Keeping it in SQL rather than
-- moving it to TypeScript would make it look like an authority it no longer is,
-- so the SQL function stays only because `admin_create_game_v2` still needs a
-- value when a caller sends none — see below — and the COMMENT says which it is.
--
-- THE ROUND-35 ASSERTION INVERTS. "No game is priced against its length" was
-- true while the mapping was a law; a typed price makes it false BY DESIGN, and
-- `supabase/tests/duration_pricing.sql` now asserts the prefill and the
-- charge-what-was-typed behaviour instead.
--
-- SHAPE ONLY AT THE FOOT. No game is created and none is repriced.
-- =============================================================================

comment on function public.price_for_duration(integer) is
  'What the admin form PREFILLS as a price for a game of this length — a '
  'default, not a law. Since round 36 the stored price is whatever the '
  'organizer typed. Credit eligibility keys on credit_seat_minutes(), not on '
  'this.';

-- -----------------------------------------------------------------------------
-- 1. THE WRITERS STORE WHAT THEY ARE SENT, again
--
-- The round-35 substitution is reversed by the same mechanism that applied it:
-- read what is installed, put the caller's value back, and RAISE if the text is
-- not what is expected rather than overwriting a body that has moved on.
--
-- `coalesce(p_price_czk, price_for_duration(...))` RATHER THAN A BARE
-- `p_price_czk`. Both signatures already validate the parameter as non-null, so
-- the fallback is unreachable through the RPC — it is there for the shape of
-- the statement to say, in one line, that the mapping is what fills a gap and
-- the caller is what decides. A reader who comes to this cold learns the rule
-- without leaving the line.
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_old constant text :=
    '    -- ROUND 35 v5: the price comes from the length, never from the caller.'
    || chr(10) ||
    '    v_venue.name, v_venue.id, p_starts_at, p_capacity,'
    || chr(10) ||
    '    public.price_for_duration(p_duration_minutes),';
  v_new constant text :=
    '    -- ROUND 36: the organizer types the price; the length only prefills it.'
    || chr(10) ||
    '    v_venue.name, v_venue.id, p_starts_at, p_capacity,'
    || chr(10) ||
    '    coalesce(p_price_czk, public.price_for_duration(p_duration_minutes)),';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_create_game_v2';

  if v_def is null then
    raise exception 'typed price: admin_create_game_v2 is missing';
  elsif position('ROUND 36' in v_def) > 0 then
    raise notice 'typed price: admin_create_game_v2 already stores the typed price';
  elsif position(v_old in v_def) = 0 then
    raise exception
      'typed price: admin_create_game_v2 does not carry round 35 v5''s insert';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

do $$
declare
  v_def text;
  v_old constant text :=
    '         price_czk  = public.price_for_duration(v_game.duration_minutes),';
  v_new constant text :=
    '         -- ROUND 36: the organizer types it; the length only prefills.'
    || chr(10) ||
    '         price_czk  = coalesce(p_price_czk,'
    || chr(10) ||
    '                               public.price_for_duration(v_game.duration_minutes)),';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_update_game';

  if v_def is null then
    raise exception 'typed price: admin_update_game is missing';
  elsif position('ROUND 36' in v_def) > 0 then
    raise notice 'typed price: admin_update_game already stores the typed price';
  elsif position(v_old in v_def) = 0 then
    raise exception
      'typed price: admin_update_game does not carry round 35 v5''s update';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. VERIFICATION — SHAPE ONLY. NO GAME IS CREATED, PRICED OR REPRICED.
--
-- Note what is NOT asserted here any more: that every game agrees with its
-- length. That was round 35 v5's law and a typed price ends it.
-- -----------------------------------------------------------------------------

do $$
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'admin_create_game_v2')
     not like '%coalesce(p_price_czk%' then
    raise exception 'typed price: admin_create_game_v2 still ignores the caller';
  end if;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'admin_update_game')
     not like '%coalesce(p_price_czk%' then
    raise exception 'typed price: admin_update_game still ignores the caller';
  end if;

  /*
   * AND THE ONE THE ADMIN FORM ACTUALLY CALLS never derived at all.
   *
   * `admin_update_game_v2` is the thirteen-argument overload every edit in
   * `app/admin/games/actions.ts` goes through, and round 35 v5 substituted into
   * the SEVEN-argument legacy function instead — so the edit form has stored
   * the typed price throughout, and the derive it was supposed to be under was
   * only ever true of a path nothing calls. Pinned here as an ABSENCE so a
   * later round cannot quietly fit a mapping into the live writer.
   */
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'admin_update_game_v2')
     like '%price_for_duration%' then
    raise exception 'typed price: admin_update_game_v2 derives the price again';
  end if;

  -- AND CREDIT ELIGIBILITY IS UNTOUCHED, which is the half most at risk of
  -- being dragged along by a price change.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_booking_internal')
     not like '%credit_seat_minutes%' then
    raise exception 'typed price: credit eligibility stopped keying on the duration';
  end if;

  if public.price_for_duration(60) <> 150 or public.price_for_duration(90) <> 180 then
    raise exception 'typed price: the prefill mapping moved';
  end if;

  raise notice 'round 36: the organizer types the price; credit still keys on the length';
end $$;
