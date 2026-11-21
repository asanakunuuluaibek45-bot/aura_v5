import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next')
  // URL parsing normalizes backslashes and whitespace. Checking only "//"
  // allows paths such as "/\\external.example" to leave this origin.
  let destination = new URL('/', origin)
  if (requestedNext?.startsWith('/')) {
    try {
      const candidate = new URL(requestedNext, origin)
      if (candidate.origin === origin) destination = candidate
    } catch {
      // Malformed destinations fall back to the application's home page.
    }
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (!userError && user?.app_metadata?.provider === 'google') {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('shop_name, requested_role')
          .eq('id', user.id)
          .maybeSingle()
        if (!profileError && (!profile?.shop_name?.trim() || !profile?.requested_role)) {
          destination = new URL('/auth/complete-profile', origin)
        }
      }
      return NextResponse.redirect(destination)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
