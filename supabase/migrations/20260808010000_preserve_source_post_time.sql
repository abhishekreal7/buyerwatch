-- Preserve the publication timestamp separately from BuyerWatch's ingestion
-- timestamp. This keeps stale-post scoring, retry recovery, and UI recency
-- faithful to the source network.

alter table public.monitored_threads
  add column if not exists source_created_at timestamptz;

update public.monitored_threads
set source_created_at = created_at
where source_created_at is null;

alter table public.monitored_threads
  alter column source_created_at set default now(),
  alter column source_created_at set not null;

create index if not exists monitored_threads_user_source_created_idx
  on public.monitored_threads (user_id, source_created_at desc);

create or replace function public.persist_scored_thread_v2(
  p_user_id uuid,
  p_keyword_id uuid,
  p_platform text,
  p_external_id text,
  p_author text,
  p_title text,
  p_text_content text,
  p_url text,
  p_source_created_at timestamptz,
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
      url, source_created_at, intent_score, intent_label, status, flag,
      score_reasoning, tracking_sid, matched_signals, quality_issues,
      automation_reason
    ) values (
      p_user_id, p_keyword_id, p_platform, p_external_id, p_author, p_title,
      p_text_content, p_url, coalesce(p_source_created_at, now()),
      p_intent_score, p_intent_label, p_status, p_flag, p_reasoning,
      p_tracking_sid, coalesce(p_matched_signals, '{}'),
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
      source_created_at = coalesce(p_source_created_at, source_created_at),
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

revoke all on function public.persist_scored_thread_v2(
  uuid, uuid, text, text, text, text, text, text, timestamptz, numeric, text,
  text, text, text, text, text[], text[], text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.persist_scored_thread_v2(
  uuid, uuid, text, text, text, text, text, text, timestamptz, numeric, text,
  text, text, text, text, text[], text[], text, text, jsonb
) to service_role;
