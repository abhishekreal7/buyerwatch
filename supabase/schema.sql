-- Drop existing tables to start fresh
drop table if exists send_audit_log cascade;
drop table if exists platform_connections cascade;
drop table if exists ingestion_events cascade;
drop table if exists reply_analytics cascade;
drop table if exists monitored_threads cascade;
drop table if exists keywords cascade;
drop table if exists ai_spend_reservations cascade;
drop table if exists usage_logs cascade;
drop table if exists profiles cascade;

-- Core tables
create table profiles (
  id uuid primary key references auth.users(id),
  business_name text,
  business_description text,
  business_url text,
  business_type text,
  writing_style text,
  tone_archetype text check (
    tone_archetype is null
    or tone_archetype in ('consultative', 'casual', 'direct', 'problem_solver')
  ),
  style_guardrails text[] not null default '{}' check (
    style_guardrails <@ array[
      'no_emojis',
      'casual_lowercase',
      'include_affiliation_disclosure',
      'lead_with_value_first',
      'never_pitch_directly'
    ]::text[]
  ),
  reddit_username text,
  plan text not null default 'free' check (plan in ('free', 'starter', 'pro', 'growth')),
  auto_send_enabled boolean default false,
  auto_send_threshold integer default 85 check (auto_send_threshold between 70 and 100),
  draft_month date,
  draft_count integer not null default 0,
  signal_month date,
  signal_count integer not null default 0,
  notification_preferences jsonb default '{"emailDigest": true, "highIntentAlerts": true, "weeklyReport": false}'::jsonb,
  high_intent_threshold smallint not null default 80
    check (high_intent_threshold between 60 and 95),
  last_polled_at timestamptz,
  created_at timestamptz default now()
);

create table keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  term text not null,
  platform text not null default 'reddit' check (platform in ('reddit', 'bluesky', 'x', 'threads')),
  target text not null, -- subreddit name, bluesky search query, x query, threads query
  is_active boolean default true,
  created_at timestamptz default now()
);

create table monitored_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  keyword_id uuid references keywords(id) on delete set null,
  platform text not null check (platform in ('reddit', 'bluesky', 'x', 'threads')),
  external_id text not null,
  author text,
  title text,
  text_content text,
  url text,
  intent_score numeric,
  intent_label text check (intent_label in ('buying', 'researching', 'complaining', 'other')),
  matched_signals text[] not null default '{}',
  quality_issues text[] not null default '{}',
  automation_reason text,
  reviewed_at timestamptz,
  status text default 'pending' check (status in ('pending', 'drafted', 'sending', 'send_reconciliation_required', 'needs_manual_reply', 'dismissed', 'replied')),
  flag text,
  created_at timestamptz default now(),
  unique (user_id, platform, external_id)
);

create table reply_analytics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  thread_id uuid references monitored_threads(id) on delete cascade,
  draft_text text,
  edited_text text,
  was_sent boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now(),
  unique (thread_id)
);

-- AI usage budgeting (see Section 4.3)
create table usage_logs (
  user_id uuid references profiles(id) on delete cascade,
  date date default current_date,
  intent_calls int default 0,
  draft_calls int default 0,
  intent_input_tokens bigint not null default 0,
  intent_output_tokens bigint not null default 0,
  intent_cost_microusd bigint not null default 0,
  intent_model text,
  draft_input_tokens bigint not null default 0,
  draft_output_tokens bigint not null default 0,
  draft_cost_microusd bigint not null default 0,
  draft_model text,
  x_spend_cents int default 0,
  primary key (user_id, date)
);

create table ai_spend_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  purpose text not null check (purpose in ('intent', 'draft')),
  estimated_microusd bigint not null check (estimated_microusd > 0),
  status text not null default 'pending'
    check (status in ('pending', 'reconciled', 'released')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index ai_spend_reservations_pending_idx
  on ai_spend_reservations (created_at, user_id)
  where status = 'pending';

-- Row Level Security — enable from day one, not retrofitted
alter table profiles enable row level security;
alter table keywords enable row level security;
alter table monitored_threads enable row level security;
alter table reply_analytics enable row level security;
alter table usage_logs enable row level security;
alter table ai_spend_reservations enable row level security;

create policy "profiles select own" on profiles for select using (auth.uid() = id);
create policy "profiles insert own" on profiles for insert
  with check (auth.uid() = id and plan = 'free' and auto_send_enabled = false);
create policy "profiles update own" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);
revoke update on profiles from authenticated;
grant update (
  business_name, business_description, business_url, business_type,
  writing_style, tone_archetype, style_guardrails, reddit_username, notification_preferences,
  high_intent_threshold
) on profiles to authenticated;
create policy "own keywords" on keywords for all using (auth.uid() = user_id);
create policy "own threads" on monitored_threads for all using (auth.uid() = user_id);
create policy "own analytics" on reply_analytics for all using (auth.uid() = user_id);
create policy "own usage" on usage_logs for all using (auth.uid() = user_id);
revoke all on table ai_spend_reservations from public, anon, authenticated;

