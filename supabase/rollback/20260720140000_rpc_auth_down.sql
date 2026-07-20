-- Rollback for 20260720140000_rpc_auth.sql

drop function if exists public.complete_signup(text, boolean, boolean);
drop function if exists public.claim_shadow_player();
drop function if exists public.record_auth_completed();
drop function if exists public.record_auth_link_sent(uuid, text);
