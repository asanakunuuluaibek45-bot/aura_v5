import test from "node:test"
import assert from "node:assert/strict"
import { commandFrame, FrameDecoder, rasterRow, dothanTechPrintJob } from "../lib/dejen-protocol.mjs"
import { connectDejen, printDejenRaster, DEJEN_SERVICE, DEJEN_VENDOR_SERVICE } from "../lib/dejen.ts"
import { getPrintErrorMessage } from "../lib/printer-errors.ts"

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

test("DothanTech job uses init, line-width, compressed rows and end frames", () => {
  const rgba = new Uint8ClampedArray(8 * 2 * 4).fill(255)
  rgba.set([0, 0, 0, 255], 0)
  const job = dothanTechPrintJob(rgba, 8, 2, { pageKey: 0x1234 })
  const frames = new FrameDecoder().push(job)
  assert.deepEqual(frames.map((frame) => frame.command), [0x20, 0x27, 0x21, 0x21, 0x28])
  assert.deepEqual([...frames[0].payload], [0x12, 0x34, 0, 0, 0, 0, 0, 0])
  assert.deepEqual([...frames[1].payload], [1, 1])
  assert.deepEqual([...frames[2].payload], [0, 0, 0x80])
  assert.deepEqual([...frames[3].payload], [0, 1])
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
  const serviceUuid = options.serviceUuid ?? (options.customService ? DEJEN_VENDOR_SERVICE : DEJEN_SERVICE)
  const serialService = serviceUuid === "0000ffe0-0000-1000-8000-00805f9b34fb"
  const notificationCharacteristic = {
    uuid: options.customService ? "e7810a73-73ae-499d-8c15-faa9aef0c3f2"
      : serialService ? "0000ffe1-0000-1000-8000-00805f9b34fb"
        : "0000ff01-0000-1000-8000-00805f9b34fb",
    properties: { notify: true },
    value: undefined,
    async startNotifications() {},
    addEventListener(type, listener) { listeners.set(type, listener) },
    removeEventListener(type) { listeners.delete(type) },
  }
  const characteristic = {
    uuid: options.badCharacteristic ? "unknown" : options.customService ? "e7810a72-73ae-499d-8c15-faa9aef0c3f2"
      : serialService ? "0000ffe2-0000-1000-8000-00805f9b34fb"
        : "0000ff02-0000-1000-8000-00805f9b34fb",
    properties: { write: true },
    async writeValueWithResponse(data) {
      assert.equal(inFlight, false, "GATT writes must not overlap")
      inFlight = true
      try {
          assert.ok(data.length <= 512)
          const bytesSent = [...writes.flat(), ...data]
        if (options.failRaster && bytesSent.some((byte, index) => byte === 0x1f && bytesSent[index + 1] === 0x21)) {
          throw new Error("simulated GATT failure")
        }
          writes.push([...data])
        let payload
        const command = data[0] === 0x1f ? data[1] : -1
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
            notificationCharacteristic.value = new DataView(padded.buffer, 1, part.length)
            listeners.get("characteristicvaluechanged")?.({ target: notificationCharacteristic })
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
      async getPrimaryServices() {
        if (options.missingService) {
          return []
        }
        return [{ uuid: serviceUuid, async getCharacteristics() { return [characteristic, notificationCharacteristic] } }]
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
      assert.deepEqual(request.optionalServices, [
        DEJEN_SERVICE,
        "0000ffe0-0000-1000-8000-00805f9b34fb",
        "ffffff00-0000-1000-8000-00805f9b34fb",
        "000018f0-0000-1000-8000-00805f9b34fb",
        "0000180a-0000-1000-8000-00805f9b34fb",
        DEJEN_VENDOR_SERVICE,
        "49535343-fe7d-4ae5-8fa9-9fafd205e45a",
        "49535343-8841-43f4-a8d4-ecbe34729bb3",
      ])
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
const receivedFrames = (mock) => new FrameDecoder().push(Uint8Array.from(mock.writes.flat()))
const hasPrintInit = (mock) => receivedFrames(mock).some((frame) => frame.command === 0x20)

test("both 300-dpi model handshakes are verified without feeding paper", async () => {
  for (const model of ["DP27P", "DP30P"]) {
    for (const customService of [false, true]) {
      const mock = mockPrinter({ name: `${model}-TEST`, head: model === "DP30P" ? 960 : 576, customService })
      const session = await connectDejen(model)
      assert.equal(session.info.dpi, 300)
      assert.equal(session.info.name, `${model}-TEST`)
      assert.ok(!hasPrintInit(mock))
      session.dispose()
    }
  }
})

test("wrong model, 203 dpi and unknown BLE characteristics are blocked", async () => {
  for (const options of [
    { name: "DP30P-TEST" },
    { dpi: 203 },
    { badCharacteristic: true },
    { serviceUuid: "0000ffc0-0000-1000-8000-00805f9b34fb" },
  ]) {
    const mock = mockPrinter(options)
    await assert.rejects(() => connectDejen("DP27P"))
    assert.equal(mock.device.gatt.connected, false)
    assert.ok(!hasPrintInit(mock))
  }
})

test("actual head width prevents oversized output before any raster", async () => {
  const mock = mockPrinter({ head: 128 })
  await assert.rejects(() => printDejenRaster(blackRow(129), 129, 1, jobOptions), /шире головки/)
  assert.ok(!hasPrintInit(mock))
})

test("closed cover stops the job without feeding paper", async () => {
  const mock = mockPrinter({ status: 34 })
  await assert.rejects(() => printDejenRaster(blackRow(8), 8, 1, jobOptions), /крышка открыта/)
  assert.ok(!hasPrintInit(mock))
})

test("copies are sequential and a partially failed raster is never retried", async () => {
  const good = mockPrinter()
  await printDejenRaster(blackRow(8), 8, 1, { ...jobOptions, copies: 2 })
  assert.equal(receivedFrames(good).filter((frame) => frame.command === 0x20).length, 2)
  assert.equal(receivedFrames(good).filter((frame) => frame.command === 0x28).length, 2)
  const bad = mockPrinter({ failRaster: true })
  await assert.rejects(
    () => printDejenRaster(blackRow(8), 8, 1, jobOptions),
    (error) => error.name === "DejenPrintError" && /частично/.test(error.message),
  )
  assert.equal(receivedFrames(bad).filter((frame) => frame.command === 0x21).length, 0)
  assert.equal(receivedFrames(bad).filter((frame) => frame.command === 0x28).length, 0)
  assert.equal(bad.device.gatt.connected, false)
})

test("vendor E781 service can transfer a label through separate custom write/notify characteristics", async () => {
  const mock = mockPrinter({ customService: true, name: "DP30P-Y6085197", head: 960 })
  await printDejenRaster(blackRow(8), 8, 1, { ...jobOptions, model: "DP30P" })
  assert.equal(receivedFrames(mock).filter((frame) => frame.command === 0x21).length, 1)
  assert.equal(receivedFrames(mock).filter((frame) => frame.command === 0x28).length, 1)
})

test("Detonger Web Bluetooth FF00 profile uses FF02 for writes and FF01 for replies", async () => {
  const mock = mockPrinter({ serviceUuid: "0000ff00-0000-1000-8000-00805f9b34fb", name: "DP30P-Y6085197", head: 960 })
  await printDejenRaster(blackRow(8), 8, 1, { ...jobOptions, model: "DP30P" })
  const frames = receivedFrames(mock)
  assert.equal(frames.filter((frame) => frame.command === 0x21).length, 1)
  assert.equal(frames.filter((frame) => frame.command === 0x28).length, 1)
  assert.ok(!frames.some((frame) => frame.command === 0x42 || frame.command === 0x43))
})

test("acknowledged BLE writes batch a large raster into fast 512-byte GATT values", async () => {
  const mock = mockPrinter({ name: "DP30P-Y6085197", head: 960 })
  const width = 960
  const height = 32
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const value = (x * 17 + y * 31) % 101 < 50 ? 0 : 255
      rgba[offset] = value
      rgba[offset + 1] = value
      rgba[offset + 2] = value
      rgba[offset + 3] = 255
    }
  }
  await printDejenRaster(rgba, width, height, { ...jobOptions, model: "DP30P" })
  const chunks = mock.writes.map((write) => write.length)
  assert.ok(chunks.some((size) => size > 20))
  assert.ok(chunks.every((size) => size <= 512))
  assert.equal(receivedFrames(mock).filter((frame) => frame.command === 0x28).length, 1)
})

test("legacy FFE0 profile uses FFE2 for writes and FFE1 for replies", async () => {
  const mock = mockPrinter({ serviceUuid: "0000ffe0-0000-1000-8000-00805f9b34fb" })
  await printDejenRaster(blackRow(8), 8, 1, jobOptions)
  assert.equal(receivedFrames(mock).filter((frame) => frame.command === 0x21).length, 1)
  assert.equal(receivedFrames(mock).filter((frame) => frame.command === 0x28).length, 1)
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
  assert.ok(mock.writes.filter((b) => b.length === 20).length >= 1)
  assert.equal(receivedFrames(mock).filter((frame) => frame.command === 0x21).length, 1)
})

test("disconnect during identification rejects the pending query and does not print", async () => {
  const mock = mockPrinter({ disconnectOnCommand: 0x71 })
  await assert.rejects(() => connectDejen("DP27P"), /соединение прервано/)
  assert.equal(mock.device.gatt.connected, false)
  assert.ok(!hasPrintInit(mock))
})

test("missing service after selection is reported as a connection-stage error", async () => {
  const mock = mockPrinter({ missingService: true })
  await assert.rejects(() => connectDejen("DP27P"), (error) => {
    assert.equal(error.name, "DejenConnectionError")
    assert.match(getPrintErrorMessage(error), /устройство выбрано.*FF00, FFE0, E781/)
    assert.match(getPrintErrorMessage(error), /нет разрешённых сервисов/)
    assert.doesNotMatch(getPrintErrorMessage(error), /Принтер не выбран/)
    return true
  })
  assert.equal(mock.device.gatt.connected, false)
  assert.ok(!hasPrintInit(mock))
})

test("NotFoundError for a GATT service is not translated as chooser cancellation", () => {
  const error = new Error("No Services matching UUID found")
  error.name = "NotFoundError"
  assert.match(getPrintErrorMessage(error), /Bluetooth-ресурс/)
  assert.doesNotMatch(getPrintErrorMessage(error), /Принтер не выбран/)
})

test("actual chooser cancellation still has the appropriate instruction", () => {
  const error = new Error("User cancelled the requestDevice() chooser.")
  error.name = "NotFoundError"
  assert.match(getPrintErrorMessage(error), /Принтер не выбран/)
})
