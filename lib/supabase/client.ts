import { createBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const nativeAuthStorage = {
  async getItem(key: string) {
    const { value } = await Preferences.get({ key })
    return value
  },
  async setItem(key: string, value: string) {
    await Preferences.set({ key, value })
  },
  async removeItem(key: string) {
    await Preferences.remove({ key })
  },
}

let nativeClient: ReturnType<typeof createSupabaseClient> | null = null

export function createClient() {
  // Capacitor's local WebView must not depend on website cookies for auth.
  // Preferences keeps the Supabase session available across native launches.
  if (Capacitor.isNativePlatform()) {
    if (!nativeClient) {
      nativeClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            storage: nativeAuthStorage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        },
      )
    }
    return nativeClient
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        sameSite: 'none',
        secure: true,
      },
    },
  )
}
