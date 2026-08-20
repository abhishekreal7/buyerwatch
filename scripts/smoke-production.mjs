const baseUrl = process.env.PRODUCTION_BASE_URL?.replace(/\/$/, '')

import { validateReadinessResponse } from './production-smoke-validators.mjs'

const allowRedditOnlyDegraded =
  process.env.ALLOW_REDDIT_ONLY_DEGRADED_READINESS === 'true'

if (!baseUrl || !baseUrl.startsWith('https://')) {
  console.error('PRODUCTION_BASE_URL must be an HTTPS origin')
  process.exit(2)
}

async function check(path, validate) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': 'BuyerWatch-Synthetic/1.0' },
    })
    await validate(response)
    console.log(`PASS ${path} (${response.status})`)
  } finally {
    clearTimeout(timeout)
  }
}

await check('/api/health/live', async (response) => {
  if (response.status !== 200) throw new Error(`liveness returned ${response.status}`)
  const body = await response.json()
  if (body.status !== 'ok') throw new Error('liveness payload is invalid')
})

await check('/api/health/ready', async (response) => {
  const result = await validateReadinessResponse(response, {
    allowRedditOnlyDegraded,
  })
  if (result.degraded) {
    console.warn('WARN readiness is degraded only by unfunded Reddit monitoring')
  }
})

await check('/', async (response) => {
  if (response.status !== 200) throw new Error(`homepage returned ${response.status}`)
  const requiredHeaders = [
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
  ]
  for (const header of requiredHeaders) {
    if (!response.headers.get(header)) throw new Error(`homepage is missing ${header}`)
  }
})

await check('/login', async (response) => {
  if (response.status !== 200) throw new Error(`login returned ${response.status}`)
  const policy = response.headers.get('content-security-policy')
  if (!policy?.includes("'strict-dynamic'")) {
    throw new Error('login is missing its strict nonce-based CSP')
  }
  if (/script-src[^;]*'unsafe-inline'/.test(policy)) {
    throw new Error('login CSP allows inline scripts')
  }
})

await check('/api/cron/enqueue', async (response) => {
  if (response.status !== 401) {
    throw new Error(`unauthenticated cron probe returned ${response.status}`)
  }
})

console.log('Production smoke checks passed')
