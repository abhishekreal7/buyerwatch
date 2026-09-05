-- Resolve ambiguous Reddit writes only after an independent, read-only check
-- finds the exact comment on the exact post. Absence never becomes proof that
-- a write failed, so unresolved cases remain in the manual reconciliation UI.

create or replace function public.resolve_send_reconciliation_automatically_v1(
  p_thread_id uuid,
  p_user_id uuid,
  p_permalink text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_audit public.send_audit_log%rowtype;
  v_permalink text := btrim(coalesce(p_permalink, ''));
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_permalink) not between 1 and 2000
    or v_permalink !~* '^https://(www\.)?reddit\.com/' then
    raise exception 'invalid permalink' using errcode = '22023';
  end if;

  select * into v_audit
  from public.send_audit_log
  where thread_id = p_thread_id
    and user_id = p_user_id
    and platform = 'reddit'
    and status = 'reconciliation_required'
  order by created_at desc
  limit 1
  for update;

  if not found then return 'not_pending'; end if;

  perform 1
  from public.monitored_threads
  where id = p_thread_id
    and user_id = p_user_id
    and status = 'send_reconciliation_required'
  for update;
  if not found then return 'thread_not_pending'; end if;

  update public.monitored_threads
  set status = 'replied'
  where id = p_thread_id and user_id = p_user_id;

  update public.reply_analytics
  set was_sent = true,
      sent_at = coalesce(sent_at, v_audit.created_at)
  where thread_id = p_thread_id and user_id = p_user_id;

  update public.send_audit_log
  set status = 'resolved_replied',
      permalink = v_permalink,
      resolved_at = now(),
      resolved_by = null,
      resolution_note = 'Automatically confirmed by a delayed read-only Reddit verification.'
  where id = v_audit.id;

  return 'resolved';
end;
$$;

revoke all on function public.resolve_send_reconciliation_automatically_v1(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_send_reconciliation_automatically_v1(uuid, uuid, text)
  to service_role;
