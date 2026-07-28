begin;

-- Backend-owned lifecycle state, bounded user input, durable queue handoff, and
-- complete subscription entitlement state.

alter table public.profiles
  add column if not exists billing_status text not null default 'free',
  add column if not exists billing_product_id text,
  add column if not exists billing_period_ends_at timestamptz,
  add column if not exists slack_webhook_ciphertext text;

alter table public.profiles drop constraint if exists profiles_billing_status_check;
alter table public.profiles
  add constraint profiles_billing_status_check
  check (billing_status in ('free', 'pending', 'active', 'on_hold', 'cancelled', 'failed', 'expired'));

alter table public.profiles
  add constraint profiles_business_name_length_check
  check (business_name is null or char_length(business_name) between 1 and 120) not valid,
  add constraint profiles_business_description_length_check
  check (business_description is null or char_length(business_description) <= 4000) not valid,
  add constraint profiles_business_type_length_check
  check (business_type is null or char_length(business_type) <= 120) not valid,
  add constraint profiles_writing_style_length_check
  check (writing_style is null or char_length(writing_style) <= 2000) not valid,
  add constraint profiles_tone_examples_length_check
  check (tone_examples is null or char_length(tone_examples) <= 5000) not valid,
  add constraint profiles_competitors_count_check
  check (cardinality(competitors) <= 25) not valid,
  add constraint profiles_notification_preferences_size_check
  check (pg_column_size(notification_preferences) <= 4096) not valid;

alter table public.keywords
  add constraint keywords_term_length_check
  check (char_length(term) between 1 and 200) not valid,
  add constraint keywords_target_length_check
  check (char_length(target) between 1 and 200) not valid;

alter table public.monitored_threads
  add column if not exists send_claim_token uuid,
  add column if not exists send_claimed_at timestamptz,
  add constraint monitored_threads_external_id_length_check
  check (char_length(external_id) between 1 and 1000) not valid,
  add constraint monitored_threads_content_length_check
  check (text_content is null or char_length(text_content) <= 100000) not valid;

create unique index if not exists profiles_billing_subscription_uidx
  on public.profiles (billing_subscription_id)
  where billing_subscription_id is not null;

create unique index if not exists profiles_billing_customer_uidx
  on public.profiles (billing_customer_id)
  where billing_customer_id is not null;

create table if not exists public.job_outbox (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.monitored_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('auto_send')),
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'dispatched')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  unique (thread_id, kind)
);

create index if not exists job_outbox_pending_idx
  on public.job_outbox (created_at)
  where status = 'pending';

alter table public.job_outbox enable row level security;
revoke all on public.job_outbox from public, anon, authenticated;

-- Users may read their own discovered data. All creation and lifecycle writes
-- are backend-only and flow through the narrow functions below.
drop policy if exists "own threads" on public.monitored_threads;
drop policy if exists "own threads select" on public.monitored_threads;
create policy "own threads select"
  on public.monitored_threads for select to authenticated
  using (auth.uid() = user_id);
revoke insert, update, delete on public.monitored_threads from anon, authenticated;
grant select on public.monitored_threads to authenticated;

drop policy if exists "own analytics" on public.reply_analytics;
drop policy if exists "own analytics select" on public.reply_analytics;
create policy "own analytics select"
  on public.reply_analytics for select to authenticated
  using (auth.uid() = user_id);
revoke insert, update, delete on public.reply_analytics from anon, authenticated;
grant select on public.reply_analytics to authenticated;

