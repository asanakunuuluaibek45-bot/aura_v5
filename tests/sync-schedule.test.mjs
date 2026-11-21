import assert from "node:assert/strict"
import test from "node:test"
import { PERIODIC_SYNC_MS, shouldRunPeriodicSync } from "../lib/sync/sync-schedule.ts"

test("periodic sync is a sparse two-minute fallback", () => {
  assert.equal(PERIODIC_SYNC_MS, 120_000)
})

test("periodic sync runs only for an online, visible, idle session", () => {
  const ready = { online: true, running: false, stopped: false, visible: true }
  assert.equal(shouldRunPeriodicSync(ready), true)
  assert.equal(shouldRunPeriodicSync({ ...ready, online: false }), false)
  assert.equal(shouldRunPeriodicSync({ ...ready, running: true }), false)
  assert.equal(shouldRunPeriodicSync({ ...ready, stopped: true }), false)
  assert.equal(shouldRunPeriodicSync({ ...ready, visible: false }), false)
})
