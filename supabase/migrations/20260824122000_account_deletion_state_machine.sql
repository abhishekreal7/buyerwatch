-- Durable, idempotent account deletion progress. This intentionally does not
-- reference profiles: the audit row must survive profile/auth deletion.
create table if not exists public.account_deletion_requests (
  user_id uuid primary key,
  subscription_id text,
  status text not null default 'pending'
    check (status in ('pending', 'billing_cancelled', 'completed', 'failed')),
  billing_cancelled_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;
revoke all on table public.account_deletion_requests from public, anon, authenticated;
grant select, insert, update on table public.account_deletion_requests to service_role;

create index if not exists account_deletion_requests_retry_idx
  on public.account_deletion_requests (updated_at)
  where status in ('pending', 'billing_cancelled', 'failed');
