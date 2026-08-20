-- =============================================================================
-- In-app notifications, v1 (round 7, item 5)
--
-- WHAT THIS LIFTS, AND ONLY THIS HALF. SCOPE.md quarantined notifications on
-- the grounds that "there is no notification store; email is the channel".
-- This adds the store for the IN-APP bell and nothing else: no dispatch, no
-- fan-out, no per-player targeting, no email. Email remains the channel for
-- everything that has to leave the browser.
--
-- AUDIENCE IS AN ENUM WITH ONE VALUE, and that is deliberate. v1 broadcasts to
-- every signed-in player. The alternative shapes — a recipient table, a
-- per-player row — are the ones that make sense once there is a second
-- audience, and building them now means maintaining a join that always
-- resolves to "everyone". An enum widens with `alter type ... add value`, one
-- line, no drop-and-restate; a CHECK constraint would need the full drop/re-add
-- dance that CLAUDE.md records as easy to forget.
--
-- READ RECEIPTS ARE KEYED ON `players.id`, NOT ON THE AUTH USER. Every other
-- foreign key in this schema points at `players`; `players.auth_user_id` is the
-- single bridge to auth, and adding a second one here would mean two ways to
-- say "who" and a join that has to pick. The specification said `user_id`; this
-- is the same thing spelled the way the rest of the schema spells it.
--
-- NO CLIENT WRITES, per the standing rule. Both writes are SECURITY DEFINER
-- RPCs: `admin_create_notification` (admin only) and `mark_notifications_read`
-- (the caller's own receipts). The tables carry SELECT grants and nothing more,
-- so a client that tries to insert gets a permission error rather than a
-- silently-empty result.
--
-- NO NEW EVENT TYPE, so `events_event_type_catalog` is untouched. Publishing a
-- notification is not a state transition on a booking or a game; it is a row in
-- its own table, and widening the catalog for it would put an entry there that
-- nothing reconciles against.
-- =============================================================================

create type public.notification_audience as enum ('all');

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  audience   public.notification_audience not null default 'all',
  created_at timestamptz not null default now(),

  constraint notifications_title_not_blank check (btrim(title) <> ''),
  constraint notifications_body_not_blank  check (btrim(body)  <> ''),
  -- Long enough for a real message, short enough that the dropdown does not
  -- become a document viewer. Enforced here rather than in the form so that
  -- the RPC is the boundary, not the browser.
  constraint notifications_title_length check (char_length(title) <= 120),
  constraint notifications_body_length  check (char_length(body)  <= 1000)
);

-- Newest first is the only order this table is ever read in.
create index notifications_created_at_idx on public.notifications (created_at desc);

create table public.user_notification_reads (
  player_id       uuid not null references public.players (id) on delete cascade,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  read_at         timestamptz not null default now(),

  primary key (player_id, notification_id)
);

create index user_notification_reads_player_idx
  on public.user_notification_reads (player_id);

-- -----------------------------------------------------------------------------
-- RLS
--
-- Auto-RLS is ON in this project and auto-expose is OFF, so a table with no
-- explicit GRANT returns EMPTY rather than erroring — which reads as missing
-- data, not as a missing grant. Both grants are stated.
-- -----------------------------------------------------------------------------

alter table public.notifications            enable row level security;
alter table public.user_notification_reads  enable row level security;

-- Every signed-in player reads every notification: v1's audience is 'all', and
-- a policy that filtered on it would be a no-op that later reads as a filter.
create policy notifications_read_authenticated
  on public.notifications
  for select
  to authenticated
  using (true);

-- A player sees only their own receipts. Not a privacy question so much as a
-- correctness one: the unread dot is computed from this, and reading someone
-- else's rows would mark the bell read for the wrong person.
create policy user_notification_reads_own
  on public.user_notification_reads
  for select
  to authenticated
  using (player_id = public.current_player_id());

grant select on public.notifications           to authenticated;
grant select on public.user_notification_reads to authenticated;

-- -----------------------------------------------------------------------------
-- Writes, both through SECURITY DEFINER
-- -----------------------------------------------------------------------------

create function public.admin_create_notification(
  p_title text,
  p_body  text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Authorization lives INSIDE the function, not in the route that calls it:
  -- a route guard is skipped by anyone using curl.
  if not (public.is_admin_caller() or public.is_service_role()) then
    raise exception 'INSUFFICIENT_PERMISSION'
      using detail = 'admin_create_notification requires an admin session or service role';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'NOTIFICATION_TITLE_REQUIRED';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'NOTIFICATION_BODY_REQUIRED';
  end if;

  insert into public.notifications (title, body)
  values (btrim(p_title), btrim(p_body))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.admin_create_notification(text, text) from public;
grant execute on function public.admin_create_notification(text, text)
  to authenticated, service_role;

/*
 * Mark everything the caller can see as read.
 *
 * ONE CALL, NOT ONE PER ROW. The bell marks read on open, so the client would
 * otherwise fire N inserts for N unread items and have to reconcile partial
 * failure. `on conflict do nothing` makes it idempotent: opening the dropdown
 * twice is not an error, and a notification published between the two opens is
 * picked up by the second.
 *
 * Returns the number of receipts actually written, which is what the caller
 * needs to decide whether to re-render the dot.
 */
create function public.mark_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_written   integer;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'NOT_A_PLAYER'
      using detail = 'mark_notifications_read requires a completed player profile';
  end if;

  insert into public.user_notification_reads (player_id, notification_id)
  select v_player_id, n.id
    from public.notifications n
   on conflict (player_id, notification_id) do nothing;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke execute on function public.mark_notifications_read() from public;
grant execute on function public.mark_notifications_read() to authenticated, service_role;

/*
 * The bell's whole payload in one round trip: the newest notifications and
 * whether this caller has read each one.
 *
 * A LEFT JOIN RATHER THAN TWO QUERIES. The client would otherwise fetch the
 * notifications and the receipts separately and join them in TypeScript, which
 * is a second place for "read" to be decided and a race between the two reads.
 *
 * `stable`, not `volatile`: it writes nothing, and marking it stable lets the
 * planner keep one snapshot for the whole call.
 */
create function public.my_notifications(p_limit integer default 20)
returns table (
  id         uuid,
  title      text,
  body       text,
  created_at timestamptz,
  is_read    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id,
         n.title,
         n.body,
         n.created_at,
         (r.notification_id is not null) as is_read
    from public.notifications n
    left join public.user_notification_reads r
      on r.notification_id = n.id
     and r.player_id = public.current_player_id()
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke execute on function public.my_notifications(integer) from public;
grant execute on function public.my_notifications(integer) to authenticated, service_role;
