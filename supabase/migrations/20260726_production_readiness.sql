-- Operational readiness: immutable reconciliation outcomes and extension-ready ingestion.

alter table send_audit_log
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid,
  add column if not exists resolution_note text;

alter table send_audit_log drop constraint if exists send_audit_log_status_check;
alter table send_audit_log
  add constraint send_audit_log_status_check
  check (status in (
    'success',
    'failed_retryable',
    'failed_permanent',
    'reconciliation_required',
    'resolved_replied',
    'resolved_not_sent'
  ));

create index if not exists send_audit_reconciliation_idx
  on send_audit_log(created_at)
  where status = 'reconciliation_required';

create or replace function resolve_send_reconciliation(
  p_audit_id uuid,
  p_outcome text,
  p_resolution_note text,
  p_resolved_by uuid
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_audit send_audit_log%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_outcome not in ('posted', 'not_posted') then
    raise exception 'invalid outcome' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_resolution_note, ''))) not between 10 and 1000 then
    raise exception 'resolution note must be between 10 and 1000 characters'
      using errcode = '22023';
  end if;

  select * into v_audit
  from send_audit_log
  where id = p_audit_id
    and status = 'reconciliation_required'
  for update;

  if not found then return 'not_pending'; end if;

  perform 1 from monitored_threads
  where id = v_audit.thread_id
    and user_id = v_audit.user_id
    and status = 'send_reconciliation_required'
  for update;
  if not found then return 'thread_not_pending'; end if;

  if p_outcome = 'posted' then
    update monitored_threads
    set status = 'replied'
    where id = v_audit.thread_id and user_id = v_audit.user_id;

    update reply_analytics
    set was_sent = true, sent_at = coalesce(sent_at, v_audit.created_at)
    where thread_id = v_audit.thread_id and user_id = v_audit.user_id;

    update send_audit_log
    set status = 'resolved_replied',
        resolved_at = now(),
        resolved_by = p_resolved_by,
        resolution_note = trim(p_resolution_note)
    where id = p_audit_id;
  else
    update monitored_threads
    set status = 'drafted'
    where id = v_audit.thread_id and user_id = v_audit.user_id;

    update send_audit_log
    set status = 'resolved_not_sent',
        resolved_at = now(),
        resolved_by = p_resolved_by,
        resolution_note = trim(p_resolution_note)
    where id = p_audit_id;
  end if;

  return 'resolved';
end;
$$;

revoke all on function resolve_send_reconciliation(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function resolve_send_reconciliation(uuid, text, text, uuid)
  to service_role;

create table if not exists ingestion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  source text not null check (source in ('chrome_extension', 'manual_import')),
  source_event_id text not null,
  source_url text not null check (source_url ~ '^https?://[^[:space:]]+$'),
  title text,
  body text not null,
  author text,
  community text,
  captured_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_event_id)
);

alter table ingestion_events enable row level security;
create policy "own ingestion events select"
  on ingestion_events for select to authenticated
  using (auth.uid() = user_id);
revoke insert, update, delete on ingestion_events from anon, authenticated;
grant select on ingestion_events to authenticated;

create index if not exists ingestion_events_unprocessed_idx
  on ingestion_events(created_at)
  where processed_at is null;
