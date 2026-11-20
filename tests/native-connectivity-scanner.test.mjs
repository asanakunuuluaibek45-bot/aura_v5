import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import vm from "node:vm"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const tick = () => new Promise(resolve => setImmediate(resolve))

function harness({ native = true, query = async () => ({ connected: false }) } = {}) {
  // Deliberately stale WebKit flag: native reachability must take precedence.
  const navigator = Object.create({ get onLine() { return true } })
  const events = []
  let networkListener, appListener
  let removals = 0
  const remove = async () => { removals++ }
  const source = read("lib/native-connectivity.ts")
    .replace(/^import .*$/gm, "").replace(/^export /gm, "")
  const context = vm.createContext({
    navigator, Event, window: { dispatchEvent: event => events.push(event.type) },
    Capacitor: { isNativePlatform: () => native },
    Network: {
      getStatus: query,
      addListener: async (_, listener) => { networkListener = listener; return { remove } },
    },
    App: { addListener: async (_, listener) => { appListener = listener; return { remove } } },
  })
  vm.runInContext(stripTypeScriptTypes(source) + "\nglobalThis.start = startNativeConnectivity", context)
  const stop = context.start()
  return {
    navigator, events, stop, removals: () => removals,
    change: value => networkListener({ connected: value }),
    resume: () => appListener({ isActive: true }),
  }
}

test("native cold start fails closed even when WebKit incorrectly reports online", async () => {
  const h = harness()
  assert.equal(h.navigator.onLine, false)
  await tick()
  assert.equal(h.navigator.onLine, false)
  assert.deepEqual(h.events, ["offline"])
  h.stop()
  assert.equal(h.navigator.onLine, true)
  assert.equal(h.removals(), 2)
})

test("native disconnect/reconnect updates the same flag used by PWA menus and action guards", async () => {
  const h = harness({ query: async () => ({ connected: true }) })
  await tick()
  assert.equal(h.navigator.onLine, true)
  h.change(false)
  assert.equal(h.navigator.onLine, false)
  h.change(true)
  assert.equal(h.navigator.onLine, true)
  assert.deepEqual(h.events, ["offline", "online", "offline", "online"])
  h.stop()
})

test("a stale initial status cannot overwrite a later native disconnect", async () => {
  let resolve
  const h = harness({ query: () => new Promise(done => { resolve = done }) })
  await tick()
  h.change(false)
  resolve({ connected: true })
  await tick()
  assert.equal(h.navigator.onLine, false)
  assert.deepEqual(h.events, ["offline"])
  h.stop()
})

test("foreground return rechecks native status and cleanup ignores late results", async () => {
  let online = false
  let resolve
  const h = harness({ query: () => online === null
    ? new Promise(done => { resolve = done })
    : Promise.resolve({ connected: online }) })
  await tick()
  online = true
  h.resume()
  await tick()
  assert.equal(h.navigator.onLine, true)
  online = null
  h.resume()
  h.stop()
  const eventCount = h.events.length
  resolve({ connected: false })
  await tick()
  assert.equal(h.navigator.onLine, true)
  assert.equal(h.events.length, eventCount)
})

test("browser PWA connectivity is untouched and native status failures stay offline", async () => {
  const web = harness({ native: false })
  assert.equal(web.navigator.onLine, true)
  assert.equal(Object.hasOwn(web.navigator, "onLine"), false)
  assert.equal(web.events.length, 0)
  web.stop()
  const failed = harness({ query: async () => { throw new Error("unavailable") } })
  await tick()
  assert.equal(failed.navigator.onLine, false)
  failed.stop()
})

test("scanner has its own body portal and hides every other screen/portal while preserving state", () => {
  const modal = read("components/BarcodeScannerModal.tsx")
  assert.match(modal, /return createPortal\(/)
  assert.match(modal, /data-native-scanner-overlay/)
  assert.match(modal, /<\/div>,\s*document.body,/)
  const css = read("app/globals.css")
  assert.match(css, /body\.barcode-scanner-active > :not\(\[data-native-scanner-overlay\]\) \* \{[^}]*visibility: hidden !important;[^}]*pointer-events: none !important;/)
  assert.doesNotMatch(css, /--background: transparent;/)
  assert.match(read("lib/native-barcode-scanner.ts"), /window.scrollTo\?\.\(0, scrollY\)/)
})

test("offline navigation and inventory mutations stay disabled, while label printing remains available", () => {
  const nav = read("components/app-nav.tsx")
  assert.match(nav, /disabled=\{!online && \(onlineOnly \|\| !isOfflineSection\(item.id\)\)\}/)
  assert.match(nav, /disabled:grayscale/)
  const stock = read("components/screens/sklad/index.tsx")
  assert.match(stock, /disabled=\{!online\} onClick=\{onAdd\}/)
  assert.match(stock, /mutationsDisabled=\{!online\}/)
  assert.match(stock, /disabled=\{!online\}\s+onClick=\{\(\) => onEdit\(p\)\}/)
  assert.match(stock, /disabled=\{!online\}\s+onClick=\{\(\) => onDelete\(p\)\}/)
  const table = read("components/screens/sklad/virtualized-sklad-table.tsx")
  assert.equal((table.match(/disabled=\{mutationsDisabled\}/g) || []).length, 2)
  assert.match(table, /onClick=\{\(\) => onPrint\(product\)\}/)
  assert.match(read("components/pwa-provider.tsx"), /return startNativeConnectivity\(\)/)
  assert.doesNotMatch(read("native/app/native-crm.tsx"), /Network\.addListener/)
})
