import test from "node:test"
import assert from "node:assert/strict"
import { commandFrame, FrameDecoder, rasterRow } from "../lib/dejen-protocol.mjs"
import { connectDejen, printDejenRaster, DEJEN_SERVICE } from "../lib/dejen.ts"

test("command checksum matches the published software-version example", () => {
  assert.deepEqual([...commandFrame(0x7c)], [0x1f, 0x7c, 0, 0x83])
})

test("decoder handles variable lengths, fragmentation and concatenation", () => {
  for (const length of [0, 1, 191, 192, 255, 300, 2048]) {
    const payload = Uint8Array.from({ length }, (_, i) => i & 255)
    const frame = commandFrame(0x79, payload)
    const decoder = new FrameDecoder()
    const results = []
    for (let i = 0; i < frame.length; i += 7) results.push(...decoder.push(frame.slice(i, i + 7)))
    assert.equal(results.length, 1)
    assert.deepEqual(results[0].payload, payload)
    const both = new Uint8Array(frame.length * 2)
    both.set(frame)
    both.set(frame, frame.length)
    assert.equal(new FrameDecoder().push(both).length, 2)
  }
})

test("decoder skips noise and corrupt checksums, accepts fixed checksum 88", () => {
  const frame = commandFrame(0x71, new Uint8Array([1, 44]))
  const corrupt = frame.slice()
  corrupt[corrupt.length - 1] ^= 1
  const all = Uint8Array.from([2, 3, ...corrupt, ...frame])
  assert.equal(new FrameDecoder().push(all).length, 1)
  frame[frame.length - 1] = 0x88
  assert.equal(new FrameDecoder().push(frame).length, 1)
})

test("raster is MSB first, white-composites transparency and keeps the last pixel", () => {
  const row = new Uint8ClampedArray(10 * 4).fill(255)
  for (const x of [0, 7, 9]) row.set([0, 0, 0, 255], x * 4)
  row.set([0, 0, 0, 0], 4 * 4)
  assert.deepEqual([...rasterRow(row, 10)], [0x1f, 0x2a, 10, 0, 0x81, 0x40])
  assert.throws(() => rasterRow(row, 11))
  assert.throws(() => commandFrame(-1))
})

let deviceCounter = 0
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")
test.after(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator)
  else Reflect.deleteProperty(globalThis, "navigator")
})

function mockPrinter(options = {}) {
  const writes = []
  const listeners = new Map()
  const deviceListeners = new Map()
  let inFlight = false
  const characteristic = {
    uuid: options.badCharacteristic ? "unknown" : "0000ffe1-0000-1000-8000-00805f9b34fb",
    properties: { write: true, notify: true },
    async startNotifications() {},
    addEventListener(type, listener) { listeners.set(type, listener) },
    removeEventListener(type) { listeners.delete(type) },
    async writeValueWithResponse(data) {
      assert.equal(inFlight, false, "GATT writes must not overlap")
      inFlight = true
      try {
        assert.ok(data.length <= 20)
        writes.push([...data])
        if (options.failRaster && data[0] === 0x1f && data[1] === 0x2a) throw new Error("simulated GATT failure")
        let payload
        const command = data[0] === 0x1f ? data[1] : -1
        if (command === 0x78) payload = [2, 0x43]
        if (command === 0x79) payload = [...new TextEncoder().encode(options.name ?? "DP27P-TEST"), 0]
        if (command === 0x71) payload = options.dpi === 203 ? [0, 203] : [1, 44]
        if (command === 0x72) payload = [(options.head ?? 576) >> 8, (options.head ?? 576) & 255, 0, 0]
        if (command === 0x70) payload = [options.status ?? 0, 1, 1, 0, 0, 50, 5, 16]
        if (command === 0x42 || command === 0x43) payload = [data[3]]
        if (options.disconnectOnCommand === command) {
          device.gatt.disconnect()
          payload = undefined
        }
        if (payload) {
          const response = commandFrame(command, new Uint8Array(payload))
          // Deliver before the write promise settles, with nonzero DataView offsets.
          for (const part of [response.slice(0, 3), response.slice(3)]) {
            const padded = Uint8Array.from([99, ...part, 99])
            characteristic.value = new DataView(padded.buffer, 1, part.length)
            listeners.get("characteristicvaluechanged")?.({ target: characteristic })
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1))
      } finally {
        inFlight = false
      }
    },
  }
  const device = {
    id: `mock-${++deviceCounter}`,
    gatt: {
      connected: false,
      async connect() { this.connected = true; return this },
      disconnect() {
        if (!this.connected) return
        this.connected = false
        deviceListeners.get("gattserverdisconnected")?.()
      },
      async getPrimaryService(uuid) {
        assert.equal(uuid, DEJEN_SERVICE)
        return { async getCharacteristics() { return [characteristic] } }
      },
    },
    addEventListener(type, listener) { deviceListeners.set(type, listener) },
    removeEventListener(type) { deviceListeners.delete(type) },
  }
  if (options.withoutResponse) {
    characteristic.properties.write = false
    characteristic.properties.writeWithoutResponse = true
    characteristic.writeValueWithoutResponse = characteristic.writeValueWithResponse
  }
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { bluetooth: { async requestDevice(request) {
      assert.deepEqual(request.optionalServices, [DEJEN_SERVICE])
      return device
    } } },
  })
  return { device, writes }
}

