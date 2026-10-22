import test from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"

// Next resolves extensionless TypeScript imports; reproduce that resolution in
// Node's native type-stripping runner without adding a production dependency.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context) }
    catch (error) {
      if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(specifier + ".ts", context)
      }
      throw error
    }
  },
})

test("failed Dejen handshake stays disconnected and retains its diagnostic on focus", async () => {
  const storage = new Map([["sklad:printer-model", "dejen-dp27p"]])
  const events = new Map()
  const deviceEvents = new Map()
  let connections = 0
  const device = {
    id: "regression-device", name: "DP27P-TEST",
    gatt: {
      connected: false,
      async connect() { connections++; this.connected = true; return this },
      disconnect() {
        if (!this.connected) return
        this.connected = false
        deviceEvents.get("gattserverdisconnected")?.()
      },
      async getPrimaryServices() { return [] },
    },
    addEventListener(type, listener) { deviceEvents.set(type, listener) },
    removeEventListener(type) { deviceEvents.delete(type) },
  }
  globalThis.window = {
    isSecureContext: true,
    localStorage: {
      getItem(key) { return storage.get(key) ?? null },
      setItem(key, value) { storage.set(key, value) },
      removeItem(key) { storage.delete(key) },
    },
    dispatchEvent() {},
    addEventListener(type, listener) { events.set(type, listener) },
    setTimeout,
  }
  globalThis.document = { addEventListener() {}, visibilityState: "visible" }
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { bluetooth: {
      async requestDevice() { return device },
      async getDevices() { return [device] },
    } },
  })
  const printer = await import("../lib/niimbot.ts")
  printer.startPrinterConnectionMonitor()
  await assert.rejects(() => printer.identifyPrinter("dejen-dp27p"), /поиск BLE-сервисов Dejen/)
  const failed = printer.getPrinterConnectionSnapshot()
  assert.equal(failed.status, "disconnected")
  assert.match(failed.error, /FFE0/)
  // Old code scheduled a raw GATT reconnect after 500 ms and erased the error.
  await new Promise((resolve) => setTimeout(resolve, 650))
  events.get("focus")?.()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const afterFocus = printer.getPrinterConnectionSnapshot()
  assert.equal(connections, 1)
  assert.equal(afterFocus.status, "disconnected")
  assert.equal(afterFocus.error, failed.error)
})
