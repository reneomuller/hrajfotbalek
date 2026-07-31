-- Rollback for 20260731100000_rpc_complete_signup_v2.sql
--
-- Safe to run: `complete_signup` was never removed, so dropping v2 leaves the
-- Phase 1 signup path intact. Any player row v2 already wrote stays — the rows
-- are the point, and nothing about them depends on the function that made them.

drop function if exists public.complete_signup_v2(
  text, boolean, boolean, text, text, public.skill_level, boolean, text);
