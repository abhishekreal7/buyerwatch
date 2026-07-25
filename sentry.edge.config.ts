import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
  sendDefaultPii: false,
  beforeSend(event) {
    delete event.user
    if (event.request) {
      delete event.request.cookies
      delete event.request.data
      delete event.request.headers
      delete event.request.query_string
    }
    return event
  },
  debug: false,
});
