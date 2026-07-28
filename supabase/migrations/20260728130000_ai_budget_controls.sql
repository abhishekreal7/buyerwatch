begin;

alter table public.profiles
  add column if not exists signal_month date,
  add column if not exists signal_count integer not null default 0;

alter table public.usage_logs
  add column if not exists intent_input_tokens bigint not null default 0,
  add column if not exists intent_output_tokens bigint not null default 0,
  add column if not exists intent_cost_microusd bigint not null default 0,
  add column if not exists intent_model text,
  add column if not exists draft_input_tokens bigint not null default 0,
  add column if not exists draft_output_tokens bigint not null default 0,
  add column if not exists draft_cost_microusd bigint not null default 0,
  add column if not exists draft_model text;

create table if not exists public.ai_spend_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (purpose in ('intent', 'draft')),
  estimated_microusd bigint not null check (estimated_microusd > 0),
  status text not null default 'pending'
    check (status in ('pending', 'reconciled', 'released')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_spend_reservations_pending_idx
  on public.ai_spend_reservations (created_at, user_id)
  where status = 'pending';

alter table public.ai_spend_reservations enable row level security;
revoke all on table public.ai_spend_reservations
  from public, anon, authenticated;

create or replace function public.reserve_monthly_signal(
  p_user_id uuid,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', current_date)::date;
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_limit < 1 then
    raise exception 'invalid signal limit' using errcode = '22023';
  end if;

  update public.profiles
  set
    signal_month = v_month,
    signal_count = case
      when signal_month = v_month then signal_count + 1
      else 1
    end
  where id = p_user_id
    and (signal_month is distinct from v_month or signal_count < p_limit)
  returning signal_count into v_count;

  return v_count is not null;
end;
$$;

revoke all on function public.reserve_monthly_signal(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_monthly_signal(uuid, integer)
  to service_role;

create or replace function public.release_monthly_signal(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.profiles
  set signal_count = greatest(signal_count - 1, 0)
  where id = p_user_id
    and signal_month = date_trunc('month', current_date)::date;
end;
$$;

revoke all on function public.release_monthly_signal(uuid)
  from public, anon, authenticated;
grant execute on function public.release_monthly_signal(uuid)
  to service_role;

create or replace function public.reserve_monthly_draft(
  p_user_id uuid,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', current_date)::date;
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_limit < 1 then
    raise exception 'invalid draft limit' using errcode = '22023';
  end if;

  update public.profiles
  set
    draft_month = v_month,
    draft_count = case
      when draft_month = v_month then draft_count + 1
      else 1
    end
  where id = p_user_id
    and (draft_month is distinct from v_month or draft_count < p_limit)
  returning draft_count into v_count;

  if v_count is not null then
    insert into public.usage_logs (user_id, date, draft_calls)
    values (p_user_id, current_date, 1)
    on conflict (user_id, date)
    do update set draft_calls = public.usage_logs.draft_calls + 1;
  end if;

  return v_count is not null;
end;
$$;

revoke all on function public.reserve_monthly_draft(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_monthly_draft(uuid, integer)
  to service_role;

create or replace function public.release_monthly_draft(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.profiles
  set draft_count = greatest(draft_count - 1, 0)
  where id = p_user_id
    and draft_month = date_trunc('month', current_date)::date;

  update public.usage_logs
  set draft_calls = greatest(draft_calls - 1, 0)
  where user_id = p_user_id
    and date = current_date;
end;
$$;

revoke all on function public.release_monthly_draft(uuid)
  from public, anon, authenticated;
grant execute on function public.release_monthly_draft(uuid)
  to service_role;

create or replace function public.reserve_ai_spend(
  p_user_id uuid,
  p_purpose text,
  p_estimated_microusd bigint,
  p_user_monthly_limit_microusd bigint,
  p_global_monthly_limit_microusd bigint
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', current_date)::date;
  v_user_actual bigint;
  v_user_pending bigint;
  v_global_actual bigint;
  v_global_pending bigint;
  v_reservation_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_purpose not in ('intent', 'draft')
    or p_estimated_microusd < 1
    or p_user_monthly_limit_microusd < 1
    or p_global_monthly_limit_microusd < 1 then
    raise exception 'invalid AI spend reservation' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  -- Every reservation takes the global lock first, then the customer lock.
  -- This keeps concurrent workers from overspending either cap.
  perform pg_advisory_xact_lock(
    hashtext('ai-spend-global'),
    hashtext(v_month::text)
  );
  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext(v_month::text)
  );

  select coalesce(sum(intent_cost_microusd + draft_cost_microusd), 0)
  into v_user_actual
  from public.usage_logs
  where user_id = p_user_id
    and date >= v_month
    and date < (v_month + interval '1 month')::date;

  select coalesce(sum(estimated_microusd), 0)
  into v_user_pending
  from public.ai_spend_reservations
  where user_id = p_user_id
    and status = 'pending'
    and created_at >= v_month
    and created_at >= now() - interval '10 minutes';

  if v_user_actual + v_user_pending + p_estimated_microusd
    > p_user_monthly_limit_microusd then
    return null;
  end if;

  select coalesce(sum(intent_cost_microusd + draft_cost_microusd), 0)
  into v_global_actual
  from public.usage_logs
  where date >= v_month
    and date < (v_month + interval '1 month')::date;

  select coalesce(sum(estimated_microusd), 0)
  into v_global_pending
  from public.ai_spend_reservations
  where status = 'pending'
    and created_at >= v_month
    and created_at >= now() - interval '10 minutes';

  if v_global_actual + v_global_pending + p_estimated_microusd
    > p_global_monthly_limit_microusd then
    return null;
  end if;

  insert into public.ai_spend_reservations (
    user_id,
    purpose,
    estimated_microusd
  )
  values (
    p_user_id,
    p_purpose,
    p_estimated_microusd
  )
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

revoke all on function public.reserve_ai_spend(uuid, text, bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_spend(uuid, text, bigint, bigint, bigint)
  to service_role;

create or replace function public.record_ai_usage(
  p_reservation_id uuid,
  p_model text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_microusd bigint
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_purpose text;
  v_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_input_tokens < 0 or p_output_tokens < 0 or p_cost_microusd < 0 then
    raise exception 'invalid AI usage' using errcode = '22023';
  end if;

  select user_id, purpose, status
  into v_user_id, v_purpose, v_status
  from public.ai_spend_reservations
  where id = p_reservation_id
  for update;

  if v_user_id is null then
    raise exception 'AI spend reservation not found' using errcode = 'P0002';
  end if;
  if v_status = 'reconciled' then
    return true;
  end if;
  if v_status <> 'pending' then
    return false;
  end if;

  insert into public.usage_logs (
    user_id,
    date,
    intent_input_tokens,
    intent_output_tokens,
    intent_cost_microusd,
    intent_model,
    draft_input_tokens,
    draft_output_tokens,
    draft_cost_microusd,
    draft_model
  )
  values (
    v_user_id,
    current_date,
    case when v_purpose = 'intent' then p_input_tokens else 0 end,
    case when v_purpose = 'intent' then p_output_tokens else 0 end,
    case when v_purpose = 'intent' then p_cost_microusd else 0 end,
    case when v_purpose = 'intent' then nullif(p_model, '') else null end,
    case when v_purpose = 'draft' then p_input_tokens else 0 end,
    case when v_purpose = 'draft' then p_output_tokens else 0 end,
    case when v_purpose = 'draft' then p_cost_microusd else 0 end,
    case when v_purpose = 'draft' then nullif(p_model, '') else null end
  )
  on conflict (user_id, date) do update set
    intent_input_tokens = public.usage_logs.intent_input_tokens
      + case when v_purpose = 'intent' then p_input_tokens else 0 end,
    intent_output_tokens = public.usage_logs.intent_output_tokens
      + case when v_purpose = 'intent' then p_output_tokens else 0 end,
    intent_cost_microusd = public.usage_logs.intent_cost_microusd
      + case when v_purpose = 'intent' then p_cost_microusd else 0 end,
    intent_model = case
      when v_purpose = 'intent' then nullif(p_model, '')
      else public.usage_logs.intent_model
    end,
    draft_input_tokens = public.usage_logs.draft_input_tokens
      + case when v_purpose = 'draft' then p_input_tokens else 0 end,
    draft_output_tokens = public.usage_logs.draft_output_tokens
      + case when v_purpose = 'draft' then p_output_tokens else 0 end,
    draft_cost_microusd = public.usage_logs.draft_cost_microusd
      + case when v_purpose = 'draft' then p_cost_microusd else 0 end,
    draft_model = case
      when v_purpose = 'draft' then nullif(p_model, '')
      else public.usage_logs.draft_model
    end;

  update public.ai_spend_reservations
  set status = 'reconciled', completed_at = now()
  where id = p_reservation_id;

  return true;
end;
$$;

revoke all on function public.record_ai_usage(uuid, text, bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, text, bigint, bigint, bigint)
  to service_role;

create or replace function public.release_ai_spend(
  p_reservation_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.ai_spend_reservations
  set status = 'released', completed_at = now()
  where id = p_reservation_id
    and status = 'pending';
end;
$$;

revoke all on function public.release_ai_spend(uuid)
  from public, anon, authenticated;
grant execute on function public.release_ai_spend(uuid)
  to service_role;

commit;
