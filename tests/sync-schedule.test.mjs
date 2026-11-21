import assert from "node:assert/strict"
import test from "node:test"
import { getRealtimeSyncPlan, PERIODIC_SYNC_MS, shouldRunPeriodicSync } from "../lib/sync/sync-schedule.ts"

test("periodic sync is an eight-minute fallback", () => {
  assert.equal(PERIODIC_SYNC_MS, 480_000)
})

test("periodic sync runs only while Realtime is disconnected and the session is active", () => {
  const ready = { online: true, running: false, stopped: false, visible: true, realtimeConnected: false }
  assert.equal(shouldRunPeriodicSync(ready), true)
  assert.equal(shouldRunPeriodicSync({ ...ready, online: false }), false)
  assert.equal(shouldRunPeriodicSync({ ...ready, running: true }), false)
  assert.equal(shouldRunPeriodicSync({ ...ready, stopped: true }), false)
  assert.equal(shouldRunPeriodicSync({ ...ready, visible: false }), false)
  assert.equal(shouldRunPeriodicSync({ ...ready, realtimeConnected: true }), false)
})

test("Realtime changes sync only the affected business table", () => {
  assert.deepEqual(getRealtimeSyncPlan(new Set(["sales"])), {
    tables: ["sales"],
    syncShopSettings: false,
    syncProductTombstones: false,
  })
})

test("product changes also refresh deletion tombstones", () => {
  assert.deepEqual(getRealtimeSyncPlan(new Set(["products"])), {
    tables: ["products"],
    syncShopSettings: false,
    syncProductTombstones: true,
  })
})

test("shop settings changes refresh only shop settings", () => {
  assert.deepEqual(getRealtimeSyncPlan(new Set(["shop_settings"])), {
    tables: [],
    syncShopSettings: true,
    syncProductTombstones: false,
  })
})
