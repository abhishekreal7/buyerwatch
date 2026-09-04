begin;

-- One tightly bounded automatic send lets a card-verified Starter trial user
-- experience the product before the ten-review earned-automation gate. These
-- columns form a durable, auditable state machine; they are never client-owned.
alter table public.profiles
  add column if not exists instant_autopilot_granted_at timestamptz,
  add column if not exists instant_autopilot_grant_event_id text,
  add column if not exists instant_autopilot_activated_at timestamptz,
  add column if not exists instant_autopilot_claimed_at timestamptz,
  add column if not exists instant_autopilot_claim_thread_id uuid references public.monitored_threads(id) on delete set null,
  add column if not exists instant_autopilot_used_at timestamptz;

create unique index if not exists profiles_instant_autopilot_grant_event_idx
  on public.profiles (instant_autopilot_grant_event_id)
  where instant_autopilot_grant_event_id is not null;

create or replace function public.grant_instant_autopilot_trial(
  p_user_id uuid,
  p_event_id text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null or nullif(trim(p_event_id), '') is null then
    raise exception 'invalid instant autopilot grant' using errcode = '22023';
  end if;

  update public.profiles
  set instant_autopilot_granted_at = coalesce(instant_autopilot_granted_at, now()),
      instant_autopilot_grant_event_id = coalesce(instant_autopilot_grant_event_id, p_event_id)
  where id = p_user_id
    and plan = 'starter'
    and billing_status = 'active'
    and instant_autopilot_used_at is null;

  return found;
end;
$$;

-- Same-timing profile triggers run alphabetically. This replacement allows
-- only the signed-webhook-granted Starter trial exception; every normal paid
-- account still needs ten verified reviews.
create or replace function public.enforce_earned_automation_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reviewed integer;
  v_instant_trial boolean;
begin
  if new.auto_send_enabled = true then
    if not public.tier_allows_auto_send(new.plan) then
      raise exception 'earned automation requires an eligible paid plan' using errcode = '22023';
    end if;
    if new.auto_send_activated_at is null then
      raise exception 'earned automation requires explicit activation' using errcode = '22023';
    end if;

    select total_drafts_reviewed into v_reviewed
    from public.user_trust_metrics
    where user_id = new.id;

    v_instant_trial := lower(coalesce(new.plan, 'free')) = 'starter'
      and new.billing_status = 'active'
      and new.instant_autopilot_granted_at is not null
      and new.instant_autopilot_activated_at is not null
      and new.instant_autopilot_used_at is null
      and new.auto_send_threshold >= 90
      and new.auto_send_daily_limit = 1;

    if coalesce(v_reviewed, 0) < 10 and not v_instant_trial then
      raise exception 'earned automation requires ten verified reviews or an unused instant trial' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.claim_instant_autopilot_send(
  p_user_id uuid,
  p_thread_id uuid
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_reviewed integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null or p_thread_id is null then
    raise exception 'invalid instant autopilot claim' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'profile not found' using errcode = 'P0002'; end if;

  select total_drafts_reviewed into v_reviewed
  from public.user_trust_metrics where user_id = p_user_id;
  if coalesce(v_reviewed, 0) >= 10 then return 'not_required'; end if;

  if v_profile.plan <> 'starter'
    or v_profile.billing_status <> 'active'
    or v_profile.auto_send_enabled is not true
    or v_profile.instant_autopilot_granted_at is null
    or v_profile.instant_autopilot_activated_at is null
    or v_profile.instant_autopilot_used_at is not null then
    return 'unavailable';
  end if;

  if v_profile.instant_autopilot_claimed_at is not null
    and v_profile.instant_autopilot_claimed_at > now() - interval '15 minutes'
    and v_profile.instant_autopilot_claim_thread_id is distinct from p_thread_id then
    return 'unavailable';
  end if;

  update public.profiles
  set instant_autopilot_claimed_at = now(),
      instant_autopilot_claim_thread_id = p_thread_id
  where id = p_user_id;
  return 'claimed';
end;
$$;

create or replace function public.release_instant_autopilot_send(
  p_user_id uuid,
  p_thread_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles
  set instant_autopilot_claimed_at = null,
      instant_autopilot_claim_thread_id = null
  where id = p_user_id
    and instant_autopilot_claim_thread_id = p_thread_id
    and instant_autopilot_used_at is null;
  return found;
end;
$$;

create or replace function public.consume_instant_autopilot_send(
  p_user_id uuid,
  p_thread_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles
  set instant_autopilot_used_at = now(),
      instant_autopilot_claimed_at = null,
      instant_autopilot_claim_thread_id = null,
      auto_send_enabled = false
  where id = p_user_id
    and instant_autopilot_claim_thread_id = p_thread_id
    and instant_autopilot_used_at is null;
  return found;
end;
$$;

revoke all on function public.grant_instant_autopilot_trial(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_instant_autopilot_send(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_instant_autopilot_send(uuid, uuid) from public, anon, authenticated;
revoke all on function public.consume_instant_autopilot_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_instant_autopilot_trial(uuid, text) to service_role;
grant execute on function public.claim_instant_autopilot_send(uuid, uuid) to service_role;
grant execute on function public.release_instant_autopilot_send(uuid, uuid) to service_role;
grant execute on function public.consume_instant_autopilot_send(uuid, uuid) to service_role;

-- Backfill active seven-day Starter trials created before this migration. A
-- promotional first month has an approximately 30-day period and is excluded.
update public.profiles
set instant_autopilot_granted_at = coalesce(instant_autopilot_granted_at, billing_updated_at, now()),
    instant_autopilot_grant_event_id = coalesce(instant_autopilot_grant_event_id, 'backfill:' || id::text)
where plan = 'starter'
  and billing_status = 'active'
  and billing_updated_at is not null
  and billing_period_ends_at is not null
  and billing_period_ends_at <= billing_updated_at + interval '8 days'
  and instant_autopilot_used_at is null;

commit;
