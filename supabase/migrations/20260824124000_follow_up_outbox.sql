-- Durable intents for non-blocking Slack and Google-rank follow-ups.
create table if not exists public.follow_up_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.monitored_threads(id) on delete cascade,
  kind text not null check (kind in ('slack', 'google_rank')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'dispatched')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (thread_id, kind)
);

alter table public.follow_up_outbox enable row level security;
revoke all on table public.follow_up_outbox from public, anon, authenticated;
grant select, insert, update on table public.follow_up_outbox to service_role;

create index if not exists follow_up_outbox_pending_idx
  on public.follow_up_outbox (created_at)
  where status = 'pending';