create or replace function mark_thread_reviewed(
  p_user_id uuid,
  p_thread_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update monitored_threads
  set reviewed_at = coalesce(reviewed_at, now())
  where id = p_thread_id and user_id = p_user_id;

  if not found then
    raise exception 'thread not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function mark_thread_reviewed(uuid, uuid) from public, anon;
grant execute on function mark_thread_reviewed(uuid, uuid) to authenticated;

-- Atomic budget check
create or replace function increment_usage_if_under_limit(
  p_user_id uuid, p_service text, p_limit int
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare current_count int;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into usage_logs (user_id, date) values (p_user_id, current_date)
    on conflict (user_id, date) do nothing;

  if p_service = 'intent' then
    select intent_calls into current_count from usage_logs where user_id = p_user_id and date = current_date for update;
    if current_count >= p_limit then return false; end if;
    update usage_logs set intent_calls = intent_calls + 1 where user_id = p_user_id and date = current_date;
  elsif p_service = 'draft' then
    select draft_calls into current_count from usage_logs where user_id = p_user_id and date = current_date for update;
    if current_count >= p_limit then return false; end if;
    update usage_logs set draft_calls = draft_calls + 1 where user_id = p_user_id and date = current_date;
  else
    raise exception 'unsupported usage service';
  end if;
  return true;
end;
$$;

revoke all on function increment_usage_if_under_limit(uuid, text, int)
  from public, anon, authenticated;
grant execute on function increment_usage_if_under_limit(uuid, text, int)
  to service_role;

create or replace function increment_x_spend_if_under_limit(
  p_user_id uuid, p_cost_cents int, p_daily_limit_cents int
) returns boolean
language plpgsql
as $$
declare current_spend int;
begin
  insert into usage_logs (user_id, date) values (p_user_id, current_date)
    on conflict (user_id, date) do nothing;

  select x_spend_cents into current_spend from usage_logs
    where user_id = p_user_id and date = current_date for update;

  if current_spend + p_cost_cents > p_daily_limit_cents then
    return false;
  end if;

  update usage_logs set x_spend_cents = x_spend_cents + p_cost_cents
    where user_id = p_user_id and date = current_date;
  return true;
end;
$$;

-- Platform Connections (OAuth & App Passwords)
create table platform_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  platform text not null check (platform in ('reddit', 'bluesky', 'x', 'threads')),
  access_token text, -- encrypted
  refresh_token text, -- encrypted
  external_username text,
  connected_at timestamptz default now(),
  unique (user_id, platform)
);

alter table platform_connections enable row level security;
create policy "own connections" on platform_connections for all using (auth.uid() = user_id);

-- Send Audit Log
create table send_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  thread_id uuid references monitored_threads(id) on delete cascade,
  platform text not null,
  trigger_type text not null check (trigger_type in ('manual', 'auto')),
  status text not null check (status in ('success', 'failed_retryable', 'failed_permanent', 'reconciliation_required', 'resolved_replied', 'resolved_not_sent')),
  error_message text,
  permalink text,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz default now()
);

alter table send_audit_log enable row level security;
create policy "own audit logs" on send_audit_log for all using (auth.uid() = user_id);

create table ingestion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  source text not null check (source in ('chrome_extension', 'manual_import')),
  source_event_id text not null,
  source_url text not null check (source_url ~ '^https?://[^[:space:]]+$'),
  title text,
  body text not null,
  author text,
  community text,
  captured_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_event_id)
);

alter table ingestion_events enable row level security;
create policy "own ingestion events select"
  on ingestion_events for select to authenticated
  using (auth.uid() = user_id);
revoke insert, update, delete on ingestion_events from anon, authenticated;
grant select on ingestion_events to authenticated;

-- Saved Views
create table saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  filters_json jsonb not null default '{}'::jsonb,
  schema_version int not null default 1,
  is_pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table saved_views enable row level security;
