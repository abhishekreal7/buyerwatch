function requireValue(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`${name}_missing`)
  return normalized.replace(/\/$/, '')
}

async function buyerwatchFetch(env) {
  const appUrl = requireValue(env.BUYERWATCH_APP_URL, 'BUYERWATCH_APP_URL')
  const secret = requireValue(env.BUYERWATCH_RSS_SHADOW_SECRET, 'BUYERWATCH_RSS_SHADOW_SECRET')
  return fetch(`${appUrl}/api/cron/enqueue`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
}

export function assertMonitorResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('monitor_response_invalid')
  }
  const canary = payload.redditDeliveryCanary
  if (!canary || typeof canary !== 'object' || Array.isArray(canary)) {
    throw new Error('monitor_canary_result_missing')
  }
  if (!['ok', 'skipped', 'failed'].includes(canary.status)) {
    throw new Error('monitor_canary_result_invalid')
  }
  if (canary.status === 'failed') {
    throw new Error(`monitor_canary_failed:${canary.code ?? 'unknown'}`)
  }
}

const worker = {
  async scheduled(_event, env, ctx) {
    const work = (async () => {
      const response = await buyerwatchFetch(env)
      if (!response.ok) throw new Error(`monitor_http_${response.status}`)
      let payload
      try {
        payload = await response.json()
      } catch {
        throw new Error('monitor_response_invalid')
      }
      assertMonitorResponse(payload)
    })()
    ctx.waitUntil(work)
  },
}

export default worker
