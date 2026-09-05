-- Align live usage permissions with the bootstrap schema and make the X-spend
-- mutation explicitly service-role-only rather than relying on table grants.
revoke insert, update, delete on table public.usage_logs from authenticated;
grant select on table public.usage_logs to authenticated;

create or replace function public.increment_x_spend_if_under_limit(
  p_user_id uuid,
  p_cost_cents integer,
  p_daily_limit_cents integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_spend integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_cost_cents < 0 or p_daily_limit_cents < 0 then
    raise exception 'invalid X spend limit' using errcode = '22023';
  end if;

  insert into public.usage_logs (user_id, date)
  values (p_user_id, current_date)
  on conflict (user_id, date) do nothing;

  select x_spend_cents into current_spend
  from public.usage_logs
  where user_id = p_user_id and date = current_date
  for update;

  if current_spend + p_cost_cents > p_daily_limit_cents then
    return false;
  end if;

  update public.usage_logs
  set x_spend_cents = x_spend_cents + p_cost_cents
  where user_id = p_user_id and date = current_date;
  return true;
end;
$$;

revoke all on function public.increment_x_spend_if_under_limit(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.increment_x_spend_if_under_limit(uuid, integer, integer)
  to service_role;
