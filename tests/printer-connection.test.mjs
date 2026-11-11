import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import vm from "node:vm"

// Real connection manager, isolated from hardware and the external driver.
function harness({ apple = true, getDevices = false } = {}) {
  const storage = new Map()
  const listeners = new Map()
  const timers = []
  const calls = { chooser: 0, connect: 0, disconnect: 0, print: 0, options: null }
  let cancel = false
  let printError = null
  let connectFailures = 0
  let driverConnected = false
  const device = {
    id: "printer-1", name: "B3S_TEST",
    gatt: {
      connected: false,
      async connect() { this.connected = true },
      disconnect() {
        this.connected = false
        for (const listener of [...listeners.values()]) listener()
      },
    },
    addEventListener(type, fn) { listeners.set(fn, fn) },
    removeEventListener(type, fn) { listeners.delete(fn) },
  }
  const bluetooth = {
    requestDevice(options) {
      calls.chooser++
      calls.options = options
      return cancel ? Promise.reject(new Error("User cancelled the requestDevice() chooser")) : Promise.resolve(device)
    },
    ...(getDevices ? { getDevices: async () => [device] } : {}),
  }
  const driver = {
    isSupported: () => true,
    printer: { modelId: 256, protocolVersion: 4 },
    async connect() {
      calls.connect++
      if (connectFailures-- > 0) throw new Error("2")
      if (!driverConnected) {
        const chosen = await bluetooth.requestDevice({})
        await chosen.gatt.connect()
        driverConnected = true
      }
    },
    async identify() { await this.connect(); return this.printer },
    async disconnect() { calls.disconnect++; driverConnected = false; device.gatt.disconnect() },
    async printImage() { calls.print++; if (printError) throw printError },
    WRITE_MODE: null, PACE_MS: 10,
  }
  const window = {
    isSecureContext: true, Niimbot: driver,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    dispatchEvent() {}, addEventListener() {},
    setTimeout(fn, ms) { timers.push({ fn, ms }) },
  }
  const source = readFileSync(new URL("../lib/niimbot.ts", import.meta.url), "utf8")
    .replace(/^import .*$/gm, "").replace(/^export /gm, "")
  const errors = readFileSync(new URL("../lib/printer-errors.ts", import.meta.url), "utf8")
    .replace(/^export /gm, "")
  const context = vm.createContext({
    window, navigator: { bluetooth, userAgent: apple ? "iPhone Web BLE Browser" : "Chrome Linux", maxTouchPoints: apple ? 5 : 0 },
    document: {
      visibilityState: "visible", addEventListener() {},
      createElement: () => ({
        getContext: () => ({ fillRect() {}, drawImage() {}, fillStyle: "" }),
        toDataURL: () => "data:image/png;base64,test",
      }),
    },
    // Run driver cooldowns immediately, but keep window retry timers inspectable.
    setTimeout(fn) { fn() }, CustomEvent: class {},
    DEJEN_OPTIONAL_SERVICES: ["dejen-service"],
  })
  vm.runInContext(stripTypeScriptTypes(`${errors}\n${source}`, { mode: "strip" }) + `
    globalThis.subject = {
      identifyPrinter, reconnectPrinter, changePrinterDevice, printCanvas,
      startPrinterConnectionMonitor, getPrinterConnectionSnapshot, getPrinterProfile,
      getPrintErrorMessage, isStaleBluetoothLinkError
    }
  `, context)
  return {
    ...context.subject, calls, device, storage, timers, bluetooth,
    cancelChooser() { cancel = true },
    failPrint(error) { printError = error },
    failConnect(count) { connectFailures = count },
  }
}

test("iPhone chooser opens synchronously before the queued driver reset", async () => {
  const h = harness()
  const pending = h.identifyPrinter("b3s")
  assert.equal(h.calls.chooser, 1)
  assert.equal(h.calls.disconnect, 0)
  assert.equal(h.calls.options.optionalServices[0], "e7810a71-73ae-499d-8c15-faa9aef0c3f2")
  await pending
  assert.equal(h.calls.chooser, 1, "driver must consume the chosen device, not open a second dialog")
  assert.equal(h.getPrinterConnectionSnapshot().status, "connected")
})

test("iPhone reconnect asks again even without getDevices", async () => {
  const h = harness()
  await h.identifyPrinter("b3s")
  const pending = h.reconnectPrinter("b3s")
  assert.equal(h.calls.chooser, 2)
  await pending
  assert.equal(h.calls.disconnect, 2, "cached driver session is reset on every explicit selection")
  assert.equal(h.timers.length, 0, "intentional disconnects must not launch background reconnects")
})

test("cancelled reselection preserves the remembered working printer", async () => {
  const h = harness()
  await h.identifyPrinter("b3s")
  h.cancelChooser()
  await assert.rejects(h.changePrinterDevice("b3s"), /cancelled/)
  assert.equal(h.getPrinterConnectionSnapshot().hasRememberedDevice, true)
  assert.equal(h.device.gatt.connected, true)
})

test("missing getDevices is not treated as missing Web Bluetooth", async () => {
  const h = harness()
  h.storage.set("sklad:printer-device-id", "remembered")
  h.startPrinterConnectionMonitor()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.getPrinterConnectionSnapshot().status, "disconnected")
  assert.equal(h.calls.chooser, 0, "background monitor must never open a permission dialog")
})

test("iPhone dropped link does not silently reconnect stale native handles", async () => {
  const h = harness()
  await h.identifyPrinter("b3s")
  h.device.gatt.disconnect()
  assert.equal(h.getPrinterConnectionSnapshot().status, "disconnected")
  assert.equal(h.timers.length, 0)
})

test("failed print is sent once, not retried with possible duplicate labels", async () => {
  const h = harness()
  await h.identifyPrinter("b3s")
  h.failPrint(new Error("2"))
  await assert.rejects(h.printCanvas({}, undefined, { model: h.getPrinterProfile("b3s") }), /2/)
  assert.equal(h.calls.print, 1)
  assert.match(h.getPrintErrorMessage(new Error("2")), /Выбрать заново/)
})

test("stale connection is retried before sending a print job", async () => {
  const h = harness()
  await h.identifyPrinter("b3s")
  h.failConnect(1)
  await h.printCanvas({}, undefined, { model: h.getPrinterProfile("b3s") })
  assert.equal(h.calls.print, 1)
  assert.equal(h.calls.chooser, 1)
})

test("desktop reconnect keeps using remembered permission", async () => {
  const h = harness({ apple: false, getDevices: true })
  await h.identifyPrinter("b3s")
  await h.reconnectPrinter("b3s")
  assert.equal(h.calls.chooser, 1)
})

test("unconfirmed output and chooser cancellation are not retryable link errors", () => {
  const h = harness()
  assert.equal(h.isStaleBluetoothLinkError(new Error("print not confirmed")), false)
  assert.equal(h.isStaleBluetoothLinkError(new Error("User cancelled the requestDevice() chooser")), false)
})

test("Vercel uses npm consistently with the project manifest", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"))
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
  assert.match(manifest.packageManager, /^npm@/)
  assert.equal(config.installCommand, "npm ci")
  assert.equal(config.buildCommand, "npm run build")
})
