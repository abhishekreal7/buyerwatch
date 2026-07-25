-- Initial, rerunnable database baseline.
-- This migration intentionally contains only objects required by later migrations.

create extension if not exists pgcrypto;
create extension if not exists fuzzystrmatch;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  business_description text,
  business_url text,
  business_type text,
  writing_style text,
  reddit_username text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'growth')),
  auto_send_enabled boolean not null default false,
  auto_send_threshold integer not null default 85 check (auto_send_threshold between 70 and 100),
  notification_preferences jsonb not null default '{"emailDigest": true, "highIntentAlerts": true, "weeklyReport": false}'::jsonb,
  last_polled_at timestamptz,
  competitors text[] not null default '{}',
  tone_examples text,
  created_at timestamptz not null default now()
);

create table if not exists keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  term text not null,
  platform text not null default 'reddit' check (platform in ('reddit', 'bluesky', 'x', 'threads')),
  target text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists monitored_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  keyword_id uuid references keywords(id) on delete set null,
  platform text not null check (platform in ('reddit', 'bluesky', 'x', 'threads')),
  external_id text not null,
  author text,
  text_content text,
  url text,
  intent_score numeric,
  status text not null default 'pending'
    check (status in ('pending', 'drafted', 'sending', 'needs_manual_reply', 'dismissed', 'replied')),
  flag text,
  created_at timestamptz not null default now(),
  unique (user_id, platform, external_id)
);

create table if not exists reply_analytics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  thread_id uuid not null references monitored_threads(id) on delete cascade,
  draft_text text,
  edited_text text,
  was_sent boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists usage_logs (
  user_id uuid references profiles(id) on delete cascade,
  date date default current_date,
  gemini_calls integer not null default 0,
  claude_calls integer not null default 0,
  x_spend_cents integer not null default 0,
  primary key (user_id, date)
);

create table if not exists platform_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('reddit', 'bluesky', 'x', 'threads')),
  access_token text,
  refresh_token text,
  external_username text,
  connected_at timestamptz not null default now(),
  unique (user_id, platform)
);

create table if not exists send_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  thread_id uuid not null references monitored_threads(id) on delete cascade,
  platform text not null,
  trigger_type text not null check (trigger_type in ('manual', 'auto')),
  status text not null check (status in ('success', 'failed_retryable', 'failed_permanent')),
  error_message text,
  permalink text,
  created_at timestamptz not null default now()
);

create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  filters_json jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists draft_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  thread_id uuid not null references monitored_threads(id) on delete cascade,
  original_draft text,
  final_draft text,
  action_type text check (action_type in ('APPROVED', 'EDITED_APPROVED', 'REJECTED', 'SKIPPED', 'AUTO_SENT')),
  edit_distance_score numeric(5,4),
  platform text,
  target_community text,
  keyword_cluster text,
  created_at timestamptz not null default now(),
  unique (user_id, thread_id)
);

create table if not exists user_trust_metrics (
  user_id uuid primary key references profiles(id) on delete cascade,
  total_drafts_reviewed integer not null default 0,
  total_approved integer not null default 0,
  approval_rate numeric(5,4) not null default 0,
  avg_edit_distance numeric(5,4) not null default 1,
  dynamic_threshold numeric(5,2) not null default 85,
  last_updated timestamptz not null default now()
);

create table if not exists community_trust_metrics (
  platform text,
  target_community text,
  total_engagements integer not null default 0,
  total_rejected integer not null default 0,
  rejection_rate numeric(5,4) not null default 0,
  primary key (platform, target_community)
);

alter table profiles enable row level security;
alter table keywords enable row level security;
alter table monitored_threads enable row level security;
alter table reply_analytics enable row level security;
alter table usage_logs enable row level security;
alter table platform_connections enable row level security;
alter table send_audit_log enable row level security;
alter table saved_views enable row level security;
alter table draft_feedback enable row level security;
alter table user_trust_metrics enable row level security;
alter table community_trust_metrics enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own keywords" on keywords for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own threads" on monitored_threads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own analytics" on reply_analytics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own usage" on usage_logs for select using (auth.uid() = user_id);
create policy "own connections" on platform_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own audit logs" on send_audit_log for select using (auth.uid() = user_id);
create policy "own saved views" on saved_views for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own draft feedback" on draft_feedback for select using (auth.uid() = user_id);
create policy "own trust metrics" on user_trust_metrics for select using (auth.uid() = user_id);
create policy "read all community metrics" on community_trust_metrics for select to authenticated using (true);

create or replace function increment_usage_if_under_limit(
  p_user_id uuid,
  p_service text,
  p_limit integer
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  current_count integer;
begin
  insert into usage_logs (user_id, date) values (p_user_id, current_date)
  on conflict (user_id, date) do nothing;

  if p_service = 'gemini' then
    select gemini_calls into current_count from usage_logs
    where user_id = p_user_id and date = current_date for update;
    if current_count >= p_limit then return false; end if;
    update usage_logs set gemini_calls = gemini_calls + 1
    where user_id = p_user_id and date = current_date;
  elsif p_service = 'claude' then
    select claude_calls into current_count from usage_logs
    where user_id = p_user_id and date = current_date for update;
    if current_count >= p_limit then return false; end if;
    update usage_logs set claude_calls = claude_calls + 1
    where user_id = p_user_id and date = current_date;
  else
    raise exception 'unsupported usage service';
  end if;

  return true;
end;
$$;

create or replace function increment_x_spend_if_under_limit(
  p_user_id uuid,
  p_cost_cents integer,
  p_daily_limit_cents integer
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  current_spend integer;
begin
  insert into usage_logs (user_id, date) values (p_user_id, current_date)
  on conflict (user_id, date) do nothing;

  select x_spend_cents into current_spend from usage_logs
  where user_id = p_user_id and date = current_date for update;

  if current_spend + p_cost_cents > p_daily_limit_cents then return false; end if;

  update usage_logs set x_spend_cents = x_spend_cents + p_cost_cents
  where user_id = p_user_id and date = current_date;
  return true;
end;
$$;
