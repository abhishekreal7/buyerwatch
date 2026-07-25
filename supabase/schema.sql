-- Drop existing tables to start fresh
drop table if exists send_audit_log cascade;
drop table if exists platform_connections cascade;
drop table if exists ingestion_events cascade;
drop table if exists reply_analytics cascade;
drop table if exists monitored_threads cascade;
drop table if exists keywords cascade;
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
  reddit_username text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'growth')),
  auto_send_enabled boolean default false,
  auto_send_threshold integer default 85 check (auto_send_threshold >= 70),
  notification_preferences jsonb default '{"emailDigest": true, "highIntentAlerts": true, "weeklyReport": false}'::jsonb,
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
  text_content text,
  url text,
  intent_score numeric,
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
  created_at timestamptz default now()
);

-- AI usage budgeting (see Section 4.3)
create table usage_logs (
  user_id uuid references profiles(id) on delete cascade,
  date date default current_date,
  gemini_calls int default 0,
  claude_calls int default 0,
  x_spend_cents int default 0,
  primary key (user_id, date)
);

-- Row Level Security — enable from day one, not retrofitted
alter table profiles enable row level security;
alter table keywords enable row level security;
alter table monitored_threads enable row level security;
alter table reply_analytics enable row level security;
alter table usage_logs enable row level security;

create policy "profiles select own" on profiles for select using (auth.uid() = id);
create policy "profiles insert own" on profiles for insert
  with check (auth.uid() = id and plan = 'free' and auto_send_enabled = false);
create policy "profiles update own" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);
revoke update on profiles from authenticated;
grant update (
  business_name, business_description, business_url, business_type,
  writing_style, reddit_username, notification_preferences
) on profiles to authenticated;
create policy "own keywords" on keywords for all using (auth.uid() = user_id);
create policy "own threads" on monitored_threads for all using (auth.uid() = user_id);
create policy "own analytics" on reply_analytics for all using (auth.uid() = user_id);
create policy "own usage" on usage_logs for all using (auth.uid() = user_id);

-- Atomic budget check
create or replace function increment_usage_if_under_limit(
  p_user_id uuid, p_service text, p_limit int
) returns boolean
language plpgsql
as $$
declare current_count int;
begin
  insert into usage_logs (user_id, date) values (p_user_id, current_date)
    on conflict (user_id, date) do nothing;

  if p_service = 'gemini' then
    select gemini_calls into current_count from usage_logs where user_id = p_user_id and date = current_date for update;
    if current_count >= p_limit then return false; end if;
    update usage_logs set gemini_calls = gemini_calls + 1 where user_id = p_user_id and date = current_date;
  else
    select claude_calls into current_count from usage_logs where user_id = p_user_id and date = current_date for update;
    if current_count >= p_limit then return false; end if;
    update usage_logs set claude_calls = claude_calls + 1 where user_id = p_user_id and date = current_date;
  end if;
  return true;
end;
$$;

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
  action_type text check (action_type in ('APPROVED', 'EDITED_APPROVED', 'REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED', 'AUTO_SENT')),
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
