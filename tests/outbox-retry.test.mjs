import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import vm from "node:vm"
import { classifySyncError, canRecoverOutboxItem } from "../lib/sync/sync-errors.ts"

function loadOutbox(rows) {
  const data = new Map(rows.map((row) => [row.id, structuredClone(row)]))
  const store = {
    get: async (id) => structuredClone(data.get(id)),
    getAll: async () => structuredClone([...data.values()]),
    put: async (row) => { data.set(row.id, structuredClone(row)) },
    delete: async (id) => { data.delete(id) },
  }
  const db = { transaction: () => ({ objectStore: () => store, done: Promise.resolve() }), getAll: store.getAll }
  const source = readFileSync(new URL("../lib/local-db/outbox.ts", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["']\s*;?$/gm, "")
    .replace(/^export /gm, "")
  const context = vm.createContext({ getLocalDB: async () => db, canRecoverOutboxItem })
  vm.runInContext(stripTypeScriptTypes(source, { mode: "strip" }) +
    "\nglobalThis.subject = { markOutboxFailed, recoverRetryableOutboxItems }", context)
  return { ...context.subject, data }
}
const item = (id, extra = {}) => ({ id, shop_id: "shop-1", client_op_id: id + "-stable", status: "pending", retries: 0, ...extra })

test("temporary failures remain retryable after the old eight-attempt limit", async () => {
  const { data, markOutboxFailed } = loadOutbox([item("sale", { retries: 7 })])
  for (let i = 0; i < 12; i++) await markOutboxFailed("sale", "Failed to fetch")
  assert.equal(data.get("sale").retries, 19)
  assert.equal(data.get("sale").status, "failed")
  assert.equal(data.get("sale").failure_kind, "transient")
  assert.equal(data.get("sale").client_op_id, "sale-stable")
  assert.ok(data.get("sale").scheduled_at)
})

test("auth failures are retryable; explicit server rejection remains terminal", async () => {
  const { data, markOutboxFailed } = loadOutbox([item("auth", { retries: 8 }), item("rejected")])
  await markOutboxFailed("auth", "Сессия истекла", { auth: true })
  await markOutboxFailed("rejected", "permission denied", { permanent: true })
  assert.equal(data.get("auth").status, "failed")
  assert.equal(data.get("auth").failure_kind, "auth")
  assert.equal(data.get("rejected").status, "dead")
  assert.equal(data.get("rejected").failure_kind, "permanent")
})

test("legacy recovery recognizes network and session exhaustion, not unknown or permanent errors", () => {
  for (const error of ["Failed to fetch", "NetworkError when attempting to fetch resource", "request timeout", "Сессия истекла"]) {
    assert.equal(canRecoverOutboxItem(item("legacy", { status: "dead", retries: 8, error })), true, error)
  }
  for (const extra of [
    { error: "duplicate key value violates unique constraint" },
    { error: "permission denied for table products" },
    { error: "unknown server error" },
    { error: "Failed to fetch", failure_kind: "permanent" },
    { error: "Failed to fetch", retries: 1 },
  ]) assert.equal(canRecoverOutboxItem(item("bad", { status: "dead", retries: 8, ...extra })), false)
})

test("explicit sync bypasses failed backoff but never requeues an active send or another shop", async () => {
  const { data, recoverRetryableOutboxItems } = loadOutbox([
    item("legacy", { status: "dead", retries: 8, error: "Failed to fetch" }),
    item("backoff", { status: "failed", scheduled_at: "2099-01-01T00:00:00Z" }),
    item("inflight", { status: "syncing" }),
    item("permanent", { status: "dead", retries: 8, error: "permission denied" }),
    item("foreign", { shop_id: "shop-2", status: "dead", retries: 8, error: "Failed to fetch" }),
  ])
  assert.equal(await recoverRetryableOutboxItems("shop-1"), 1)
  assert.equal(data.get("legacy").status, "pending")
  assert.equal(data.get("backoff").status, "failed")
  assert.equal(await recoverRetryableOutboxItems("shop-1", true), 1)
  assert.equal(data.get("backoff").status, "pending")
  assert.equal(data.get("backoff").scheduled_at, null)
  assert.equal(data.get("inflight").status, "syncing")
  assert.equal(data.get("permanent").status, "dead")
  assert.equal(data.get("foreign").status, "dead")
  assert.equal(data.get("legacy").client_op_id, "legacy-stable")
})

test("RLS denial is not an expired session; authentication and transient failures stay distinct", () => {
  assert.equal(classifySyncError({ status: 403, code: "42501", message: "permission denied" }), "permanent")
  assert.equal(classifySyncError({ status: 401 }), "auth")
  assert.equal(classifySyncError({ code: "PGRST301", message: "JWT expired" }), "auth")
  assert.equal(classifySyncError({ status: 503 }), "transient")
  assert.equal(classifySyncError({ code: "P0001", message: "insufficient balance" }), "permanent")
  assert.equal(classifySyncError({ code: "23505" }), "conflict")
})
