import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import vm from "node:vm"
import { classifySyncError } from "../lib/sync/sync-errors.ts"

// Exercise the real TypeScript without Next/Supabase, a database or credentials.
// These tests require Node >=22.13 (or Node 24).
function loadSource(path, expression, mocks = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["']\s*;?$/gm, "")
    .replace(/^export default /gm, "")
    .replace(/^export /gm, "")
  const js = stripTypeScriptTypes(source, { mode: "strip" })
  const context = vm.createContext({
    URL, AbortController, setTimeout, clearTimeout,
    console: { error() {}, warn() {}, log() {} },
    process: { env: {} },
    ...mocks,
  })
  vm.runInContext(`${js}\nglobalThis.subject = ${expression}`, context)
  return context.subject
}

test("public QR routes bypass auth, but /stores and /crm remain protected", () => {
  const config = loadSource("proxy.ts", "config")
  const matcher = new RegExp(`^${config.matcher[0]}$`)
  for (const path of ["/q/12/AU001", "/store/shop", "/store/shop/product/AU001"]) {
    assert.equal(matcher.test(path), false, path)
  }
  for (const path of ["/stores", "/crm/pos", "/customers"]) {
    assert.equal(matcher.test(path), true, path)
  }
})

test("shop marketing page is public while CRM stays protected", async () => {
  const updateSession = loadSource("lib/supabase/proxy.ts", "updateSession", {
    NextResponse: {
      next: () => ({ kind: "next" }),
      redirect: (url) => ({ kind: "redirect", pathname: url.pathname }),
    },
  })
  const requestFor = (pathname) => ({
    nextUrl: {
      pathname,
      clone() {
        return { pathname: this.pathname }
      },
    },
  })

  assert.deepEqual(await updateSession(requestFor("/for-shops")), { kind: "next" })
  assert.deepEqual(await updateSession(requestFor("/for-shops/details")), { kind: "next" })
  assert.deepEqual(await updateSession(requestFor("/crm/pos")), {
    kind: "redirect",
    pathname: "/auth/login",
  })
})

test("auth callback accepts local paths and rejects normalized external redirects", async () => {
  const GET = loadSource("app/auth/callback/route.ts", "GET", {
    createClient: async () => ({
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => ({
          data: { user: { id: "user-1", app_metadata: { provider: "google" } } },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { shop_name: "Магазин", requested_role: "seller" },
              error: null,
            }),
          }),
        }),
      }),
    }),
    NextResponse: { redirect: (url) => new URL(url).href },
  })
  for (const next of ["/\\evil.example", "//evil.example", "/\t/evil.example", "https://evil.example"]) {
    const nextUrl = new URL("https://aura.example/auth/callback")
    nextUrl.searchParams.set("code", "test-code")
    nextUrl.searchParams.set("next", next)
    assert.equal(await GET({ nextUrl }), "https://aura.example/", next)
  }
  const nextUrl = new URL("https://aura.example/auth/callback?code=test&next=%2Fcrm%2Fpos%3Ftab%3D1")
  assert.equal(await GET({ nextUrl }), "https://aura.example/crm/pos?tab=1")
})

test("new Google accounts are sent to registration completion", async () => {
  const GET = loadSource("app/auth/callback/route.ts", "GET", {
    createClient: async () => ({
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => ({
          data: { user: { id: "new-user", app_metadata: { provider: "google" } } },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { shop_name: null, requested_role: null },
              error: null,
            }),
          }),
        }),
      }),
    }),
    NextResponse: { redirect: (url) => new URL(url).href },
  })
  const nextUrl = new URL("https://aura.example/auth/callback?code=test&next=%2Fcrm%2Fpos")
  assert.equal(await GET({ nextUrl }), "https://aura.example/auth/complete-profile")
})

