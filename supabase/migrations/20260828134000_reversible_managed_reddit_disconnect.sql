-- A user disconnect must pause a durable managed Reddit profile, not delete
-- the encrypted profile identifier required to reconnect it later.

alter table public.reddit_connection_secrets
  drop constraint if exists reddit_connection_secrets_status_check;

alter table public.reddit_connection_secrets
  add constraint reddit_connection_secrets_status_check
  check (status in ('active', 'disconnected', 'reauth_required', 'error'));
