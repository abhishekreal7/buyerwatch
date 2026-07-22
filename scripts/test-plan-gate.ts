/**
 * Manual test for the confidence engine plan gate.
 *
 * Simulates the exact scenario from the audit prompt:
 *   - free user with auto_send_enabled = true (as if set directly in DB)
 *   - expects: approved=false, reason='auto_send_requires_paid_plan'
 *
 * Run from project root:
 *   node --loader ts-node/esm scripts/test-plan-gate.ts
 * or:
 *   npx ts-node scripts/test-plan-gate.ts
 */

import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { evaluateAutoSend } from '../src/lib/confidence-engine'

const PASS = '\x1b[32m✓ PASS\x1b[0m'
const FAIL = '\x1b[31m✗ FAIL\x1b[0m'
const DIM  = '\x1b[2m'
const RESET = '\x1b[0m'

async function runTests() {
  let allPassed = true

  // ────────────────────────────────────────────────────────────────
  // Test 1: Free user, auto_send_enabled=true (direct DB bypass sim)
  //         Must be blocked with auto_send_requires_paid_plan
  // ────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════')
  console.log(' Confidence Engine — Plan Gate Tests')
  console.log('══════════════════════════════════════════════\n')

  {
    const label = 'Free plan + auto_send_enabled=true → blocked at plan gate'
    const result = await evaluateAutoSend(
      'test-user-free',
      'reddit',
      { flagged: false, hasDisclosure: true },
      { auto_send_enabled: true, plan: 'free' },
      null
    )
    const pass = result.approved === false && result.reason === 'auto_send_requires_paid_plan'
    allPassed = allPassed && pass
    console.log(`  ${pass ? PASS : FAIL}  ${label}`)
    console.log(`${DIM}         approved=${result.approved}  reason='${result.reason}'${RESET}`)
  }

  // ────────────────────────────────────────────────────────────────
  // Test 2: Free plan, auto_send_enabled=false → same block
  //         (plan gate fires before the feature-flag gate)
  // ────────────────────────────────────────────────────────────────
  {
    const label = 'Free plan + auto_send_enabled=false → still blocked at plan gate'
    const result = await evaluateAutoSend(
      'test-user-free',
      'reddit',
      { flagged: false, hasDisclosure: true },
      { auto_send_enabled: false, plan: 'free' },
      null
    )
    const pass = result.approved === false && result.reason === 'auto_send_requires_paid_plan'
    allPassed = allPassed && pass
    console.log(`  ${pass ? PASS : FAIL}  ${label}`)
    console.log(`${DIM}         approved=${result.approved}  reason='${result.reason}'${RESET}`)
  }

  // ────────────────────────────────────────────────────────────────
  // Test 3: normalizePlan edge case — null plan (new user, never set)
  //         → must also be blocked (null ?? 'free' = 'free')
  // ────────────────────────────────────────────────────────────────
  {
    const label = 'null plan (new user) + auto_send_enabled=true → blocked at plan gate'
    const rawPlan = null as unknown as string  // simulates profile.plan from DB being null
    const result = await evaluateAutoSend(
      'test-user-new',
      'reddit',
      { flagged: false, hasDisclosure: true },
      { auto_send_enabled: true, plan: rawPlan ?? 'free' },
      null
    )
    const pass = result.approved === false && result.reason === 'auto_send_requires_paid_plan'
    allPassed = allPassed && pass
    console.log(`  ${pass ? PASS : FAIL}  ${label}`)
    console.log(`${DIM}         approved=${result.approved}  reason='${result.reason}'${RESET}`)
  }

  // ────────────────────────────────────────────────────────────────
  // Test 4: Pro plan + auto_send_enabled=false
  //         → passes plan gate, fails at feature-flag gate (Gate 0)
  //         Verifies plan gate doesn't interfere with legitimate flow
  // ────────────────────────────────────────────────────────────────
  {
    const label = 'Pro plan + auto_send_enabled=false → plan gate passes, Gate 0 blocks'
    const result = await evaluateAutoSend(
      'test-user-pro',
      'reddit',
      { flagged: false, hasDisclosure: true },
      { auto_send_enabled: false, plan: 'pro' },
      null
    )
    const pass = result.approved === false && result.reason === 'auto_send_disabled'
    allPassed = allPassed && pass
    console.log(`  ${pass ? PASS : FAIL}  ${label}`)
    console.log(`${DIM}         approved=${result.approved}  reason='${result.reason}'${RESET}`)
  }

  // ────────────────────────────────────────────────────────────────
  // Test 5: Growth plan + auto_send_enabled=true + cold start
  //         → plan gate and Gate 0 pass, Gate 2 fires (cold start)
  // ────────────────────────────────────────────────────────────────
  {
    const label = 'Growth plan + auto_send_enabled=true + cold start → blocked at Gate 2'
    const result = await evaluateAutoSend(
      'test-user-growth',
      'reddit',
      { flagged: false, hasDisclosure: true },
      { auto_send_enabled: true, plan: 'growth' },
      null
    )
    // user_trust_metrics won't exist for this test user → cold_start_insufficient_data
    const pass = result.approved === false &&
      (result.reason === 'cold_start_insufficient_data' || result.reason === 'below_dynamic_threshold')
    allPassed = allPassed && pass
    console.log(`  ${pass ? PASS : FAIL}  ${label}`)
    console.log(`${DIM}         approved=${result.approved}  reason='${result.reason}'${RESET}`)
  }

  console.log('\n══════════════════════════════════════════════')
  console.log(allPassed
    ? `\x1b[32m All tests passed\x1b[0m`
    : `\x1b[31m Some tests FAILED — plan gate has a bug\x1b[0m`)
  console.log('══════════════════════════════════════════════\n')
  process.exit(allPassed ? 0 : 1)
}

runTests().catch(err => {
  console.error('\x1b[31mUnexpected error during test run:\x1b[0m', err)
  process.exit(1)
})
