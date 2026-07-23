import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data, error } = await sb
    .from('monitored_threads')
    .select('id, intent_score, intent_label, platform, source_target, created_at, user_id')
    .order('created_at', { ascending: false })
    .limit(15)

  if (error) {
    console.error('Error:', error)
  } else {
    console.log(`\n=== monitored_threads (${data.length} rows) ===`)
    for (const r of data) {
      console.log(`[${r.platform}] ${r.source_target} | score=${r.intent_score} | label=${r.intent_label} | ${r.created_at}`)
    }
  }
}

main().catch(console.error)
