-- Store RedditAPIs write sessions separately from user-readable connection
-- metadata. Passwords and TOTP secrets are never persisted; only the encrypted
-- cookies returned by the one-time provider login are stored here.

create table if not exists public.reddit_connection_secrets (
  connection_id uuid primary key
    references public.platform_connections(id) on delete cascade,
  user_id uuid not null unique
    references public.profiles(id) on delete cascade,
  provider text not null default 'redditapis'
    check (provider = 'redditapis'),
  session_ciphertext text not null,
  session_version integer not null default 1
    check (session_version = 1),
  status text not null default 'active'
    check (status in ('active', 'reauth_required', 'error')),
  account_created_at timestamptz,
  link_karma integer,
  comment_karma integer,
  last_verified_at timestamptz not null default now(),
  last_used_at timestamptz,
  consecutive_failures integer not null default 0
    check (consecutive_failures >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reddit_connection_secrets enable row level security;

-- There are deliberately no authenticated-user policies on this table. The
-- service role is the only database principal allowed to touch session data.
revoke all on table public.reddit_connection_secrets
  from public, anon, authenticated;
grant select, insert, update, delete on table public.reddit_connection_secrets
  to service_role;

create index if not exists reddit_connection_secrets_status_idx
  on public.reddit_connection_secrets (status, updated_at);

create or replace function public.save_redditapis_connection_v1(
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
    user_id,
    platform,
    access_token,
    refresh_token,
    external_username,
    connected_at
  ) values (
    p_user_id,
    'reddit',
    null,
    null,
    trim(p_username),
    now()
  )
  on conflict (user_id, platform) do update set
    access_token = null,
    refresh_token = null,
    external_username = excluded.external_username,
    connected_at = excluded.connected_at
  returning id into v_connection_id;

  insert into public.reddit_connection_secrets (
    connection_id,
    user_id,
    provider,
    session_ciphertext,
    session_version,
    status,
    account_created_at,
    link_karma,
    comment_karma,
    last_verified_at,
    last_used_at,
    consecutive_failures,
    last_error_code,
    updated_at
  ) values (
    v_connection_id,
    p_user_id,
    'redditapis',
    p_session_ciphertext,
    1,
    'active',
    p_account_created_at,
    p_link_karma,
    p_comment_karma,
    now(),
    null,
    0,
    null,
    now()
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

revoke all on function public.save_redditapis_connection_v1(
  uuid, text, text, timestamptz, integer, integer
) from public, anon, authenticated;
grant execute on function public.save_redditapis_connection_v1(
  uuid, text, text, timestamptz, integer, integer
) to service_role;

-- OAuth bearer tokens are no longer used for Reddit delivery. Clearing them
-- prevents stale credentials from being mistaken for an active write session;
-- the connection row is retained so the UI can explain that reconnection is
-- required instead of silently losing the account identity.
update public.platform_connections
set access_token = null,
    refresh_token = null
where platform = 'reddit';

create or replace function public.handle_platform_disconnect_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.job_outbox
  set status = 'cancelled',
      dispatched_at = coalesce(dispatched_at, now()),
      last_error = 'Automatic delivery cancelled: platform disconnected'
  where user_id = old.user_id
    and kind = 'auto_send'
    and status in ('pending', 'dispatched')
    and payload ->> 'platform' = old.platform;

  return old;
end;
$$;

revoke all on function public.handle_platform_disconnect_v1()
  from public, anon, authenticated;

drop trigger if exists platform_connection_disconnect_cleanup_v1
  on public.platform_connections;
create trigger platform_connection_disconnect_cleanup_v1
  after delete on public.platform_connections
  for each row execute function public.handle_platform_disconnect_v1();
