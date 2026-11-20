import { createBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { AuraNative, usesKeychain } from '../native-session'

const DEVICE_SIGNED_OUT_KEY = 'aura_device_signed_out'
let deviceSignInInProgress = false

export function deviceAuthStorageKey(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('Supabase URL is not configured')
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
}

export async function isDeviceSignedOut(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return (await Preferences.get({ key: DEVICE_SIGNED_OUT_KEY })).value === 'true'
  }
  return typeof localStorage !== 'undefined' && localStorage.getItem(DEVICE_SIGNED_OUT_KEY) === 'true'
}

export function prepareDeviceSignIn(): void {
  deviceSignInInProgress = true
  nativeClient = null
}

export async function markDeviceSignedIn(): Promise<void> {
  deviceSignInInProgress = false
  if (Capacitor.isNativePlatform()) await Preferences.remove({ key: DEVICE_SIGNED_OUT_KEY })
  else localStorage.removeItem(DEVICE_SIGNED_OUT_KEY)
  createClient().auth.startAutoRefresh()
}

export async function clearDeviceAuth(): Promise<void> {
  deviceSignInInProgress = false
  const key = deviceAuthStorageKey()
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: DEVICE_SIGNED_OUT_KEY, value: 'true' })
    for (const item of [key, `${key}-code-verifier`, `${key}-user`]) {
      if (usesKeychain()) await AuraNative.remove({ key: item })
      await Preferences.remove({ key: item })
    }
  } else {
    localStorage.setItem(DEVICE_SIGNED_OUT_KEY, 'true')
    for (const item of [key, `${key}-code-verifier`, `${key}-user`]) localStorage.removeItem(item)
  }
  // A fresh instance on next login cannot resurrect its in-memory old session.
  nativeClient = null
}

const nativeAuthStorage = {
  async getItem(key: string) {
    if (await isDeviceSignedOut()) return null
    if (usesKeychain()) {
      const secure = await AuraNative.get({ key })
      if (secure.value !== null) return secure.value
      // Migrate an existing installation only after Keychain confirms the write.
      const legacy = await Preferences.get({ key })
      if (legacy.value !== null) {
        await AuraNative.set({ key, value: legacy.value })
        await Preferences.remove({ key })
      }
      return legacy.value
    }
    const { value } = await Preferences.get({ key })
    return value
  },
  async setItem(key: string, value: string) {
    if (await isDeviceSignedOut() && !deviceSignInInProgress) return
    if (usesKeychain()) await AuraNative.set({ key, value })
    else await Preferences.set({ key, value })
  },
  async removeItem(key: string) {
    if (usesKeychain()) await AuraNative.remove({ key })
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
            storageKey: deviceAuthStorageKey(),
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
