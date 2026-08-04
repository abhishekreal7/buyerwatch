/**
 * Maps raw technical auth-related error strings into user-friendly messages.
 *
 * Used in two layers:
 * 1. Server-side (auth callback routes) — to prevent raw strings from reaching the URL.
 * 2. Client-side (login/signup pages) — defense-in-depth in case a raw string
 *    still ends up in `?error=` via a stale bookmark, manual URL crafting, or
 *    a new error path we haven't covered.
 */

/** Known error codes used by our own routes (google oauth, reddit, etc.) */
const ERROR_CODE_MAP: Record<string, string> = {
  google_oauth_unavailable:
    'Google sign-in is temporarily unavailable. Please try email/password or try again later.',
}

/** Pattern-based fallback for Supabase / OAuth technical strings */
const ERROR_PATTERNS: [test: RegExp, message: string][] = [
  [
    /pkce|code.verifier|verifier.not.found/i,
    'Your login session expired \u2014 please try signing in again.',
  ],
  [
    /invalid.grant|code.has.been.used|authorization.code/i,
    'This sign-in link has already been used or has expired. Please try again.',
  ],
  [
    /access.denied|access_denied/i,
    'Sign-in was cancelled or denied. Please try again.',
  ],
  [
    /email.not.confirmed/i,
    'Please confirm your email address first. Check your inbox for the confirmation link.',
  ],
  [
    /invalid.login|invalid.credentials/i,
    'Incorrect email or password. Please try again.',
  ],
]

/**
 * Returns a clean, user-safe error message for any auth error string.
 *
 * - Known internal codes (e.g. `google_oauth_unavailable`) are mapped to friendly text.
 * - Known Supabase/PKCE patterns are caught by regex.
 * - Anything else gets a safe generic fallback so raw internals never leak.
 */
export function friendlyAuthError(raw: string | null | undefined): string {
  if (!raw) return 'Sign-in failed \u2014 please try again.'

  // 1. Exact code match (our own route codes)
  const codeMatch = ERROR_CODE_MAP[raw]
  if (codeMatch) return codeMatch

  // 2. Pattern match (Supabase / OAuth technical strings)
  for (const [pattern, message] of ERROR_PATTERNS) {
    if (pattern.test(raw)) return message
  }

  // 3. If the string looks like a short, clean, human-written sentence
  //    (no stack traces, no camelCase internals, no URL-encoded junk),
  //    it's likely already a friendly message from our own routes.
  const looksHumanWritten =
    raw.length <= 120 &&
    !raw.includes('Error:') &&
    !raw.includes('error:') &&
    !/[A-Z][a-z]+[A-Z]/.test(raw) && // camelCase detector
    !raw.includes('\n') &&
    !raw.includes('{')

  if (looksHumanWritten) return raw

  // 4. Anything else is suspicious — don't render it
  return 'Sign-in failed \u2014 please try again.'
}
