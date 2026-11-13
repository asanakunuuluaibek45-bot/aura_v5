import test from "node:test"
import assert from "node:assert/strict"
import { countUnresolvedProductDeletions } from "../lib/local-db/logout-protection.ts"

const operation = (op_type, status, shop_id = "shop-a", entity = "products") => ({
  op_type,
  status,
  shop_id,
  entity,
})

test("counts unresolved product deletions but ignores completed and unrelated operations", () => {
  const items = [
    operation("product_delete", "pending"),
    operation("product_delete", "failed"),
    operation("product_delete", "syncing"),
    operation("product_delete", "dead"),
    operation("product_delete", "completed"),
    operation("delete", "pending", "shop-a", "products"),
    operation("delete", "pending", "shop-a", "sales"),
    operation("product_update", "pending"),
    operation("product_delete", "pending", "shop-b"),
  ]

  assert.equal(countUnresolvedProductDeletions(items), 6)
  assert.equal(countUnresolvedProductDeletions(items, "shop-a"), 5)
})
