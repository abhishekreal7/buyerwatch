-- Durable, horizontally scalable Reddit reply tracking.
-- Every successful Reddit send receives its own schedule row. Concurrent
-- schedulers atomically claim different rows, so no global cursor can starve
-- newer sends as platform volume grows.

create table if not exists public.reddit_reply_tracking_state (
  audit_id uuid primary key references public.send_audit_log(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.monitored_threads(id) on delete cascade,
  next_check_at timestamptz not null,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claim_token uuid,
  last_checked_at timestamptz,
  last_reply_count integer not null default 0 check (last_reply_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reddit_reply_tracking_due_idx
  on public.reddit_reply_tracking_state(next_check_at, audit_id)
  where completed_at is null;

create index if not exists reddit_reply_tracking_user_idx
  on public.reddit_reply_tracking_state(user_id, last_checked_at desc);

alter table public.reddit_reply_tracking_state enable row level security;
revoke all on table public.reddit_reply_tracking_state from public, anon, authenticated;
grant select, insert, update, delete on table public.reddit_reply_tracking_state to service_role;

create or replace function public.seed_reddit_reply_tracking_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.platform = 'reddit'
    and new.status = 'success'
    and new.permalink is not null
    and length(btrim(new.permalink)) > 0 then
    insert into public.reddit_reply_tracking_state (
      audit_id,
      user_id,
      thread_id,
      next_check_at,
      expires_at
    ) values (
      new.id,
      new.user_id,
      new.thread_id,
      greatest(new.created_at + interval '15 minutes', now()),
      new.created_at + interval '14 days'
    )
    on conflict (audit_id) do update
    set
      user_id = excluded.user_id,
      thread_id = excluded.thread_id,
      expires_at = excluded.expires_at,
      completed_at = case
        when public.reddit_reply_tracking_state.completed_at is not null
          and public.reddit_reply_tracking_state.last_error = 'invalid_permalink'
        then null
        else public.reddit_reply_tracking_state.completed_at
      end,
      next_check_at = case
        when public.reddit_reply_tracking_state.last_checked_at is null
        then least(public.reddit_reply_tracking_state.next_check_at, excluded.next_check_at)
        else public.reddit_reply_tracking_state.next_check_at
      end,
      updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.seed_reddit_reply_tracking_v1() from public, anon, authenticated;

drop trigger if exists send_audit_seed_reddit_reply_tracking on public.send_audit_log;
create trigger send_audit_seed_reddit_reply_tracking
after insert or update of status, permalink on public.send_audit_log
for each row execute function public.seed_reddit_reply_tracking_v1();

insert into public.reddit_reply_tracking_state (
  audit_id,
  user_id,
  thread_id,
  next_check_at,
  expires_at
)
select
  audit.id,
  audit.user_id,
  audit.thread_id,
  greatest(audit.created_at + interval '15 minutes', now()),
  audit.created_at + interval '14 days'
from public.send_audit_log as audit
where audit.platform = 'reddit'
  and audit.status = 'success'
  and audit.permalink is not null
  and length(btrim(audit.permalink)) > 0
  and audit.created_at >= now() - interval '14 days'
on conflict (audit_id) do nothing;

create or replace function public.claim_due_reddit_reply_tracking_v1(
  p_limit integer default 100
) returns table (
  audit_id uuid,
  user_id uuid,
  thread_id uuid,
  permalink text,
  send_created_at timestamptz,
  expires_at timestamptz,
  attempt_count integer,
  claim_token uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with due as (
    select state.audit_id
    from public.reddit_reply_tracking_state as state
    where state.completed_at is null
      and state.expires_at > now()
      and state.next_check_at <= now()
      and (state.claimed_at is null or state.claimed_at < now() - interval '10 minutes')
    order by state.next_check_at asc, state.audit_id asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ), claimed as (
    update public.reddit_reply_tracking_state as state
    set
      claimed_at = now(),
      claim_token = gen_random_uuid(),
      attempt_count = state.attempt_count + 1,
      updated_at = now()
    from due
    where state.audit_id = due.audit_id
    returning
      state.audit_id,
      state.user_id,
      state.thread_id,
      state.expires_at,
      state.attempt_count,
      state.claim_token
  )
  select
    claimed.audit_id,
    claimed.user_id,
    claimed.thread_id,
    audit.permalink,
    audit.created_at,
    claimed.expires_at,
    claimed.attempt_count,
    claimed.claim_token
  from claimed
  join public.send_audit_log as audit on audit.id = claimed.audit_id;
end;
$$;

revoke all on function public.claim_due_reddit_reply_tracking_v1(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_reddit_reply_tracking_v1(integer)
  to service_role;

create or replace function public.settle_reddit_reply_tracking_v1(
  p_audit_id uuid,
  p_claim_token uuid,
  p_checked_at timestamptz,
  p_next_check_at timestamptz,
  p_reply_count integer,
  p_last_error text,
  p_complete boolean default false
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.reddit_reply_tracking_state
  set
    last_checked_at = coalesce(p_checked_at, last_checked_at),
    next_check_at = greatest(coalesce(p_next_check_at, now() + interval '30 minutes'), now()),
    last_reply_count = case
      when p_reply_count is null then last_reply_count
      else greatest(0, p_reply_count)
    end,
    last_error = case
      when p_last_error is null then null
      else left(p_last_error, 500)
    end,
    completed_at = case when p_complete then now() else null end,
    claimed_at = null,
    claim_token = null,
    updated_at = now()
  where audit_id = p_audit_id
    and claim_token = p_claim_token
  returning audit_id into v_updated;

  return v_updated is not null;
end;
$$;

revoke all on function public.settle_reddit_reply_tracking_v1(
  uuid, uuid, timestamptz, timestamptz, integer, text, boolean
) from public, anon, authenticated;
grant execute on function public.settle_reddit_reply_tracking_v1(
  uuid, uuid, timestamptz, timestamptz, integer, text, boolean
) to service_role;

create or replace function public.get_reddit_reply_outcomes_v1(
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.role() <> 'service_role' and auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with delivery as (
    select
      count(*) filter (where status = 'success')::integer as sent_count,
      count(*) filter (
        where status in ('failed_retryable', 'failed_permanent')
      )::integer as failure_count
    from public.send_audit_log
    where user_id = p_user_id
  ), tracking as (
    select
      count(*) filter (where last_checked_at is not null)::integer as checked_count,
      count(*) filter (
        where last_checked_at is not null and last_reply_count > 0
      )::integer as conversation_count,
      coalesce(sum(last_reply_count) filter (where last_checked_at is not null), 0)::integer
        as replies_received
    from public.reddit_reply_tracking_state
    where user_id = p_user_id
  ), per_thread as (
    select
      thread_id,
      sum(last_reply_count)::integer as reply_count,
      max(last_checked_at) as checked_at
    from public.reddit_reply_tracking_state
    where user_id = p_user_id
      and last_checked_at is not null
      and last_reply_count > 0
    group by thread_id
  ), engagement as (
    select coalesce(
      jsonb_object_agg(
        thread_id::text,
        jsonb_build_object(
          'replyCount', reply_count,
          'checkedAt', checked_at
        )
      ),
      '{}'::jsonb
    ) as by_thread
    from per_thread
  )
  select jsonb_build_object(
    'sentCount', delivery.sent_count,
    'failureCount', delivery.failure_count,
    'deliverySuccessRate', case
      when delivery.sent_count + delivery.failure_count > 0
      then delivery.sent_count::numeric
        / (delivery.sent_count + delivery.failure_count)::numeric * 100
      else null
    end,
    'conversationsStarted', tracking.conversation_count,
    'repliesReceived', tracking.replies_received,
    'conversationResponseRate', case
      when tracking.checked_count > 0
      then tracking.conversation_count::numeric / tracking.checked_count::numeric * 100
      else null
    end,
    'verifiedRepliesChecked', tracking.checked_count,
    'replyEngagementByThread', engagement.by_thread
  ) into v_result
  from delivery, tracking, engagement;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_reddit_reply_outcomes_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_reddit_reply_outcomes_v1(uuid)
  to authenticated, service_role;

