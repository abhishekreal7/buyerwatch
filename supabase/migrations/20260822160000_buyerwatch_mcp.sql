-- BuyerWatch MCP uses revocable, one-time-visible API keys. Only hashes are
-- stored. The MCP agent records a passwordless Reddit identity after verifying
-- the signed-in profile in the user's own browser.

create table if not exists public.mcp_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_prefix text not null check (length(token_prefix) between 8 and 24),
  label text not null default 'BuyerWatch AI agent' check (length(label) between 1 and 80),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists mcp_access_tokens_one_active_per_user_idx
  on public.mcp_access_tokens(user_id)
  where revoked_at is null;
create index if not exists mcp_access_tokens_hash_active_idx
  on public.mcp_access_tokens(token_hash)
  where revoked_at is null;

alter table public.mcp_access_tokens enable row level security;
revoke all on table public.mcp_access_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.mcp_access_tokens to service_role;

create or replace function public.rotate_mcp_access_token_v1(
  p_user_id uuid,
  p_token_hash text,
  p_token_prefix text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or length(p_token_prefix) not between 8 and 24 then
    raise exception 'invalid mcp token' using errcode = '22023';
  end if;

  update public.mcp_access_tokens
  set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;

  insert into public.mcp_access_tokens(user_id, token_hash, token_prefix)
  values (p_user_id, p_token_hash, p_token_prefix)
  returning id into v_token_id;

  return v_token_id;
end;
$$;

revoke all on function public.rotate_mcp_access_token_v1(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.rotate_mcp_access_token_v1(uuid, text, text)
  to service_role;

alter table public.reddit_connection_secrets
  drop constraint if exists reddit_connection_secrets_provider_check;
alter table public.reddit_connection_secrets
  add constraint reddit_connection_secrets_provider_check
  check (provider in ('redditapis', 'sprinklr', 'browser_relay', 'mcp_agent'));

alter table public.reddit_connection_secrets
  drop constraint if exists reddit_connection_secrets_session_version_check;
alter table public.reddit_connection_secrets
  add constraint reddit_connection_secrets_session_version_check
  check (session_version in (1, 2, 3, 4));

create or replace function public.save_mcp_agent_reddit_connection_v1(
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
    v_connection_id, p_user_id, 'mcp_agent', p_session_ciphertext, 4,
    'active', null, null, null, now(), null, 0, null, now()
  )
  on conflict (user_id) do update set
    connection_id = excluded.connection_id,
    provider = excluded.provider,
    session_ciphertext = excluded.session_ciphertext,
    session_version = excluded.session_version,
    status = 'active',
    account_created_at = null,
    link_karma = null,
    comment_karma = null,
    last_verified_at = now(),
    last_used_at = null,
    consecutive_failures = 0,
    last_error_code = null,
    updated_at = now();

  return v_connection_id;
end;
$$;

revoke all on function public.save_mcp_agent_reddit_connection_v1(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.save_mcp_agent_reddit_connection_v1(uuid, text, text)
  to service_role;

create or replace function public.mark_thread_mcp_replied_v1(
  p_user_id uuid,
  p_thread_id uuid,
  p_final_text text,
  p_permalink text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_thread public.monitored_threads%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null
    or p_final_text is null
    or length(trim(p_final_text)) = 0
    or length(p_final_text) > 10000 then
    raise exception 'invalid reply text' using errcode = '22023';
  end if;
  if p_permalink is not null and length(p_permalink) > 2000 then
    raise exception 'invalid permalink' using errcode = '22023';
  end if;

  update public.monitored_threads
  set status = 'replied'
  where id = p_thread_id
    and user_id = p_user_id
    and platform = 'reddit'
    and status in ('drafted', 'needs_manual_reply')
  returning * into v_thread;

  if v_thread.id is null then return false; end if;

  update public.reply_analytics
  set
    edited_text = p_final_text,
    was_sent = true,
    sent_at = coalesce(sent_at, now())
  where thread_id = p_thread_id and user_id = p_user_id;

  insert into public.send_audit_log (
    user_id, thread_id, platform, trigger_type, status, permalink
  ) values (
    p_user_id, p_thread_id, 'reddit', 'manual', 'success', nullif(trim(p_permalink), '')
  );

  return true;
end;
$$;

revoke all on function public.mark_thread_mcp_replied_v1(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_thread_mcp_replied_v1(uuid, uuid, text, text)
  to service_role;
