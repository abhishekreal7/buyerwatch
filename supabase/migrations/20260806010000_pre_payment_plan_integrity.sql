-- Align persisted plan constraints and keyword enforcement with the public
-- Free, Starter, Professional, and Growth tiers before accepting payments.

alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'starter', 'pro', 'growth'));

create or replace function public.enforce_keyword_plan_limit()
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

  select plan into v_plan from public.profiles where id = new.user_id;
  v_limit := case v_plan
    when 'growth' then 50
    when 'pro' then 10
    when 'starter' then 5
    else 1
  end;

  select count(*) into v_count
  from public.keywords
  where user_id = new.user_id
    and (tg_op = 'INSERT' or id <> new.id);

  if v_count >= v_limit then
    raise exception 'keyword plan limit reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

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

  insert into public.profiles (
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

  select plan into v_plan from public.profiles where id = v_user_id for update;
  v_limit := case v_plan
    when 'growth' then 50
    when 'pro' then 10
    when 'starter' then 5
    else 1
  end;
  select count(*) into v_existing from public.keywords where user_id = v_user_id;
  v_requested := jsonb_array_length(p_keywords);

  if v_existing + v_requested > v_limit then
    raise exception 'keyword plan limit reached' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_keywords) as item(term text, platform text, target text)
    where trim(coalesce(item.term, '')) = ''
      or trim(coalesce(item.target, '')) = ''
      or item.platform not in ('reddit', 'bluesky')
  ) then
    raise exception 'invalid keyword configuration' using errcode = '22023';
  end if;

  with inserted as (
    insert into public.keywords (user_id, term, platform, target, is_active)
    select v_user_id, trim(item.term), item.platform, trim(item.target), true
    from jsonb_to_recordset(p_keywords) as item(term text, platform text, target text)
    returning id, term, platform, target
  )
  select coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb)
  into v_inserted from inserted;

  return v_inserted;
end;
$$;

revoke all on function public.complete_onboarding(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_onboarding(text, text, text, text, text, text, jsonb)
  to authenticated;

-- Existing free accounts may have inherited the temporary five-keyword limit.
-- Keep the most recently created rule active and pause the remainder.
with ranked as (
  select
    keywords.id,
    row_number() over (
      partition by keywords.user_id
      order by keywords.created_at desc, keywords.id
    ) as position
  from public.keywords
  join public.profiles on profiles.id = keywords.user_id
  where profiles.plan = 'free'
)
update public.keywords
set is_active = ranked.position = 1
from ranked
where public.keywords.id = ranked.id;
