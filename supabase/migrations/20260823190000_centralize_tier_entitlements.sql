-- BuyerWatch tier contract (must mirror src/lib/plan-limits.ts):
-- free     1 rule / 1 target / Reddit + Bluesky
-- starter  5 rules / 2 targets / Reddit + Bluesky
-- pro     10 rules / 3 targets / Reddit + Bluesky + X
-- growth  50 rules / 6 targets / Reddit + Bluesky + X
--
-- This is deliberately enforced in Postgres as well as the application API.
-- Browser-side Supabase writes and race conditions must not be able to create
-- monitoring capacity a customer has not purchased.

create or replace function public.tier_keyword_limit(p_plan text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'growth' then 50
    when 'pro' then 10
    when 'starter' then 5
    else 1
  end
$$;

create or replace function public.tier_target_limit(p_plan text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'growth' then 6
    when 'pro' then 3
    when 'starter' then 2
    else 1
  end
$$;

create or replace function public.tier_allows_platform(p_plan text, p_platform text)
returns boolean
language sql
immutable
as $$
  select case
    when p_platform in ('reddit', 'bluesky') then true
    when p_platform = 'x' and p_plan in ('pro', 'growth') then true
    else false
  end
$$;

create or replace function public.enforce_keyword_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text;
  v_rule_limit integer;
  v_target_limit integer;
  v_active_rules integer;
  v_active_targets integer;
  v_target_is_new boolean;
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> new.user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Pausing an existing rule can never add capacity. The user ID itself is
  -- immutable in normal flows, but keep this safe for service-side changes.
  if tg_op = 'UPDATE' and new.is_active = false then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select plan into v_plan from public.profiles where id = new.user_id;
  v_plan := coalesce(v_plan, 'free');
  v_rule_limit := public.tier_keyword_limit(v_plan);
  v_target_limit := public.tier_target_limit(v_plan);

  if not public.tier_allows_platform(v_plan, new.platform) then
    raise exception 'platform is not included in this plan' using errcode = 'P0001';
  end if;

  select count(*) into v_active_rules
  from public.keywords
  where user_id = new.user_id
    and is_active = true
    and (tg_op = 'INSERT' or id <> new.id);
  if v_active_rules >= v_rule_limit then
    raise exception 'keyword plan limit reached' using errcode = 'P0001';
  end if;

  select not exists (
    select 1 from public.keywords
    where user_id = new.user_id
      and is_active = true
      and platform = new.platform
      and lower(target) = lower(new.target)
      and (tg_op = 'INSERT' or id <> new.id)
  ) into v_target_is_new;
  if v_target_is_new then
    select count(distinct (platform, lower(target))) into v_active_targets
    from public.keywords
    where user_id = new.user_id and is_active = true;
    if v_active_targets >= v_target_limit then
      raise exception 'monitored community plan limit reached' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists keywords_enforce_plan_limit on public.keywords;
create trigger keywords_enforce_plan_limit
before insert or update of user_id, is_active, platform, target on public.keywords
for each row execute function public.enforce_keyword_plan_limit();

-- Atomic onboarding has to apply the same platform, rule, and target checks
-- before the bulk insert; triggers then remain the final concurrency guard.
create or replace function public.complete_onboarding(
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
  v_rule_limit integer;
  v_target_limit integer;
  v_existing integer;
  v_requested integer;
  v_targets integer;
  v_inserted jsonb;
begin
  if v_user_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_keywords) is distinct from 'array' then
    raise exception 'keywords must be an array' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  insert into public.profiles (id, business_name, business_description, business_url, business_type, writing_style, reddit_username)
  values (v_user_id, p_business_name, p_business_description, p_business_url, p_business_type, p_writing_style, nullif(p_reddit_username, ''))
  on conflict (id) do update set
    business_name = excluded.business_name, business_description = excluded.business_description,
    business_url = excluded.business_url, business_type = excluded.business_type,
    writing_style = excluded.writing_style, reddit_username = excluded.reddit_username;

  select coalesce(plan, 'free') into v_plan from public.profiles where id = v_user_id for update;
  v_rule_limit := public.tier_keyword_limit(v_plan);
  v_target_limit := public.tier_target_limit(v_plan);
  select count(*) into v_existing from public.keywords where user_id = v_user_id and is_active = true;
  v_requested := jsonb_array_length(p_keywords);
  if v_existing + v_requested > v_rule_limit then
    raise exception 'keyword plan limit reached' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_keywords) as item(term text, platform text, target text)
    where trim(coalesce(item.term, '')) = '' or trim(coalesce(item.target, '')) = ''
      or not public.tier_allows_platform(v_plan, item.platform)
  ) then raise exception 'invalid keyword configuration' using errcode = '22023'; end if;
  -- Count only requested targets that are not already active. This preserves
  -- the target contract when onboarding is resumed or called a second time.
  select count(*) into v_targets
  from (
    select distinct item.platform, lower(trim(item.target)) as target_key
    from jsonb_to_recordset(p_keywords) as item(term text, platform text, target text)
  ) requested
  where not exists (
    select 1 from public.keywords existing
    where existing.user_id = v_user_id
      and existing.is_active = true
      and existing.platform = requested.platform
      and lower(existing.target) = requested.target_key
  );
  if (
    select count(distinct (platform, lower(target)))
    from public.keywords
    where user_id = v_user_id and is_active = true
  ) + v_targets > v_target_limit then
    raise exception 'monitored community plan limit reached' using errcode = 'P0001';
  end if;

  with inserted as (
    insert into public.keywords (user_id, term, platform, target, is_active)
    select v_user_id, trim(item.term), item.platform, trim(item.target), true
    from jsonb_to_recordset(p_keywords) as item(term text, platform text, target text)
    returning id, term, platform, target
  ) select coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb) into v_inserted from inserted;
  return v_inserted;
