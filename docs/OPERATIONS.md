# Scouto operations runbook

## Service health

- Web liveness: `GET /api/health/live`
- Web readiness: `GET /api/health/ready`
- Worker liveness: `GET /healthz`
- Worker readiness: `GET /readyz`
- Worker metrics: `GET /metrics` with `Authorization: Bearer $ADMIN_SECRET`
- Queue dashboard: `/admin/queues` on the worker with the same bearer token

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

Enable Supabase point-in-time recovery before accepting paying customers.
Additionally, create a daily logical backup and retain:

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

## Optional provider launch mode

The core app requires Supabase, Redis, cron authorization, encryption, and one
AI provider. These integrations are optional when their complete environment
groups are absent:

- Dodo Payments: paid checkout is disabled and pricing sends users to contact.
- Anthropic: Gemini handles drafting until an Anthropic key and model are set.
- Reddit OAuth: direct Reddit posting is unavailable without OAuth credentials.
- Resend: digest email is unavailable unless both API key and sender are set.

The `ingestion_events` table is the service-write-only contract for a future
Chrome extension. The extension backend should authenticate the user, validate
and normalize captured public URLs, and write idempotently using
`(user_id, source, source_event_id)`.

## Release procedure

1. Require green typecheck, lint, unit, audit, build, browser, and migration jobs.
2. Deploy the same build artifact across instances.
3. Set `DEPLOYMENT_VERSION` and a stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
4. Apply migrations to staging and run authenticated Playwright smoke tests.
5. Deploy to production and run `npm run smoke:production`.
6. Watch readiness, queue lag, dead letters, and Sentry during the release window.
7. Roll back the application artifact if needed; do not reverse a migration
   unless a tested forward-fix is impossible.
