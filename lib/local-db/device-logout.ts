import { requireLogoutConsent, type LogoutOptions } from '../offline-policy'
import type { Profile } from '../types'
import { createClient, clearDeviceAuth, isDeviceSignedOut } from '../supabase/client'
import { getSavedUserSession, wipeLocalDatabase } from './db'
import { getUnresolvedOutboxOperationCount } from './outbox'
import { clearServiceWorkerCaches, runLogoutCleanup } from './logout-cleanup'
import { syncEngine } from '../sync/sync-engine'

export async function restoreDeviceProfile(): Promise<Profile | null> {
  if (await isDeviceSignedOut()) return null
  const saved = await getSavedUserSession()
  const profile = saved?.profile as Profile | undefined
  return profile?.id === saved?.userId && profile?.status === 'approved' && profile.role && profile.shop_id
    ? profile : null
}

/** Fail closed: a failed queue read must never authorize destructive logout. */
export async function logoutDeviceAccount(options: LogoutOptions = {}): Promise<void> {
  requireLogoutConsent(await getUnresolvedOutboxOperationCount(), options)
  await syncEngine.stopAndDrain()
  try {
    // Re-check after outstanding writes settle, before any destructive action.
    requireLogoutConsent(await getUnresolvedOutboxOperationCount(), options)
    createClient().auth.stopAutoRefresh()
    // Local device logout deliberately makes no HTTP request. Remote sessions
    // are not revoked offline; the fence blocks restoration after cold start.
    await clearDeviceAuth()
    await runLogoutCleanup(options)
  } catch (error) {
    const profile = await restoreDeviceProfile()
    if (profile?.shop_id) void syncEngine.init(profile.shop_id)
    throw error
  }
}

/**
 * A server-confirmed account deletion makes all cached business data stale.
 * Unlike ordinary logout, there is no surviving account to protect from
 * accidental unsynced-data loss, so purge the local database without consent.
 */
export async function purgeDeletedAccountData(): Promise<void> {
  await syncEngine.stopAndDrain()
  createClient().auth.stopAutoRefresh()
  await clearDeviceAuth()
  await wipeLocalDatabase()
  await clearServiceWorkerCaches()
}
