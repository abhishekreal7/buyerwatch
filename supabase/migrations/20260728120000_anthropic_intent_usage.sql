begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usage_logs'
      and column_name = 'gemini_calls'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usage_logs'
      and column_name = 'intent_calls'
  ) then
    alter table public.usage_logs rename column gemini_calls to intent_calls;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usage_logs'
      and column_name = 'claude_calls'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usage_logs'
      and column_name = 'draft_calls'
  ) then
    alter table public.usage_logs rename column claude_calls to draft_calls;
  end if;
end;
$$;

create or replace function increment_usage_if_under_limit(
  p_user_id uuid,
  p_service text,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into usage_logs (user_id, date)
  values (p_user_id, current_date)
  on conflict (user_id, date) do nothing;

  if p_service = 'intent' then
    select intent_calls into current_count
    from usage_logs
    where user_id = p_user_id and date = current_date
    for update;

    if current_count >= p_limit then return false; end if;

    update usage_logs
    set intent_calls = intent_calls + 1
    where user_id = p_user_id and date = current_date;
  elsif p_service = 'draft' then
    select draft_calls into current_count
    from usage_logs
    where user_id = p_user_id and date = current_date
    for update;

    if current_count >= p_limit then return false; end if;

    update usage_logs
    set draft_calls = draft_calls + 1
    where user_id = p_user_id and date = current_date;
  else
    raise exception 'unsupported usage service';
  end if;

  return true;
end;
$$;

revoke all on function increment_usage_if_under_limit(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function increment_usage_if_under_limit(uuid, text, integer)
  to service_role;

create or replace function reserve_monthly_draft(
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
  if auth.role() <> 'service_role'
    and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update profiles
  set
    draft_month = v_month,
    draft_count = case when draft_month = v_month then draft_count + 1 else 1 end
  where id = p_user_id
    and (draft_month is distinct from v_month or draft_count < p_limit)
  returning draft_count into v_count;

  if v_count is not null then
    insert into usage_logs (user_id, date, draft_calls)
    values (p_user_id, current_date, 1)
    on conflict (user_id, date)
    do update set draft_calls = usage_logs.draft_calls + 1;
  end if;

  return v_count is not null;
end;
$$;

revoke all on function reserve_monthly_draft(uuid, integer)
  from public, anon;
grant execute on function reserve_monthly_draft(uuid, integer)
  to authenticated, service_role;

commit;
