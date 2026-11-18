import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const read = (path) => readFileSync(join(root, path), "utf8")

function createOfflineWorker(cachedPages = {}) {
  const listeners = new Map()
  const stores = new Map()
  const origin = "https://golduchet.com"

  const caches = {
    async open(name) {
      if (!stores.has(name)) {
        const entries = new Map()
        stores.set(name, {
          async match(request) {
            const url = new URL(typeof request === "string" ? request : request.url)
            return entries.get(`${url.origin}${url.pathname}`)?.clone() ?? null
          },
          async put(request, response) {
            const url = new URL(typeof request === "string" ? request : request.url)
            entries.set(`${url.origin}${url.pathname}`, response.clone())
          },
          async delete(request) {
            const url = new URL(typeof request === "string" ? request : request.url)
            return entries.delete(`${url.origin}${url.pathname}`)
          },
        })
      }
      return stores.get(name)
    },
    async keys() {
      return [...stores.keys()]
    },
  }

  const self = {
    location: new URL(origin),
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    clients: { async matchAll() { return [] } },
    async skipWaiting() {},
  }
  const context = {
    self,
    caches,
    URL,
    Request,
    Response,
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    navigator: { onLine: false },
    fetch: async () => { throw new TypeError("offline") },
    console,
  }
  vm.runInNewContext(read("public/sw.js"), context, { filename: "public/sw.js" })

  return (async () => {
    const shellCache = await caches.open(vm.runInContext("SHELL_CACHE", context))
    for (const [path, html] of Object.entries(cachedPages)) {
      await shellCache.put(
        new Request(`${origin}${path}`, { credentials: "same-origin" }),
        new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
      )
    }

    return {
      async navigate(path) {
        let responsePromise
        listeners.get("fetch")({
          request: {
            url: `${origin}${path}`,
            method: "GET",
            mode: "navigate",
            destination: "document",
          },
          respondWith(promise) {
            responsePromise = promise
          },
        })
        assert.ok(responsePromise, `service worker should handle ${path}`)
        return responsePromise
      },
    }
  })()
}

test("an offline root launch redirects to the saved cashier and serves its cached shell", async () => {
  const worker = await createOfflineWorker({ "/crm/pos": "CASHIER_SHELL" })

  const redirect = await worker.navigate("/")
  assert.equal(redirect.status, 302)
  assert.equal(redirect.headers.get("location"), "https://golduchet.com/crm/pos")

  const cashier = await worker.navigate("/crm/pos")
  assert.equal(cashier.status, 200)
  assert.equal(await cashier.text(), "CASHIER_SHELL")
})

test("offline CRM routes return to the cashier instead of showing stale reports", async () => {
  const worker = await createOfflineWorker({
    "/crm/pos": "CASHIER_SHELL",
    "/crm/reports": "STALE_REPORTS",
  })

  const response = await worker.navigate("/crm/reports")
  assert.equal(response.status, 302)
  assert.equal(response.headers.get("location"), "https://golduchet.com/crm/pos")
})

test("a CRM page is not exposed offline when no cashier shell was saved", async () => {
  const worker = await createOfflineWorker({ "/crm/reports": "STALE_REPORTS" })

  const response = await worker.navigate("/crm/reports")
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /Нет подключения/)
  assert.doesNotMatch(html, /STALE_REPORTS/)
})

test("native camera controls do not overlap and the viewport cannot rubber-band", () => {
  const modal = read("components/BarcodeScannerModal.tsx")
  const nativeScanner = read("lib/native-barcode-scanner.ts")
  const css = read("app/globals.css")
  const capacitor = read("capacitor.config.ts")

  assert.match(capacitor, /https:\/\/golduchet\.com\/crm\/pos/)
  assert.match(modal, /aria-label="Закрыть"/)
  assert.match(modal, /aria-label=\{torchOn \? "Выключить вспышку" : "Включить вспышку"\}/)
  assert.match(modal, /top-\[calc\(env\(safe-area-inset-top,0px\)\+5rem\)\]/)
  assert.match(modal, /touchAction: "none"/)
  assert.match(nativeScanner, /--barcode-scanner-scroll-y/)
  assert.match(css, /overscroll-behavior: none !important/)
  assert.match(css, /position: fixed !important/)
})

test("the selected light or dark theme also colors browser chrome and offline screens", () => {
  const layout = read("app/layout.tsx")
  const toggle = read("components/theme-toggle.tsx")
  const css = read("app/globals.css")
  const offline = read("public/offline.html")
  const manifest = JSON.parse(read("public/manifest.json"))

  assert.match(layout, /t==="dark"\?"#29233d":"#fbfaff"/)
  assert.match(toggle, /next === "dark" \? "#29233d" : "#fbfaff"/)
  assert.match(css, /background-color: var\(--background\)/)
  assert.match(css, /--background: oklch/)
  assert.match(offline, /prefers-color-scheme: light/)
  assert.match(offline, /aura-theme/)
  assert.equal(manifest.start_url, "/crm/pos")
  assert.equal(manifest.theme_color, "#29233d")
})

test("losing the connection returns CRM navigation to the cashier", () => {
  const dashboard = read("components/dashboard.tsx")

  assert.match(dashboard, /const handleOffline = \(\) => \{\s*setIsOnline\(false\)/)
  assert.match(dashboard, /toast\.info\("Нет интернета — открыта офлайн-касса"\)/)
  assert.match(dashboard, /if \(!navigator\.onLine && next !== "kassa" && !isImpersonating\)/)
  assert.match(dashboard, /if \(!navigator\.onLine && !isImpersonating\)/)
  assert.match(dashboard, /toast\.info\("Без интернета доступна только касса"\)/)
})