create policy "own saved views" on saved_views for all using (auth.uid() = user_id);

-- ==========================================
-- PHASE 1: AUTOMATION CONFIDENCE ENGINE
-- ==========================================

create extension if not exists fuzzystrmatch;

-- 1. Raw Feedback Events
create table draft_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  thread_id uuid references monitored_threads(id) on delete cascade,
  original_draft text,
  final_draft text,
  action_type text check (action_type in ('APPROVED', 'EDITED_APPROVED', 'REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED', 'AUTO_SENT', 'COPIED')),
  edit_distance_score numeric(5,4), -- 1.0 = untouched, 0.0 = total rewrite
  platform text,
  target_community text,
  keyword_cluster text,
  created_at timestamptz default now(),
  unique(user_id, thread_id)
);

alter table draft_feedback enable row level security;
create policy "own draft feedback" on draft_feedback for all using (auth.uid() = user_id);

-- 2. Aggregated User Trust Metrics
create table user_trust_metrics (
  user_id uuid primary key references profiles(id) on delete cascade,
  total_drafts_reviewed int default 0,
  total_approved int default 0,
  approval_rate numeric(5,4) default 0.0,
  avg_edit_distance numeric(5,4) default 1.0,
  dynamic_threshold numeric(5,2) default 85.00,
  last_updated timestamptz default now()
);

alter table user_trust_metrics enable row level security;
create policy "own trust metrics" on user_trust_metrics for all using (auth.uid() = user_id);

-- 3. Aggregated Community Trust Metrics
create table community_trust_metrics (
  platform text,
  target_community text,
  total_engagements int default 0,
  total_rejected int default 0,
  rejection_rate numeric(5,4) default 0.0,
  primary key (platform, target_community)
);

-- We can make community metrics public for reading since it's aggregated crowdsourced data,
-- but for simplicity let's just make it readable for all authenticated users.
alter table community_trust_metrics enable row level security;
create policy "read all community metrics" on community_trust_metrics for select to authenticated using (true);

