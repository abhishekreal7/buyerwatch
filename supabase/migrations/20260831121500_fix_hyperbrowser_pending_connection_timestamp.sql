-- reddit_connection_secrets.last_verified_at is non-null in existing
-- production databases. A pending connection is still fail-closed via status;
-- record the provisioning time instead of writing NULL.

create or replace function public.save_pending_hyperbrowser_reddit_connection_v1(
  p_user_id uuid,
  p_username text,
  p_session_ciphertext text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_connection_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null
    or p_username !~ '^[A-Za-z0-9_-]{3,32}$'
    or nullif(p_session_ciphertext, '') is null then
    raise exception 'invalid_reddit_connection' using errcode = '22023';
  end if;

  insert into public.platform_connections (
    user_id, platform, access_token, refresh_token, external_username, connected_at
  ) values (
    p_user_id, 'reddit', null, null, p_username, now()
  )
  on conflict (user_id, platform) do update set
    access_token = null,
    refresh_token = null,
    external_username = excluded.external_username,
    connected_at = excluded.connected_at
  returning id into v_connection_id;

  insert into public.reddit_connection_secrets (
    connection_id, user_id, provider, session_ciphertext, session_version,
    status, account_created_at, link_karma, comment_karma, last_verified_at,
    last_used_at, consecutive_failures, last_error_code, updated_at
  ) values (
    v_connection_id, p_user_id, 'hyperbrowser', p_session_ciphertext, 5,
    'reauth_required', null, null, null, now(),
    null, 0, 'hyperbrowser_sign_in_required', now()
  )
  on conflict (user_id) do update set
    connection_id = excluded.connection_id,
    provider = excluded.provider,
    session_ciphertext = excluded.session_ciphertext,
    session_version = excluded.session_version,
    status = 'reauth_required',
    account_created_at = null,
    link_karma = null,
    comment_karma = null,
    last_verified_at = now(),
    last_used_at = null,
    consecutive_failures = 0,
    last_error_code = 'hyperbrowser_sign_in_required',
    updated_at = now();

  return v_connection_id;
end;
$$;

revoke all on function public.save_pending_hyperbrowser_reddit_connection_v1(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.save_pending_hyperbrowser_reddit_connection_v1(
  uuid, text, text
) to service_role;
