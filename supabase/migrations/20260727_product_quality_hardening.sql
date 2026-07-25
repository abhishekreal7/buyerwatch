-- Product-quality hardening that is independent of external provider credentials.

alter table monitored_threads
  add column if not exists title text,
  add column if not exists intent_label text,
  add column if not exists matched_signals text[] not null default '{}',
  add column if not exists quality_issues text[] not null default '{}',
  add column if not exists automation_reason text;

update monitored_threads
set intent_label = case
  when intent_score >= 80 then 'buying'
  when intent_score >= 60 then 'researching'
  else 'other'
end
where intent_label is null;

alter table monitored_threads
  drop constraint if exists monitored_threads_intent_label_check;
alter table monitored_threads
  add constraint monitored_threads_intent_label_check
  check (intent_label in ('buying', 'researching', 'complaining', 'other'));

alter table profiles
  drop constraint if exists profiles_auto_send_threshold_check;
alter table profiles
  add constraint profiles_auto_send_threshold_check
  check (auto_send_threshold between 70 and 100);

-- One analytics row is the source of truth for one thread. Regeneration updates
-- the draft instead of creating ambiguous historical rows.
delete from reply_analytics older
using reply_analytics newer
where older.thread_id = newer.thread_id
  and (
    older.created_at < newer.created_at
    or (older.created_at = newer.created_at and older.id < newer.id)
  );

create unique index if not exists reply_analytics_thread_uidx
  on reply_analytics(thread_id);

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
  if trim(coalesce(p_draft_text, '')) = '' or length(p_draft_text) > 10000 then
    raise exception 'invalid draft text' using errcode = '22023';
  end if;

  update monitored_threads set status = 'drafted'
  where id = p_thread_id
    and user_id = p_user_id
    and status in ('pending', 'drafted', 'needs_manual_reply');
  if not found then
    raise exception 'thread not found or not draftable' using errcode = 'P0002';
  end if;

  insert into reply_analytics (user_id, thread_id, draft_text)
  values (p_user_id, p_thread_id, p_draft_text)
  on conflict (thread_id) do update set
    draft_text = excluded.draft_text,
    edited_text = null;
end;
$$;

revoke all on function save_generated_draft(uuid, uuid, text) from public, anon;
grant execute on function save_generated_draft(uuid, uuid, text) to authenticated;
