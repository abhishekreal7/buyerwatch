-- Let grandfathered workspaces replace an active target without increasing
-- their legacy target count. Inserts still obey the current tier limit.
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
  v_targets_before integer;
  v_targets_after integer;
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> new.user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Pausing an existing rule only releases capacity.
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

  select count(distinct (platform, lower(target))) into v_targets_before
  from public.keywords
  where user_id = new.user_id and is_active = true;

  select count(*) into v_targets_after
  from (
    select distinct platform, lower(target) as target
    from (
      select platform, target
      from public.keywords
      where user_id = new.user_id
        and is_active = true
        and (tg_op = 'INSERT' or id <> new.id)
      union all
      select new.platform, new.target
      where new.is_active = true
    ) projected
  ) distinct_targets;

  if v_targets_after > v_target_limit and (
    tg_op = 'INSERT' or v_targets_after > v_targets_before
  ) then
    raise exception 'monitored community plan limit reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
