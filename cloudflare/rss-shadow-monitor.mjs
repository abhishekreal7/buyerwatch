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

export default {
  async scheduled(_event, env, ctx) {
    const work = (async () => {
      const response = await buyerwatchFetch(env)
      if (!response.ok) throw new Error(`monitor_http_${response.status}`)
    })()
    ctx.waitUntil(work)
  },
}
