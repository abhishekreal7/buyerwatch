import { createRequire } from 'node:module'

// The compiled worker shares delivery modules with Next.js. Load its send
// handler in a plain Node process so web-only module markers or aliases cannot
// silently pass TypeScript and then crash the production worker at startup.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://worker-load-check.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'worker-load-check'
process.env.UPSTASH_REDIS_URL ||= 'redis://127.0.0.1:6379'

const require = createRequire(import.meta.url)
require('../dist/worker/handlers/send-reply.js')

console.log('PASS: compiled reply worker loads in plain Node.js')
