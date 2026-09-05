-- Paid entitlements must never be inferred from profiles.plan alone.
-- Repair legacy/impossible rows first, then make that state unrepresentable.

update public.profiles
set
  plan = 'free',
  auto_send_enabled = false
where plan <> 'free'
  and (
    billing_status <> 'active'
    or billing_subscription_id is null
    or btrim(billing_subscription_id) = ''
  );

alter table public.profiles
  drop constraint if exists profiles_paid_plan_requires_active_subscription;

alter table public.profiles
  add constraint profiles_paid_plan_requires_active_subscription
  check (
    plan = 'free'
    or (
      billing_status = 'active'
      and billing_subscription_id is not null
      and btrim(billing_subscription_id) <> ''
    )
  );

comment on constraint profiles_paid_plan_requires_active_subscription on public.profiles is
  'A paid plan is an entitlement only when an active provider subscription is attached.';
