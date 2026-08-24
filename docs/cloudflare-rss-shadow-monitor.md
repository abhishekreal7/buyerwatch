# Cloudflare RSS shadow monitor

This is a **shadow-only** monitor. It validates whether Reddit's public Atom
feeds are reachable from Cloudflare without touching BuyerWatch leads, AI,
credits, user notifications, or reply delivery.

## What it does

Every 15 minutes, the Worker:

1. Authenticates to BuyerWatch and requests a bounded list of active Reddit communities.
2. Fetches each community's `/new/.rss` Atom feed with a timeout and a descriptive user agent.
3. Sends only compact telemetry back: HTTP outcome, post count, and a SHA-256 fingerprint of public post IDs.

The Worker cannot access Supabase directly and has no ability to score content,
create drafts, charge users, or post to Reddit.

## Deploy safely

1. Apply `supabase/migrations/20260824060000_cloudflare_rss_shadow_monitor.sql`.
2. Generate one random secret of at least 32 characters.
3. Add it to Vercel Production as `CLOUDFLARE_RSS_SHADOW_SECRET` and redeploy.
4. In Cloudflare Workers, deploy `cloudflare/rss-shadow-monitor.mjs` using
   `cloudflare/wrangler.rss-shadow.toml`.
5. Add the same value to the Worker as the secret
   `BUYERWATCH_RSS_SHADOW_SECRET`, and set `BUYERWATCH_APP_URL` to
   `https://www.buyerwatch.co`.
6. Observe `rss_shadow_monitor_runs` for at least 48 hours before considering
   RSS as a monitoring fallback.

## Cutover rule

Do not make RSS the production discovery source unless it shows stable success
rates for the communities you monitor, no persistent 403/429 responses, and
acceptable detection delay. QStash and the current monitor remain untouched by
this deployment.
