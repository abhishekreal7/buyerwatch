const MAX_RESPONSE_BYTES = 1_000_000
const RSS_TIMEOUT_MS = 12_000
const WORKER_VERSION = '2026-08-24.1'

function requireValue(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`${name}_missing`)
  return normalized.replace(/\/$/, '')
}

function normalizeTarget(value) {
  const target = String(value ?? '').trim().replace(/^r\//i, '').toLowerCase()
  return /^[a-z0-9_]{2,50}$/.test(target) ? target : null
}

async function boundedText(response) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('response_too_large')
  }
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error('response_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

async function fingerprint(target, ids) {
  const payload = new TextEncoder().encode(`${target}\n${ids.join('\n')}`)
  const hash = await crypto.subtle.digest('SHA-256', payload)
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
}

async function fetchRss(target) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS)
  try {
    const response = await fetch(`https://www.reddit.com/r/${target}/new/.rss`, {
      headers: {
        'Accept': 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'BuyerWatchRSSShadow/1.0 (+https://buyerwatch.co)',
      },
      signal: controller.signal,
      cf: { cacheTtl: 0, cacheEverything: false },
    })
    if (!response.ok) {
      return { target, status: 'http_error', httpStatus: response.status, postCount: 0, feedFingerprint: null, errorCode: `http_${response.status}` }
    }
    const xml = await boundedText(response)
    if (!/<feed(?:\s|>)/i.test(xml)) {
      return { target, status: 'invalid_feed', httpStatus: 200, postCount: 0, feedFingerprint: null, errorCode: 'invalid_atom' }
    }
    const ids = [...xml.matchAll(/<id>t3_([a-z0-9]+)<\/id>/gi)]
      .map(match => match[1].toLowerCase())
      .slice(0, 100)
    return {
      target,
      status: 'success',
      httpStatus: 200,
      postCount: ids.length,
      feedFingerprint: await fingerprint(target, ids),
      errorCode: null,
    }
  } catch (error) {
    const code = error && typeof error === 'object' && error.name === 'AbortError'
      ? 'timeout'
      : 'network_error'
    return { target, status: 'network_error', httpStatus: null, postCount: 0, feedFingerprint: null, errorCode: code }
  } finally {
    clearTimeout(timeout)
  }
}

async function buyerwatchFetch(env, path, init = {}) {
  const appUrl = requireValue(env.BUYERWATCH_APP_URL, 'BUYERWATCH_APP_URL')
  const secret = requireValue(env.BUYERWATCH_RSS_SHADOW_SECRET, 'BUYERWATCH_RSS_SHADOW_SECRET')
  return fetch(`${appUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init.headers ?? {}),
    },
  })
}

export default {
  async scheduled(_event, env, ctx) {
    const startedAt = new Date().toISOString()
    const runId = crypto.randomUUID()
    const work = (async () => {
      const targetResponse = await buyerwatchFetch(env, '/api/internal/rss-shadow/targets')
      if (!targetResponse.ok) throw new Error(`targets_http_${targetResponse.status}`)
      const targetPayload = await targetResponse.json()
      const targets = Array.isArray(targetPayload.targets)
        ? targetPayload.targets.map(normalizeTarget).filter(Boolean)
        : []
      if (targets.length === 0) return

      const results = []
      for (const target of targets) results.push(await fetchRss(target))

      const resultResponse = await buyerwatchFetch(env, '/api/internal/rss-shadow/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          startedAt,
          completedAt: new Date().toISOString(),
          workerVersion: WORKER_VERSION,
          results,
        }),
      })
      if (!resultResponse.ok) throw new Error(`results_http_${resultResponse.status}`)
    })()
    ctx.waitUntil(work)
  },
}
