-- =============================================================================
-- Scouto: Incremental Migration — Trust Engine Tables
-- Run this in the Supabase SQL Editor (NOT the full schema.sql which has DROP statements)
-- This only adds new tables that don't exist yet in the live project.
-- =============================================================================

-- 1. Draft Feedback log (with idempotency constraint)
create table if not exists draft_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  thread_id uuid references monitored_threads(id) on delete cascade,
  original_draft text,
  final_draft text,
  action_type text check (action_type in ('APPROVED', 'EDITED_APPROVED', 'REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED', 'AUTO_SENT')),
  edit_distance_score numeric(5,4),
  platform text,
  target_community text,
  keyword_cluster text,
  created_at timestamptz default now(),
  unique(user_id, thread_id)
);

alter table draft_feedback enable row level security;
drop policy if exists "own draft feedback" on draft_feedback;
create policy "own draft feedback" on draft_feedback for all using (auth.uid() = user_id);

-- 2. User Trust Metrics
create table if not exists user_trust_metrics (
  user_id uuid primary key references profiles(id) on delete cascade,
  total_drafts_reviewed int default 0,
  total_approved int default 0,
  approval_rate numeric(5,4) default 0.0,
  avg_edit_distance numeric(5,4) default 1.0,
  dynamic_threshold numeric(5,2) default 85.00,
  last_updated timestamptz default now()
);

alter table user_trust_metrics enable row level security;
drop policy if exists "own trust metrics" on user_trust_metrics;
create policy "own trust metrics" on user_trust_metrics for all using (auth.uid() = user_id);

-- 3. Community Trust Metrics
create table if not exists community_trust_metrics (
  platform text,
  target_community text,
  total_engagements int default 0,
  total_rejected int default 0,
  rejection_rate numeric(5,4) default 0.0,
  primary key (platform, target_community)
);

alter table community_trust_metrics enable row level security;
drop policy if exists "read all community metrics" on community_trust_metrics;
create policy "read all community metrics" on community_trust_metrics for select to authenticated using (true);

-- 4. Saved Views
create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  is_pinned boolean default false,
  created_at timestamptz default now()
);

alter table saved_views enable row level security;
drop policy if exists "own saved views" on saved_views;
create policy "own saved views" on saved_views for all using (auth.uid() = user_id);

-- 5. Add notification_preferences to profiles if not already there
alter table profiles
  add column if not exists notification_preferences jsonb
  default '{"emailDigest": true, "highIntentAlerts": true, "weeklyReport": false}'::jsonb;

-- 6. log_draft_feedback RPC
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

  -- 1. Calculate edit distance score (1.0 = untouched, 0.0 = total rewrite)
  if p_original_draft is not null and p_final_draft is not null and length(p_original_draft) > 0 then
    declare
      v_longer int := greatest(length(p_original_draft), length(p_final_draft));
      v_lev_dist int;
    begin
      -- Levenshtein approximation via character diff
      v_lev_dist := abs(length(p_original_draft) - length(p_final_draft));
      v_score := greatest(0.0, least(1.0, 1.0 - (v_lev_dist::numeric / v_longer)));
    end;
  end if;

  -- 2. Log the feedback event
  insert into draft_feedback (user_id, thread_id, original_draft, final_draft, action_type, edit_distance_score, platform, target_community, keyword_cluster)
  values (p_user_id, p_thread_id, p_original_draft, p_final_draft, p_action_type, v_score, p_platform, p_target_community, p_keyword_cluster)
  on conflict (user_id, thread_id) do update set
    action_type = excluded.action_type,
    final_draft = excluded.final_draft,
    edit_distance_score = excluded.edit_distance_score;

  -- 3. Update User Trust Metrics (skip REJECTED/SKIPPED for edit_distance)
  if p_action_type not in ('REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED') then
    insert into user_trust_metrics (user_id, total_drafts_reviewed, total_approved, approval_rate, avg_edit_distance)
    values (
      p_user_id, 1,
      case when p_action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT') then 1 else 0 end,
      case when p_action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT') then 1.0 else 0.0 end,
      coalesce(v_score, 1.0)
    )
    on conflict (user_id) do update set
      total_drafts_reviewed = user_trust_metrics.total_drafts_reviewed + 1,
      total_approved = user_trust_metrics.total_approved + case when p_action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT') then 1 else 0 end,
      approval_rate = (user_trust_metrics.total_approved + case when p_action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT') then 1 else 0 end)::numeric / (user_trust_metrics.total_drafts_reviewed + 1),
      avg_edit_distance = case
        when v_score is not null then (user_trust_metrics.avg_edit_distance * 0.9) + (v_score * 0.1)
        else user_trust_metrics.avg_edit_distance
      end,
      last_updated = now();

    -- Update dynamic_threshold after updating avg_edit_distance
    update user_trust_metrics set
      dynamic_threshold = 85.0 - ((avg_edit_distance - 0.5) * 10.0)
    where user_id = p_user_id;
  end if;

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
