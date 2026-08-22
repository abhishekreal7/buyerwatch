# Reddit delivery incident response

## Customer promise

BuyerWatch fails closed. If delivery safety cannot be verified, the global Reddit circuit opens, pending Reddit jobs are cancelled, affected users see a persistent in-app incident, and queued email notifications are retried. An uncertain write is never automatically retried.

## Immediate response

1. Confirm `/api/status` and the public `/status` page show the pause.
2. Confirm `service_controls.reddit_delivery` is open and record the reason code and timestamp.
3. Check open `service_incidents`, failed `incident_deliveries`, the external GitHub production-monitor issue, Vercel runtime logs, and Hyperbrowser session/credit health.
4. For an uncertain write, inspect the Reddit thread manually before any retry. Never test by posting to a customer thread.
5. Reply to affected support requests with the incident state and a link to `/status`; do not request Reddit credentials.

## Recovery

Transient canary incidents may close only after a healthy account/profile canary. Selector changes, exhausted credits, and uncertain writes require a manual reset after the underlying problem is verified. Auto-send remains disabled for profiles stopped by the circuit; customers must intentionally enable it again after recovery.

For a manual reset, an admin sends `POST /api/admin/reddit-circuit` with JSON `{ "action": "close", "confirmation": "REDDIT_DELIVERY_VERIFIED" }` from a trusted same-origin session. Before doing so, verify a read-only canary, account identity, current selectors, credit availability, and all uncertain threads. Never bypass the circuit directly in SQL except during a documented database recovery.

## Customer follow-up

Resolve user incidents after their connection is verified healthy. Review email delivery failures until delivered or the retry limit is reached. If a paid customer reports material unavailability, follow `/service-policy` and document any credit or refund decision.

## Evidence to retain

Keep incident timestamps, safe reason codes, affected user IDs, delivery states, provider request IDs, deployment ID, recovery verification, and customer communication outcome. Never copy passwords, cookies, 2FA secrets, or API keys into logs or tickets.
