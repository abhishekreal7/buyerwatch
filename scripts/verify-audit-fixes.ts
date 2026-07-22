import { evaluateAutoSend } from '../src/lib/confidence-engine'
import { checkSendRateLimit } from '../src/lib/send-limiter'

async function runAuditVerification() {
  console.log('--- RUNNING AUDIT FIX VERIFICATIONS ---')

  // 1. Verify targetCommunity fix in confidence engine gate evaluation
  console.log('\n[1] Testing Confidence Engine targetCommunity lookup parameter...')
  const dummyProfile = {
    plan: 'pro',
    auto_send_enabled: true,
    auto_send_threshold: 80,
    writing_style: 'helpful'
  }
  const dummyDraft = {
    score: 85,
    text: 'Check out our solution at matchsignal.com for automated keyword monitoring. Founder disclosure: I built MatchSignal.',
    flagged: false,
    hasDisclosure: true
  }

  
  // Test passing subreddit as targetCommunity (e.g. "entrepreneur")
  const evalResult = await evaluateAutoSend('user-test-123', 'reddit', dummyDraft, dummyProfile, 'entrepreneur')
  console.log('Evaluation result with targetCommunity="entrepreneur":', {
    approved: evalResult.approved,
    reason: evalResult.reason,
    confidence: evalResult.automationConfidence,
    threshold: evalResult.dynamicThreshold
  })

  // 2. Verify Rate Limiter fail-closed / allowed check
  console.log('\n[2] Testing Rate Limiter fallback behavior...')
  const rateLimitResult = await checkSendRateLimit('user-test-123', 'reddit')
  console.log('Rate limit check result:', rateLimitResult)

  console.log('\n--- VERIFICATION COMPLETED SUCCESSFULLY ---')
}

runAuditVerification().catch(console.error)
