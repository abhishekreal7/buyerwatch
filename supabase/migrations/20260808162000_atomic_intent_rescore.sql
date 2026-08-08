begin;

-- Apply deterministic scoring upgrades to active historical rows without
-- racing a reply/send transition. Rows that are no longer actionable become
-- dismissed and any unconfirmed automatic-delivery handoff is cancelled in
-- the same transaction.
create or replace function public.apply_intent_rescore_v1(
  p_thread_id uuid,
  p_intent_score numeric,
  p_intent_label text,
  p_flag text,
  p_reasoning text,
  p_matched_signals text[],
  p_should_dismiss boolean,
  p_automation_reason text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_thread_id is null
    or p_intent_score is null
    or p_intent_score < 0
    or p_intent_score > 100
    or p_intent_label not in ('buying', 'researching', 'complaining', 'other')
    or (p_intent_score >= 80 and p_intent_label <> 'buying')
    or (p_intent_score >= 60 and p_intent_score < 80 and p_intent_label <> 'researching')
    or (p_intent_score >= 40 and p_intent_score < 60 and p_intent_label <> 'complaining')
    or (p_intent_score < 40 and p_intent_label <> 'other')
    or (p_flag is not null and p_flag <> 'COMPETITOR_RISK')
    or p_should_dismiss is null
    or (p_should_dismiss is false and p_intent_score < 60)
    or char_length(trim(coalesce(p_reasoning, ''))) not between 8 and 500
    or char_length(trim(coalesce(p_automation_reason, ''))) not between 1 and 100 then
    raise exception 'invalid intent rescore' using errcode = '22023';
  end if;

  update public.monitored_threads
  set
    intent_score = round(p_intent_score),
    intent_label = p_intent_label,
    status = case when p_should_dismiss then 'dismissed' else status end,
    flag = nullif(trim(coalesce(p_flag, '')), ''),
    score_reasoning = trim(p_reasoning),
    matched_signals = coalesce(p_matched_signals, '{}'),
    automation_reason = trim(p_automation_reason)
  where id = p_thread_id
    and status in ('pending', 'drafted', 'needs_manual_reply')
  returning id into v_updated_id;

  if v_updated_id is null then
    return false;
  end if;

  if p_should_dismiss then
    update public.job_outbox
    set
      status = 'cancelled',
      dispatched_at = coalesce(dispatched_at, now()),
      last_error = 'Automatic delivery cancelled after intent rescore rejection.'
    where thread_id = v_updated_id
      and kind = 'auto_send'
      and status in ('pending', 'dispatched');
  end if;

  return true;
end;
$$;

revoke all on function public.apply_intent_rescore_v1(
  uuid, numeric, text, text, text, text[], boolean, text
) from public, anon, authenticated;
grant execute on function public.apply_intent_rescore_v1(
  uuid, numeric, text, text, text, text[], boolean, text
) to service_role;

-- A user dismissal is also an immediate automation cancellation. Preserve an
-- explicit reason so future maintenance never mistakes it for a scorer reject.
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
  set
    status = 'dismissed',
    automation_reason = 'user_dismissed'
  where id = p_thread_id
    and user_id = v_user_id
    and status in ('pending', 'drafted', 'needs_manual_reply')
  returning id into v_updated;

  if v_updated is not null then
    update public.job_outbox
    set
      status = 'cancelled',
      dispatched_at = coalesce(dispatched_at, now()),
      last_error = 'Automatic delivery cancelled because the conversation was dismissed.'
    where thread_id = v_updated
      and user_id = v_user_id
      and kind = 'auto_send'
      and status in ('pending', 'dispatched');
  end if;

  return v_updated is not null;
end;
$$;

revoke all on function public.dismiss_thread(uuid) from public, anon;
grant execute on function public.dismiss_thread(uuid) to authenticated;

commit;
