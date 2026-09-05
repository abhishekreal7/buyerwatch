-- Idempotent AI settlement operations and fail-closed spend reservations.

create table if not exists public.ai_settlement_events (
  id text primary key check (length(id) between 8 and 200),
  operation text not null check (
    operation in ('record_usage', 'release_spend', 'release_draft_allowance')
  ),
  reservation_id uuid not null,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.ai_settlement_events enable row level security;
revoke all on table public.ai_settlement_events from public, anon, authenticated;
grant select, insert on table public.ai_settlement_events to service_role;

create or replace function public.apply_ai_settlement_v1(
  p_id text,
  p_operation text,
  p_reservation_id uuid,
  p_user_id uuid,
  p_model text default '',
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_cost_microusd bigint default 0
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(coalesce(p_id, '')) < 8
    or length(p_id) > 200
    or p_operation not in ('record_usage', 'release_spend', 'release_draft_allowance')
    or p_input_tokens < 0
    or p_output_tokens < 0
    or p_cost_microusd < 0 then
    raise exception 'invalid AI settlement' using errcode = '22023';
  end if;
  if p_operation = 'release_draft_allowance' and p_user_id is null then
    raise exception 'user is required for allowance release' using errcode = '22023';
  end if;

  insert into public.ai_settlement_events (id, operation, reservation_id, user_id)
  values (p_id, p_operation, p_reservation_id, p_user_id)
  on conflict (id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return true;
  end if;

  if p_operation = 'record_usage' then
    if public.record_ai_usage(
      p_reservation_id,
      coalesce(p_model, ''),
      p_input_tokens,
      p_output_tokens,
      p_cost_microusd
    ) is distinct from true then
      raise exception 'AI usage reservation could not be reconciled';
    end if;
  elsif p_operation = 'release_spend' then
    perform public.release_ai_spend(p_reservation_id);
  else
    perform public.release_monthly_draft(p_user_id);
  end if;

  return true;
end;
$$;

revoke all on function public.apply_ai_settlement_v1(
  text, text, uuid, uuid, text, bigint, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.apply_ai_settlement_v1(
  text, text, uuid, uuid, text, bigint, bigint, bigint
) to service_role;

-- Reservations remain part of the cap until an explicit idempotent settlement
-- reconciles or releases them. Age alone must never make real spend disappear.
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

  perform pg_advisory_xact_lock(hashtext('ai-spend-global'), hashtext(v_month::text));
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(v_month::text));

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
    and created_at >= v_month;

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
    and created_at >= v_month;

  if v_global_actual + v_global_pending + p_estimated_microusd
    > p_global_monthly_limit_microusd then
    return null;
  end if;

  insert into public.ai_spend_reservations (user_id, purpose, estimated_microusd)
  values (p_user_id, p_purpose, p_estimated_microusd)
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

revoke all on function public.reserve_ai_spend(uuid, text, bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_spend(uuid, text, bigint, bigint, bigint)
  to service_role;

