import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const allowedPaths = new Set([
  '/crm/money', '/crm/showcase', '/crm/customers', '/crm/reports',
  '/crm/suppliers', '/crm/stores', '/crm/notifications', '/crm/cabinet',
])

/**
 * Access-only bootstrap for an isolated WKWebView. Never accept a refresh token:
 * two clients rotating the same refresh token can invalidate the native login.
 * The online window is disposable and must be reopened when this JWT expires.
 */
export async function POST(request: NextRequest) {
  const fail = (status: number) => NextResponse.json(
    { error: 'Не удалось открыть онлайн-сеанс. Закройте окно и повторите вход.' },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
  if (request.headers.get('x-aura-native') !== '1' ||
      !request.headers.get('content-type')?.startsWith('application/json')) return fail(400)
  // Browser forms cannot supply the custom header. Reject cross-origin fetches.
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) return fail(403)
  let body: { accessToken?: unknown; path?: unknown }
  try {
    const raw = await request.text()
    if (raw.length > 16384) return fail(413)
    body = JSON.parse(raw)
  } catch { return fail(400) }
  if (typeof body?.accessToken !== 'string' || typeof body.path !== 'string' ||
      !allowedPaths.has(body.path)) return fail(400)
  const supabase = await createClient()
  // Signature, expiry and user state are checked by Supabase, not trusted from input.
  const { data: user, error } = await supabase.auth.getUser(body.accessToken)
  if (error || !user.user) return fail(401)
  const { data, error: sessionError } = await supabase.auth.setSession({
    access_token: body.accessToken,
    refresh_token: 'native-access-only',
  })
  if (sessionError || !data.session || data.session.user.id !== user.user.id) return fail(401)
  const response = NextResponse.redirect(new URL(body.path, request.url), 303)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
