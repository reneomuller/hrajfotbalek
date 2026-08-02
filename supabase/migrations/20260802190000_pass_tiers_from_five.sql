-- =============================================================================
-- Migration 36 — the pass starts at five games
--
-- The 1-game tier is removed (ruled 2026-08-02). It was seeded at par — 150 CZK
-- for 150 CZK of credit, never expiring — on the reasoning that a reference
-- point makes the other discounts legible. In practice it sat first on the
-- page, where the best offer belongs, and offered nothing: a reader who took in
-- only the top card concluded the pass was not a discount. The reference price
-- is still stated, once, in the page's "How it works" panel, which is where an
-- explanation belongs rather than in a card with a Buy button under it.
--
-- THE ROW IS DELETED, NOT HIDDEN. Filtering it out of `listPassTiers` would
-- leave `create_pass_topup(1)` working — a price list with a second, invisible
-- entry that any caller with the RPC name can still buy from. Nothing here is
-- enforced at the render layer.
--
-- THIS WILL FAIL LOUDLY IF SOMEONE ACTUALLY BOUGHT ONE. `credit_topups.pass_games`
-- references this table, so a real 1-game purchase raises a foreign-key error
-- rather than being silently orphaned. That is the correct outcome: a purchase
-- record is not ours to rewrite, and the failure tells the operator something
-- they need to know before deciding. Confirm with:
--
--     select id, status, created_at from public.credit_topups where pass_games = 1;
--
-- Rollback: supabase/rollback/20260802190000_pass_tiers_from_five_down.sql
-- =============================================================================

delete from public.pass_tiers where games = 1;

-- The floor is now a constraint rather than a convention. Without it the next
-- person seeding a tier table restores a par tier by copying the old list, and
-- the ruling survives only as a comment.
alter table public.pass_tiers add constraint pass_tiers_minimum_games check (games >= 5);

comment on constraint pass_tiers_minimum_games on public.pass_tiers is
  'Passes start at five games (ruled 2026-08-02). A one-game "tier" is an '
  'ordinary top-up wearing a discount''s clothes.';

comment on table public.pass_tiers is
  'The game-pass tiers (§4.2), five games and up. Read by the pass page, the '
  'admin screen and confirm_topup''s exact-price match — one source, so a '
  'price change cannot land in two of the three. No client writes.';
