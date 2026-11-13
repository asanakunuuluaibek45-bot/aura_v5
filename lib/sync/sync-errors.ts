import type { OutboxItem } from '../local-db/schema'

export type SupabaseErrorKind = 'transient' | 'permanent' | 'auth' | 'conflict'

/** Classify a Supabase/network failure: only transient errors deserve a retry. */
export function classifySyncError(err: any): SupabaseErrorKind {
  const code = String(err?.code || '')
  const status = Number(err?.status || err?.statusCode || 0)
  const message = String(err?.message || '').toLowerCase()

  if (status === 401 || code === 'PGRST301' || message.includes('jwt')) return 'auth'
  if (status === 409 || code === '23505' || message.includes('duplicate key')) return 'conflict'
  // Keep offline receipts queued if the RPC has not reached PostgREST's schema
  // cache yet; a transient retry lets the same operation succeed after deploy.
  if (code === 'PGRST202' || code === '42883') return 'transient'

  // Network-level failures, aborts and rate limits are always worth retrying.
  if (
    err?.name === 'AbortError' ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599) ||
    code === '40001' || // serialization failure
    code === '40P01' || // deadlock
    code === '57014' || // statement timeout
    code === '08006' ||
    code === '08003'
  ) {
    return 'transient'
  }

  // Constraint violations, bad payloads and RLS denials will never succeed on retry.
  if (code === 'P0001' || code.startsWith('22') || code.startsWith('23') || code.startsWith('42') || (status >= 400 && status < 500)) {
    return 'permanent'
  }

  return 'transient'
}

/** Recover only known temporary failures from the old eight-attempt dead-letter policy. */
export function canRecoverOutboxItem(item: OutboxItem): boolean {
  if (item.status !== 'dead') return false
  if (item.failure_kind) return item.failure_kind === 'transient' || item.failure_kind === 'auth'
  if ((item.retries || 0) < 8) return false
  const message = (item.error || '').toLowerCase()
  return /failed to fetch|fetch failed|network(?:error| request| error)?|timeout|timed out|abort(?:ed|error)|сессия истекла|jwt.*(?:expired|invalid)|refresh token|deadlock|serialization failure/.test(message) ||
    (message.includes('could not find the function') && message.includes('schema cache'))
}
