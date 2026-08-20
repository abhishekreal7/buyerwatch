# Production deployment checklist

1. Apply every Supabase migration in timestamp order to a staging database, then production.
2. Set every required value documented in `.env.example` for both the Next.js service and worker.
3. Use HTTPS for `NEXT_PUBLIC_APP_URL` and `rediss://` with a valid certificate chain for Redis.
4. Configure Supabase Auth redirect allow-lists for the exact application origin and OAuth callback paths.
5. Register `/api/billing/webhook` in Dodo Payments and copy its signing secret into the deployment.
6. Configure the QStash monitor scheduler every 5 minutes; BuyerWatch applies each plan's 5- or 60-minute cadence per keyword. Configure the digest scheduler separately and confirm the hosting plan supports the required duration.
7. Keep the worker HTTP service private where possible. If public ingress is unavoidable, require `ADMIN_SECRET` and restrict ingress at the platform/load-balancer layer.
8. Configure `REDDITAPIS_API_KEY`, explicit discovery/posting kill switches, daily paid-call ceilings, and the discovery cache. Verify provider account health. RedditAPIs is an independent provider and does not remove Reddit account or policy risk. Configure Resend sender-domain verification, Slack, Google CSE, Sentry, and healthcheck endpoints as applicable.
9. Run `npm run verify`, deploy to staging, and exercise signup, onboarding, billing, monitoring, draft generation, manual send, auto-send, click attribution, conversion, and downgrade.
10. If any Docker image was previously built from a context containing `.env.local`, remove it from every registry/cache and rotate every credential that image could contain.
11. Set `DEPLOYMENT_VERSION` and a stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for rolling or multi-instance deployments.
12. Set the GitHub `PRODUCTION_BASE_URL` secret to enable the scheduled production synthetic.
13. Create a staging smoke account and set `E2E_USER_EMAIL` and `E2E_USER_PASSWORD` when running authenticated Playwright coverage.
14. Configure load balancers with `/api/health/ready` for the web service and `/readyz` for the worker. Keep worker `/metrics` and `/admin/queues` private or bearer-protected.
15. Enable point-in-time recovery and complete the backup/restore drill in [OPERATIONS.md](./OPERATIONS.md).
16. Until Dodo is configured, paid-plan links intentionally route to contact. Until the RedditAPIs provider key, posting kill switch, database migration, and encrypted user session are all present, direct Reddit posting must remain unavailable.
