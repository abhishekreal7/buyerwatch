# Production remediation record

This record documents the decisions made during the July 2026 security and
reliability remediation.

## Finding disposition

| ID | Status | Resolution |
|---|---|---|
| C01 | Fixed | Authenticated profile updates now use column grants that exclude plan, billing, trust, and auto-send entitlement fields. |
| C02 | Mitigated | Docker build contexts exclude all environment and key files. Previously published images still require external removal and credential rotation. |
| H01 | Fixed | Feedback RPCs verify `auth.uid()`, fix `search_path`, validate thread ownership, and restrict grants. |
| H02 | Fixed | Checkout requires distinct Pro and Growth product IDs and never falls back across plans. |
| H03 | Fixed | Billing uses an event ledger, subscription identity and timestamp ordering, transactional application, and checkout idempotency. |
| H04 | Fixed | Cron authorization fails closed when its secret is absent and uses exact constant-time comparison. |
| H05 | Fixed | Onboarding URL fetches reject private/reserved destinations, pin validated DNS addresses, revalidate redirects, cap bytes, and time out. |
| H06 | Fixed | Slack URLs are restricted in UI/API, database constraints, and worker execution to exact Slack webhook hosts and paths. |
| H07 | Fixed | Tracking redirects resolve destinations from persisted tokens only and reject non-HTTP(S) or credentialed URLs. |
| H08 | Fixed | Thread uniqueness is per user, platform, and external post. |
| H09 | Fixed | The baseline and hardening migrations define every column/table used by scoring, attribution, conversion, ranking, billing, and downgrade flows. |
| H10 | Fixed | Canonical keyword limits are Free 1, Pro 10, Growth 50 and are enforced atomically; onboarding respects the same limit. |
| H11 | Fixed | The scheduler runs every 15 minutes, applies explicit 6h/30m/15m plan intervals, and passes only due mappings to shared-target jobs. |
| H12 | Fixed | Stable send job IDs, an atomic state transition, at-most-once external posting, and a non-sendable reconciliation state prevent concurrent duplicate sends. |
| H13 | Fixed | Redis reservations serialize sends; quota and minimum-gap timestamps are recorded only after provider success. |
| H14 | Fixed | Synthetic drafts/posts are development-only; provider exhaustion throws in production. |
| H15 | Fixed | Next.js is 16.2.11 and vulnerable transitive packages are pinned to patched releases with npm overrides. |
| H16 | Fixed | Redis TLS certificate verification uses platform defaults; insecure overrides were removed. |
| M01–M03 | Fixed | Provider calls have deadlines; queues have retry/backoff/DLQ policies; worker failures are thrown. |
| M04–M07 | Fixed | Digest inputs paginate, telemetry is minimized, draft accounting is atomic, and admin aggregation uses a server-only admin client. |
| M08–M11 | Fixed | Production rate limiting is mandatory, OAuth bypasses are development-only, persistence errors are checked, and short-link deduplication uses bounded Redis keys. |
| M12–M16 | Fixed | Security headers, indexes, current lint/tests/CI, generic public errors, and root route boundaries are present. |
| M17–M19 | Fixed | Duplicate IDs and inaccurate copy were removed; landing visuals/widgets/footer are split into focused modules and timers pause off-screen. |
| L01–L06 | Fixed | Dead code/CSS were removed, newsletter submission is real and accessible, environment/deployment contracts are committed, and redirects use one configured origin. |

## Design decisions

- Auto-send remains an explicit paid feature because the backend already
  implements a trust-gated workflow. Public copy now says manual review is the
  default and describes guarded auto-send accurately.
- Reply delivery favors at-most-once behavior. Once a provider accepts a post,
  later persistence failures move the thread to
  `send_reconciliation_required`; the system never silently makes it sendable
  again.
- The Next.js release still declared old exact PostCSS and Sharp dependencies.
  Root npm overrides select patched, API-compatible releases and are exercised
  by the production build and CI audit.
- Supabase CLI database lint could not run locally because this workstation has
  no PostgreSQL or Docker service. Migration contract tests run in CI, and the
  deployment checklist requires applying the full migration chain to staging
  before production.

## External actions

Follow [DEPLOYMENT.md](./DEPLOYMENT.md), especially secret rotation for any
historic Docker image, Supabase redirect allow-lists, Dodo webhook
configuration, sender-domain verification, and confirmation that the hosting
plan executes the 15-minute cron schedule.

## Production-readiness follow-up

- CI now replays the complete migration chain in a local Supabase stack.
- Playwright covers public UI, health contracts, security headers, cron
  authorization, and safe billing degradation; authenticated staging smoke
  coverage activates when test-account credentials are supplied.
- Web and worker readiness endpoints, protected worker metrics, queue/DLQ
  visibility, graceful worker shutdown, and scheduled production synthetics are
  implemented.
- Send reconciliation has an operator-only UI and a transactional,
  service-role-only resolution function.
- The worker image uses Node 22, multi-stage dependency installation, a non-root
  runtime, and a container health check.
- Sentry and structured logs suppress default PII and redact credentials and
  user-specific fields.
- Authenticated routes use request nonces and strict-dynamic script policy.
  Inline styles remain allowed because the existing visual system uses React
  style attributes; eliminating that final directive is a separate visual
  refactor.
- Billing and Resend are complete optional capability groups. Reddit discovery
  and direct posting use explicit RedditAPIs kill switches; direct posting also
  requires an encrypted, service-role-only session for the connected user.
  Anthropic is required for intent scoring, onboarding intelligence, and reply
  drafting.
