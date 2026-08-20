-- Revoke one-time add-on credits after a successful refund. The event ledger
-- also makes refund-before-payment delivery safe: a late payment webhook sees
-- the recorded refund and never grants credits.

alter table public.billing_addon_credits
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_event_id text;

create unique index if not exists billing_addon_credits_refund_event_uidx
  on public.billing_addon_credits (refund_event_id)
  where refund_event_id is not null;

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
    and usage_month = p_month
    and refunded_at is null;
$$;

revoke all on function public.monthly_addon_credit_total(uuid, text, date)
  from public, anon, authenticated;
grant execute on function public.monthly_addon_credit_total(uuid, text, date)
  to service_role;

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
  v_credit_id uuid;
  v_usage_month date := date_trunc('month', coalesce(p_event_at, now()))::date;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event_id is null or p_event_id = ''
    or p_user_id is null
    or p_payment_id is null or p_payment_id = ''
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

  if exists (
    select 1
    from public.billing_webhook_events
    where event_type = 'refund.succeeded'
      and subscription_id = p_payment_id
  ) then
    update public.billing_webhook_events
    set processed_at = now()
    where provider_event_id = p_event_id;
    return 'refunded';
  end if;

  insert into public.billing_addon_credits (
    user_id, provider_event_id, provider_payment_id, product_id,
    addon_type, quantity, credits, usage_month, event_at
  ) values (
    p_user_id, p_event_id, p_payment_id, p_product_id,
    p_addon_type, p_quantity, p_credits, v_usage_month, p_event_at
  )
  on conflict (provider_payment_id, addon_type) do nothing
  returning id into v_credit_id;

  update public.billing_webhook_events
  set processed_at = now()
  where provider_event_id = p_event_id;

  if v_credit_id is null then return 'duplicate'; end if;
  return 'applied';
end;
$$;

revoke all on function public.apply_billing_addon_event(
  text, text, uuid, text, text, text, integer, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_billing_addon_event(
  text, text, uuid, text, text, text, integer, integer, timestamptz
) to service_role;

create or replace function public.apply_billing_addon_refund_event(
  p_event_id text,
  p_event_type text,
  p_payment_id text,
  p_event_at timestamptz
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted text;
  v_user_id uuid;
  v_updated integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event_id is null or p_event_id = ''
    or p_event_type <> 'refund.succeeded'
    or p_payment_id is null or p_payment_id = ''
    or p_event_at is null then
    raise exception 'invalid billing add-on refund event' using errcode = '22023';
  end if;

  select user_id into v_user_id
  from public.billing_addon_credits
  where provider_payment_id = p_payment_id
  order by created_at
  limit 1;

  insert into public.billing_webhook_events (
    provider_event_id, event_type, user_id, subscription_id,
    provider_status, event_at
  ) values (
    p_event_id, p_event_type, v_user_id, p_payment_id,
    'cancelled', p_event_at
  )
  on conflict (provider_event_id) do nothing
  returning provider_event_id into v_inserted;

  if v_inserted is null then return 'duplicate'; end if;

  update public.billing_addon_credits
  set refunded_at = p_event_at,
      refund_event_id = p_event_id
  where provider_payment_id = p_payment_id
    and refunded_at is null;
  get diagnostics v_updated = row_count;

  update public.billing_webhook_events
  set processed_at = now()
  where provider_event_id = p_event_id;

  if v_updated = 0 then return 'pending_payment'; end if;
  return 'applied';
end;
$$;

revoke all on function public.apply_billing_addon_refund_event(
  text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_billing_addon_refund_event(
  text, text, text, timestamptz
) to service_role;
