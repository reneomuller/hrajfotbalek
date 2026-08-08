-- =============================================================================
-- v1.3 conformance A — the one repair the probes asked for
--
-- `anon` and `authenticated` hold TRUNCATE on `public.site_settings` and
-- `public.pass_tiers`. RLS does not restrict TRUNCATE: no policy is consulted,
-- so either role can empty either table in a single statement.
--
-- WHERE IT CAME FROM, since it is not in any migration. Nothing ever granted
-- it. Supabase's default ACL for tables created by `postgres` in `public` is
--
--   {postgres=arwdDxtm/postgres, anon=Dxtm/postgres,
--    authenticated=Dxtm/postgres, service_role=Dxtm/postgres}
--
-- so every table in this schema is BORN with TRUNCATE, REFERENCES, TRIGGER and
-- MAINTAIN granted to the two client roles. The older tables escape it because
-- 20260720100000 and 20260720100100 open with `revoke all ... from anon,
-- authenticated` before granting anything back. `site_settings`
-- (20260802130000) and `pass_tiers` (20260802150000) said only `grant select`,
-- which reads as complete and is not.
--
-- CLAUDE.md IS WRONG ABOUT THIS, and that is likely why it survived. It states
-- "Supabase grants nothing by default here." The default is `Dxtm`, not
-- nothing. The same file already warns that lowercase `d` is DELETE and
-- uppercase `D` is TRUNCATE, and that the distinction cost a debugging session
-- on the seed reset — so both halves of the trap were written down and the
-- conclusion drawn from them was the wrong one.
--
-- EXPOSURE. Not reachable over HTTP: PostgREST has no TRUNCATE verb, so an
-- anon key cannot trigger this today. The risk is latent — any future
-- SECURITY INVOKER function, or anything connecting directly as these roles,
-- can. Production ran these same migrations against the same defaults and
-- therefore carries the same grants.
--
-- WHY THIS IS SAFE. Nothing in this repository issues TRUNCATE: not the
-- migrations, not `scripts/seed.ts`, not `scripts/reset-platform.mjs`. The
-- reset path deletes. Revoking a privilege nothing uses cannot change any
-- behaviour that exists.
--
-- SCOPE. anon and authenticated only, on these two tables only. `service_role`
-- keeps its grants: it is the server-side role the seed and ops scripts
-- authenticate as, and narrowing it was not audited here. The schema-wide
-- default ACL is deliberately NOT altered — that would change what every
-- future table inherits, which is a decision to take on its own terms rather
-- than inside a conformance phase. Recorded in POLISH.md as post-deadline work.
--
-- Additive in the sense that matters: it adds no object and removes no data.
-- It withdraws a capability that was never intended and never exercised.
-- =============================================================================

revoke truncate on public.site_settings from anon, authenticated;
revoke truncate on public.pass_tiers    from anon, authenticated;

-- Belt and braces: prove the intent held, in the same transaction that made
-- the change. A migration that silently fails to revoke is indistinguishable
-- from one that was never applied, and the next thing to notice would be the
-- conformance suite — which is a good backstop and a slow one.
do $$
begin
  if has_table_privilege('anon', 'public.site_settings', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.site_settings', 'TRUNCATE')
     or has_table_privilege('anon', 'public.pass_tiers', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.pass_tiers', 'TRUNCATE')
  then
    raise exception
      'v13_conformance_a: TRUNCATE still held after revoke (site_settings anon=%, authenticated=%; pass_tiers anon=%, authenticated=%)',
      has_table_privilege('anon', 'public.site_settings', 'TRUNCATE'),
      has_table_privilege('authenticated', 'public.site_settings', 'TRUNCATE'),
      has_table_privilege('anon', 'public.pass_tiers', 'TRUNCATE'),
      has_table_privilege('authenticated', 'public.pass_tiers', 'TRUNCATE');
  end if;
end $$;

-- The reads these two tables exist to serve are untouched, and are re-asserted
-- here so a future edit to this file cannot quietly take them away as well.
do $$
begin
  if not (has_table_privilege('anon', 'public.site_settings', 'SELECT')
          and has_table_privilege('authenticated', 'public.site_settings', 'SELECT')
          and has_table_privilege('anon', 'public.pass_tiers', 'SELECT')
          and has_table_privilege('authenticated', 'public.pass_tiers', 'SELECT'))
  then
    raise exception 'v13_conformance_a: a SELECT grant was lost — the revoke was too wide';
  end if;
end $$;
