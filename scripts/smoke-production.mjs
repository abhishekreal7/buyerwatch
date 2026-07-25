const baseUrl = process.env.PRODUCTION_BASE_URL?.replace(/\/$/, '')

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
      headers: { 'user-agent': 'Scouto-Synthetic/1.0' },
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
  if (response.status !== 200) {
    const body = await response.text()
    throw new Error(`readiness returned ${response.status}: ${body.slice(0, 300)}`)
  }
})

await check('/', async (response) => {
  if (response.status !== 200) throw new Error(`homepage returned ${response.status}`)
  const requiredHeaders = [
    'content-security-policy',
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
  ]
  for (const header of requiredHeaders) {
    if (!response.headers.get(header)) throw new Error(`homepage is missing ${header}`)
  }
})

await check('/api/cron/enqueue', async (response) => {
  if (response.status !== 401) {
    throw new Error(`unauthenticated cron probe returned ${response.status}`)
  }
})

console.log('Production smoke checks passed')
