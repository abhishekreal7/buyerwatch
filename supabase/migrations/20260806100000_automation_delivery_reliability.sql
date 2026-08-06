begin;

-- Auto-send handoffs need durable terminal states: a customer can cancel an
-- unsent handoff, and an exhausted delivery can be surfaced without being
-- retried indefinitely.
alter table public.job_outbox
  drop constraint if exists job_outbox_status_check;
alter table public.job_outbox
  add constraint job_outbox_status_check
  check (status in ('pending', 'dispatched', 'cancelled', 'failed'));

create index if not exists job_outbox_stale_auto_send_idx
  on public.job_outbox (dispatched_at)
  where kind = 'auto_send' and status = 'dispatched';

create index if not exists job_outbox_auto_send_user_status_idx
  on public.job_outbox (user_id, status)
  where kind = 'auto_send';

-- This trigger runs before the existing earned-automation trigger (Postgres
-- orders same-timing triggers by name). A downgrade can therefore never leave
-- automation enabled for a plan that no longer includes it.
create or replace function public.enforce_automation_plan_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if lower(coalesce(new.plan, 'free')) not in ('pro', 'growth') then
    new.auto_send_enabled := false;
    new.auto_send_activated_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_automation_plan_entitlement()
  from public, anon, authenticated;

drop trigger if exists a00_profiles_automation_plan_entitlement on public.profiles;
create trigger a00_profiles_automation_plan_entitlement
  before insert or update of plan, auto_send_enabled, auto_send_activated_at
  on public.profiles
  for each row execute function public.enforce_automation_plan_entitlement();

-- Disable is an immediate cancellation signal for anything not yet confirmed
-- by a provider. The sender also checks this policy immediately before posting
-- to cover already-delivered QStash messages.
create or replace function public.cancel_auto_send_outbox_on_disable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.auto_send_enabled is true and new.auto_send_enabled is not true then
    update public.job_outbox
    set
      status = 'cancelled',
      dispatched_at = coalesce(dispatched_at, now()),
      last_error = 'Automatic delivery cancelled because automation was disabled.'
    where user_id = new.id
      and kind = 'auto_send'
      and status in ('pending', 'dispatched');
  end if;
  return new;
end;
$$;

revoke all on function public.cancel_auto_send_outbox_on_disable()
  from public, anon, authenticated;

drop trigger if exists profiles_cancel_auto_send_outbox on public.profiles;
create trigger profiles_cancel_auto_send_outbox
  after update of plan, auto_send_enabled on public.profiles
  for each row execute function public.cancel_auto_send_outbox_on_disable();

-- Correct any already-downgraded records through the same trigger path.
update public.profiles
set
  auto_send_enabled = false,
  auto_send_activated_at = null
where auto_send_enabled is true
  and lower(coalesce(plan, 'free')) not in ('pro', 'growth');

-- QStash retries a message several times, but a network acknowledgement can
-- still be lost. Requeue a stale, still-sendable outbox row a bounded number
-- of times. Claim leases protect the provider from duplicate posts.
create or replace function public.requeue_stale_auto_send_outbox(
  p_stale_before timestamptz,
  p_max_dispatch_attempts integer default 3
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requeued integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_stale_before is null or p_max_dispatch_attempts < 1 then
    raise exception 'invalid recovery parameters' using errcode = '22023';
  end if;

  with requeued as (
    update public.job_outbox as outbox
    set
      status = 'pending',
      dispatched_at = null,
      last_error = 'Automatic delivery acknowledgement timed out; retrying.'
    from public.monitored_threads as thread
    where outbox.thread_id = thread.id
      and outbox.kind = 'auto_send'
      and outbox.status = 'dispatched'
      and outbox.dispatched_at < p_stale_before
      and outbox.attempts < p_max_dispatch_attempts
      and thread.status = 'drafted'
    returning outbox.id
  )
  select count(*)::integer into v_requeued from requeued;

  with exhausted as (
    update public.job_outbox as outbox
    set
      status = 'failed',
      last_error = format(
        'Automatic delivery was not confirmed after %s handoffs. Draft remains available for review.',
        p_max_dispatch_attempts
      )
    from public.monitored_threads as thread
    where outbox.thread_id = thread.id
      and outbox.kind = 'auto_send'
      and outbox.status = 'dispatched'
      and outbox.dispatched_at < p_stale_before
      and outbox.attempts >= p_max_dispatch_attempts
      and thread.status = 'drafted'
    returning
      outbox.user_id,
      outbox.thread_id,
      coalesce(outbox.payload ->> 'platform', thread.platform) as platform
  )
  insert into public.send_audit_log (
    user_id, thread_id, platform, trigger_type, status, error_message
  )
  select
    user_id,
    thread_id,
    platform,
    'auto',
    'failed_retryable',
    format(
      'Automatic delivery was not confirmed after %s handoffs. Draft remains available for review.',
      p_max_dispatch_attempts
    )
  from exhausted;

  return v_requeued;
end;
$$;

revoke all on function public.requeue_stale_auto_send_outbox(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.requeue_stale_auto_send_outbox(timestamptz, integer)
  to service_role;

commit;
