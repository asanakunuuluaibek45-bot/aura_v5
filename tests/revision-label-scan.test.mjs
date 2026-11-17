import assert from "node:assert/strict"
import test from "node:test"
import { createRevisionScanTracker, processRevisionLabel } from "../lib/revision-label-scan.ts"
import { recordRevisionScan } from "../lib/inventory-revision.ts"

const foreign = { ok: false, reason: "foreign_shop", scannedSeqId: 2, ownSeqId: 1, ownShopName: null }
const valid = { ok: true, shopSeqId: 1, shopName: null }
const label = { sku: "A", shopSeqId: 2 }
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function store(initial = []) {
  const tracker = createRevisionScanTracker()
  let ids = [...initial]
  const products = ["A", "B"].map(id => ({ id, sku: id, name: id, status: "in_stock" }))
  return {
    tracker,
    ids: () => ids,
    persisted: () => ids.filter(id => !tracker.isPending(id)),
    mark(id) { tracker.invalidate(id); if (!ids.includes(id)) ids.push(id) },
    undo(id) { tracker.invalidate(id); ids = ids.filter(value => value !== id) },
    reset() { tracker.reset(); ids = [] },
    begin(sku) {
      const result = recordRevisionScan(products, ids, sku)
      if (result.status === "not_found") return { result, confirm() {}, rollback: () => false }
      if (result.status === "checked") ids = [...ids, result.product.id]
      const ticket = tracker.begin(result.product.id, result.status === "checked")
      return {
        result,
        confirm() { ticket.confirm() },
        rollback() {
          if (!ticket.rollback()) return false
          ids = ids.filter(id => id !== result.product.id)
          return true
        },
      }
    },
  }
}

test("local marking happens before the server response and stays after confirmation", async () => {
  const s = store(), check = deferred()
  const run = processRevisionLabel(label, s.begin, () => check.promise)
  assert.deepEqual(s.ids(), ["A"])
  assert.deepEqual(s.persisted(), [])
  assert.equal(s.tracker.pendingCount, 1)
  check.resolve(valid)
  assert.equal((await run).kind, "accepted")
  assert.deepEqual(s.persisted(), ["A"])
  assert.equal(s.tracker.pendingCount, 0)
})

test("foreign label rolls back its own mark, not marks for another scanned item", async () => {
  const s = store(), check = deferred()
  const run = processRevisionLabel(label, s.begin, () => check.promise)
  await processRevisionLabel({ sku: "B", shopSeqId: null }, s.begin, async () => valid)
  check.resolve(foreign)
  assert.equal((await run).rolledBack, true)
  assert.deepEqual(s.ids(), ["B"])
})

test("a foreign duplicate must never remove a previously checked item", async () => {
  const s = store(["A"])
  const result = await processRevisionLabel(label, s.begin, async () => foreign)
  assert.equal(result.rolledBack, false)
  assert.deepEqual(s.ids(), ["A"])
})

test("late rejection cannot undo a later manual undo and re-mark", async () => {
  const s = store(), check = deferred()
  const run = processRevisionLabel(label, s.begin, () => check.promise)
  s.undo("A")
  s.mark("A")
  check.resolve(foreign)
  assert.equal((await run).rolledBack, false)
  assert.deepEqual(s.ids(), ["A"])
})

test("late rejection cannot affect a new revision or a different shop session", async () => {
  const s = store(), check = deferred()
  const run = processRevisionLabel(label, s.begin, () => check.promise)
  s.reset()
  s.mark("A")
  check.resolve(foreign)
  assert.equal((await run).rolledBack, false)
  assert.deepEqual(s.ids(), ["A"])
})

test("a failed request rolls back only tentative data and reports validation_error", async () => {
  const s = store()
  const result = await processRevisionLabel(label, s.begin, async () => { throw new Error("404") })
  assert.equal(result.reason, "validation_error")
  assert.equal(result.rolledBack, true)
  assert.deepEqual(s.ids(), [])
})

test("unauthorized verification does not leave an unverified mark", async () => {
  const s = store()
  const result = await processRevisionLabel(label, s.begin, async () => ({ ok: false, reason: "unauthorized" }))
  assert.equal(result.reason, "unauthorized")
  assert.deepEqual(s.ids(), [])
})

test("plain SKU commits locally without a server call", async () => {
  const s = store()
  const result = await processRevisionLabel({ sku: "A", shopSeqId: null }, s.begin, async () => {
    assert.fail("No server call expected")
  })
  assert.equal(result.kind, "accepted")
  assert.deepEqual(s.persisted(), ["A"])
})

test("late confirmation does not restore an item manually unchecked while waiting", async () => {
  const s = store(), check = deferred()
  const run = processRevisionLabel(label, s.begin, () => check.promise)
  s.undo("A")
  check.resolve(valid)
  await run
  assert.deepEqual(s.ids(), [])
  assert.deepEqual(s.persisted(), [])
})

test("an earlier rejection cannot remove a newer scan of the same product", async () => {
  const s = store(), firstCheck = deferred(), secondCheck = deferred()
  const first = processRevisionLabel(label, s.begin, () => firstCheck.promise)
  s.undo("A")
  const second = processRevisionLabel(label, s.begin, () => secondCheck.promise)
  firstCheck.resolve(foreign)
  assert.equal((await first).rolledBack, false)
  assert.deepEqual(s.ids(), ["A"])
  secondCheck.resolve(valid)
  await second
  assert.deepEqual(s.persisted(), ["A"])
})

test("missing SKU never creates a mark", async () => {
  const s = store()
  const result = await processRevisionLabel({ sku: "missing", shopSeqId: null }, s.begin, async () => valid)
  assert.equal(result.result.status, "not_found")
  assert.deepEqual(s.ids(), [])
})
