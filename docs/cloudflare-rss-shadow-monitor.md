# Cloudflare production monitor scheduler

Cloudflare Cron is BuyerWatch's production monitoring clock. The Worker makes
one authenticated request to BuyerWatch every five minutes; BuyerWatch then
applies each customer's plan cadence, obtains provider results, deduplicates
threads, scores eligible leads, and dispatches durable work.

## What it does

Every five minutes, the Worker:

1. Authenticates to `POST /api/cron/enqueue` with the shared Cloudflare secret.
2. Starts the bounded BuyerWatch monitoring cycle.
3. Treats a non-2xx response as a failed Cron execution.

The Worker cannot access Supabase or provider credentials directly. QStash is
not a second scheduler: it is retained only for signed, durable per-user jobs,
reply delivery, and retryable background work.

## Deploy safely

1. Generate one random secret of at least 32 characters.
2. Add it to Vercel Production as `CLOUDFLARE_RSS_SHADOW_SECRET` and redeploy.
3. In Cloudflare Workers, deploy `cloudflare/rss-shadow-monitor.mjs` using
   `cloudflare/wrangler.rss-shadow.toml`.
4. Add the same value to the Worker as the secret
   `BUYERWATCH_RSS_SHADOW_SECRET`, and set `BUYERWATCH_APP_URL` to
   `https://www.buyerwatch.co`.
5. Confirm at least three successful five-minute executions before removing a
   previous scheduler.

## Ownership rule

Only Cloudflare may start an unscoped global monitoring run. QStash-signed
requests to the same endpoint must identify a specific user and are used by
onboarding and **Fetch now**. This prevents duplicate global scans while keeping
durable on-demand execution.
