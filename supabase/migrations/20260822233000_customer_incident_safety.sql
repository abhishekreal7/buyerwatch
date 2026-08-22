begin;

-- Durable operational state is the source of truth for customer communication
-- and the Reddit delivery kill switch. Redis remains an acceleration layer,
-- never the only copy of an incident or safety decision.
create table if not exists public.service_controls (
  control_key text primary key,
  state text not null check (state in ('closed', 'open')),
  reason_code text,
  requires_manual_reset boolean not null default false,
  opened_at timestamptz,
  last_verified_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint service_controls_key_check
    check (control_key ~ '^[a-z][a-z0-9_]{2,80}$'),
  constraint service_controls_reason_length_check
    check (reason_code is null or char_length(reason_code) between 1 and 160)
);

insert into public.service_controls (control_key, state)
values ('reddit_delivery', 'closed')
on conflict (control_key) do nothing;

create table if not exists public.service_incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null default 'reddit',
  kind text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  reason_code text not null,
  title text not null,
  message text not null,
  action_path text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint service_incidents_fingerprint_length_check
    check (char_length(fingerprint) between 3 and 240),
  constraint service_incidents_kind_check
    check (kind in (
      'reconnect_required', 'selector_changed', 'delivery_uncertain',
      'repeated_failures', 'credits_low', 'canary_failed', 'delivery_paused'
    )),
  constraint service_incidents_text_length_check
    check (
      char_length(reason_code) between 1 and 160
      and char_length(title) between 1 and 160
      and char_length(message) between 1 and 1000
    ),
  constraint service_incidents_action_path_check
    check (action_path is null or (action_path like '/%' and char_length(action_path) <= 500)),
  constraint service_incidents_metadata_size_check
    check (pg_column_size(metadata) <= 8192),
  constraint service_incidents_resolution_check
    check (
      (status = 'open' and resolved_at is null)
      or (status = 'resolved' and resolved_at is not null)
    )
);

create unique index if not exists service_incidents_open_fingerprint_idx
  on public.service_incidents (fingerprint)
  where status = 'open';
create index if not exists service_incidents_user_status_idx
  on public.service_incidents (user_id, status, started_at desc);
create index if not exists service_incidents_global_status_idx
  on public.service_incidents (status, started_at desc)
  where user_id is null;

create table if not exists public.incident_deliveries (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.service_incidents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email')),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incident_id, user_id, channel),
  constraint incident_deliveries_error_length_check
    check (last_error is null or char_length(last_error) <= 500)
);

create index if not exists incident_deliveries_pending_idx
  on public.incident_deliveries (status, created_at)
  where delivered_at is null and attempts < 3;

alter table public.service_controls enable row level security;
alter table public.service_incidents enable row level security;
alter table public.incident_deliveries enable row level security;
revoke all on public.service_controls from public, anon, authenticated;
revoke all on public.service_incidents from public, anon, authenticated;
revoke all on public.incident_deliveries from public, anon, authenticated;

