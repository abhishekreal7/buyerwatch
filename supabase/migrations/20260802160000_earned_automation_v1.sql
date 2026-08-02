begin;

-- Earned automation remains opt-in and bounded even after the trust gate clears.
alter table public.profiles
  add column if not exists auto_send_daily_limit integer not null default 3,
  add column if not exists auto_send_platforms text[] not null default array['bluesky']::text[],
  add column if not exists auto_send_communities text[] not null default '{}'::text[],
  add column if not exists auto_send_activated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_auto_send_daily_limit_check,
  drop constraint if exists profiles_auto_send_platforms_check,
  drop constraint if exists profiles_auto_send_communities_check;

alter table public.profiles
  add constraint profiles_auto_send_daily_limit_check
    check (auto_send_daily_limit between 1 and 25),
  add constraint profiles_auto_send_platforms_check
    check (
      auto_send_platforms <@ array['reddit', 'bluesky']::text[]
      and cardinality(auto_send_platforms) <= 2
    ),
  add constraint profiles_auto_send_communities_check
    check (
      cardinality(auto_send_communities) <= 50
      and pg_column_size(auto_send_communities) <= 12000
    );

-- Existing flags are reset unless they already satisfy the earned gate. This
-- prevents an older UI or service path from inheriting unsafe automation.
update public.profiles p
set auto_send_enabled = false,
    auto_send_activated_at = null
where p.auto_send_enabled = true
  and (
    lower(coalesce(p.plan, 'free')) = 'free'
    or p.auto_send_activated_at is null
    or coalesce((
      select utm.total_drafts_reviewed
      from public.user_trust_metrics utm
      where utm.user_id = p.id
    ), 0) < 10
  );

create or replace function public.enforce_earned_automation_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reviewed integer;
begin
  if new.auto_send_enabled = true then
    if lower(coalesce(new.plan, 'free')) = 'free' then
      raise exception 'earned automation requires a paid plan' using errcode = '22023';
    end if;
    if new.auto_send_activated_at is null then
      raise exception 'earned automation requires explicit activation' using errcode = '22023';
    end if;

    select total_drafts_reviewed into v_reviewed
    from public.user_trust_metrics
    where user_id = new.id;
    if coalesce(v_reviewed, 0) < 10 then
      raise exception 'earned automation requires ten verified reviews' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_earned_automation_gate on public.profiles;
create trigger profiles_earned_automation_gate
  before insert or update of auto_send_enabled, auto_send_activated_at, plan
  on public.profiles
  for each row execute function public.enforce_earned_automation_gate();

-- Repair the existing digest selector: a table name is not a composite row
-- value in PostgreSQL, so the previous `(ranked.thread).*` query was invalid.
create or replace function public.get_digest_opportunities(
  p_since timestamptz,
  p_min_score numeric default 70,
  p_per_user integer default 10
) returns setof public.monitored_threads
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    with ranked as (
      select
        mt.id,
        row_number() over (
          partition by mt.user_id
          order by mt.intent_score desc, mt.created_at desc
        ) as position
      from public.monitored_threads mt
      where mt.status in ('drafted', 'needs_manual_reply')
        and mt.intent_score >= p_min_score
        and mt.created_at >= p_since
    )
    select mt.*
    from ranked r
    join public.monitored_threads mt on mt.id = r.id
    where r.position <= p_per_user;
end;
$$;

revoke all on function public.get_digest_opportunities(timestamptz, numeric, integer)
  from public, anon, authenticated;
grant execute on function public.get_digest_opportunities(timestamptz, numeric, integer)
  to service_role;

create table if not exists public.engagement_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid references public.monitored_threads(id) on delete cascade,
  event_type text not null check (event_type in (
    'signal_discovered',
    'intent_scored',
    'draft_generated',
    'draft_reviewed',
    'automation_evaluated',
    'assisted_reply_prepared',
    'reply_prefilled',
    'reply_confirmed',
    'reply_sent',
    'reply_failed',
    'clicked',
    'converted',
    'dismissed'
  )),
  platform text,
  actor_type text not null default 'system'
    check (actor_type in ('system', 'user', 'extension', 'provider')),
  source text not null default 'buyerwatch',
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (char_length(idempotency_key) between 1 and 240),
  check (pg_column_size(metadata) <= 32768)
);

create index if not exists engagement_events_user_time_idx
  on public.engagement_events (user_id, occurred_at desc);
create index if not exists engagement_events_thread_time_idx
  on public.engagement_events (thread_id, occurred_at desc)
  where thread_id is not null;

create table if not exists public.automation_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.monitored_threads(id) on delete cascade,
  platform text not null,
  decision text not null check (decision in ('approved', 'manual_review', 'assisted')),
  reason text not null,
  delivery_mode text not null check (delivery_mode in ('direct', 'assisted', 'manual', 'unsupported')),
  automation_confidence numeric(6,2) not null default 0,
  dynamic_threshold numeric(6,2) not null default 100,
  configured_threshold numeric(6,2) not null default 100,
  user_trust numeric(6,2) not null default 0,
  community_trust numeric(6,2) not null default 0,
  total_drafts_reviewed integer not null default 0,
  content_policy jsonb not null default '{}'::jsonb,
  model_context jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (char_length(reason) between 1 and 200),
  check (char_length(idempotency_key) between 1 and 240),
  check (automation_confidence between 0 and 100),
  check (dynamic_threshold between 0 and 100),
  check (configured_threshold between 0 and 100),
  check (user_trust between 0 and 100),
  check (community_trust between 0 and 100),
  check (total_drafts_reviewed >= 0),
  check (pg_column_size(content_policy) <= 16384),
  check (pg_column_size(model_context) <= 16384)
);

create index if not exists automation_decisions_user_time_idx
  on public.automation_decisions (user_id, created_at desc);
create index if not exists automation_decisions_thread_time_idx
  on public.automation_decisions (thread_id, created_at desc);

alter table public.engagement_events enable row level security;
alter table public.automation_decisions enable row level security;

drop policy if exists "own engagement events select" on public.engagement_events;
create policy "own engagement events select"
  on public.engagement_events for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own automation decisions select" on public.automation_decisions;
create policy "own automation decisions select"
  on public.automation_decisions for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.engagement_events from anon, authenticated;
revoke insert, update, delete on public.automation_decisions from anon, authenticated;
grant select on public.engagement_events to authenticated;
grant select on public.automation_decisions to authenticated;

revoke all on function public.enforce_earned_automation_gate() from public, anon, authenticated;

commit;
