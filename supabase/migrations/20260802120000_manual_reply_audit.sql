create or replace function public.mark_thread_manually_replied_v2(
  p_thread_id uuid,
  p_final_text text,
  p_permalink text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_thread public.monitored_threads%rowtype;
begin
  if v_user_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_final_text is null or length(trim(p_final_text)) = 0 or length(p_final_text) > 10000 then
    raise exception 'invalid reply text' using errcode = '22023';
  end if;

  update public.monitored_threads
  set status = 'replied'
  where id = p_thread_id
    and user_id = v_user_id
    and status in ('drafted', 'needs_manual_reply')
  returning * into v_thread;

  if v_thread.id is null then return false; end if;

  update public.reply_analytics
  set
    edited_text = p_final_text,
    was_sent = true,
    sent_at = coalesce(sent_at, now())
  where thread_id = p_thread_id and user_id = v_user_id;

  insert into public.send_audit_log (
    user_id, thread_id, platform, trigger_type, status, permalink
  ) values (
    v_user_id, p_thread_id, v_thread.platform, 'manual', 'success', nullif(trim(p_permalink), '')
  );

  return true;
end;
$$;

revoke all on function public.mark_thread_manually_replied_v2(uuid, text, text)
  from public, anon;
grant execute on function public.mark_thread_manually_replied_v2(uuid, text, text)
  to authenticated;
