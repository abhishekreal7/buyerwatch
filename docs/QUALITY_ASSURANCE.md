# Product quality assurance

Scouto separates deterministic product guarantees from provider-dependent
behavior. Missing provider credentials must never turn a skipped integration
into a passing product claim.

## Offline release gate

Run:

```powershell
npm run verify:offline
$env:E2E_BASE_URL='http://127.0.0.1:3000'
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:e2e
```

The offline gate covers:

- buying-signal fixtures and stored evidence categories;
- strict validation of model-shaped intent responses;
- faithful intent labels and low-relevance fallbacks;
- promotional language, calls to action, unsupported claims, disclosures, and
  platform length limits;
- paid-plan, feature-flag, reply-quality, cold-start, learned-trust, community,
  and user-configured auto-send gates;
- attribution token validation, redirect construction, destination query
  preservation, bot filtering, and internal-preview exclusion;
- onboarding URL normalization, product-context requirements, suggestion
  sanitization, deduplication, and bounded list sizes;
- database migration contracts, one canonical draft per thread, send
  idempotency, reconciliation, plan limits, billing ordering, and security
  boundaries;
- application and worker typechecking, zero-warning lint, production
  compilation, public browser behavior, health contracts, CSP, and safe
  unauthenticated billing degradation.

## Credentialed release gate

Run these only after the relevant credentials and sandbox accounts are
available. They must be treated as required before enabling that capability in
production.

### AI providers

- Evaluate at least 200 labelled conversations across buying, research, pain,
  and irrelevant classes.
- Record precision, recall, false-negative rate, and calibration by score band.
- Evaluate drafts for factual grounding, relevance, disclosure correctness,
  promotional tone, platform length, and human edit distance.
- Confirm primary-provider timeout, malformed output, fallback, and total
  provider failure behavior.

### Discovery providers

- Verify Reddit, Bluesky, and X pagination, deduplication, freshness, deleted
  content, rate limits, spend limits, and retry behavior.
- Compare fetched posts with provider search results for the same time window.
- Confirm one scoring job per user and external post.

### Posting providers

- Exercise OAuth/app-password connection and revocation.
- Post to controlled test communities/accounts.
- Verify rate limits, transient retries, permanent failures, stable job IDs,
  at-most-once posting, permalink persistence, and reconciliation.

### Attribution and conversion

- Publish a controlled reply containing a tracked redirect.
- Verify internal preview and bot visits do not count.
- Verify the first external visit counts and redirects with `ref` and `sid`.
- Submit an authenticated conversion webhook twice and confirm idempotency.
- Confirm the reply, click, conversion, and revenue appear together in
  Analytics.

### Billing, email, and observability

- Exercise checkout, webhook ordering, duplicate events, cancellation, and
  downgrade enforcement in provider sandboxes.
- Verify digest delivery, sender authentication, unsubscribe behavior, and
  provider failure handling.
- Confirm Sentry receives redacted web and worker failures without user content,
  tokens, or secrets.

## Authenticated browser journey

CI must provide a dedicated test account and cover:

1. Signup or login.
2. Website analysis and reviewed suggestions.
3. Atomic onboarding completion.
4. Initial monitoring job creation.
5. Opportunity evidence and intent reasoning.
6. Draft generation, live publishing checks, editing, and approval.
7. Connected-provider posting and audit state.
8. Attribution click, conversion webhook, and Analytics reconciliation.

Until this journey passes with provider sandboxes, the architecture can be
release-ready while the integrated capability remains explicitly unverified.
