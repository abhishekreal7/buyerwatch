begin;

-- Starter includes the same guarded, earned automation workflow as the higher
-- paid tiers. Safety gates remain unchanged: explicit activation, ten verified
-- reviews, bounded daily delivery, selected connected platforms, and the
-- confidence/content-policy checks all still apply.
create or replace function public.tier_allows_auto_send(p_plan text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_plan, 'free')) in ('starter', 'pro', 'growth')
$$;

create or replace function public.enforce_automation_plan_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.tier_allows_auto_send(new.plan) then
    new.auto_send_enabled := false;
    new.auto_send_activated_at := null;
  elsif tg_op = 'UPDATE'
    and old.auto_send_enabled is true
    and new.auto_send_enabled is false
    and new.billing_updated_at is distinct from old.billing_updated_at
    and new.billing_status = 'active' then
    -- The billing event function predates Starter automation and defensively
    -- clears the flag for lower tiers. Preserve an already-earned opt-in only
    -- for an active eligible subscription event; ordinary user disable actions
    -- do not change billing_updated_at and therefore remain authoritative.
    new.auto_send_enabled := true;
  end if;
  return new;
end;
$$;

revoke all on function public.tier_allows_auto_send(text)
  from public, anon, authenticated;
grant execute on function public.tier_allows_auto_send(text)
  to service_role;

revoke all on function public.enforce_automation_plan_entitlement()
  from public, anon, authenticated;

-- Existing Starter accounts remain opt-in. This migration deliberately does
-- not enable automation for anyone automatically.
update public.profiles
set auto_send_enabled = false,
    auto_send_activated_at = null
where auto_send_enabled is true
  and lower(coalesce(plan, 'free')) not in ('starter', 'pro', 'growth');

commit;
