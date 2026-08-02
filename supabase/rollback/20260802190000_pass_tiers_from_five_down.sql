-- Rollback for migration 36 — the 1-game tier returns.
--
-- The constraint has to go before the row can, and the row is restored with the
-- values migration 32 seeded: par price, par credit, no expiry.

alter table public.pass_tiers drop constraint pass_tiers_minimum_games;

insert into public.pass_tiers (games, price_czk, credited_czk, expires_months)
values (1, 150, 150, null)
on conflict (games) do nothing;

comment on table public.pass_tiers is
  'The six game-pass tiers (§4.2). Read by the pass page, the admin screen and '
  'confirm_topup''s exact-price match — one source, so a price change cannot '
  'land in two of the three. No client writes.';
