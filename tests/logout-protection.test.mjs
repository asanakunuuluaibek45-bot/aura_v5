import test from "node:test"
import assert from "node:assert/strict"
import { countUnresolvedOutboxOperations, summarizeOutboxOperations } from "../lib/local-db/logout-protection.ts"

const operationTypes = [
  "create", "update", "delete", "atomic_sale", "atomic_return", "atomic_cash",
  "product_add", "product_update", "product_delete", "stock_change",
]
const statuses = ["pending", "failed", "syncing", "dead"]
const operation = (op_type, status, shop_id = "shop-a", error = null) => ({
  op_type, status, shop_id, error,
})

test("summarizes queued and rejected operations consistently with logout protection", () => {
  const active = operationTypes.flatMap((type) => statuses.map((status) =>
    operation(type, status, "shop-a", status === "dead" ? "Server rejected operation" : null),
  ))
  const items = [
    ...active,
    ...operationTypes.map((type) => operation(type, "completed")),
    operation("product_delete", "pending", "shop-b"),
  ]

  assert.deepEqual(summarizeOutboxOperations(items), {
    pendingCount: 31,
    needsAttentionCount: 10,
    unresolvedCount: 41,
    lastError: "Server rejected operation",
  })
  assert.deepEqual(summarizeOutboxOperations(items, "shop-a"), {
    pendingCount: 30,
    needsAttentionCount: 10,
    unresolvedCount: 40,
    lastError: "Server rejected operation",
  })
  assert.equal(countUnresolvedOutboxOperations(items, "shop-b"), 1)
})
