-- =============================================================================
-- ROUND 33, ITEM 3 — a party may be up to thirteen guests.
--
-- THE CEILING WAS IN TWO PLACES AND IS NOW IN ONE. `create_booking_internal`
-- carried `v_max_guests constant integer := 3` and `can_add_guests` carried a
-- bare `3 -  guest_count`; the round-11 comment on `policy.booking.maxPartyGuests`
-- says in as many words that moving the ceiling means editing both in one
-- commit, which is a rule that works exactly until somebody misses one. It is
-- now `public.max_party_guests()`, and the next move is one function.
--
-- THE SQL IS STILL THE AUTHORITY. `lib/policy.ts` holds the same number for the
-- UI's benefit and is display only — a route guard is skipped by anyone using
-- curl, and if the two ever disagree the database is right.
--
-- WHY THE TWO BODIES ARE REWRITTEN RATHER THAN RESTATED. `create_booking_internal`
-- is 203 lines of heavily commented plpgsql and `can_add_guests` is 39; pasting
-- them here to change one token would make this file the newest copy of code
-- whose comments explain decisions made in three earlier rounds, and the next
-- reader would have two versions to reconcile. Instead the migration reads what
-- is actually installed, substitutes the one token, and re-creates it — so it
-- edits PRODUCTION'S function rather than the repo's idea of it, and RAISES if
-- the token it expects is not there. `prosrc` keeps comments, so nothing is
-- lost in the round trip.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The ceiling, as a value
-- -----------------------------------------------------------------------------

create or replace function public.max_party_guests()
returns integer
language sql
immutable
set search_path = ''
as $$ select 13 $$;

revoke execute on function public.max_party_guests() from public;
grant execute on function public.max_party_guests() to anon, authenticated, service_role;

comment on function public.max_party_guests() is
  'EXTRA seats one booking may hold, so a party is at most 1 + this. The '
  'authority; lib/policy.ts mirrors it for display only.';

-- -----------------------------------------------------------------------------
-- 2. create_booking_internal — the booking-time ceiling
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_old constant text := 'v_max_guests constant integer := 3;';
  v_new constant text := 'v_max_guests constant integer := public.max_party_guests();';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_booking_internal';

  if v_def is null then
    raise exception 'party ceiling: create_booking_internal is missing';
  end if;

  -- Already done. Applying this file twice must not be an error.
  if position(v_new in v_def) > 0 then
    raise notice 'party ceiling: create_booking_internal already reads the function';
  elsif position(v_old in v_def) = 0 then
    raise exception
      'party ceiling: create_booking_internal does not carry the expected constant — '
      'it has been changed since round 12 and this substitution must be re-derived';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. can_add_guests — the ceiling counted across guests the booking already has
--
-- "Three is three, not three more each time", as the round-27 comment puts it.
-- Thirteen is thirteen on the same terms: a booking that already carries four
-- guests may add nine.
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_old constant text := 'greatest(0, 3 - v_booking.guest_count)';
  v_new constant text := 'greatest(0, public.max_party_guests() - v_booking.guest_count)';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_add_guests';

  if v_def is null then
    raise exception 'party ceiling: can_add_guests is missing';
  end if;

  if position(v_new in v_def) > 0 then
    raise notice 'party ceiling: can_add_guests already reads the function';
  elsif position(v_old in v_def) = 0 then
    raise exception
      'party ceiling: can_add_guests does not carry the expected expression';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. The capability flag
--
-- THE UI MUST NOT OFFER A PARTY THE DATABASE REFUSES. Without this flag the
-- dropdown would list +4 through +13 the moment the deploy lands, and every one
-- of them would come back `PARTY_TOO_LARGE` from a function still capped at
-- three — a control that exists with a dead path behind it, which round 12
-- ruled against. The booking-time picker reads it; the add-guests panel does
-- not need to, because its options come from `can_add_guests()` itself and are
-- therefore already whatever the database will allow.
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
    'creditLedgerNote',       true,
    'autoSettle',             true,
    'adminRemoveCover',       true,
    'venueMapUrl',            true,
    'playerNumbers',          true,
    'adminRenamePlayer',      true,
    'partyUpToThirteen',      true
  )
$$;

-- -----------------------------------------------------------------------------
-- 5. VERIFICATION — SHAPE ONLY. NOT ONE ROW IS WRITTEN, AND NO BOOKING IS MADE.
--
-- The behaviour — that a party of thirteen is accepted and one of fourteen is
-- refused, and that capacity still binds first — is drilled in
-- `supabase/tests/party_size.sql`, which `run.mjs` rolls back.
-- -----------------------------------------------------------------------------

do $$
begin
  if public.max_party_guests() <> 13 then
    raise exception 'party ceiling: max_party_guests() returns %', public.max_party_guests();
  end if;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_booking_internal')
     not like '%max_party_guests()%' then
    raise exception 'party ceiling: create_booking_internal still holds a literal';
  end if;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'can_add_guests')
     not like '%max_party_guests()%' then
    raise exception 'party ceiling: can_add_guests still holds a literal';
  end if;

  if not (public.app_capabilities() ->> 'partyUpToThirteen')::boolean then
    raise exception 'party ceiling: the capability flag is not set';
  end if;

  raise notice 'round 33 item 3: shape verified — behaviour is drilled in supabase/tests/party_size.sql';
end $$;
