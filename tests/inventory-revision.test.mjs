import assert from "node:assert/strict"
import test from "node:test"
import {
  getRevisionProducts,
  groupRevisionProducts,
  filterRevisionCategory,
  parseRevisionSession,
  recordRevisionScan,
  toggleRevisionCheck,
} from "../lib/inventory-revision.ts"

const product = (id, overrides = {}) => ({
  id,
  name: "Кольцо",
  sku: id,
  category: "Кольца",
  metal: "Золото 375",
  status: "in_stock",
  deleted_at: null,
  ...overrides,
})

test("revision includes only active stock and reserved products", () => {
  const products = [
    product("stock"),
    product("reserved", { status: "reserved" }),
    product("sold", { status: "sold" }),
    product("deleted", { deleted_at: "2026-11-13T00:00:00Z" }),
  ]

  assert.deepEqual(getRevisionProducts(products).map(({ id }) => id), ["stock", "reserved"])
})

test("products group by category and metal with a non-negative remaining count", () => {
  const groups = groupRevisionProducts(
    [product("one"), product("two"), product("silver", { metal: "Серебро 925" })],
    new Set(["one", "two", "not-in-stock"]),
  )

  assert.equal(groups.length, 2)
  assert.equal(groups[0].total, 2)
  assert.equal(groups[0].checked, 2)
  assert.equal(groups[0].remaining, 0)
  assert.equal(groups[1].remaining, 1)
})

test("scan matches an exact SKU and duplicate scans do not decrement again", () => {
  const products = [product("RY00001"), product("RY00002")]
  const first = recordRevisionScan(products, [], "ry00001")

  assert.equal(first.status, "checked")
  if (first.status !== "checked") return
  assert.deepEqual(first.checkedIds, ["RY00001"])
  assert.equal(recordRevisionScan(products, first.checkedIds, "RY00001").status, "already_checked")
  assert.equal(recordRevisionScan(products, first.checkedIds, "missing").status, "not_found")
  assert.deepEqual(first.checkedIds, ["RY00001"])
})

test("revision sessions restore valid state and ignore malformed data", () => {
  assert.deepEqual(parseRevisionSession("{broken"), { checkedProductIds: [], finished: false })
  assert.deepEqual(parseRevisionSession(JSON.stringify({
    checkedProductIds: ["a", "a", 42, "b"],
    finished: true,
  })), { checkedProductIds: ["a", "b"], finished: true })
})


test("manual checks append once and undo preserves the newest-first history", () => {
  const first = toggleRevisionCheck([], "a", true)
  const second = toggleRevisionCheck(first, "b", true)
  assert.deepEqual(toggleRevisionCheck(second, "a", true), ["a", "b"])
  assert.deepEqual(toggleRevisionCheck(second, "a", false), ["b"])
  assert.deepEqual(second, ["a", "b"])
})


test("selected category filters the product set while all categories stay available", () => {
  const products = [product("ring"), product("earrings", { category: "Серьги" })]
  assert.deepEqual(filterRevisionCategory(products, "Серьги").map(({ id }) => id), ["earrings"])
  assert.deepEqual(filterRevisionCategory(products, "").map(({ id }) => id), ["ring", "earrings"])
})
