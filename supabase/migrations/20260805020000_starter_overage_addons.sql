create table if not exists public.billing_addon_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_event_id text not null unique,
  provider_payment_id text,
  product_id text,
  addon_type text not null check (addon_type in ('signals', 'drafts')),
  quantity integer not null default 1 check (quantity > 0),
  credits integer not null check (credits > 0),
  usage_month date not null default date_trunc('month', current_date)::date,
  event_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists billing_addon_credits_user_month_idx
  on public.billing_addon_credits (user_id, usage_month, addon_type);

alter table public.billing_addon_credits enable row level security;

create policy "billing addon credits select own"
  on public.billing_addon_credits
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.billing_addon_credits from public, anon, authenticated;
grant select on public.billing_addon_credits to authenticated;

create or replace function public.apply_billing_addon_event(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_payment_id text,
  p_product_id text,
  p_addon_type text,
  p_quantity integer,
  p_credits integer,
  p_event_at timestamptz
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted text;
  v_usage_month date := date_trunc('month', coalesce(p_event_at, now()))::date;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event_id is null or p_event_id = ''
    or p_user_id is null
    or p_addon_type not in ('signals', 'drafts')
    or p_quantity < 1
    or p_credits < 1
    or p_event_at is null then
    raise exception 'invalid billing add-on event' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  insert into public.billing_webhook_events (
    provider_event_id, event_type, user_id, subscription_id,
    provider_status, product_id, event_at
  ) values (
    p_event_id, p_event_type, p_user_id, p_payment_id,
    'active', p_product_id, p_event_at
  )
  on conflict (provider_event_id) do nothing
  returning provider_event_id into v_inserted;

  if v_inserted is null then return 'duplicate'; end if;

  insert into public.billing_addon_credits (
    user_id, provider_event_id, provider_payment_id, product_id,
    addon_type, quantity, credits, usage_month, event_at
  ) values (
    p_user_id, p_event_id, p_payment_id, p_product_id,
    p_addon_type, p_quantity, p_credits, v_usage_month, p_event_at
  );

  update public.billing_webhook_events
  set processed_at = now()
  where provider_event_id = p_event_id;

  return 'applied';
end;
$$;

revoke all on function public.apply_billing_addon_event(
  text, text, uuid, text, text, text, integer, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_billing_addon_event(
  text, text, uuid, text, text, text, integer, integer, timestamptz
) to service_role;

create or replace function public.monthly_addon_credit_total(
  p_user_id uuid,
  p_addon_type text,
  p_month date default date_trunc('month', current_date)::date
) returns integer
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(sum(credits), 0)::integer
  from public.billing_addon_credits
  where user_id = p_user_id
    and addon_type = p_addon_type
    and usage_month = p_month;
$$;

revoke all on function public.monthly_addon_credit_total(uuid, text, date)
  from public, anon, authenticated;
grant execute on function public.monthly_addon_credit_total(uuid, text, date)
  to service_role;

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
  v_effective_limit integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_limit < 1 then
    raise exception 'invalid signal limit' using errcode = '22023';
  end if;

  v_effective_limit := p_limit + public.monthly_addon_credit_total(p_user_id, 'signals', v_month);

  update public.profiles
  set
    signal_month = v_month,
    signal_count = case when signal_month = v_month then signal_count + 1 else 1 end
  where id = p_user_id
    and (signal_month is distinct from v_month or signal_count < v_effective_limit)
  returning signal_count into v_count;

  return v_count is not null;
end;
$$;

revoke all on function public.reserve_monthly_signal(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_monthly_signal(uuid, integer)
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
  v_effective_limit integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_limit < 1 then
    raise exception 'invalid draft limit' using errcode = '22023';
  end if;

  v_effective_limit := p_limit + public.monthly_addon_credit_total(p_user_id, 'drafts', v_month);

  update public.profiles
  set
    draft_month = v_month,
    draft_count = case when draft_month = v_month then draft_count + 1 else 1 end
  where id = p_user_id
    and (draft_month is distinct from v_month or draft_count < v_effective_limit)
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

