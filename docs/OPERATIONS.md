# Scouto operations runbook

## Service health

- Web liveness: `GET /api/health/live`
- Web readiness: `GET /api/health/ready`
- Worker liveness: `GET /healthz`
- Worker readiness: `GET /readyz`
- Worker metrics: `GET /metrics` with `Authorization: Bearer $ADMIN_SECRET`
- Queue dashboard: `/admin/queues` on the worker with the same bearer token
- Replay a reviewed dead letter: `POST /admin/dead-letter/{jobId}/replay`
  with `Authorization: Bearer $ADMIN_SECRET`

Liveness only confirms that the process can answer HTTP. Readiness checks the
dependencies required to handle work. Load balancers should use readiness for
traffic and liveness for restart decisions.

## Initial alert thresholds

- Any readiness failure for 3 consecutive minutes: page the operator.
- Dead-letter queue count above 0 for 5 minutes: page the operator.
- `send_reconciliation_required` count above 0 for 5 minutes: page the operator.
- Oldest waiting job above 10 minutes: investigate queue capacity/provider health.
- Billing webhook failure: page immediately once billing is enabled.
- Cron synthetic failure twice consecutively: page the operator.

Tune thresholds after two weeks of production traffic.

Never replay a send-related dead letter until its thread state has been
inspected. The send lease will reject known-complete sends, while uncertain
provider outcomes must be resolved through `/admin/reconciliation`.

## AI margin controls

Anthropic calls are reserved before execution and reconciled to actual input
tokens, output tokens, model, and estimated cost afterward. The defaults are:

- Free: $1/customer/month
- Pro: $10/customer/month
- Growth: $40/customer/month
- Global: $200/month

Override these with the `ANTHROPIC_*_MONTHLY_SPEND_LIMIT_USD` variables in
`.env.example`. Also configure the intent and draft reservation estimates high
enough to cover a normal request. If a cap blocks intent scoring, the worker
skips that candidate without consuming its monthly signal allowance. If a cap
blocks drafting, the signal remains visible as needing a manual reply.

Review `/admin/usage` at least weekly during launch. Compare its estimated AI
spend with the Anthropic invoice and update model rates in `src/lib/ai-usage.ts`
if provider pricing changes.

## Send reconciliation

Open `/admin/reconciliation` with an email listed in `ADMIN_EMAILS`.

1. Open the original thread and any recorded provider permalink.
2. Search the connected platform account for the reply.
3. Record what was checked in the evidence field.
4. If the reply exists, choose **Confirm reply was posted**.
5. Only if the provider definitively did not publish it, type `NOT POSTED` and
   return it to draft.

Both outcomes are applied through a service-role-only transactional database
function. The original send audit is retained and annotated with the operator,
time, evidence, and outcome.

## Backup and restore

Supabase Free does not provide production-grade automatic backups. Until a paid
database plan is enabled, run `scripts/backup-database.ps1` daily from a secured
machine or CI runner and copy the encrypted output to off-site object storage.
Set `SUPABASE_DATABASE_URL` only in that runner. Before accepting paying
customers, enable Supabase automatic backups/PITR or an equivalent managed
backup service. Retain:

- daily backups for 14 days;
- weekly backups for 8 weeks;
- monthly backups for 12 months.

Run a quarterly restore drill into a new staging project:

1. Restore the latest backup.
2. Run `supabase migration list` and reconcile migration history.
3. Exercise login, keyword reads, draft reads, attribution, and audit history.
4. Record recovery point and recovery time.
5. Delete the temporary project after the drill.

Never test a restore by resetting the production project.

## Retention and deletion

The worker's daily maintenance removes completed AI spend reservations after
90 days, stale pending reservations after one day, dispatched outbox records
after 30 days, processed ingestion events after 90 days, and billing webhook
receipts after two years. Customer-owned opportunities and analytics remain
until the customer deletes the account. `GET /api/account/export` provides a
machine-readable export; `DELETE /api/account` requires a recent login plus the
literal confirmation `DELETE`, cancels an attached subscription, and then
removes the Supabase Auth user so database cascades erase customer-owned rows.

## Optional integration launch mode

The core app requires Supabase, Redis, cron authorization, encryption, and
Anthropic. These integrations are optional when their complete environment
groups are absent:

- Dodo Payments: paid checkout is disabled and pricing sends users to contact.
- RedditAPIs: Reddit discovery fallback and direct delivery are unavailable
  without `REDDITAPIS_API_KEY`; writes also require the independent
  `REDDITAPIS_POSTING_ENABLED=true` kill switch.
- Resend: digest email is unavailable unless both API key and sender are set.

Reddit accounts are connected through `POST /api/settings/reddit`. Passwords
and optional TOTP setup secrets are forwarded once to RedditAPIs and are never
persisted. Only the returned Reddit session cookies are encrypted and stored in
the service-role-only `reddit_connection_secrets` table. A session failure marks
the connection `reauth_required`, cancels queued Reddit auto-sends, and requires
the customer to reconnect before delivery resumes.

## Low-cost production topology

- Vercel serves only the Next.js web application.
- Railway (Dockerfile + `railway.json`) runs one always-on worker and its
  scheduler. Start with a single replica.
- Supabase stores durable application state.
- Upstash Redis holds BullMQ jobs and distributed scheduler locks.

The worker is required: Vercel's daily Hobby cron is only a fallback probe and
cannot provide 15/30-minute monitoring. Configure Railway's health check as
`/readyz`. Keep `/metrics` and `/admin/queues` private behind `ADMIN_SECRET`.

## Provider placeholders required before launch

- `ANTHROPIC_API_KEY`
- all Supabase values plus `SUPABASE_DATABASE_URL` in the backup runner
- `UPSTASH_REDIS_URL`, `ADMIN_SECRET`, `CRON_SECRET`, and `ENCRYPTION_KEY`
- Dodo API key, webhook secret, product IDs, and explicit environment
- RedditAPIs key, funded balance, and explicit posting kill switch
- Resend key, verified sender, and `EMAIL_UNSUBSCRIBE_SECRET`
- Sentry values and an external uptime/heartbeat URL

## Release procedure

1. Require green typecheck, lint, unit, audit, build, browser, and migration jobs.
2. Deploy the same build artifact across instances.
3. Set `DEPLOYMENT_VERSION` and a stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
4. Apply migrations to staging and run authenticated Playwright smoke tests.
5. Deploy to production and run `npm run smoke:production`.
6. Watch readiness, queue lag, dead letters, and Sentry during the release window.
7. Roll back the application artifact if needed; do not reverse a migration
   unless a tested forward-fix is impossible.
