-- Production hardening and canonical application/schema alignment.

alter table profiles
  add column if not exists referral_tracking_enabled boolean not null default true,
  add column if not exists webhook_secret text,
  add column if not exists billing_subscription_id text,
  add column if not exists billing_customer_id text,
  add column if not exists billing_updated_at timestamptz,
  add column if not exists draft_month date,
  add column if not exists draft_count integer not null default 0;

alter table profiles alter column webhook_secret
  set default encode(gen_random_bytes(32), 'hex');
update profiles set webhook_secret = encode(gen_random_bytes(32), 'hex')
where webhook_secret is null;
alter table profiles alter column webhook_secret set not null;

alter table profiles drop constraint if exists profiles_business_url_check;
alter table profiles add constraint profiles_business_url_check
  check (business_url is null or business_url ~ '^https?://[^[:space:]]+$') not valid;

alter table keywords
  add column if not exists updated_at timestamptz not null default now();

alter table monitored_threads
  add column if not exists tracking_sid text,
  add column if not exists score_reasoning text,
  add column if not exists google_rank_position integer,
  add column if not exists ranked_keyword text;

alter table monitored_threads drop constraint if exists monitored_threads_status_check;
alter table monitored_threads
  add constraint monitored_threads_status_check
  check (status in ('pending', 'drafted', 'sending', 'send_reconciliation_required', 'needs_manual_reply', 'dismissed', 'replied'));

alter table send_audit_log drop constraint if exists send_audit_log_status_check;
alter table send_audit_log
  add constraint send_audit_log_status_check
  check (status in ('success', 'failed_retryable', 'failed_permanent', 'reconciliation_required'));

alter table draft_feedback drop constraint if exists draft_feedback_action_type_check;
alter table draft_feedback
  add constraint draft_feedback_action_type_check
  check (action_type in (
    'APPROVED', 'EDITED_APPROVED', 'REJECTED', 'SKIPPED',
    'REGENERATE_REQUESTED', 'AUTO_SENT'
  ));

alter table monitored_threads drop constraint if exists monitored_threads_platform_external_id_key;
alter table monitored_threads drop constraint if exists monitored_threads_user_id_platform_external_id_key;
alter table monitored_threads
  add constraint monitored_threads_user_platform_external_id_key
  unique (user_id, platform, external_id);

alter table reply_attribution
  add column if not exists shortcode text,
  add column if not exists destination_url text;

drop policy if exists "public click tracking" on reply_attribution;
drop policy if exists "own attributions" on reply_attribution;
create policy "own attributions select"
  on reply_attribution for select to authenticated
  using (auth.uid() = user_id);
revoke insert, update, delete on reply_attribution from anon, authenticated;
grant select on reply_attribution to authenticated;

update reply_attribution set shortcode = attribution_token where shortcode is null;
alter table reply_attribution alter column shortcode set not null;
create unique index if not exists reply_attribution_shortcode_uidx on reply_attribution(shortcode);

