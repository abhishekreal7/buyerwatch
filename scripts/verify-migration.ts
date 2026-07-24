import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function applyMigration() {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20260724_differentiator_features.sql'),
    'utf-8'
  )

  // Split into individual statements and run each via rpc if exec_sql exists,
  // otherwise try running them as individual queries
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  console.log(`Running ${statements.length} statements...`)

  for (const stmt of statements) {
    console.log(`Executing: ${stmt.slice(0, 80)}...`)
    const { error } = await supabase.rpc('exec_sql' as any, { sql: stmt }).single() as any
    if (error && !error.message.includes('already exists') && !error.message.includes('does not exist')) {
      // Try direct query approach
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        method: 'GET',
        headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY! }
      })
      console.warn(`Statement had issue: ${error.message} (may be harmless IF NOT EXISTS)`)
    } else if (!error) {
      console.log(`✅ OK`)
    }
  }

  // Verify new columns exist
  const { data, error } = await supabase
    .from('monitored_threads')
    .select('score_reasoning, google_rank_position')
    .limit(1)

  if (!error) {
    console.log('✅ Columns verified: score_reasoning + google_rank_position exist')
  } else {
    console.log('❌ Column check failed:', error.message)
    console.log('\n⚠️  You need to manually run the migration SQL in Supabase SQL Editor:')
    console.log('   supabase/migrations/20260724_differentiator_features.sql')
  }

  const { data: attrData, error: attrError } = await supabase
    .from('reply_attribution')
    .select('id')
    .limit(1)

  if (!attrError) {
    console.log('✅ reply_attribution table verified')
  } else {
    console.log('❌ reply_attribution table missing:', attrError.message)
    console.log('   Run migration manually in Supabase SQL Editor')
  }
}

applyMigration().catch(console.error)
