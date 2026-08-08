import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { evaluateIntentPreflight } from '../src/lib/intent-preflight.ts'
import {
  INTENT_RESCORE_ACTIVE_STATUSES,
  planIntentRescore,
} from '../src/lib/intent-rescore.ts'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

function parseArguments(argv) {
  const options = {
    apply: false,
    userId: null,
    limit: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--apply') {
      options.apply = true
      continue
    }
    if (argument === '--user') {
      options.userId = argv[index + 1] ?? null
      index += 1
      continue
    }
    if (argument === '--limit') {
      options.limit = Number(argv[index + 1])
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  if (options.userId && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(options.userId)) {
    throw new Error('--user must be a UUID')
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive integer')
  }

  return options
}

function chunk(values, size) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function fetchAllActiveThreads(supabase, options, activeStatuses) {
  const rows = []
  const pageSize = 500

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('monitored_threads')
      .select('id, user_id, keyword_id, platform, external_id, author, title, text_content, url, source_created_at, status, intent_score, intent_label, flag, score_reasoning, matched_signals, automation_reason')
      .in('status', activeStatuses)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (options.userId) query = query.eq('user_id', options.userId)
    const { data, error } = await query
    if (error) throw new Error(`Failed to load monitored threads: ${error.message}`)

    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
    if (options.limit !== null && rows.length >= options.limit) break
  }

  return options.limit === null ? rows : rows.slice(0, options.limit)
}

async function fetchRecordsByIds(supabase, table, columns, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  const records = []
  for (const idChunk of chunk(uniqueIds, 100)) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in('id', idChunk)
    if (error) throw new Error(`Failed to load ${table}: ${error.message}`)
    records.push(...(data ?? []))
  }
  return records
}

function incrementCounter(record, key) {
  record[key] = (record[key] ?? 0) + 1
}

async function run() {
  const options = parseArguments(process.argv.slice(2))
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const threads = await fetchAllActiveThreads(
    supabase,
    options,
    INTENT_RESCORE_ACTIVE_STATUSES,
  )
  const [profiles, keywords] = await Promise.all([
    fetchRecordsByIds(
      supabase,
      'profiles',
      'id, business_name, business_description, competitors',
      threads.map(thread => thread.user_id),
    ),
    fetchRecordsByIds(
      supabase,
      'keywords',
      'id, term, target',
      threads.map(thread => thread.keyword_id),
    ),
  ])
  const profileById = new Map(profiles.map(profile => [profile.id, profile]))
  const keywordById = new Map(keywords.map(keyword => [keyword.id, keyword]))
  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    scanned: threads.length,
    changed: 0,
    dismissed: 0,
    retained: 0,
    highIntentBefore: 0,
    highIntentAfter: 0,
    skippedMissingProfile: 0,
    skippedConcurrentChange: 0,
    failures: 0,
    rejectionSignals: {},
  }
  const planned = []

  for (const thread of threads) {
    const profile = profileById.get(thread.user_id)
    if (!profile) {
      summary.skippedMissingProfile += 1
      continue
    }
    if (Number(thread.intent_score ?? 0) >= 80) summary.highIntentBefore += 1

    const preflight = evaluateIntentPreflight({
      platform: thread.platform,
      externalId: thread.external_id,
      author: thread.author ?? '',
      title: thread.title ?? undefined,
      text: thread.text_content ?? '',
      url: thread.url ?? '',
      createdAt: thread.source_created_at,
      sourceTarget: keywordById.get(thread.keyword_id)?.target ?? '',
    }, profile, {
      keywordTerm: keywordById.get(thread.keyword_id)?.term ?? null,
    })
    const plan = planIntentRescore(thread, preflight)
    if (plan.score >= 80 && !plan.shouldDismiss) summary.highIntentAfter += 1
    if (plan.shouldDismiss) {
      summary.dismissed += 1
      for (const signal of preflight.noiseSignals) {
        incrementCounter(summary.rejectionSignals, signal)
      }
    } else {
      summary.retained += 1
    }
    if (plan.shouldApply) {
      summary.changed += 1
      planned.push({ thread, plan })
    }
  }

  if (options.apply) {
    for (const batch of chunk(planned, 8)) {
      const results = await Promise.all(batch.map(async ({ thread, plan }) => {
        const { data, error } = await supabase.rpc('apply_intent_rescore_v1', {
          p_thread_id: thread.id,
          p_intent_score: plan.score,
          p_intent_label: plan.label,
          p_flag: plan.flag,
          p_reasoning: plan.reasoning,
          p_matched_signals: plan.matchedSignals,
          p_should_dismiss: plan.shouldDismiss,
          p_automation_reason: plan.automationReason,
        })
        return { data, error }
      }))

      for (const result of results) {
        if (result.error) {
          summary.failures += 1
          console.error(`Rescore write failed: ${result.error.message}`)
        } else if (result.data !== true) {
          summary.skippedConcurrentChange += 1
        }
      }
    }
  }

  summary.rejectionSignals = Object.fromEntries(
    Object.entries(summary.rejectionSignals)
      .sort((left, right) => right[1] - left[1]),
  )
  console.log(JSON.stringify(summary, null, 2))
  if (!options.apply && summary.changed > 0) {
    console.log('Dry run only. Re-run with --apply after reviewing this summary.')
  }
  if (summary.failures > 0) process.exitCode = 1
}

const invokedPath = process.argv[1]
if (invokedPath && pathToFileURL(path.resolve(invokedPath)).href === import.meta.url) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
