import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
function salesHarness(online = true) {
  const effects = [], timers = new Map(), calls = [], states = []
  let id = 0
  const navigator = { onLine: online }
  const context = vm.createContext({ console, Date, Map, Set, navigator,
    window: { addEventListener() {}, removeEventListener() {},
      setTimeout(fn) { timers.set(++id, fn); return id }, clearTimeout(id) { timers.delete(id) } },
    useOnline: () => navigator.onLine,
    useEffect: fn => effects.push(fn), useMemo: fn => fn(),
    useState: initial => [initial, next => states.push(typeof next === 'function' ? next(states.at(-1) ?? initial) : next)],
    getSalesInRange: args => { calls.push(args); return Promise.resolve({ sales: [], products: [] }) },
  })
  const source = read('hooks/use-server-sales.ts').replace(/^import.*$/gm, '').replace(/^export /gm, '')
  vm.runInContext(stripTypeScriptTypes(source, { mode: 'strip' }) + '\nglobalThis.run = useServerSalesRange', context)
  context.run({ from: 1000, to: 2000, localSales: [{ id: 'local-sale' }] })
  const cleanups = effects.map(fn => fn())
  return { navigator, timers, calls, states, cleanup: () => cleanups.forEach(fn => fn?.()),
    fire: () => [...timers.values()].forEach(fn => fn()) }
}

test('sales never calls a server action when connection disappears during debounce', () => {
  const h = salesHarness()
  assert.equal(h.timers.size, 1)
  h.navigator.onLine = false
  h.fire()
  assert.equal(h.calls.length, 0)
  assert.equal(h.states.at(-1).loading, false)
})
test('offline cold start uses local sales without scheduling a request', () => {
  const h = salesHarness(false)
  assert.equal(h.timers.size, 0)
  assert.equal(h.calls.length, 0)
})
test('online sales still loads the selected range', async () => {
  const h = salesHarness()
  h.fire()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].from, '1970-01-01T00:00:01.000Z')
  assert.equal(h.states.at(-1).loading, false)
})
test('unmounted sales screen cancels its delayed request', () => {
  const h = salesHarness()
  h.cleanup()
  h.fire()
  assert.equal(h.calls.length, 0)
})
function syncHarness(online) {
  let subscriptions = 0, removals = 0, pulls = 0
  const navigator = { onLine: online }
  const channel = { on() { return this }, subscribe() { subscriptions++; return this } }
  const source = read('lib/sync/sync-engine.ts').replace(/^import[\s\S]*?from\s+["'][^"']+["']\s*;?$/gm, '').replace(/^export /gm, '')
  const context = vm.createContext({ console, navigator, setTimeout, clearTimeout,
    updateSyncState() {}, createSupabaseClient: () => ({ channel: () => channel, removeChannel: () => { removals++ } }) })
  vm.runInContext(stripTypeScriptTypes(source, { mode: 'strip' }) + '\nglobalThis.subject = new SyncEngine()', context)
  const engine = context.subject
  engine.activeShopId = 'shop-a'
  engine.triggerSync = () => { pulls++ }
  return { engine, navigator, subscriptions: () => subscriptions, removals: () => removals, pulls: () => pulls }
}
test('offline startup does not open a realtime socket', () => {
  const h = syncHarness(false)
  h.engine.startRealtime('shop-a')
  assert.equal(h.subscriptions(), 0)
})
test('disconnect detaches realtime, reconnect subscribes again and resumes sync', () => {
  const h = syncHarness(true)
  h.engine.startRealtime('shop-a')
  assert.equal(h.subscriptions(), 1)
  h.navigator.onLine = false
  h.engine.handleOnlineState(false)
  assert.equal(h.removals(), 1)
  assert.equal(h.engine.realtimeChannel, null)
  assert.equal(h.pulls(), 0)
  h.navigator.onLine = true
  h.engine.handleOnlineState(true)
  assert.equal(h.subscriptions(), 2)
  assert.equal(h.pulls(), 1)
})

test('redirected static shells are saved as navigation-safe responses', async () => {
  const stored = new Map()
  const context = vm.createContext({ URL, Request, Response, AbortController, setTimeout, clearTimeout,
    self: { location: new URL('https://example.test'), addEventListener() {} } })
  vm.runInContext(read('public/sw.js'), context)
  const response = new Response('CACHED CRM', { headers: { 'Content-Type': 'text/html' } })
  Object.defineProperty(response, 'redirected', { value: true })
  const cache = { put: async (key, value) => stored.set(key.url, value) }
  await context.cacheShellDocument(cache, {}, '/crm/pos/', response)
  const saved = stored.get('https://example.test/crm/pos')
  assert.equal(saved.redirected, false)
  assert.equal(await saved.text(), 'CACHED CRM')
})