end;
$$;

-- Billing events are the sole source of active plan state. Every applied tier
-- change immediately recalculates active rules, including a paid downgrade.
create or replace function public.apply_billing_subscription_event_v2(
  p_event_id text, p_event_type text, p_user_id uuid, p_subscription_id text,
  p_customer_id text, p_plan text, p_provider_status text, p_product_id text,
  p_period_ends_at timestamptz, p_event_at timestamptz
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted text;
  v_current_subscription text;
  v_current_updated_at timestamptz;
  v_effective_plan text;
  v_rule_limit integer;
  v_target_limit integer;
  v_is_active boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_event_id is null or p_event_id = '' or p_subscription_id is null or p_subscription_id = ''
    or p_product_id is null or p_product_id = ''
    or p_provider_status not in ('pending', 'active', 'on_hold', 'cancelled', 'failed', 'expired')
    or p_plan not in ('free', 'starter', 'pro', 'growth') then
    raise exception 'invalid billing event' using errcode = '22023';
  end if;
  v_is_active := p_provider_status = 'active' and p_plan in ('starter', 'pro', 'growth');
  insert into public.billing_webhook_events (provider_event_id, event_type, user_id, subscription_id, provider_status, product_id, event_at)
  values (p_event_id, p_event_type, p_user_id, p_subscription_id, p_provider_status, p_product_id, p_event_at)
  on conflict (provider_event_id) do nothing returning provider_event_id into v_inserted;
  if v_inserted is null then return 'duplicate'; end if;

  select billing_subscription_id, billing_updated_at into v_current_subscription, v_current_updated_at
  from public.profiles where id = p_user_id for update;
  if not found then raise exception 'profile not found' using errcode = 'P0002'; end if;
  if v_current_updated_at is not null and p_event_at < v_current_updated_at then
    update public.billing_webhook_events set processed_at = now() where provider_event_id = p_event_id;
    return 'stale';
  end if;
  if v_current_subscription is not null and v_current_subscription is distinct from p_subscription_id
    -- Only a newly activated subscription may replace a different current
    -- subscription. A delayed plan_changed event always belongs to the
    -- existing subscription and must never resurrect old access.
    and p_event_type <> 'subscription.active' then
    update public.billing_webhook_events set processed_at = now() where provider_event_id = p_event_id;
    return 'stale_subscription';
  end if;

  v_effective_plan := case when v_is_active then p_plan else 'free' end;
  update public.profiles set
    plan = v_effective_plan,
    auto_send_enabled = case when v_is_active and public.tier_allows_platform(v_effective_plan, 'reddit') and v_effective_plan in ('pro', 'growth') then auto_send_enabled else false end,
    billing_subscription_id = p_subscription_id,
    billing_customer_id = coalesce(p_customer_id, billing_customer_id),
    billing_status = p_provider_status, billing_product_id = p_product_id,
    billing_period_ends_at = p_period_ends_at, billing_updated_at = p_event_at
  where id = p_user_id;

  v_rule_limit := public.tier_keyword_limit(v_effective_plan);
  v_target_limit := public.tier_target_limit(v_effective_plan);
  with ranked_targets as (
    select platform, lower(target) as target_key,
      row_number() over (order by max(updated_at) desc, platform, lower(target)) as target_position
    from public.keywords
    where user_id = p_user_id
      and is_active = true
      and public.tier_allows_platform(v_effective_plan, platform)
    group by platform, lower(target)
  ), ranked_rules as (
    select k.id, row_number() over (order by k.updated_at desc, k.created_at desc, k.id) as rule_position
    from public.keywords k
    join ranked_targets t on t.platform = k.platform and t.target_key = lower(k.target)
    where k.user_id = p_user_id
      and k.is_active = true
      and t.target_position <= v_target_limit
      and public.tier_allows_platform(v_effective_plan, k.platform)
  ) update public.keywords k
  set is_active = coalesce(r.rule_position <= v_rule_limit, false)
  from ranked_rules r
  where k.id = r.id;
  update public.keywords set is_active = false
  where user_id = p_user_id and id not in (
    select id from public.keywords k2
    where k2.user_id = p_user_id and k2.is_active = true
  );

  -- Do not leave a lower-tier account with a still-working attribution link
  -- inside an unsent draft after a downgrade. Historical sent-reply links are
  -- retained for reporting and redirect continuity.
  if v_effective_plan not in ('pro', 'growth') then
    delete from public.reply_attribution
    where user_id = p_user_id
      and thread_id in (
        select id from public.monitored_threads
        where user_id = p_user_id
          and status in ('pending', 'drafted', 'needs_manual_reply')
      );
    update public.monitored_threads
    set tracking_sid = null
    where user_id = p_user_id
      and status in ('pending', 'drafted', 'needs_manual_reply');
  end if;

  update public.billing_webhook_events set processed_at = now() where provider_event_id = p_event_id;
  return 'applied';
end;
$$;

revoke all on function public.complete_onboarding(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_onboarding(text, text, text, text, text, text, jsonb) to authenticated;
revoke all on function public.apply_billing_subscription_event_v2(text, text, uuid, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_billing_subscription_event_v2(text, text, uuid, text, text, text, text, text, timestamptz, timestamptz) to service_role;