create or replace function public.dismiss_thread(
  p_thread_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated uuid;
begin
  if v_user_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.monitored_threads
  set status = 'dismissed'
  where id = p_thread_id
    and user_id = v_user_id
    and status in ('pending', 'drafted', 'needs_manual_reply')
  returning id into v_updated;

  return v_updated is not null;
end;
$$;

revoke all on function public.dismiss_thread(uuid) from public, anon;
grant execute on function public.dismiss_thread(uuid) to authenticated;

create or replace function public.mark_thread_manually_replied(
  p_thread_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated uuid;
begin
  if v_user_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.monitored_threads
  set status = 'replied'
  where id = p_thread_id
    and user_id = v_user_id
    and status in ('drafted', 'needs_manual_reply')
  returning id into v_updated;

  if v_updated is not null then
    update public.reply_analytics
    set was_sent = true, sent_at = coalesce(sent_at, now())
    where thread_id = v_updated
      and user_id = v_user_id;
  end if;

  return v_updated is not null;
end;
$$;

revoke all on function public.mark_thread_manually_replied(uuid) from public, anon;
grant execute on function public.mark_thread_manually_replied(uuid) to authenticated;

create or replace function public.persist_scored_thread(
  p_user_id uuid,
  p_keyword_id uuid,
  p_platform text,
  p_external_id text,
  p_author text,
  p_title text,
  p_text_content text,
  p_url text,
  p_intent_score numeric,
  p_intent_label text,
  p_status text,
  p_flag text,
  p_reasoning text,
  p_tracking_sid text,
  p_matched_signals text[],
  p_quality_issues text[],
  p_automation_reason text,
  p_draft_text text,
  p_auto_send_payload jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_thread_id uuid;
  v_existing_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_platform not in ('reddit', 'bluesky', 'x', 'threads')
    or p_status not in ('pending', 'drafted', 'needs_manual_reply', 'dismissed')
    or p_intent_label not in ('buying', 'researching', 'complaining', 'other')
    or char_length(trim(coalesce(p_external_id, ''))) not between 1 and 1000
    or char_length(coalesce(p_text_content, '')) > 100000
    or (p_draft_text is not null and char_length(p_draft_text) > 10000) then
    raise exception 'invalid scored thread' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text || ':' || p_platform),
    hashtext(p_external_id)
  );

  select id, status
  into v_thread_id, v_existing_status
  from public.monitored_threads
  where user_id = p_user_id
    and platform = p_platform
    and external_id = p_external_id
  for update;

  if v_thread_id is null then
    if not exists (
      select 1 from public.keywords
      where id = p_keyword_id
        and user_id = p_user_id
        and platform = p_platform
    ) then
      raise exception 'keyword ownership mismatch' using errcode = '22023';
    end if;
    insert into public.monitored_threads (
      user_id, keyword_id, platform, external_id, author, title, text_content,
      url, intent_score, intent_label, status, flag, score_reasoning,
      tracking_sid, matched_signals, quality_issues, automation_reason
    ) values (
      p_user_id, p_keyword_id, p_platform, p_external_id, p_author, p_title,
      p_text_content, p_url, p_intent_score, p_intent_label, p_status, p_flag,
      p_reasoning, p_tracking_sid, coalesce(p_matched_signals, '{}'),
      coalesce(p_quality_issues, '{}'), p_automation_reason
    )
    returning id into v_thread_id;
  elsif v_existing_status = 'pending'
    or (
      p_draft_text is not null
      and v_existing_status in ('drafted', 'needs_manual_reply')
    ) then
    update public.monitored_threads
    set
      author = p_author,
      title = p_title,
      text_content = p_text_content,
      url = p_url,
      intent_score = p_intent_score,
      intent_label = p_intent_label,
      status = p_status,
      flag = p_flag,
      score_reasoning = p_reasoning,
      tracking_sid = coalesce(tracking_sid, p_tracking_sid),
      matched_signals = coalesce(p_matched_signals, '{}'),
      quality_issues = coalesce(p_quality_issues, '{}'),
      automation_reason = p_automation_reason
    where id = v_thread_id;
  else
    return v_thread_id;
  end if;

  if p_draft_text is not null then
    insert into public.reply_analytics (user_id, thread_id, draft_text)
    values (p_user_id, v_thread_id, p_draft_text)
    on conflict (thread_id) do update set
      draft_text = excluded.draft_text,
      edited_text = null;
  end if;

  if p_auto_send_payload is not null then
    insert into public.job_outbox (thread_id, user_id, kind, payload)
    values (
      v_thread_id,
      p_user_id,
      'auto_send',
      p_auto_send_payload || jsonb_build_object('threadId', v_thread_id)
    )
    on conflict (thread_id, kind) do update set
      payload = excluded.payload,
      status = case
        when public.job_outbox.status = 'dispatched' then public.job_outbox.status
        else 'pending'
      end,
      last_error = null;
  end if;

  return v_thread_id;
end;
$$;

revoke all on function public.persist_scored_thread(
  uuid, uuid, text, text, text, text, text, text, numeric, text, text, text,
  text, text, text[], text[], text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_scored_thread(
  uuid, uuid, text, text, text, text, text, text, numeric, text, text, text,
  text, text, text[], text[], text, text, jsonb
) to service_role;

-- The earlier feedback RPC trusted client-supplied source data. Keep it
-- unavailable while callers migrate to log_verified_draft_feedback below.
revoke all on function public.log_draft_feedback(
  uuid, uuid, text, text, text, text, text, text
) from public, anon, authenticated;

-- Slack webhook material is written only through the encrypted server route.
revoke update (slack_webhook_url, slack_webhook_ciphertext)
  on public.profiles from authenticated;

drop policy if exists "own connections" on public.platform_connections;
drop policy if exists "own connections select" on public.platform_connections;
create policy "own connections select"
  on public.platform_connections for select to authenticated
  using (auth.uid() = user_id);
revoke insert, update, delete on public.platform_connections from anon, authenticated;
grant select on public.platform_connections to authenticated;

-- Replace the boolean claim with a lease token. A crashed sender is moved to
-- reconciliation instead of ever becoming sendable automatically.
create or replace function public.claim_thread_for_send_v2(
  p_thread_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
  v_claimed uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.monitored_threads
  set
    status = 'sending',
    send_claim_token = v_token,
    send_claimed_at = now()
  where id = p_thread_id
    and user_id = p_user_id
    and status in ('drafted', 'needs_manual_reply')
  returning id into v_claimed;

  return case when v_claimed is null then null else v_token end;
end;
$$;

revoke all on function public.claim_thread_for_send_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_thread_for_send_v2(uuid, uuid)
  to service_role;

alter table public.send_audit_log drop constraint if exists send_audit_log_trigger_type_check;
alter table public.send_audit_log
  add constraint send_audit_log_trigger_type_check
  check (trigger_type in ('manual', 'auto', 'recovery'));

create or replace function public.recover_stale_send_claims(
  p_stale_before timestamptz
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with recovered as (
    update public.monitored_threads
    set
      status = 'send_reconciliation_required',
      send_claim_token = null
    where status = 'sending'
      and send_claimed_at < p_stale_before
    returning id, user_id, platform
  ), audited as (
    insert into public.send_audit_log (
      user_id, thread_id, platform, trigger_type, status, error_message
    )
    select
      user_id, id, platform, 'recovery', 'reconciliation_required',
      'Worker stopped while a public send was in progress; provider state must be verified.'
    from recovered
    returning id
  )
  select count(*)::integer into v_count from audited;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.recover_stale_send_claims(timestamptz)
  from public, anon, authenticated;
grant execute on function public.recover_stale_send_claims(timestamptz)
  to service_role;

create or replace function public.finalize_successful_send(
  p_thread_id uuid,
  p_user_id uuid,
  p_claim_token uuid,
  p_platform text,
  p_trigger_type text,
  p_permalink text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.monitored_threads
  set
    status = 'replied',
    send_claim_token = null,
    send_claimed_at = null
  where id = p_thread_id
    and user_id = p_user_id
    and status = 'sending'
    and send_claim_token = p_claim_token
  returning id into v_updated;

  if v_updated is null then return false; end if;

  update public.reply_analytics
  set was_sent = true, sent_at = now()
  where thread_id = p_thread_id and user_id = p_user_id;

  insert into public.send_audit_log (
    user_id, thread_id, platform, trigger_type, status, permalink
  ) values (
    p_user_id, p_thread_id, p_platform, p_trigger_type, 'success', p_permalink
  );

  return true;
end;
$$;

revoke all on function public.finalize_successful_send(
  uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_successful_send(
  uuid, uuid, uuid, text, text, text
) to service_role;

create or replace function public.release_send_claim(
  p_thread_id uuid,
  p_user_id uuid,
  p_claim_token uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.monitored_threads
  set
    status = 'drafted',
    send_claim_token = null,
    send_claimed_at = null
  where id = p_thread_id
    and user_id = p_user_id
    and status = 'sending'
    and send_claim_token = p_claim_token
  returning id into v_updated;

  return v_updated is not null;
end;
$$;

revoke all on function public.release_send_claim(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_send_claim(uuid, uuid, uuid)
  to service_role;

create or replace function public.mark_send_reconciliation(
  p_thread_id uuid,
  p_user_id uuid,
  p_claim_token uuid,
  p_platform text,
  p_trigger_type text,
  p_permalink text,
  p_error_message text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.monitored_threads
  set
    status = 'send_reconciliation_required',
    send_claim_token = null,
    send_claimed_at = null
  where id = p_thread_id
    and user_id = p_user_id
    and status = 'sending'
    and send_claim_token = p_claim_token
  returning id into v_updated;

  if v_updated is null then return false; end if;

  insert into public.send_audit_log (
    user_id, thread_id, platform, trigger_type, status, permalink, error_message
  ) values (
    p_user_id, p_thread_id, p_platform, p_trigger_type,
    'reconciliation_required', p_permalink, left(p_error_message, 500)
  );

  return true;
end;
$$;

revoke all on function public.mark_send_reconciliation(
  uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.mark_send_reconciliation(
  uuid, uuid, uuid, text, text, text, text
) to service_role;

create or replace function public.log_verified_draft_feedback(
  p_user_id uuid,
  p_thread_id uuid,
  p_final_draft text,
  p_action_type text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original_draft text;
  v_platform text;
  v_target_community text;
  v_keyword_cluster text;
  v_dist integer;
  v_max_len integer;
  v_score numeric(5,4);
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action_type not in (
    'APPROVED', 'EDITED_APPROVED', 'REJECTED', 'SKIPPED',
    'REGENERATE_REQUESTED', 'COPIED'
  ) then
    raise exception 'invalid action type' using errcode = '22023';
  end if;
  if p_final_draft is not null and char_length(p_final_draft) > 10000 then
    raise exception 'final draft is too long' using errcode = '22023';
  end if;

  select
    ra.draft_text,
    mt.platform,
    k.target,
    k.term
  into
    v_original_draft,
    v_platform,
    v_target_community,
    v_keyword_cluster
  from public.monitored_threads mt
  join public.reply_analytics ra
    on ra.thread_id = mt.id and ra.user_id = mt.user_id
  left join public.keywords k on k.id = mt.keyword_id
  where mt.id = p_thread_id and mt.user_id = p_user_id
  for update of mt, ra;

  if v_original_draft is null then
    raise exception 'verified draft not found' using errcode = 'P0002';
  end if;

  if p_action_type in ('REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED', 'COPIED') then
    v_score := null;
  elsif coalesce(p_final_draft, v_original_draft) = v_original_draft then
    v_score := 1;
  else
    v_dist := levenshtein(
      substring(v_original_draft from 1 for 250),
      substring(p_final_draft from 1 for 250)
    );
    v_max_len := greatest(
      length(substring(v_original_draft from 1 for 250)),
      length(substring(p_final_draft from 1 for 250))
    );
    v_score := case when v_max_len = 0 then 1
      else greatest(0, 1 - (v_dist::numeric / v_max_len::numeric)) end;
  end if;

  insert into public.draft_feedback (
    user_id, thread_id, original_draft, final_draft, action_type,
    edit_distance_score, platform, target_community, keyword_cluster
  ) values (
    p_user_id, p_thread_id, v_original_draft,
    coalesce(p_final_draft, v_original_draft), p_action_type,
    v_score, v_platform, v_target_community, v_keyword_cluster
  )
  on conflict (user_id, thread_id) do update set
    final_draft = case
      when excluded.action_type = 'COPIED' then public.draft_feedback.final_draft
      else excluded.final_draft
    end,
    action_type = case
      when excluded.action_type = 'COPIED'
        and public.draft_feedback.action_type in ('APPROVED', 'EDITED_APPROVED', 'AUTO_SENT')
        then public.draft_feedback.action_type
      else excluded.action_type
    end,
    edit_distance_score = case
      when excluded.action_type = 'COPIED' then public.draft_feedback.edit_distance_score
      else excluded.edit_distance_score
    end;

  if p_action_type <> 'COPIED' then
    insert into public.user_trust_metrics (
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
    from public.draft_feedback
    where user_id = p_user_id and action_type <> 'COPIED'
    on conflict (user_id) do update set
      total_drafts_reviewed = excluded.total_drafts_reviewed,
      total_approved = excluded.total_approved,
      approval_rate = excluded.approval_rate,
      avg_edit_distance = excluded.avg_edit_distance,
      dynamic_threshold = excluded.dynamic_threshold,
      last_updated = excluded.last_updated;
  end if;

  if p_action_type <> 'COPIED' and v_target_community is not null then
    insert into public.community_trust_metrics (
      platform, target_community, total_engagements, total_rejected, rejection_rate
    )
    select
      v_platform,
      v_target_community,
      count(*)::integer,
      count(*) filter (
        where action_type in ('REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED')
      )::integer,
      case when count(*) = 0 then 0 else
        count(*) filter (
          where action_type in ('REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED')
        )::numeric / count(*) end
    from public.draft_feedback
    where platform = v_platform
      and target_community = v_target_community
      and action_type <> 'COPIED'
    on conflict (platform, target_community) do update set
      total_engagements = excluded.total_engagements,
      total_rejected = excluded.total_rejected,
      rejection_rate = excluded.rejection_rate;
  end if;
end;
$$;

revoke all on function public.log_verified_draft_feedback(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.log_verified_draft_feedback(uuid, uuid, text, text)
  to service_role;

alter table public.billing_webhook_events
  add column if not exists provider_status text,
  add column if not exists product_id text,
  add column if not exists event_at timestamptz;

create or replace function public.apply_billing_subscription_event_v2(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_subscription_id text,
  p_customer_id text,
  p_plan text,
  p_provider_status text,
  p_product_id text,
  p_period_ends_at timestamptz,
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
  v_current_plan text;
  v_is_active boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event_id is null or p_event_id = ''
    or p_subscription_id is null or p_subscription_id = ''
    or p_product_id is null or p_product_id = ''
    or p_provider_status not in ('pending', 'active', 'on_hold', 'cancelled', 'failed', 'expired')
    or p_plan not in ('free', 'pro', 'growth') then
    raise exception 'invalid billing event' using errcode = '22023';
  end if;

  v_is_active := p_provider_status = 'active' and p_plan in ('pro', 'growth');

  insert into public.billing_webhook_events (
    provider_event_id, event_type, user_id, subscription_id,
    provider_status, product_id, event_at
  ) values (
    p_event_id, p_event_type, p_user_id, p_subscription_id,
    p_provider_status, p_product_id, p_event_at
  )
  on conflict (provider_event_id) do nothing
  returning provider_event_id into v_inserted;

  if v_inserted is null then return 'duplicate'; end if;

  select billing_subscription_id, billing_updated_at, plan
  into v_current_subscription, v_current_updated_at, v_current_plan
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if v_current_updated_at is not null and p_event_at < v_current_updated_at then
    update public.billing_webhook_events set processed_at = now()
    where provider_event_id = p_event_id;
    return 'stale';
  end if;
  if v_current_subscription is not null
    and v_current_subscription is distinct from p_subscription_id
    and p_event_type not in ('subscription.active', 'subscription.plan_changed') then
    update public.billing_webhook_events set processed_at = now()
    where provider_event_id = p_event_id;
    return 'stale_subscription';
  end if;

  update public.profiles
  set
    plan = case when v_is_active then p_plan else 'free' end,
    auto_send_enabled = case when v_is_active then auto_send_enabled else false end,
    billing_subscription_id = p_subscription_id,
    billing_customer_id = coalesce(p_customer_id, billing_customer_id),
    billing_status = p_provider_status,
    billing_product_id = p_product_id,
    billing_period_ends_at = p_period_ends_at,
    billing_updated_at = p_event_at
  where id = p_user_id;

  if not v_is_active and v_current_plan <> 'free' then
    with ranked as (
      select id, row_number() over (order by updated_at desc, created_at desc, id) as position
      from public.keywords where user_id = p_user_id
    )
    update public.keywords
    set is_active = ranked.position = 1
    from ranked
    where public.keywords.id = ranked.id;
  end if;

  update public.billing_webhook_events
  set processed_at = now()
  where provider_event_id = p_event_id;
  return 'applied';
end;
$$;

revoke all on function public.apply_billing_subscription_event_v2(
  text, text, uuid, text, text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_billing_subscription_event_v2(
  text, text, uuid, text, text, text, text, text, timestamptz, timestamptz
) to service_role;

-- The digest source follows actual worker lifecycle states.
create or replace function public.get_digest_opportunities(
  p_since timestamptz,
  p_min_score numeric default 70,
  p_per_user integer default 10
) returns setof public.monitored_threads
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
        public.monitored_threads as thread,
        row_number() over (
          partition by user_id
          order by intent_score desc, created_at desc
        ) as position
      from public.monitored_threads
      where status in ('drafted', 'needs_manual_reply')
        and intent_score >= p_min_score
        and created_at >= p_since
    ) ranked
    where ranked.position <= p_per_user;
end;
$$;

revoke all on function public.get_digest_opportunities(timestamptz, numeric, integer)
  from public, anon, authenticated;
grant execute on function public.get_digest_opportunities(timestamptz, numeric, integer)
  to service_role;

create or replace function public.cleanup_operational_data() returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ai integer;
  v_billing integer;
  v_outbox integer;
  v_ingestion integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.ai_spend_reservations
  where (
      status in ('reconciled', 'released')
      and completed_at < now() - interval '90 days'
    )
    or (
      status = 'pending'
      and created_at < now() - interval '1 day'
    );
  get diagnostics v_ai = row_count;

  delete from public.billing_webhook_events
  where processed_at < now() - interval '2 years';
  get diagnostics v_billing = row_count;

  delete from public.job_outbox
  where status = 'dispatched'
    and dispatched_at < now() - interval '30 days';
  get diagnostics v_outbox = row_count;

  delete from public.ingestion_events
  where processed_at < now() - interval '90 days';
  get diagnostics v_ingestion = row_count;

  return jsonb_build_object(
    'ai_spend_reservations_deleted', v_ai,
    'billing_webhook_events_deleted', v_billing,
    'job_outbox_deleted', v_outbox,
    'ingestion_events_deleted', v_ingestion
  );
end;
$$;

revoke all on function public.cleanup_operational_data()
  from public, anon, authenticated;
grant execute on function public.cleanup_operational_data()
  to service_role;

commit;