function makeEngine(overrides = {}) {
  const events = { completed: [], failed: [], rpc: [], mutations: [] }
  const item = {
    id: "queue-1", client_op_id: "operation-1", shop_id: "shop-1",
    entity: "products", op_type: "product_add", payload: { id: "product-1" },
  }
  const engine = loadSource("lib/sync/sync-engine.ts", "syncEngine", {
    toast: { success() {}, error() {}, warning() {} },
    getDueOutboxItems: async () => [item],
    recoverRetryableOutboxItems: async () => 0,
    classifyError: classifySyncError,
    getOutboxStatusSummary: async () => ({ pendingCount: 0, needsAttentionCount: 0, unresolvedCount: 0, lastError: null }),
    getNextRetryDelayMs: async () => null,
    markOutboxSyncing: async () => {},
    markOutboxCompleted: async (id) => events.completed.push(id),
    markOutboxFailed: async (...args) => events.failed.push(args),
    updateSyncState() {},
    createSupabaseClient: () => ({}),
    setLocalSaleSyncState: async () => {},
    ...overrides,
  })
  engine.activeShopId = "shop-1"
  engine.isOnline = true
  return { engine, events, item }
}

test("unique constraints and HTTP 409 never silently discard queued writes", async () => {
  for (const error of [{ code: "23505" }, { status: 409 }]) {
    const { engine, events } = makeEngine()
    engine.pushItem = async () => { throw error }
    await engine.flushOutbox()
    assert.deepEqual(events.completed, [])
    assert.equal(events.failed.length, 1)
    assert.equal(events.failed[0][2].permanent, true)
  }
})

test("overlapping flush triggers send once and release the lock after failure", async () => {
  let release
  const wait = new Promise((resolve) => { release = resolve })
  const { engine, events } = makeEngine()
  let sends = 0
  engine.pushItem = async () => { sends++; await wait }
  const first = engine.flushOutbox()
  await Promise.resolve()
  const second = engine.flushOutbox()
  release()
  await Promise.all([first, second])
  assert.equal(sends, 1)
  assert.deepEqual(events.completed, ["queue-1"])
  engine.flushOutboxBatch = async () => { throw new Error("IndexedDB failed") }
  await assert.rejects(engine.flushOutbox(), /IndexedDB failed/)
  assert.equal(engine.outboxFlushing, false)
})

function makeReturnEngine(rpcResult) {
  const mutations = []
  const stores = Object.fromEntries(["sale_returns", "cash_operations"].map((name) => [name, {
    index: () => ({ getAll: async () => [{ id: "local-cash", client_op_id: "operation-1:cash" }] }),
    delete: async (id) => mutations.push(["delete", name, id]),
    put: async (row) => mutations.push(["put", name, row.id]),
  }]))
  const { engine, item } = makeEngine({
    getLocalDB: async () => ({
      transaction: () => ({ objectStore: (name) => stores[name], done: Promise.resolve() }),
    }),
  })
  item.op_type = "atomic_return"
  item.payload = { id: "local-return", sale_id: "sale-1", item_index: 0, amount: 999999 }
  const calls = []
  const supabase = {
    rpc(name, args) {
      calls.push([name, args])
      return { abortSignal: async () => rpcResult }
    },
    from(name) {
      calls.push(["read", name])
      const builder = {
        select() { return this }, eq() { return this }, is() { return this },
        abortSignal() { return this },
        single: async () => ({ data: { id: "server-cash" }, error: null }),
        maybeSingle: async () => ({ data: rpcResult.existing ?? null, error: null }),
      }
      return builder
    },
  }
  return { engine, item, supabase, calls, mutations }
}

const confirmedReturn = {
  id: "server-return", shop_id: "shop-1", sale_id: "sale-1",
  item_index: 0, cash_operation_id: "server-cash", amount: 100,
}

test("offline return uses one atomic RPC and replaces optimistic money/return rows", async () => {
  const { engine, item, supabase, calls, mutations } = makeReturnEngine({ data: confirmedReturn, error: null })
  await engine.pushItem(supabase, item)
  assert.equal(calls[0][0], "return_sale_item")
  assert.deepEqual(Object.keys(calls[0][1]).sort(), ["_item_index", "_reason", "_sale_id"])
  assert.deepEqual(mutations, [
    ["delete", "cash_operations", "local-cash"],
    ["delete", "sale_returns", "local-return"],
    ["put", "sale_returns", "server-return"],
    ["put", "cash_operations", "server-cash"],
  ])
})

