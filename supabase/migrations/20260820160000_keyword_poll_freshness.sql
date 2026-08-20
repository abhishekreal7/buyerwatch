-- Per-keyword polling health. A profile-level heartbeat can hide a failed
-- platform or target, so every active rule records its own last attempt and
-- last successful source fetch.

alter table public.keywords
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_check_status text not null default 'never',
  add column if not exists last_check_error text,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists next_poll_at timestamptz;

alter table public.keywords
  drop constraint if exists keywords_last_check_status_check;
alter table public.keywords
  add constraint keywords_last_check_status_check
  check (last_check_status in ('never', 'success', 'error'));

alter table public.keywords
  drop constraint if exists keywords_consecutive_failures_check;
alter table public.keywords
  add constraint keywords_consecutive_failures_check
  check (consecutive_failures between 0 and 100);

create index if not exists keywords_poll_health_idx
  on public.keywords (is_active, platform, last_success_at, next_poll_at)
  where is_active = true;

create or replace function public.record_keyword_poll_success_v1(
  p_keyword_ids uuid[],
  p_checked_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  update public.keywords
  set last_checked_at = p_checked_at,
      last_success_at = p_checked_at,
      last_check_status = 'success',
      last_check_error = null,
      consecutive_failures = 0,
      next_poll_at = null
  where id = any(coalesce(p_keyword_ids, array[]::uuid[]));
  get diagnostics updated_count = row_count;

  update public.profiles
  set last_polled_at = greatest(
    coalesce(last_polled_at, '-infinity'::timestamptz),
    p_checked_at
  )
  where id in (
    select distinct user_id
    from public.keywords
    where id = any(coalesce(p_keyword_ids, array[]::uuid[]))
  );

  return updated_count;
end;
$$;

create or replace function public.record_keyword_poll_failure_v1(
  p_keyword_ids uuid[],
  p_error_code text,
  p_checked_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  update public.keywords
  set last_checked_at = p_checked_at,
      last_check_status = 'error',
      last_check_error = left(coalesce(nullif(trim(p_error_code), ''), 'source_fetch_failed'), 80),
      next_poll_at = p_checked_at + make_interval(
        mins => least(60, 5 * (2 ^ least(consecutive_failures, 4)))::integer
      ),
      consecutive_failures = least(100, consecutive_failures + 1)
  where id = any(coalesce(p_keyword_ids, array[]::uuid[]));
  get diagnostics updated_count = row_count;

  return updated_count;
end;
$$;

create or replace function public.quarantine_stale_pending_threads_v1(
  p_cutoff timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_cutoff is null or p_cutoff > now() then
    raise exception 'valid historical cutoff required';
  end if;

  update public.monitored_threads
  set status = 'dismissed',
      automation_reason = 'source_too_old'
  where status = 'pending'
    and coalesce(source_created_at, created_at) < p_cutoff;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.record_keyword_poll_success_v1(uuid[], timestamptz)
  from public, anon, authenticated;
revoke all on function public.record_keyword_poll_failure_v1(uuid[], text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.quarantine_stale_pending_threads_v1(timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_keyword_poll_success_v1(uuid[], timestamptz)
  to service_role;
grant execute on function public.record_keyword_poll_failure_v1(uuid[], text, timestamptz)
  to service_role;
grant execute on function public.quarantine_stale_pending_threads_v1(timestamptz)
  to service_role;