-- 4. Logging & Aggregation Function
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
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_dist int;
  v_max_len int;
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

  -- 1. Calculate normalized edit distance score (1.0 = identical, 0.0 = entirely different)
  if p_original_draft is null or p_final_draft is null then
    v_score := 1.0;
  elsif p_original_draft = p_final_draft then
    v_score := 1.0;
  else
    -- Use levenshtein, bounded to avoid massive CPU spikes on giant texts. 
    -- If texts > 255 chars (levenshtein limit in some postgres versions without external libs), 
    -- we take a substring or assume a rough score. fuzzystrmatch limits levenshtein to 255 bytes unless specified.
    -- To be safe, we take up to 250 chars.
    v_dist := levenshtein(substring(p_original_draft from 1 for 250), substring(p_final_draft from 1 for 250));
    v_max_len := greatest(length(substring(p_original_draft from 1 for 250)), length(substring(p_final_draft from 1 for 250)));
    
    if v_max_len = 0 then
      v_score := 1.0;
    else
      v_score := greatest(0.0, 1.0 - (v_dist::numeric / v_max_len::numeric));
    end if;
  end if;

  -- Force score on pure rejection/skips to not mess up edit distance (or skip it entirely)
  if p_action_type in ('REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED') then
    v_score := null;
  end if;

  -- 2. Insert raw feedback event
  insert into draft_feedback (
    user_id, thread_id, original_draft, final_draft, action_type, 
    edit_distance_score, platform, target_community, keyword_cluster
  ) values (
    p_user_id, p_thread_id, p_original_draft, p_final_draft, p_action_type, 
    v_score, p_platform, p_target_community, p_keyword_cluster
  );

  -- 3. Update User Trust Metrics
  insert into user_trust_metrics (user_id, total_drafts_reviewed, total_approved, approval_rate, avg_edit_distance)
  values (
    p_user_id, 
    1, 
    case when p_action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT') then 1 else 0 end,
    case when p_action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT') then 1.0 else 0.0 end,
    coalesce(v_score, 1.0)
  )
  on conflict (user_id) do update set 
    total_drafts_reviewed = user_trust_metrics.total_drafts_reviewed + 1,
    total_approved = user_trust_metrics.total_approved + case when p_action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT') then 1 else 0 end,
    approval_rate = (user_trust_metrics.total_approved + case when p_action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT') then 1 else 0 end)::numeric / (user_trust_metrics.total_drafts_reviewed + 1),
    -- simple moving average for edit distance if score is present
    avg_edit_distance = case 
      when v_score is not null then (user_trust_metrics.avg_edit_distance * 0.9) + (v_score * 0.1) 
      else user_trust_metrics.avg_edit_distance 
    end,
    last_updated = now();
    
  -- update dynamic threshold based on new baseline
  update user_trust_metrics set
    -- Base threshold is 85. We adjust by +/- 10 points based on avg_edit_distance.
    dynamic_threshold = 85.0 - ((avg_edit_distance - 0.5) * 10.0)
  where user_id = p_user_id;

  -- 4. Update Community Trust Metrics
  if p_platform is not null and p_target_community is not null then
    insert into community_trust_metrics (platform, target_community, total_engagements, total_rejected, rejection_rate)
    values (
      p_platform, p_target_community, 1,
      case when p_action_type in ('REJECTED', 'SKIPPED') then 1 else 0 end,
      case when p_action_type in ('REJECTED', 'SKIPPED') then 1.0 else 0.0 end
    )
    on conflict (platform, target_community) do update set
      total_engagements = community_trust_metrics.total_engagements + 1,
      total_rejected = community_trust_metrics.total_rejected + case when p_action_type in ('REJECTED', 'SKIPPED') then 1 else 0 end,
      rejection_rate = (community_trust_metrics.total_rejected + case when p_action_type in ('REJECTED', 'SKIPPED') then 1 else 0 end)::numeric / (community_trust_metrics.total_engagements + 1);
  end if;
end;
$$;

revoke all on function log_draft_feedback(uuid, uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function log_draft_feedback(uuid, uuid, text, text, text, text, text, text)
  to authenticated;

-- Atomic monthly signal and draft allowances.
create or replace function reserve_monthly_signal(
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
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_limit < 1 then
    raise exception 'invalid signal limit' using errcode = '22023';
  end if;

  update profiles
  set
    signal_month = v_month,
    signal_count = case when signal_month = v_month then signal_count + 1 else 1 end
  where id = p_user_id
    and (signal_month is distinct from v_month or signal_count < p_limit)
  returning signal_count into v_count;

  return v_count is not null;
end;
$$;

revoke all on function reserve_monthly_signal(uuid, integer)
  from public, anon, authenticated;
grant execute on function reserve_monthly_signal(uuid, integer)
  to service_role;

create or replace function release_monthly_signal(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update profiles
  set signal_count = greatest(signal_count - 1, 0)
  where id = p_user_id
    and signal_month = date_trunc('month', current_date)::date;
end;
$$;

revoke all on function release_monthly_signal(uuid)
  from public, anon, authenticated;
grant execute on function release_monthly_signal(uuid)
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
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_limit < 1 then
    raise exception 'invalid draft limit' using errcode = '22023';
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
  from public, anon, authenticated;
grant execute on function reserve_monthly_draft(uuid, integer)
  to service_role;

create or replace function release_monthly_draft(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update profiles
  set draft_count = greatest(draft_count - 1, 0)
  where id = p_user_id
    and draft_month = date_trunc('month', current_date)::date;

  update usage_logs
  set draft_calls = greatest(draft_calls - 1, 0)
  where user_id = p_user_id
    and date = current_date;
end;
$$;

revoke all on function release_monthly_draft(uuid)
  from public, anon, authenticated;
grant execute on function release_monthly_draft(uuid)
  to service_role;

-- Provider-cost reservations make per-customer and global caps race-safe.
create or replace function reserve_ai_spend(
  p_user_id uuid,
  p_purpose text,
  p_estimated_microusd bigint,
  p_user_monthly_limit_microusd bigint,
  p_global_monthly_limit_microusd bigint
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', current_date)::date;
  v_user_actual bigint;
  v_user_pending bigint;
  v_global_actual bigint;
  v_global_pending bigint;
  v_reservation_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_purpose not in ('intent', 'draft')
    or p_estimated_microusd < 1
    or p_user_monthly_limit_microusd < 1
    or p_global_monthly_limit_microusd < 1 then
    raise exception 'invalid AI spend reservation' using errcode = '22023';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('ai-spend-global'), hashtext(v_month::text));
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(v_month::text));

  select coalesce(sum(intent_cost_microusd + draft_cost_microusd), 0)
  into v_user_actual
  from usage_logs
  where user_id = p_user_id
    and date >= v_month
    and date < (v_month + interval '1 month')::date;

  select coalesce(sum(estimated_microusd), 0)
  into v_user_pending
  from ai_spend_reservations
  where user_id = p_user_id
    and status = 'pending'
    and created_at >= v_month
    and created_at >= now() - interval '10 minutes';

  if v_user_actual + v_user_pending + p_estimated_microusd
    > p_user_monthly_limit_microusd then
    return null;
  end if;

  select coalesce(sum(intent_cost_microusd + draft_cost_microusd), 0)
  into v_global_actual
  from usage_logs
  where date >= v_month
    and date < (v_month + interval '1 month')::date;

  select coalesce(sum(estimated_microusd), 0)
  into v_global_pending
  from ai_spend_reservations
  where status = 'pending'
    and created_at >= v_month
    and created_at >= now() - interval '10 minutes';

  if v_global_actual + v_global_pending + p_estimated_microusd
    > p_global_monthly_limit_microusd then
    return null;
  end if;

  insert into ai_spend_reservations (user_id, purpose, estimated_microusd)
  values (p_user_id, p_purpose, p_estimated_microusd)
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

revoke all on function reserve_ai_spend(uuid, text, bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function reserve_ai_spend(uuid, text, bigint, bigint, bigint)
  to service_role;

create or replace function record_ai_usage(
  p_reservation_id uuid,
  p_model text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_microusd bigint
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_purpose text;
  v_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_input_tokens < 0 or p_output_tokens < 0 or p_cost_microusd < 0 then
    raise exception 'invalid AI usage' using errcode = '22023';
  end if;

  select user_id, purpose, status
  into v_user_id, v_purpose, v_status
  from ai_spend_reservations
  where id = p_reservation_id
  for update;

  if v_user_id is null then
    raise exception 'AI spend reservation not found' using errcode = 'P0002';
  end if;
  if v_status = 'reconciled' then
    return true;
  end if;
  if v_status <> 'pending' then
    return false;
  end if;

  insert into usage_logs (
    user_id, date,
    intent_input_tokens, intent_output_tokens, intent_cost_microusd, intent_model,
    draft_input_tokens, draft_output_tokens, draft_cost_microusd, draft_model
  )
  values (
    v_user_id, current_date,
    case when v_purpose = 'intent' then p_input_tokens else 0 end,
    case when v_purpose = 'intent' then p_output_tokens else 0 end,
    case when v_purpose = 'intent' then p_cost_microusd else 0 end,
    case when v_purpose = 'intent' then nullif(p_model, '') else null end,
    case when v_purpose = 'draft' then p_input_tokens else 0 end,
    case when v_purpose = 'draft' then p_output_tokens else 0 end,
    case when v_purpose = 'draft' then p_cost_microusd else 0 end,
    case when v_purpose = 'draft' then nullif(p_model, '') else null end
  )
  on conflict (user_id, date) do update set
    intent_input_tokens = usage_logs.intent_input_tokens
      + case when v_purpose = 'intent' then p_input_tokens else 0 end,
    intent_output_tokens = usage_logs.intent_output_tokens
      + case when v_purpose = 'intent' then p_output_tokens else 0 end,
    intent_cost_microusd = usage_logs.intent_cost_microusd
      + case when v_purpose = 'intent' then p_cost_microusd else 0 end,
    intent_model = case when v_purpose = 'intent' then nullif(p_model, '') else usage_logs.intent_model end,
    draft_input_tokens = usage_logs.draft_input_tokens
      + case when v_purpose = 'draft' then p_input_tokens else 0 end,
    draft_output_tokens = usage_logs.draft_output_tokens
      + case when v_purpose = 'draft' then p_output_tokens else 0 end,
    draft_cost_microusd = usage_logs.draft_cost_microusd
      + case when v_purpose = 'draft' then p_cost_microusd else 0 end,
    draft_model = case when v_purpose = 'draft' then nullif(p_model, '') else usage_logs.draft_model end;

  update ai_spend_reservations
  set status = 'reconciled', completed_at = now()
  where id = p_reservation_id;

  return true;
end;
$$;

revoke all on function record_ai_usage(uuid, text, bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function record_ai_usage(uuid, text, bigint, bigint, bigint)
  to service_role;

create or replace function release_ai_spend(
  p_reservation_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update ai_spend_reservations
  set status = 'released', completed_at = now()
  where id = p_reservation_id
    and status = 'pending';
end;
$$;

revoke all on function release_ai_spend(uuid)
  from public, anon, authenticated;
grant execute on function release_ai_spend(uuid)
  to service_role;
