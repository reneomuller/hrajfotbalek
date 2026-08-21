-- Rollback for 20260821240000_public_player_profile. Additive: one type, one
-- function, no data. The public profile route 404s without it.
drop function if exists public.public_player_profile(text);
drop type if exists public.public_profile;
