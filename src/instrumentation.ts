import * as Sentry from '@sentry/nextjs'
import type { Instrumentation } from 'next'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateAppEnvironment } = await import('./lib/env')
    validateAppEnvironment()
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  await Sentry.captureRequestError(error, request, context)
}
