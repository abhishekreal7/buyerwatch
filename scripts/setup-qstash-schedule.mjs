import dotenv from 'dotenv'
import { Client } from '@upstash/qstash'

dotenv.config({ path: process.env.ENV_FILE || '.env.local' })

const token = process.env.QSTASH_TOKEN?.trim()
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://buyerwatch.co')
  .trim()
  .replace(/\/$/, '')

if (!token) {
  throw new Error('QSTASH_TOKEN is required. Copy it from the Upstash QStash dashboard.')
}

const destination = `${appUrl}/api/cron/enqueue`
const client = new Client({ token })
const result = await client.schedules.create({
  destination,
  scheduleId: 'buyerwatch-reddit-monitor',
  cron: '*/5 * * * *',
  method: 'POST',
  retries: 2,
  timeout: '4m',
  label: 'buyerwatch-reddit-monitor',
})
const schedule = await client.schedules.get(result.scheduleId)
if (
  schedule.destination !== destination
  || schedule.cron !== '*/5 * * * *'
  || schedule.isPaused
) {
  throw new Error('QStash created the schedule but verification failed.')
}

console.log(`QStash schedule ready: ${result.scheduleId}`)
console.log(`Destination: ${destination}`)
console.log('Frequency: every 5 minutes (UTC)')
