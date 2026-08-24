-- Cloudflare RSS shadow telemetry is deliberately isolated from the lead,
-- scoring, credit, and delivery tables. It proves source health before any
-- production cutover without affecting customer-visible work.

create table if not exists public.rss_shadow_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  target text not null,
  status text not null,
  http_status smallint,
  post_count integer not null default 0,
  feed_fingerprint text,
  error_code text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  worker_version text not null,
  received_at timestamptz not null default now(),
  unique (run_id, target),
  constraint rss_shadow_monitor_runs_target_check
    check (target ~ '^[a-z0-9_]{2,50}$'),
  constraint rss_shadow_monitor_runs_status_check
    check (status in ('success', 'http_error', 'network_error', 'invalid_feed')),
  constraint rss_shadow_monitor_runs_http_status_check
    check (http_status is null or http_status between 100 and 599),
  constraint rss_shadow_monitor_runs_post_count_check
    check (post_count between 0 and 100),
  constraint rss_shadow_monitor_runs_fingerprint_check
    check (feed_fingerprint is null or feed_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint rss_shadow_monitor_runs_error_code_check
    check (error_code is null or error_code ~ '^[a-z0-9_:-]{1,80}$'),
  constraint rss_shadow_monitor_runs_completed_after_start_check
    check (completed_at >= started_at),
  constraint rss_shadow_monitor_runs_success_shape_check
    check (
      (status = 'success' and http_status = 200 and feed_fingerprint is not null and error_code is null)
      or (status <> 'success' and post_count = 0)
    )
);

create index if not exists rss_shadow_monitor_runs_received_at_idx
  on public.rss_shadow_monitor_runs (received_at desc);
create index if not exists rss_shadow_monitor_runs_target_received_at_idx
  on public.rss_shadow_monitor_runs (target, received_at desc);

alter table public.rss_shadow_monitor_runs enable row level security;

revoke all on public.rss_shadow_monitor_runs from anon, authenticated;
grant select, insert, update on public.rss_shadow_monitor_runs to service_role;
