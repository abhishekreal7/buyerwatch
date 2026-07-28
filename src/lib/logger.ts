import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'request.headers.authorization',
      'request.headers.cookie',
      '*.access_token',
      '*.refresh_token',
      '*.slack_webhook_url',
      '*.webhook_secret',
      '*.email',
      '*.userId',
      '*.target',
      'access_token',
      'refresh_token',
      'slack_webhook_url',
      'slack_webhook_ciphertext',
      'webhook_secret',
      'email',
      'userId',
      'target',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
    }
  } : undefined,
  base: {
    env: process.env.NODE_ENV
  }
})
