import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

function load(path, expression, mocks = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from\s+["'][^"']+["']\s*;?$/gm, '').replace(/^export /gm, '')
  const policySource = readFileSync(new URL('../lib/offline-policy.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
  const context = vm.createContext({ console, setTimeout, clearTimeout, URL, AbortController, navigator: { onLine: true }, ...mocks })
  vm.runInContext(stripTypeScriptTypes(policySource, { mode: 'strip' }), context)
  vm.runInContext(stripTypeScriptTypes(source, { mode: 'strip' }) + `\nglobalThis.subject = ${expression}`, context)
  return context.subject
}
const profile = { id: 'user-a', shop_id: 'shop-a', status: 'approved', role: 'admin' }
function productDb({ rows = [], queue = [], failQueue = false, session = profile } = {}) {
  let products = new Map(rows.map(row => [row.id, structuredClone(row)]))
  let outbox = new Map(queue.map(row => [row.id, structuredClone(row)]))
  return {
    products: () => [...products.values()], outbox: () => [...outbox.values()],
    transaction() {
      const p = new Map(products), o = new Map(outbox)
      let aborted = false, rejectDone
      const done = new Promise((resolve, reject) => {
        rejectDone = reject
        setTimeout(() => { if (!aborted) { products = p; outbox = o; resolve() } }, 0)
      })
      const store = (map, fail = false) => ({
        get: async id => structuredClone(map.get(id)), getAll: async () => structuredClone([...map.values()]),
        put: async row => { if (fail) throw new Error('Storage quota'); map.set(row.id, structuredClone(row)) },
        delete: async id => map.delete(id),
      })
      return { done, abort() { aborted = true; rejectDone(new Error('Aborted')) },
        objectStore(name) { return name === 'user_session' ? { get: async () => ({ userId: session.id, profile: session }) }
          : name === 'products' ? store(p) : store(o, failQueue) },
      }
    },
  }
}
function stock(db) {
  let id = 0
  return load('lib/local-db/product-record.ts', '{ persistOfflineProduct, editableProductPatch, validateOfflineProduct }', {
    getLocalDB: async () => db, createLocalId: () => `id-${++id}`,
  })
}

test('offline allowed sections include cabinet and inventory, not reports', () => {
  const allowed = load('lib/offline-sections.ts', 'isOfflineSection')
  for (const section of ['kassa', 'sklad', 'kabinet', 'revisions']) assert.equal(allowed(section), true)
  for (const section of ['otchety', 'shops', 'suppliers']) assert.equal(allowed(section), false)
})

test('online device product commits its shop, author and stable queue atomically', async () => {
  const db = productDb(), subject = stock(db)
  const product = await subject.persistOfflineProduct({ profile, product: { name: 'Кольцо', weight: 3.25, sale_price: 15500 } })
  assert.equal(product.shop_id, 'shop-a'); assert.equal(product.created_by, 'user-a')
  assert.equal(db.products()[0].sale_price, 15500)
  assert.equal(db.outbox()[0].payload.id, product.id)
  assert.equal(db.outbox()[0].client_op_id, product.client_op_id)
})

test('failed queue write rolls back product so no unqueued offline item survives', async () => {
  const db = productDb({ failQueue: true })
  await assert.rejects(stock(db).persistOfflineProduct({ profile, product: { name: 'Кольцо' } }), /Storage quota/)
  assert.equal(db.products().length, 0); assert.equal(db.outbox().length, 0)
})

test('editing then deleting a never-sent addition leaves neither row nor queue', async () => {
  const db = productDb(), subject = stock(db)
  const product = await subject.persistOfflineProduct({ profile, product: { name: 'Кольцо', sale_price: 15000 } })
  await subject.persistOfflineProduct({ profile, product: { id: product.id, name: 'Кольцо', sale_price: 15500 } })
  assert.equal(db.outbox().length, 1); assert.equal(db.outbox()[0].op_type, 'product_add')
  assert.equal(db.outbox()[0].payload.sale_price, 15500)
  await subject.persistOfflineProduct({ profile, product: { id: product.id }, remove: true })
  assert.equal(db.products().length, 0); assert.equal(db.outbox().length, 0)
})

test('offline edit cannot restore sold stock, cross shops, or bypass logged-out identity', async () => {
  for (const row of [{ id: 'p', name: 'Кольцо', shop_id: 'shop-a', status: 'sold' },
    { id: 'p', name: 'Кольцо', shop_id: 'shop-b', status: 'in_stock' }]) {
    const db = productDb({ rows: [row] })
    await assert.rejects(stock(db).persistOfflineProduct({ profile, product: { id: 'p', name: 'Кольцо' } }))
    assert.equal(db.outbox().length, 0)
  }
  await assert.rejects(stock(productDb({ session: { ...profile, id: 'user-b' } })).persistOfflineProduct({ profile, product: { name: 'Кольцо' } }))
})

test('editable product payload cannot change stock, SKU, owner or QR derived field', () => {
  const subject = stock(productDb())
  const patch = subject.editableProductPatch({ name: ' Кольцо ', status: 'in_stock', sku: 'AB123', shop_id: 'other', created_by: 'other', shop_seq_id: 4 })
  assert.deepEqual(JSON.parse(JSON.stringify(patch)), { name: 'Кольцо' })
})

test('offline validation preserves locked supplier prices and finite nonnegative amounts', () => {
  const subject = stock(productDb())
  for (const sale_price of [-1, NaN, Infinity]) assert.throws(() => subject.validateOfflineProduct({ name: 'Кольцо', sale_price }))
  assert.throws(() => subject.validateOfflineProduct({ name: 'Кольцо', purchase_price: 200 }, { consignment_operation_id: 'locked', purchase_price: 100 }))
})

test('cabinet cold restoration requires approved matching identity and respects durable logout', async () => {
  for (const extra of [{ signedOut: true, profile }, { signedOut: false, profile: { ...profile, status: 'pending' } },
    { signedOut: false, profile: { ...profile, role: null } }]) {
    const restore = load('lib/local-db/device-logout.ts', 'restoreDeviceProfile', {
      isDeviceSignedOut: async () => extra.signedOut,
      getSavedUserSession: async () => ({ userId: 'user-a', profile: extra.profile }),
    })
    assert.equal(await restore(), null)
  }
  const restore = load('lib/local-db/device-logout.ts', 'restoreDeviceProfile', {
    isDeviceSignedOut: async () => false, getSavedUserSession: async () => ({ userId: 'user-a', profile }),
  })
  assert.equal((await restore()).id, 'user-a')
})

test('offline logout stops before any destructive action when queue cannot be confirmed', async () => {
  for (const count of [1, 'failed-read']) {
    const calls = []
    const logout = load('lib/local-db/device-logout.ts', 'logoutDeviceAccount', {
      getUnresolvedOutboxOperationCount: async () => { if (count === 'failed-read') throw new Error('DB unavailable'); return count },
      syncEngine: { stopAndDrain: async () => calls.push('stop') },
      clearDeviceAuth: async () => calls.push('clear'), runLogoutCleanup: async () => calls.push('wipe'),
    })
    await assert.rejects(logout()); assert.deepEqual(calls, [])
  }
})

test('empty-queue logout drains requests, fences credentials, then clears business rows without HTTP', async () => {
  const calls = []
  const logout = load('lib/local-db/device-logout.ts', 'logoutDeviceAccount', {
    getUnresolvedOutboxOperationCount: async () => 0,
    syncEngine: { stopAndDrain: async () => calls.push('drain') },
    createClient: () => ({ auth: { stopAutoRefresh: () => calls.push('stop-refresh') } }),
    clearDeviceAuth: async () => calls.push('fence'), runLogoutCleanup: async () => calls.push('wipe'),
  })
  await logout(); assert.deepEqual(calls, ['drain', 'stop-refresh', 'fence', 'wipe'])
})

test('native Preferences logout removes exact auth keys and rejects late token writes', async () => {
  const preferences = new Map([['sb-test-auth-token', 'old-session']])
  const subject = load('lib/supabase/client.ts', '{ clearDeviceAuth, isDeviceSignedOut, nativeAuthStorage, prepareDeviceSignIn, markDeviceSignedIn }', {
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co' } },
    Capacitor: { isNativePlatform: () => true },
    usesKeychain: () => false,
    Preferences: { get: async ({ key }) => ({ value: preferences.get(key) ?? null }),
      set: async ({ key, value }) => preferences.set(key, value), remove: async ({ key }) => preferences.delete(key) },
    createSupabaseClient: () => ({ auth: { startAutoRefresh() {} } }),
  })
  await subject.clearDeviceAuth(); assert.equal(await subject.isDeviceSignedOut(), true)
  assert.equal(preferences.has('sb-test-auth-token'), false)
  await subject.nativeAuthStorage.setItem('sb-test-auth-token', 'late-old-session')
  assert.equal(preferences.has('sb-test-auth-token'), false)
  subject.prepareDeviceSignIn()
  await subject.nativeAuthStorage.setItem('sb-test-auth-token', 'new-session')
  // New token is not usable for cold offline entry until profile approval completes.
  assert.equal(await subject.nativeAuthStorage.getItem('sb-test-auth-token'), null)
  await subject.markDeviceSignedIn()
  assert.equal(await subject.nativeAuthStorage.getItem('sb-test-auth-token'), 'new-session')
})

function productSync({ current, inserted = null, updateResult = null } = {}) {
  const calls = []
  const client = { from(table) {
    const call = { table, filters: [] }; calls.push(call)
    const builder = {
      select(value) { call.select = value; return this },
      upsert(value, options) { call.upsert = value; call.options = options; return this },
      update(value) { call.update = value; return this },
      eq(key, value) { call.filters.push(['eq', key, value]); return this },
      is(key, value) { call.filters.push(['is', key, value]); return this },
      neq(key, value) { call.filters.push(['neq', key, value]); return this },
      abortSignal() { return this },
      single() { return this }, maybeSingle() { return this },
      then(resolve) { return Promise.resolve({ data: call.upsert ? inserted : call.update ? updateResult : current,
        error: call.update && !updateResult ? { code: 'PGRST116', status: 406 } : null }).then(resolve) },
    }; return builder
  } }
  const patch = stock(productDb())
  const engine = load('lib/sync/sync-engine.ts', 'new SyncEngine()', {
    editableProductPatch: patch.editableProductPatch, validateOfflineProduct: patch.validateOfflineProduct,
  })
  engine.cacheConfirmedProduct = async () => {}
  return { engine, calls, client }
}

test('retrying an offline product addition cannot overwrite a remotely sold row or send QR derived fields', async () => {
  const item = { shop_id: 'shop-a', client_op_id: 'op-a', op_type: 'product_add',
    payload: { id: 'p', name: 'Кольцо', shop_seq_id: 23, client_op_id: 'op-a', status: 'in_stock' } }
  const subject = productSync({ current: { ...item.payload, status: 'sold' } })
  await subject.engine.pushItem(subject.client, item)
  assert.equal(subject.calls[0].options.ignoreDuplicates, true)
  assert.equal('shop_seq_id' in subject.calls[0].upsert, false)
  assert.equal(subject.calls.filter(call => call.update).length, 0)
})

test('stock updates require exact shop and original timestamp and never restore sold status', async () => {
  const item = { shop_id: 'shop-a', client_op_id: 'op-a', op_type: 'product_update',
    payload: { id: 'p', name: 'Кольцо', sale_price: 15500, status: 'in_stock',
      original_updated_at: '2026-11-19T00:00:00Z' } }
  const subject = productSync({ current: { id: 'p', name: 'Кольцо', updated_at: '2026-11-19T00:00:00Z' }, updateResult: { id: 'p', sale_price: 15500 } })
  await subject.engine.pushItem(subject.client, item)
  const update = subject.calls.find(call => call.update)
  assert.equal('status' in update.update, false)
  assert.ok(update.filters.some(([kind,key,value]) => kind === 'eq' && key === 'shop_id' && value === 'shop-a'))
  assert.ok(update.filters.some(([kind,key,value]) => kind === 'eq' && key === 'updated_at' && value === '2026-11-19T00:00:00Z'))
  assert.ok(update.filters.some(([kind,key,value]) => kind === 'neq' && key === 'status' && value === 'sold'))
})

test('zero affected stock rows stay unconfirmed instead of being erased from outbox', async () => {
  const subject = productSync({ current: { id: 'p', name: 'Кольцо' } })
  await assert.rejects(subject.engine.pushItem(subject.client, { shop_id: 'shop-a', client_op_id: 'op-a',
    op_type: 'product_update', payload: { id: 'p', name: 'Кольцо', sale_price: 15500 } }))
})

test('logout drain actually waits for the active pull, not just cleared timer flags', async () => {
  const engine = load('lib/sync/sync-engine.ts', 'new SyncEngine()', { resetSyncState() {} })
  engine.stopRealtime = () => {}
  engine.isRunning = true
  let finished = false
  const drain = engine.stopAndDrain().then(() => { finished = true })
  await new Promise(resolve => setTimeout(resolve, 35))
  assert.equal(finished, false)
  engine.isRunning = false
  await drain
  assert.equal(finished, true)
})

for (const operation of ['add', 'edit', 'delete']) {
  test(`stock ${operation} is rejected offline without writing or queuing`, async () => {
    const db = productDb({ rows: [{ id: 'p', name: 'Кольцо', shop_id: 'shop-a', status: 'in_stock' }] })
    const persist = load('lib/local-db/product-record.ts', 'persistOfflineProduct', {
      getLocalDB: async () => db, navigator: { onLine: false }, createLocalId: () => 'new-p',
    })
    await assert.rejects(persist({ profile, product: operation === 'add' ? { name: 'Новое' } : { id: 'p', name: 'Изменённое' }, remove: operation === 'delete' }))
    assert.equal(db.outbox().length, 0)
    assert.equal(db.products().length, 1)
    assert.equal(db.products()[0].name, 'Кольцо')
  })
}

test('confirmed discard drains, fences and passes explicit consent to cleanup', async () => {
  const calls = []
  const logout = load('lib/local-db/device-logout.ts', 'logoutDeviceAccount', {
    getUnresolvedOutboxOperationCount: async () => 3,
    syncEngine: { stopAndDrain: async () => calls.push('drain') },
    createClient: () => ({ auth: { stopAutoRefresh: () => calls.push('stop-refresh') } }),
    clearDeviceAuth: async () => calls.push('fence'),
    runLogoutCleanup: async options => { assert.equal(options.discardUnsynced, true); calls.push('wipe') },
  })
  await logout({ discardUnsynced: true })
  assert.deepEqual(calls, ['drain', 'stop-refresh', 'fence', 'wipe'])
})

test('consent never bypasses an unreadable queue', async () => {
  let wiped = false
  const logout = load('lib/local-db/device-logout.ts', 'logoutDeviceAccount', {
    getUnresolvedOutboxOperationCount: async () => { throw new Error('unreadable') },
    runLogoutCleanup: async () => { wiped = true },
  })
  await assert.rejects(logout({ discardUnsynced: true }), /unreadable/)
  assert.equal(wiped, false)
})

test('queue appearing while sync drains requires a second destructive consent', async () => {
  let count = 0, wiped = false
  const logout = load('lib/local-db/device-logout.ts', 'logoutDeviceAccount', {
    getUnresolvedOutboxOperationCount: async () => count++ === 0 ? 0 : 2,
    syncEngine: { stopAndDrain: async () => {} },
    getSavedUserSession: async () => null, isDeviceSignedOut: async () => false,
    runLogoutCleanup: async () => { wiped = true },
  })
  await assert.rejects(logout(), error => error.name === 'UnsyncedLogoutError' && error.count === 2)
  assert.equal(wiped, false)
})

test('cancelled discard preserves queue; explicit confirmation erases it', async () => {
  let wipes = 0
  const cleanup = load('lib/local-db/logout-cleanup.ts', 'runLogoutCleanup', {
    getUnresolvedOutboxOperationCount: async () => 4,
    syncEngine: { stopAndDrain: async () => {} }, wipeLocalDatabase: async () => { wipes++ },
  })
  await assert.rejects(cleanup())
  assert.equal(wipes, 0)
  await cleanup({ discardUnsynced: true })
  assert.equal(wipes, 1)
})

test('revision progress is removed on account logout but the signed-out fence survives', async () => {
  const storage = new Map([['inventory-revision-v1:shop-a', 'progress'], ['aura_device_signed_out', 'true'], ['other-app', 'keep']])
  const localStorage = { get length() { return storage.size }, key: i => [...storage.keys()][i], removeItem: key => storage.delete(key) }
  const wipe = load('lib/local-db/db.ts', 'wipeLocalDatabase', { deleteDB: async () => {}, localStorage, isDeviceSignedOut: async () => false })
  await wipe()
  assert.equal(storage.has('inventory-revision-v1:shop-a'), false)
  assert.equal(storage.get('aura_device_signed_out'), 'true')
  assert.equal(storage.get('other-app'), 'keep')
})


test('late auth callbacks cannot recreate the saved profile after logout', async () => {
  let opened = false
  const save = load('lib/local-db/db.ts', 'saveUserSession', {
    isDeviceSignedOut: async () => true,
    getLocalDB: async () => { opened = true; throw new Error('must not open') },
  })
  await save({ userId: 'user-a', profile })
  assert.equal(opened, false)
})
