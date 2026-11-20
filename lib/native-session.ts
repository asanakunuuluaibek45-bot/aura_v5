import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

interface AuraNativePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
  openOnline(options: { path: string; accessToken: string }): Promise<void>
  closeOnline(): Promise<void>
  addListener(event: 'localNavigate', listener: (event: { path: string }) => void): Promise<PluginListenerHandle>
}

export const AuraNative = registerPlugin<AuraNativePlugin>('AuraNative')
export function usesKeychain(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

/** A native iOS modal, not a remote page with access to the Capacitor bridge. */
export async function openOnlineSection(path: string): Promise<void> {
  const { createClient } = await import('./supabase/client')
  const { data, error } = await createClient().auth.getSession()
  if (error || !data.session) throw new Error('Для онлайн-раздела войдите в аккаунт с интернетом.')
  await AuraNative.openOnline({ path, accessToken: data.session.access_token })
}
