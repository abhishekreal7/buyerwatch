export async function validateReadinessResponse(
  response,
  { allowRedditOnlyDegraded = false } = {},
) {
  let body
  try {
    body = await response.json()
  } catch {
    throw new Error(`readiness returned ${response.status} with invalid JSON`)
  }

  if (response.status === 200 && body?.status === 'ok') return { degraded: false }

  if (!allowRedditOnlyDegraded) {
    throw new Error(
      `readiness returned ${response.status}: ${JSON.stringify(body).slice(0, 300)}`,
    )
  }

  const checks = body?.checks ?? {}
  const affectedPlatforms = checks.monitoring?.affectedPlatforms
  const redditOnlyMonitoringFailure =
    checks.monitoring?.status === 'error'
    && checks.monitoring?.code === 'monitoring_stale'
    && Array.isArray(affectedPlatforms)
    && affectedPlatforms.length === 1
    && affectedPlatforms[0] === 'reddit'

  const acceptableDegradation =
    response.status === 503
    && body?.status === 'degraded'
    && checks.database?.status === 'ok'
    && checks.cache?.status === 'ok'
    && redditOnlyMonitoringFailure
    && body?.dependencies?.redditProviderRequired === false

  if (!acceptableDegradation) {
    throw new Error(
      `readiness degradation is not Reddit-only: ${JSON.stringify(body).slice(0, 500)}`,
    )
  }

  return { degraded: true }
}