create or replace function public.create_reddit_user_incident_v1(
  p_user_id uuid,
  p_kind text,
  p_severity text,
  p_reason_code text,
  p_title text,
  p_message text,
  p_action_path text default '/settings?section=connections'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_incident_id uuid;
  v_fingerprint text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'user required' using errcode = '22023';
  end if;
  v_fingerprint := p_user_id::text || ':reddit:' || left(btrim(p_kind), 80);

  insert into public.service_incidents (
    fingerprint, user_id, platform, kind, severity, reason_code,
    title, message, action_path
  ) values (
    v_fingerprint, p_user_id, 'reddit', p_kind, p_severity,
    left(btrim(p_reason_code), 160), left(btrim(p_title), 160),
    left(btrim(p_message), 1000), p_action_path
  )
  on conflict (fingerprint) where status = 'open'
  do update set
    severity = excluded.severity,
    reason_code = excluded.reason_code,
    title = excluded.title,
    message = excluded.message,
    action_path = excluded.action_path,
    updated_at = now()
  returning id into v_incident_id;

  insert into public.incident_deliveries (incident_id, user_id, channel)
  values (v_incident_id, p_user_id, 'email')
  on conflict (incident_id, user_id, channel) do nothing;

  return v_incident_id;
end;
$$;

create or replace function public.create_reddit_global_incident_v1(
  p_kind text,
  p_severity text,
  p_reason_code text,
  p_title text,
  p_message text,
  p_action_path text default '/status'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_incident_id uuid;
  v_fingerprint text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_fingerprint := 'global:reddit:' || left(btrim(p_kind), 80);

  insert into public.service_incidents (
    fingerprint, platform, kind, severity, reason_code,
    title, message, action_path
  ) values (
    v_fingerprint, 'reddit', p_kind, p_severity,
    left(btrim(p_reason_code), 160), left(btrim(p_title), 160),
    left(btrim(p_message), 1000), p_action_path
  )
  on conflict (fingerprint) where status = 'open'
  do update set
    severity = excluded.severity,
    reason_code = excluded.reason_code,
    title = excluded.title,
    message = excluded.message,
    action_path = excluded.action_path,
    updated_at = now()
  returning id into v_incident_id;

  insert into public.incident_deliveries (incident_id, user_id, channel)
  select v_incident_id, secret.user_id, 'email'
  from public.reddit_connection_secrets as secret
  where secret.status in ('active', 'reauth_required', 'error')
  on conflict (incident_id, user_id, channel) do nothing;

  return v_incident_id;
end;
$$;

create or replace function public.open_reddit_delivery_circuit_v1(
  p_reason_code text,
  p_title text,
  p_message text,
  p_requires_manual_reset boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_incident_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.service_controls
  set
    state = 'open',
    reason_code = left(btrim(p_reason_code), 160),
    requires_manual_reset = requires_manual_reset or p_requires_manual_reset,
    opened_at = coalesce(opened_at, now()),
    updated_at = now()
  where control_key = 'reddit_delivery';

  insert into public.service_incidents (
    fingerprint, platform, kind, severity, reason_code,
    title, message, action_path
  ) values (
    'global:reddit:delivery_paused', 'reddit', 'delivery_paused', 'critical',
    left(btrim(p_reason_code), 160), left(btrim(p_title), 160),
    left(btrim(p_message), 1000), '/status'
  )
  on conflict (fingerprint) where status = 'open'
  do update set
    reason_code = excluded.reason_code,
    title = excluded.title,
    message = excluded.message,
    updated_at = now()
  returning id into v_incident_id;

  insert into public.incident_deliveries (incident_id, user_id, channel)
  select v_incident_id, secret.user_id, 'email'
  from public.reddit_connection_secrets as secret
  where secret.status in ('active', 'reauth_required', 'error')
  on conflict (incident_id, user_id, channel) do nothing;

  update public.job_outbox
  set
    status = 'cancelled',
    dispatched_at = coalesce(dispatched_at, now()),
    last_error = 'Automatic Reddit delivery cancelled by the global safety circuit.'
  where kind = 'auto_send'
    and status in ('pending', 'dispatched')
    and payload ->> 'platform' = 'reddit';

  update public.profiles
  set auto_send_enabled = false,
      auto_send_activated_at = null
  where auto_send_enabled is true
    and 'reddit' = any(auto_send_platforms);

  return v_incident_id;
end;
$$;

create or replace function public.close_reddit_delivery_circuit_v1(
  p_manual_override boolean default false
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requires_manual boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select requires_manual_reset into v_requires_manual
  from public.service_controls
  where control_key = 'reddit_delivery'
  for update;
  if v_requires_manual and not p_manual_override then
    return false;
  end if;

  update public.service_controls
  set
    state = 'closed',
    reason_code = null,
    requires_manual_reset = false,
    opened_at = null,
    last_verified_at = now(),
    updated_at = now()
  where control_key = 'reddit_delivery';

  update public.service_incidents
  set status = 'resolved', resolved_at = now(), updated_at = now()
  where fingerprint = 'global:reddit:delivery_paused'
    and status = 'open';
  return true;
end;
$$;

create or replace function public.resolve_reddit_user_incidents_v1(
  p_user_id uuid
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.service_incidents
  set status = 'resolved', resolved_at = now(), updated_at = now()
  where user_id = p_user_id
    and platform = 'reddit'
    and status = 'open'
    and kind in ('reconnect_required', 'repeated_failures', 'canary_failed');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.claim_incident_email_deliveries_v1(
  p_limit integer default 20
) returns table (
  delivery_id uuid,
  incident_id uuid,
  user_id uuid,
  attempts integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;
  return query
  with candidates as (
    select delivery.id
    from public.incident_deliveries as delivery
    join public.service_incidents as incident on incident.id = delivery.incident_id
    where incident.status = 'open'
      and delivery.delivered_at is null
      and delivery.attempts < 3
      and (
        delivery.status in ('pending', 'failed')
        or (delivery.status = 'sending' and delivery.locked_at < now() - interval '10 minutes')
      )
    order by case incident.severity
      when 'critical' then 0
      when 'warning' then 1
      else 2
    end, delivery.created_at
    limit p_limit
    for update of delivery skip locked
  ), claimed as (
    update public.incident_deliveries as delivery
    set
      status = 'sending',
      attempts = delivery.attempts + 1,
      locked_at = now(),
      updated_at = now()
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.incident_id, delivery.user_id, delivery.attempts
  )
  select claimed.id, claimed.incident_id, claimed.user_id, claimed.attempts
  from claimed;
end;
$$;

create or replace function public.record_incident_email_delivery_v1(
  p_delivery_id uuid,
  p_succeeded boolean,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.incident_deliveries
  set
    status = case when p_succeeded then 'delivered' else 'failed' end,
    delivered_at = case when p_succeeded then now() else null end,
    locked_at = null,
    last_error = case when p_succeeded then null else left(coalesce(p_error, 'delivery failed'), 500) end,
    updated_at = now()
  where id = p_delivery_id;
  return found;
end;
$$;

revoke all on function public.create_reddit_user_incident_v1(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.create_reddit_global_incident_v1(text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.open_reddit_delivery_circuit_v1(text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.close_reddit_delivery_circuit_v1(boolean)
  from public, anon, authenticated;
revoke all on function public.resolve_reddit_user_incidents_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_incident_email_deliveries_v1(integer)
  from public, anon, authenticated;
revoke all on function public.record_incident_email_delivery_v1(uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function public.create_reddit_user_incident_v1(uuid, text, text, text, text, text, text)
  to service_role;
grant execute on function public.create_reddit_global_incident_v1(text, text, text, text, text, text)
  to service_role;
grant execute on function public.open_reddit_delivery_circuit_v1(text, text, text, boolean)
  to service_role;
grant execute on function public.close_reddit_delivery_circuit_v1(boolean)
  to service_role;
grant execute on function public.resolve_reddit_user_incidents_v1(uuid)
  to service_role;
grant execute on function public.claim_incident_email_deliveries_v1(integer)
  to service_role;
grant execute on function public.record_incident_email_delivery_v1(uuid, boolean, text)
  to service_role;

commit;