test("a failed atomic return makes no local or separate server writes", async () => {
  const error = { code: "08006", message: "network failure" }
  const { engine, item, supabase, calls, mutations } = makeReturnEngine({ data: null, error })
  await assert.rejects(engine.pushItem(supabase, item), (e) => e === error)
  assert.deepEqual(calls.map(([name]) => name), ["return_sale_item"])
  assert.deepEqual(mutations, [])
})

test("return replay requires an existing exact server row, not just a conflict", async () => {
  for (const existing of [confirmedReturn, null]) {
    const error = { code: "P0001", message: "already returned" }
    const { engine, item, supabase, mutations } = makeReturnEngine({ data: null, error, existing })
    if (existing) {
      await engine.pushItem(supabase, item)
      assert.equal(mutations.length, 4)
    } else {
      await assert.rejects(engine.pushItem(supabase, item), (e) => e === error)
      assert.deepEqual(mutations, [])
    }
  }
})


test("local-first POS checkout does not refresh the server route, while server checkout still does", async () => {
  const source = readFileSync(new URL("../components/crm/screens/kassa/index.tsx", import.meta.url), "utf8")
  const checkoutSource = source.slice(source.indexOf("  const doCheckout = async () => {"), source.indexOf("  const submit = () => {"))
  for (const local of [true, false]) {
    const calls = { local: 0, server: 0, refresh: 0, reset: 0, errors: [] }
    const context = vm.createContext({
      checkoutBusy: { current: false }, checkoutAttempt: { current: null },
      setConfirmLoss() {}, setSubmitting() {},
      cart: [{ id: "product-1", price: 100 }], totalDiscountAmount: 0, bonusNum: 0,
      payment: "cash", customerName: "", customerPhone: "", customerId: null,
      receiptType: "non_fiscal", total: 100, showBonus: false,
      onLocalCheckout: local ? async () => { calls.local++; return { sale: { final_price: 100 } } } : undefined,
      checkout: async () => { calls.server++; return { total: 100 } },
      getClientOperationAttempt: () => ({ clientOpId: "checkout-test" }),
      formatSom: String, handleReset: () => { calls.reset++ },
      startTransition: (fn) => fn(), router: { refresh: () => { calls.refresh++ } },
      toast: { success() {}, error: (message) => calls.errors.push(message) },
      console: { error() {} },
    })
    vm.runInContext(checkoutSource + "\nglobalThis.checkoutUnderTest = doCheckout", context)
    await context.checkoutUnderTest()
    assert.deepEqual(calls.errors, [])
    assert.equal(calls.local, local ? 1 : 0)
    assert.equal(calls.server, local ? 0 : 1)
    assert.equal(calls.refresh, local ? 0 : 1)
    assert.equal(calls.reset, 1)
  }
})


test("an expired session refreshes once and retries the same queued operation", async () => {
  let refreshes = 0
  const { engine, events } = makeEngine({ createSupabaseClient: () => ({
    auth: { refreshSession: async () => { refreshes++; return { data: { session: { user: { id: "user-1" } } }, error: null } } },
  }) })
  const ids = []
  engine.pushItem = async (_client, item) => {
    ids.push(item.client_op_id)
    if (ids.length === 1) throw { status: 401, message: "JWT expired" }
  }
  await engine.flushOutbox()
  assert.equal(refreshes, 1)
  assert.deepEqual(ids, ["operation-1", "operation-1"])
  assert.deepEqual(events.completed, ["queue-1"])
  assert.equal(events.failed.length, 0)
})

test("failed auth refresh does not confirm or permanently reject an unsent operation", async () => {
  const { engine, events } = makeEngine({ createSupabaseClient: () => ({
    auth: { refreshSession: async () => ({ error: new Error("Failed to fetch") }) },
  }) })
  engine.pushItem = async () => { throw { status: 401 } }
  await engine.flushOutbox()
  assert.deepEqual(events.completed, [])
  assert.equal(events.failed.length, 1)
  assert.notEqual(events.failed[0][2]?.permanent, true)
})

test("explicit flush forces scheduled retries without changing ordinary timed flushes", async () => {
  const forced = []
  const { engine } = makeEngine({ recoverRetryableOutboxItems: async (_shopId, force) => { forced.push(force) } })
  engine.pushItem = async () => {}
  await engine.flushOutbox()
  await engine.flushOutbox({ forceRetry: true })
  assert.deepEqual(forced, [false, true])
})
