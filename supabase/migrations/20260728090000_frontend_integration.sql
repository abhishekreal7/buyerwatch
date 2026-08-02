-- Persist the new writing controls and onboarding progress without introducing
-- client-only sources of truth.

alter table profiles
  add column if not exists tone_archetype text,
  add column if not exists style_guardrails text[] not null default '{}';

alter table profiles drop constraint if exists profiles_tone_archetype_check;
alter table profiles
  add constraint profiles_tone_archetype_check
  check (
    tone_archetype is null
    or tone_archetype in ('consultative', 'casual', 'direct', 'problem_solver')
  );

alter table profiles drop constraint if exists profiles_style_guardrails_check;
alter table profiles
  add constraint profiles_style_guardrails_check
  check (
    style_guardrails <@ array[
      'no_emojis',
      'casual_lowercase',
      'include_affiliation_disclosure',
      'lead_with_value_first',
      'never_pitch_directly'
    ]::text[]
  );

grant update (tone_archetype, style_guardrails) on profiles to authenticated;

alter table monitored_threads
  add column if not exists reviewed_at timestamptz;

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

alter table draft_feedback drop constraint if exists draft_feedback_action_type_check;
alter table draft_feedback
  add constraint draft_feedback_action_type_check
  check (
    action_type in (
      'APPROVED',
      'EDITED_APPROVED',
      'REJECTED',
      'SKIPPED',
      'REGENERATE_REQUESTED',
      'AUTO_SENT',
      'COPIED'
    )
  );

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
    'APPROVED', 'EDITED_APPROVED', 'REJECTED', 'SKIPPED',
    'REGENERATE_REQUESTED', 'COPIED'
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

  if p_action_type in ('REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED', 'COPIED') then
    v_score := null;
  end if;

  insert into draft_feedback (
    user_id, thread_id, original_draft, final_draft, action_type,
    edit_distance_score, platform, target_community, keyword_cluster
  ) values (
    p_user_id, p_thread_id, p_original_draft, p_final_draft, p_action_type,
    v_score, p_platform, p_target_community, p_keyword_cluster
  )
  on conflict (user_id, thread_id) do update set
    final_draft = case
      when excluded.action_type = 'COPIED' then draft_feedback.final_draft
      else excluded.final_draft
    end,
    action_type = case
      when excluded.action_type = 'COPIED'
        and draft_feedback.action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT')
        then draft_feedback.action_type
      else excluded.action_type
    end,
    edit_distance_score = case
      when excluded.action_type = 'COPIED' then draft_feedback.edit_distance_score
      else excluded.edit_distance_score
    end;

  if p_action_type <> 'COPIED' then
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
    where user_id = p_user_id and action_type <> 'COPIED'
    on conflict (user_id) do update set
      total_drafts_reviewed = excluded.total_drafts_reviewed,
      total_approved = excluded.total_approved,
      approval_rate = excluded.approval_rate,
      avg_edit_distance = excluded.avg_edit_distance,
      dynamic_threshold = excluded.dynamic_threshold,
      last_updated = excluded.last_updated;
  end if;

  if p_action_type <> 'COPIED'
    and p_platform is not null
    and p_target_community is not null then
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
    where platform = p_platform
      and target_community = p_target_community
      and action_type <> 'COPIED'
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

  return v_count is not null;
end;
$$;

revoke all on function reserve_monthly_draft(uuid, integer) from public, anon;
grant execute on function reserve_monthly_draft(uuid, integer) to authenticated, service_role;
