-- Align Starter/free keyword limits with app code (5 rules) and harden
-- add-on credit grants so the same provider payment cannot be credited twice.

-- ---------------------------------------------------------------------------
-- 1. Keyword plan limits: free/Starter = 5 (was 1)
-- Keep in sync with src/lib/plan-limits.ts PLAN_LIMITS
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
  v_limit := case v_plan when 'growth' then 50 when 'pro' then 10 else 5 end;

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
  v_limit := case v_plan when 'growth' then 50 when 'pro' then 10 else 5 end;
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

-- ---------------------------------------------------------------------------
-- 2. Add-on credits: de-dupe by provider payment + add-on type
-- ---------------------------------------------------------------------------

-- Backfill any rows missing a payment id so the unique index can be enforced.
update public.billing_addon_credits
set provider_payment_id = provider_event_id
where provider_payment_id is null or provider_payment_id = '';

alter table public.billing_addon_credits
  alter column provider_payment_id set not null;

-- If the same payment was already credited more than once (pre-fix), keep the
-- earliest row and drop later duplicates so the unique index can be created.
delete from public.billing_addon_credits bac
using public.billing_addon_credits older
where bac.provider_payment_id = older.provider_payment_id
  and bac.addon_type = older.addon_type
  and bac.id <> older.id
  and (
    bac.created_at > older.created_at
    or (bac.created_at = older.created_at and bac.id > older.id)
  );

create unique index if not exists billing_addon_credits_payment_addon_uidx
  on public.billing_addon_credits (provider_payment_id, addon_type);

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

  -- Event-level de-dupe (same webhook delivery / retry).
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

  -- Payment-level de-dupe: multiple successful events for one payment must
  -- grant credits only once per add-on type.
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
