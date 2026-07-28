import { getServiceRoleClient } from '@/lib/admin'
import { verifyUnsubscribeToken } from '@/lib/email-preferences'
import { readJsonBody, readTextBody, RequestInputError } from '@/lib/request'

function page(token: string, message?: string) {
  const safeToken = token.replace(/[^A-Za-z0-9_-]/g, '')
  const body = message
    ? `<p>${message}</p>`
    : `<form method="post"><input type="hidden" name="token" value="${safeToken}"><button type="submit">Unsubscribe</button></form>`
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Email preferences</title></head><body style="font-family:system-ui;max-width:560px;margin:80px auto;padding:20px"><h1>BuyerWatch email preferences</h1>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  if (!verifyUnsubscribeToken(token)) return page('', 'This unsubscribe link is invalid or expired.')
  return page(token)
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    const queryToken = new URL(request.url).searchParams.get('token') ?? ''
    const token = queryToken || (
      contentType.includes('application/json')
        ? String((await readJsonBody<Record<string, unknown>>(request, 2_048)).token ?? '')
        : String(new URLSearchParams(await readTextBody(request, 2_048)).get('token') ?? '')
    )
    const userId = verifyUnsubscribeToken(token)
    if (!userId) return page('', 'This unsubscribe link is invalid or expired.')

    const admin = getServiceRoleClient()
    const { data: profile, error: loadError } = await admin
      .from('profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .single()
    if (loadError) throw loadError
    const preferences = {
      ...(profile.notification_preferences ?? {}),
      weeklyReport: false,
      emailDigest: false,
    }
    const { error } = await admin
      .from('profiles')
      .update({ notification_preferences: preferences })
      .eq('id', userId)
    if (error) throw error
    return page('', 'You have been unsubscribed from weekly email reports.')
  } catch (error) {
    if (error instanceof RequestInputError) return page('', 'Invalid request.')
    return page('', 'We could not update your preferences. Please try again.')
  }
}
