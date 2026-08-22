-- Add Sprinklr's official Reddit data-partner integration alongside the
-- legacy RedditAPIs session provider. Sprinklr credentials stay in server
-- environment variables; this table stores only the encrypted account map.

alter table public.reddit_connection_secrets
  drop constraint if exists reddit_connection_secrets_provider_check;
alter table public.reddit_connection_secrets
  add constraint reddit_connection_secrets_provider_check
  check (provider in ('redditapis', 'sprinklr'));

alter table public.reddit_connection_secrets
  drop constraint if exists reddit_connection_secrets_session_version_check;
alter table public.reddit_connection_secrets
  add constraint reddit_connection_secrets_session_version_check
  check (session_version in (1, 2));

create or replace function public.save_sprinklr_reddit_connection_v1(
  p_user_id uuid,
  p_username text,
  p_session_ciphertext text,
  p_account_created_at timestamptz default null,
  p_link_karma integer default null,
  p_comment_karma integer default null
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
    or nullif(trim(p_username), '') is null
    or nullif(p_session_ciphertext, '') is null then
    raise exception 'invalid_reddit_connection' using errcode = '22023';
  end if;

  insert into public.platform_connections (
    user_id, platform, access_token, refresh_token, external_username, connected_at
  ) values (
    p_user_id, 'reddit', null, null, trim(p_username), now()
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
    v_connection_id, p_user_id, 'sprinklr', p_session_ciphertext, 2,
    'active', p_account_created_at, p_link_karma, p_comment_karma, now(),
    null, 0, null, now()
  )
  on conflict (user_id) do update set
    connection_id = excluded.connection_id,
    provider = excluded.provider,
    session_ciphertext = excluded.session_ciphertext,
    session_version = excluded.session_version,
    status = 'active',
    account_created_at = excluded.account_created_at,
    link_karma = excluded.link_karma,
    comment_karma = excluded.comment_karma,
    last_verified_at = now(),
    last_used_at = null,
    consecutive_failures = 0,
    last_error_code = null,
    updated_at = now();

  return v_connection_id;
end;
$$;

revoke all on function public.save_sprinklr_reddit_connection_v1(
  uuid, text, text, timestamptz, integer, integer
) from public, anon, authenticated;
grant execute on function public.save_sprinklr_reddit_connection_v1(
  uuid, text, text, timestamptz, integer, integer
) to service_role;
