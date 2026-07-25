import { expect, test } from '@playwright/test'

test('landing page exposes the core product and navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Scouto/i)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /pricing/i }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /log in/i }).first()).toBeVisible()
})

test('liveness and readiness endpoints have stable contracts', async ({ request }) => {
  const live = await request.get('/api/health/live')
  expect(live.status()).toBe(200)
  expect(live.headers()['cache-control']).toMatch(/no-store/)
  expect(await live.json()).toMatchObject({
    status: 'ok',
    service: 'scouto-web',
  })

  const ready = await request.get('/api/health/ready')
  expect([200, 503]).toContain(ready.status())
  const payload = await ready.json()
  expect(payload).toMatchObject({
    service: 'scouto-web',
    checks: {
      database: { status: expect.stringMatching(/^(ok|error)$/) },
      cache: { status: expect.stringMatching(/^(ok|error)$/) },
    },
  })
})

test('security headers and cron authorization fail closed', async ({ request }) => {
  const home = await request.get('/')
  expect(home.headers()['x-content-type-options']).toBe('nosniff')
  expect(home.headers()['x-frame-options']).toBe('DENY')
  expect(home.headers()['content-security-policy']).toMatch(/default-src 'self'/)

  const cron = await request.get('/api/cron/enqueue', {
    headers: { authorization: 'Bearer definitely-not-the-cron-secret' },
  })
  expect(cron.status()).toBe(401)
})

test('authenticated surfaces use nonce-protected scripts', async ({ request }) => {
  const login = await request.get('/login')
  const policy = login.headers()['content-security-policy']
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/)
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/)
})

test('billing degrades safely when no authenticated account is present', async ({ request }) => {
  const checkout = await request.post('/api/billing/checkout', {
    data: { plan: 'pro' },
  })
  expect([401, 503]).toContain(checkout.status())

  const webhook = await request.post('/api/billing/webhook', {
    data: { type: 'subscription.active' },
  })
  expect([401, 503]).toContain(webhook.status())
})
