import test from "node:test"
import assert from "node:assert/strict"
import { countUnresolvedOutboxOperations } from "../lib/local-db/logout-protection.ts"

const operationTypes = [
  "create",
  "update",
  "delete",
  "atomic_sale",
  "atomic_return",
  "atomic_cash",
  "product_add",
  "product_update",
  "product_delete",
  "stock_change",
]
const unresolvedStatuses = ["pending", "failed", "syncing", "dead"]
const operation = (op_type, status, shop_id = "shop-a") => ({ op_type, status, shop_id })

test("counts every unresolved operation type and status, ignoring completed rows", () => {
  const unresolved = operationTypes.flatMap((type) =>
    unresolvedStatuses.map((status) => operation(type, status)),
  )
  const items = [
    ...unresolved,
    ...operationTypes.map((type) => operation(type, "completed")),
    operation("product_delete", "pending", "shop-b"),
  ]

  assert.equal(countUnresolvedOutboxOperations(items), unresolved.length + 1)
  assert.equal(countUnresolvedOutboxOperations(items, "shop-a"), unresolved.length)
  assert.equal(countUnresolvedOutboxOperations(items, "shop-b"), 1)
})
