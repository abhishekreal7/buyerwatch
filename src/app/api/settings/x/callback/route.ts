import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/admin'
import { encrypt } from '@/lib/encryption'
import { fetchWithTimeout, readResponseText } from '@/lib/http'
import { redis } from '@/lib/redis'
import { canMonitorPlatform } from '@/lib/plan-limits'

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://www.buyerwatch.co'
const redirect = (status: string) => NextResponse.redirect(new URL(`/settings?section=connections&x=${status}`, siteUrl()))
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get('code'); const state = url.searchParams.get('state')
  if (!code || !state || url.searchParams.get('error')) return redirect('cancelled')
  const rawState = await redis.get(`x-oauth:${state}`); await redis.del(`x-oauth:${state}`)
  if (!rawState || !process.env.X_OAUTH_CLIENT_ID || !process.env.X_OAUTH_CLIENT_SECRET) return redirect('expired')
  let stateData: { userId: string; verifier: string }; try { stateData = JSON.parse(rawState) } catch { return redirect('expired') }
  const { data: profile } = await getServiceRoleClient().from('profiles').select('plan').eq('id', stateData.userId).maybeSingle()
  if (!canMonitorPlatform(profile?.plan, 'x')) return redirect('plan_required')
  const callback = new URL('/api/settings/x/callback', siteUrl()).toString()
  const auth = Buffer.from(`${process.env.X_OAUTH_CLIENT_ID}:${process.env.X_OAUTH_CLIENT_SECRET}`).toString('base64')
  const tokenResponse = await fetchWithTimeout('https://api.x.com/2/oauth2/token', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: callback, code_verifier: stateData.verifier }).toString() }, 15_000)
  const tokenRaw = await readResponseText(tokenResponse, 64_000); let token: { access_token?: string; refresh_token?: string; expires_in?: number }
  try { token = JSON.parse(tokenRaw) } catch { return redirect('failed') }
  if (!tokenResponse.ok || !token.access_token || !token.refresh_token) return redirect('failed')
  const meResponse = await fetchWithTimeout('https://api.x.com/2/users/me', { headers: { Authorization: `Bearer ${token.access_token}` } }, 15_000)
  const meRaw = await readResponseText(meResponse, 64_000); let me: { data?: { username?: string } }; try { me = JSON.parse(meRaw) } catch { return redirect('failed') }
  if (!meResponse.ok || !me.data?.username) return redirect('failed')
  const access = JSON.stringify({ accessToken: token.access_token, expiresAt: Date.now() + Math.max(60, Number(token.expires_in) || 7200) * 1000 })
  const { error } = await getServiceRoleClient().from('platform_connections').upsert({ user_id: stateData.userId, platform: 'x', access_token: encrypt(access), refresh_token: encrypt(token.refresh_token), external_username: me.data.username }, { onConflict: 'user_id,platform' })
  return error ? redirect('failed') : redirect('connected')
}