const blackRow = (width) => {
  const rgba = new Uint8ClampedArray(width * 4)
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255
  return rgba
}
const jobOptions = { model: "DP27P", copies: 1, density: 3 }
const isRaster = (b) => b[0] === 0x1f && b[1] === 0x2a

test("both 300-dpi model handshakes are verified without feeding paper", async () => {
  for (const model of ["DP27P", "DP30P"]) {
    const mock = mockPrinter({ name: `${model}-TEST`, head: model === "DP30P" ? 960 : 576 })
    const session = await connectDejen(model)
    assert.equal(session.info.dpi, 300)
    assert.equal(session.info.name, `${model}-TEST`)
    assert.ok(!mock.writes.some(isRaster))
    assert.ok(!mock.writes.some((b) => b[0] === 0x0c || b[0] === 0x1b))
    session.dispose()
  }
})

test("wrong model, 203 dpi and unknown BLE characteristics are blocked", async () => {
  for (const options of [{ name: "DP30P-TEST" }, { dpi: 203 }, { badCharacteristic: true }]) {
    const mock = mockPrinter(options)
    await assert.rejects(() => connectDejen("DP27P"))
    assert.equal(mock.device.gatt.connected, false)
    assert.ok(!mock.writes.some(isRaster))
    assert.ok(!mock.writes.some((b) => b[0] === 0x0c))
  }
})

test("actual head width prevents oversized output before any raster", async () => {
  const mock = mockPrinter({ head: 128 })
  await assert.rejects(() => printDejenRaster(blackRow(129), 129, 1, jobOptions), /шире головки/)
  assert.ok(!mock.writes.some(isRaster))
  assert.ok(!mock.writes.some((b) => b[0] === 0x1b))
})

test("closed cover stops the job without feeding paper", async () => {
  const mock = mockPrinter({ status: 34 })
  await assert.rejects(() => printDejenRaster(blackRow(8), 8, 1, jobOptions), /крышка открыта/)
  assert.ok(!mock.writes.some(isRaster))
  assert.ok(!mock.writes.some((b) => b[0] === 0x0c))
})

test("copies are sequential and a partially failed raster is never retried", async () => {
  const good = mockPrinter()
  await printDejenRaster(blackRow(8), 8, 1, { ...jobOptions, copies: 2 })
  assert.equal(good.writes.filter(isRaster).length, 2)
  assert.equal(good.writes.filter((b) => b[0] === 0x0c).length, 2)
  const bad = mockPrinter({ failRaster: true })
  await assert.rejects(
    () => printDejenRaster(blackRow(8), 8, 1, jobOptions),
    (error) => error.name === "DejenPrintError" && /частично/.test(error.message),
  )
  assert.equal(bad.writes.filter(isRaster).length, 1)
  assert.equal(bad.writes.filter((b) => b[0] === 0x0c).length, 0)
  assert.equal(bad.device.gatt.connected, false)
})

test("invalid copy count and buffer size do not open the Bluetooth chooser", async () => {
  let requested = false
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { bluetooth: { requestDevice() { requested = true; throw new Error("unexpected chooser") } } },
  })
  await assert.rejects(() => printDejenRaster(blackRow(8), 8, 1, { ...jobOptions, copies: 0 }))
  await assert.rejects(() => printDejenRaster(blackRow(8), 9, 1, jobOptions))
  assert.equal(requested, false)
})

test("unacknowledged-only firmware uses paced 20-byte chunks", async () => {
  const mock = mockPrinter({ withoutResponse: true })
  await printDejenRaster(blackRow(176), 176, 1, jobOptions)
  assert.ok(mock.writes.every((b) => b.length <= 20))
  assert.equal(mock.writes.filter((b) => b.length === 20).length, 1)
  assert.equal(mock.writes.filter((b) => b[0] === 0x0c).length, 1)
})

test("disconnect during identification rejects the pending query and does not print", async () => {
  const mock = mockPrinter({ disconnectOnCommand: 0x71 })
  await assert.rejects(() => connectDejen("DP27P"), /соединение прервано/)
  assert.equal(mock.device.gatt.connected, false)
  assert.ok(!mock.writes.some(isRaster))
})
