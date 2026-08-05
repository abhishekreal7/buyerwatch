-- Add 'starter' as a paid plan tier to billing and keyword-limit functions.
-- The 'free' tier remains the default for users with no active subscription.
-- 'starter' is the $19/mo paid entry plan.

-- ---------------------------------------------------------------------------
-- 1. apply_billing_subscription_event_v2: accept 'starter' as a valid plan
-- ---------------------------------------------------------------------------
create or replace function public.apply_billing_subscription_event_v2(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_subscription_id text,
  p_customer_id text,
  p_plan text,
  p_provider_status text,
  p_product_id text,
  p_period_ends_at timestamptz,
  p_event_at timestamptz
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted text;
  v_current_subscription text;
  v_current_updated_at timestamptz;
  v_current_plan text;
  v_is_active boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event_id is null or p_event_id = ''
    or p_subscription_id is null or p_subscription_id = ''
    or p_product_id is null or p_product_id = ''
    or p_provider_status not in ('pending', 'active', 'on_hold', 'cancelled', 'failed', 'expired')
    or p_plan not in ('free', 'starter', 'pro', 'growth') then
    raise exception 'invalid billing event' using errcode = '22023';
  end if;

  v_is_active := p_provider_status = 'active' and p_plan in ('starter', 'pro', 'growth');

  insert into public.billing_webhook_events (
    provider_event_id, event_type, user_id, subscription_id,
    provider_status, product_id, event_at
  ) values (
    p_event_id, p_event_type, p_user_id, p_subscription_id,
    p_provider_status, p_product_id, p_event_at
  )
  on conflict (provider_event_id) do nothing
  returning provider_event_id into v_inserted;

  if v_inserted is null then return 'duplicate'; end if;

  select billing_subscription_id, billing_updated_at, plan
  into v_current_subscription, v_current_updated_at, v_current_plan
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if v_current_updated_at is not null and p_event_at < v_current_updated_at then
    update public.billing_webhook_events set processed_at = now()
    where provider_event_id = p_event_id;
    return 'stale';
  end if;
  if v_current_subscription is not null
    and v_current_subscription is distinct from p_subscription_id
    and p_event_type not in ('subscription.active', 'subscription.plan_changed') then
    update public.billing_webhook_events set processed_at = now()
    where provider_event_id = p_event_id;
    return 'stale_subscription';
  end if;

  update public.profiles
  set
    plan = case when v_is_active then p_plan else 'free' end,
    auto_send_enabled = case when v_is_active then auto_send_enabled else false end,
    billing_subscription_id = p_subscription_id,
    billing_customer_id = coalesce(p_customer_id, billing_customer_id),
    billing_status = p_provider_status,
    billing_product_id = p_product_id,
    billing_period_ends_at = p_period_ends_at,
    billing_updated_at = p_event_at
  where id = p_user_id;

  if not v_is_active and v_current_plan <> 'free' then
    with ranked as (
      select id, row_number() over (order by updated_at desc, created_at desc, id) as position
      from public.keywords where user_id = p_user_id
    )
    update public.keywords
    set is_active = ranked.position = 1
    from ranked
    where public.keywords.id = ranked.id;
  end if;

  update public.billing_webhook_events
  set processed_at = now()
  where provider_event_id = p_event_id;
  return 'applied';
end;
$$;

revoke all on function public.apply_billing_subscription_event_v2(
  text, text, uuid, text, text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_billing_subscription_event_v2(
  text, text, uuid, text, text, text, text, text, timestamptz, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- 2. enforce_keyword_plan_limit: recognise 'starter' (limit = 5)
-- ---------------------------------------------------------------------------
create or replace function enforce_keyword_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> new.user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  select plan into v_plan from profiles where id = new.user_id;
  v_limit := case v_plan
    when 'growth' then 50
    when 'pro' then 10
    when 'starter' then 5
    else 5
  end;

  select count(*) into v_count
  from keywords
  where user_id = new.user_id
    and (tg_op = 'INSERT' or id <> new.id);

  if v_count >= v_limit then
    raise exception 'keyword plan limit reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. complete_onboarding: recognise 'starter' (limit = 5)
-- ---------------------------------------------------------------------------
create or replace function complete_onboarding(
  p_business_name text,
  p_business_description text,
  p_business_url text,
  p_business_type text,
  p_writing_style text,
  p_reddit_username text,
  p_keywords jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan text;
  v_limit integer;
  v_existing integer;
  v_requested integer;
  v_inserted jsonb;
begin
  if v_user_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_keywords) is distinct from 'array' then
    raise exception 'keywords must be an array' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  insert into profiles (
    id, business_name, business_description, business_url,
    business_type, writing_style, reddit_username
  ) values (
    v_user_id, p_business_name, p_business_description, p_business_url,
    p_business_type, p_writing_style, nullif(p_reddit_username, '')
  )
  on conflict (id) do update set
    business_name = excluded.business_name,
    business_description = excluded.business_description,
    business_url = excluded.business_url,
    business_type = excluded.business_type,
    writing_style = excluded.writing_style,
    reddit_username = excluded.reddit_username;

  select plan into v_plan from profiles where id = v_user_id for update;
  v_limit := case v_plan
    when 'growth' then 50
    when 'pro' then 10
    when 'starter' then 5
    else 5
  end;
  select count(*) into v_existing from keywords where user_id = v_user_id;
  v_requested := jsonb_array_length(p_keywords);

  if v_existing + v_requested > v_limit then
    raise exception 'keyword plan limit reached' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_keywords) as item(term text, platform text, target text)
    where trim(coalesce(item.term, '')) = ''
      or trim(coalesce(item.target, '')) = ''
      or item.platform not in ('reddit', 'bluesky', 'x')
  ) then
    raise exception 'invalid keyword configuration' using errcode = '22023';
  end if;

  with inserted as (
    insert into keywords (user_id, term, platform, target, is_active)
    select v_user_id, trim(item.term), item.platform, trim(item.target), true
    from jsonb_to_recordset(p_keywords) as item(term text, platform text, target text)
    returning id, term, platform, target
  )
  select coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb)
  into v_inserted from inserted;

  return v_inserted;
end;
$$;

revoke all on function complete_onboarding(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function complete_onboarding(text, text, text, text, text, text, jsonb)
  to authenticated;
