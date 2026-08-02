import { createBrowserClient } from '@supabase/ssr'
import { cachedSupabaseFetch } from '@/utils/supabase/read-cache'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      isSingleton: true,
      global: { fetch: cachedSupabaseFetch },
    },
  )
}
