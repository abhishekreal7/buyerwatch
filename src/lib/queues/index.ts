import { Queue, type JobsOptions } from 'bullmq'
import { redis } from '../redis'

const reliableDefaults: JobsOptions = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 2_000,
}

function queue(name: string, defaults: JobsOptions = reliableDefaults) {
  let instance: Queue | undefined
  const getInstance = () => {
    instance ??= new Queue(name, {
      connection: redis as never,
      defaultJobOptions: defaults,
    })
    return instance
  }

  // Route modules are evaluated during `next build`. Defer BullMQ construction
  // until a handler or the standalone worker actually touches the queue, so a
  // production build never attempts an outbound Redis connection.
  return new Proxy({} as Queue, {
    get(_target, property) {
      const value = Reflect.get(getInstance(), property, getInstance())
      return typeof value === 'function' ? value.bind(getInstance()) : value
    },
  })
}

export const redditFetchQueue = queue('fetch-reddit')
export const blueskyFetchQueue = queue('fetch-bluesky')
export const xFetchQueue = queue('fetch-x')
export const scorePostQueue = queue('score-post')
export const sendDigestQueue = queue('send-digest')
export const notifySlackQueue = queue('notify-slack')
export const checkGoogleRankQueue = queue('check-google-rank')

export const sendReplyQueue = queue('send-reply', {
  attempts: 5,
  backoff: { type: 'fixed', delay: 5 * 60_000 },
  removeOnComplete: 2_000,
  removeOnFail: 2_000,
})

export const deadLetterQueue = queue('dead-letter', {
  attempts: 1,
  removeOnComplete: 5_000,
  removeOnFail: 5_000,
})