create table if not exists billing_webhook_events (
  provider_event_id text primary key,
  event_type text not null,
  user_id uuid references profiles(id) on delete set null,
  subscription_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

alter table billing_webhook_events enable row level security;

create or replace function apply_billing_subscription_event(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_subscription_id text,
  p_customer_id text,
  p_plan text,
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
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_event_type not in ('subscription.active', 'subscription.updated', 'subscription.cancelled') then
    return 'ignored';
  end if;

  if p_subscription_id is null or p_subscription_id = '' then
    raise exception 'subscription id is required' using errcode = '22023';
  end if;

  if p_plan not in ('pro', 'growth') then
    raise exception 'invalid paid plan' using errcode = '22023';
  end if;

  insert into billing_webhook_events (
    provider_event_id, event_type, user_id, subscription_id
  ) values (
    p_event_id, p_event_type, p_user_id, p_subscription_id
  )
  on conflict (provider_event_id) do nothing
  returning provider_event_id into v_inserted;

  if v_inserted is null then return 'duplicate'; end if;

  select billing_subscription_id, billing_updated_at
  into v_current_subscription, v_current_updated_at
  from profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  if v_current_updated_at is not null and p_event_at < v_current_updated_at then
    update billing_webhook_events set processed_at = now()
    where provider_event_id = p_event_id;
    return 'stale';
  end if;

  if p_event_type = 'subscription.updated'
     and v_current_subscription is not null
     and v_current_subscription is distinct from p_subscription_id then
    update billing_webhook_events set processed_at = now()
    where provider_event_id = p_event_id;
    return 'stale_subscription';
  elsif p_event_type in ('subscription.active', 'subscription.updated') then
    update profiles set
      plan = p_plan,
      billing_subscription_id = p_subscription_id,
      billing_customer_id = p_customer_id,
      billing_updated_at = p_event_at
    where id = p_user_id;
  elsif v_current_subscription is distinct from p_subscription_id then
    update billing_webhook_events set processed_at = now()
    where provider_event_id = p_event_id;
    return 'stale_subscription';
  else
    update profiles set
      plan = 'free',
      auto_send_enabled = false,
      billing_subscription_id = null,
      billing_updated_at = p_event_at
    where id = p_user_id;

    with ranked as (
      select id, row_number() over (order by updated_at desc, created_at desc, id) as position
      from keywords where user_id = p_user_id
    )
    update keywords
    set is_active = ranked.position = 1
    from ranked
    where keywords.id = ranked.id;
  end if;

  update billing_webhook_events set processed_at = now()
  where provider_event_id = p_event_id;
  return 'applied';
end;
$$;

revoke all on function apply_billing_subscription_event(text, text, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function apply_billing_subscription_event(text, text, uuid, text, text, text, timestamptz)
  to service_role;

drop policy if exists "own profile" on profiles;
drop policy if exists "profiles select own" on profiles;
drop policy if exists "profiles insert own" on profiles;
drop policy if exists "profiles update own" on profiles;

create policy "profiles select own"
  on profiles for select to authenticated
  using (auth.uid() = id);

create policy "profiles insert own"
  on profiles for insert to authenticated
  with check (
    auth.uid() = id
    and plan = 'free'
    and auto_send_enabled = false
    and draft_count = 0
    and billing_subscription_id is null
    and billing_customer_id is null
  );

create policy "profiles update own"
  on profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on profiles from authenticated;
grant update (
  business_name,
  business_description,
  business_url,
  business_type,
  writing_style,
  reddit_username,
  competitors,
  tone_examples,
  notification_preferences,
  slack_webhook_url,
  slack_notify_threshold,
  referral_tracking_enabled
) on profiles to authenticated;

alter table profiles drop constraint if exists profiles_slack_webhook_url_check;
alter table profiles
  add constraint profiles_slack_webhook_url_check
  check (
    slack_webhook_url is null
    or slack_webhook_url ~ '^https://hooks[.]slack(-gov)?[.]com/services/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$'
  );

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
  v_limit := case v_plan when 'growth' then 50 when 'pro' then 10 else 1 end;

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

drop trigger if exists keywords_enforce_plan_limit on keywords;
create trigger keywords_enforce_plan_limit
before insert or update of user_id on keywords
for each row execute function enforce_keyword_plan_limit();

drop policy if exists "own keywords insert under plan limit" on keywords;
create policy "own keywords insert"
  on keywords for insert to authenticated
  with check (auth.uid() = user_id);

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
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update profiles
  set
    draft_month = v_month,
    draft_count = case when draft_month = v_month then draft_count + 1 else 1 end
  where id = p_user_id
    and (draft_month is distinct from v_month or draft_count < p_limit)
  returning draft_count into v_count;

  return v_count is not null;
end;
$$;

revoke all on function reserve_monthly_draft(uuid, integer) from public, anon;
grant execute on function reserve_monthly_draft(uuid, integer) to authenticated;

create or replace function claim_thread_for_send(
  p_thread_id uuid,
  p_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed uuid;
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update monitored_threads
  set status = 'sending'
  where id = p_thread_id
    and user_id = p_user_id
    and status in ('drafted', 'needs_manual_reply')
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke all on function claim_thread_for_send(uuid, uuid) from public, anon, authenticated;
grant execute on function claim_thread_for_send(uuid, uuid) to service_role;

create or replace function log_draft_feedback(
  p_user_id uuid,
  p_thread_id uuid,
  p_original_draft text,
  p_final_draft text,
  p_action_type text,
  p_platform text,
  p_target_community text,
  p_keyword_cluster text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dist integer;
  v_max_len integer;
  v_score numeric(5,4);
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from monitored_threads
    where id = p_thread_id and user_id = p_user_id
  ) then
    raise exception 'thread not found' using errcode = 'P0002';
  end if;

  if p_action_type not in (
    'APPROVED', 'EDITED_APPROVED', 'REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED'
  ) then
    raise exception 'invalid action type' using errcode = '22023';
  end if;

  if p_original_draft is null or p_final_draft is null or p_original_draft = p_final_draft then
    v_score := 1;
  else
    v_dist := levenshtein(
      substring(p_original_draft from 1 for 250),
      substring(p_final_draft from 1 for 250)
    );
    v_max_len := greatest(
      length(substring(p_original_draft from 1 for 250)),
      length(substring(p_final_draft from 1 for 250))
    );
    v_score := case when v_max_len = 0 then 1
      else greatest(0, 1 - (v_dist::numeric / v_max_len::numeric)) end;
  end if;

  if p_action_type in ('REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED') then v_score := null; end if;

  insert into draft_feedback (
    user_id, thread_id, original_draft, final_draft, action_type,
    edit_distance_score, platform, target_community, keyword_cluster
  ) values (
    p_user_id, p_thread_id, p_original_draft, p_final_draft, p_action_type,
    v_score, p_platform, p_target_community, p_keyword_cluster
  )
  on conflict (user_id, thread_id) do update set
    final_draft = excluded.final_draft,
    action_type = excluded.action_type,
    edit_distance_score = excluded.edit_distance_score;

  insert into user_trust_metrics (
    user_id, total_drafts_reviewed, total_approved, approval_rate,
    avg_edit_distance, dynamic_threshold, last_updated
  )
  select
    p_user_id,
    count(*)::integer,
    count(*) filter (
      where action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT')
    )::integer,
    case when count(*) = 0 then 0 else
      count(*) filter (
        where action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT')
      )::numeric / count(*) end,
    coalesce(avg(edit_distance_score), 1),
    85 - ((coalesce(avg(edit_distance_score), 1) - 0.5) * 10),
    now()
  from draft_feedback
  where user_id = p_user_id
  on conflict (user_id) do update set
    total_drafts_reviewed = excluded.total_drafts_reviewed,
    total_approved = excluded.total_approved,
    approval_rate = excluded.approval_rate,
    avg_edit_distance = excluded.avg_edit_distance,
    dynamic_threshold = excluded.dynamic_threshold,
    last_updated = excluded.last_updated;

  if p_platform is not null and p_target_community is not null then
    insert into community_trust_metrics (
      platform, target_community, total_engagements, total_rejected, rejection_rate
    )
    select
      p_platform,
      p_target_community,
      count(*)::integer,
      count(*) filter (
        where action_type in ('REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED')
      )::integer,
      case when count(*) = 0 then 0 else
        count(*) filter (
          where action_type in ('REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED')
        )::numeric / count(*) end
    from draft_feedback
    where platform = p_platform and target_community = p_target_community
    on conflict (platform, target_community) do update set
      total_engagements = excluded.total_engagements,
      total_rejected = excluded.total_rejected,
      rejection_rate = excluded.rejection_rate;
  end if;
end;
$$;

revoke all on function log_draft_feedback(uuid, uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function log_draft_feedback(uuid, uuid, text, text, text, text, text, text)
  to authenticated;

create index if not exists keywords_polling_idx
  on keywords(platform, target) where is_active;
create index if not exists keywords_user_updated_idx
  on keywords(user_id, updated_at desc);
create index if not exists monitored_threads_dashboard_idx
  on monitored_threads(user_id, status, created_at desc);
create index if not exists monitored_threads_digest_idx
  on monitored_threads(user_id, intent_score desc, created_at desc)
  where status = 'pending';
create index if not exists reply_analytics_user_created_idx
  on reply_analytics(user_id, created_at desc);
create index if not exists reply_attribution_user_created_idx
  on reply_attribution(user_id, created_at desc);

create or replace function get_digest_opportunities(
  p_since timestamptz,
  p_min_score numeric default 70,
  p_per_user integer default 10
) returns setof monitored_threads
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select (ranked.thread).*
    from (
      select
        monitored_threads as thread,
        row_number() over (
          partition by user_id
          order by intent_score desc, created_at desc
        ) as position
      from monitored_threads
      where status = 'pending'
        and intent_score >= p_min_score
        and created_at >= p_since
    ) ranked
    where ranked.position <= p_per_user;
end;
$$;

revoke all on function get_digest_opportunities(timestamptz, numeric, integer)
  from public, anon, authenticated;
grant execute on function get_digest_opportunities(timestamptz, numeric, integer)
  to service_role;

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
  v_limit := case v_plan when 'growth' then 50 when 'pro' then 10 else 1 end;
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
  from public, anon;
grant execute on function complete_onboarding(text, text, text, text, text, text, jsonb)
  to authenticated;

create or replace function save_generated_draft(
  p_user_id uuid,
  p_thread_id uuid,
  p_draft_text text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if trim(coalesce(p_draft_text, '')) = '' then
    raise exception 'draft text is required' using errcode = '22023';
  end if;

  update monitored_threads set status = 'drafted'
  where id = p_thread_id and user_id = p_user_id;
  if not found then
    raise exception 'thread not found' using errcode = 'P0002';
  end if;

  insert into reply_analytics (user_id, thread_id, draft_text)
  values (p_user_id, p_thread_id, p_draft_text);
end;
$$;

revoke all on function save_generated_draft(uuid, uuid, text) from public, anon;
grant execute on function save_generated_draft(uuid, uuid, text) to authenticated;
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now(),
  constraint newsletter_subscribers_email_length check (char_length(email) between 3 and 254)
);

alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;
