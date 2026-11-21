import type { TableName } from '../local-db/schema'

/**
 * Realtime handles normal updates. The long interval is only a recovery
 * safety-net for disconnected clients; it is skipped while Realtime is healthy.
 */
export const PERIODIC_SYNC_MS = 8 * 60 * 1000

const DELTA_SYNC_TABLES: readonly TableName[] = [
  'products',
  'sales',
  'sale_returns',
  'cash_operations',
  'customers',
  'cash_reason_presets',
  'metal_rates',
  'supplier_debt_operations',
]

export function shouldRunPeriodicSync(state: {
  online: boolean
  running: boolean
  stopped: boolean
  visible: boolean
  realtimeConnected: boolean
}): boolean {
  return state.online && !state.running && !state.stopped && state.visible && !state.realtimeConnected
}

export function getRealtimeSyncPlan(changedTables: ReadonlySet<string>): {
  tables: TableName[]
  syncShopSettings: boolean
  syncProductTombstones: boolean
} {
  return {
    tables: DELTA_SYNC_TABLES.filter((table) => changedTables.has(table)),
    syncShopSettings: changedTables.has('shop_settings'),
    syncProductTombstones:
      changedTables.has('products') || changedTables.has('product_deletion_tombstones'),
  }
}
