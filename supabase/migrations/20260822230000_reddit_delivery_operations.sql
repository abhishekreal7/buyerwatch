begin;

-- Preserve the provider handoff identity and give successful deliveries a
-- terminal state. Previously a successful row remained "dispatched" forever,
-- which was safe because recovery also checked the thread state, but it made
-- operational reconciliation needlessly ambiguous.
alter table public.job_outbox
  add column if not exists qstash_message_id text,
  add column if not exists completed_at timestamptz,
  add column if not exists permalink text;

alter table public.job_outbox
  drop constraint if exists job_outbox_status_check;
alter table public.job_outbox
  add constraint job_outbox_status_check
  check (status in ('pending', 'dispatched', 'cancelled', 'failed', 'completed'));

alter table public.job_outbox
  drop constraint if exists job_outbox_qstash_message_id_length_check,
  add constraint job_outbox_qstash_message_id_length_check
    check (qstash_message_id is null or char_length(qstash_message_id) between 1 and 200) not valid,
  drop constraint if exists job_outbox_permalink_length_check,
  add constraint job_outbox_permalink_length_check
    check (permalink is null or char_length(permalink) between 1 and 2000) not valid;

create index if not exists job_outbox_qstash_message_idx
  on public.job_outbox (qstash_message_id)
  where qstash_message_id is not null;

-- Make failure counters atomic so concurrent pre-write provider failures do
-- not lose increments. The returned count drives the three-failure alert.
create or replace function public.increment_reddit_connection_failure_v1(
  p_user_id uuid,
  p_error_code text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_failures integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null or nullif(btrim(p_error_code), '') is null then
    raise exception 'invalid failure record' using errcode = '22023';
  end if;

  update public.reddit_connection_secrets
  set
    consecutive_failures = least(100, consecutive_failures + 1),
    last_error_code = left(btrim(p_error_code), 160),
    updated_at = now()
  where user_id = p_user_id
  returning consecutive_failures into v_failures;

  return coalesce(v_failures, 0);
end;
$$;

revoke all on function public.increment_reddit_connection_failure_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.increment_reddit_connection_failure_v1(uuid, text)
  to service_role;

create or replace function public.finalize_successful_send(
  p_thread_id uuid,
  p_user_id uuid,
  p_claim_token uuid,
  p_platform text,
  p_trigger_type text,
  p_permalink text
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

  update public.monitored_threads
  set
    status = 'replied',
    send_claim_token = null,
    send_claimed_at = null
  where id = p_thread_id
    and user_id = p_user_id
    and status = 'sending'
    and send_claim_token = p_claim_token
  returning id into v_updated;

  if v_updated is null then return false; end if;

  update public.reply_analytics
  set was_sent = true, sent_at = now()
  where thread_id = p_thread_id and user_id = p_user_id;

  insert into public.send_audit_log (
    user_id, thread_id, platform, trigger_type, status, permalink
  ) values (
    p_user_id, p_thread_id, p_platform, p_trigger_type, 'success', p_permalink
  );

  update public.job_outbox
  set
    status = 'completed',
    completed_at = now(),
    permalink = p_permalink,
    last_error = null
  where thread_id = p_thread_id
    and user_id = p_user_id
    and kind = 'auto_send'
    and status = 'dispatched';

  return true;
end;
$$;

revoke all on function public.finalize_successful_send(
  uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_successful_send(
  uuid, uuid, uuid, text, text, text
) to service_role;

-- Backfill historical successful handoffs using their durable audit records.
with successful_delivery as (
  select
    thread.id as thread_id,
    coalesce(analytics.sent_at, audit.created_at) as completed_at,
    audit.permalink
  from public.monitored_threads as thread
  left join public.reply_analytics as analytics
    on analytics.thread_id = thread.id
  left join lateral (
    select log.permalink, log.created_at
    from public.send_audit_log as log
    where log.thread_id = thread.id
      and log.status = 'success'
    order by log.created_at desc
    limit 1
  ) as audit on true
  where thread.status = 'replied'
)
update public.job_outbox as outbox
set
  status = 'completed',
  completed_at = coalesce(delivery.completed_at, outbox.dispatched_at),
  permalink = delivery.permalink,
  last_error = null
from successful_delivery as delivery
where outbox.thread_id = delivery.thread_id
  and outbox.kind = 'auto_send'
  and outbox.status = 'dispatched'
;

alter table public.job_outbox
  validate constraint job_outbox_qstash_message_id_length_check;
alter table public.job_outbox
  validate constraint job_outbox_permalink_length_check;

commit;
