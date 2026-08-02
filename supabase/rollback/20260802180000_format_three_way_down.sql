-- Rollback for migration 35 — back to two-sided formats only.
--
-- NOT SAFE UNCONDITIONALLY, and deliberately loud about it: any game already
-- saved as a three-way violates the narrowed CHECK, and `alter table … add
-- constraint` validates existing rows. The rollback therefore clears those
-- values first rather than failing halfway, and says how many it cleared —
-- losing an organizer's "6v6v6" is the price of going back, and it should be
-- visible in the output rather than discovered on the page.

do $$
declare
  v_count integer;
begin
  update public.games
     set format = null
   where format ~ '^[0-9]{1,2}v[0-9]{1,2}v[0-9]{1,2}$';

  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise notice 'cleared % three-way format value(s)', v_count;
  end if;
end $$;

alter table public.games drop constraint games_format_format;

alter table public.games add constraint games_format_format check (
  format is null or format ~ '^[0-9]{1,2}v[0-9]{1,2}$'
);
