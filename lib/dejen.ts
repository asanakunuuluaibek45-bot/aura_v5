import { commandFrame, FrameDecoder, rasterRow } from "./dejen-protocol.mjs"

// E7810A71-... is the vendor service discovered by LPAPI Android SDK in its GATT
// service scan; FFE0/FFE1 is the SDK's legacy serial-service fallback.
// Other firmware/service variants are deliberately rejected.
export const DEJEN_VENDOR_SERVICE = "e7810a71-73ae-499d-8c15-faa9aef0c3f2"
export const DEJEN_SERVICE = "0000ffe0-0000-1000-8000-00805f9b34fb"
const DEJEN_WRITE = "0000ffe1-0000-1000-8000-00805f9b34fb"
export type DejenModelName = "DP27P" | "DP30P"
export type DejenPrinterInfo = { name: string; dpi: number; printheadPx: number }

function connectionError(stage: string, cause: unknown): Error {
  const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
  const error = new Error(`Dejen — ${stage}. ${detail}`)
  error.name = "DejenConnectionError"
  return error
}

type Characteristic = {
  uuid: string
  properties: { write?: boolean; writeWithoutResponse?: boolean; notify?: boolean; indicate?: boolean }
  value?: DataView
  startNotifications(): Promise<unknown>
  writeValueWithResponse?(data: Uint8Array): Promise<unknown>
  writeValueWithoutResponse?(data: Uint8Array): Promise<unknown>
  writeValue?(data: Uint8Array): Promise<unknown>
  addEventListener(type: string, listener: (event: unknown) => void): void
  removeEventListener(type: string, listener: (event: unknown) => void): void
}
type DejenDevice = {
  id: string
  gatt?: {
    connected: boolean
    connect(): Promise<unknown>
    disconnect(): void
    getPrimaryServices(): Promise<Array<{ uuid: string; getCharacteristics(): Promise<Characteristic[]> }>>
  } | null
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}
type Pending = {
  resolve(value: Uint8Array): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
async function bounded<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function statusError(status: number): string {
  const errors: Record<number, string> = {
    12: "печать отменена", 30: "низкий заряд", 31: "ошибка питания",
    32: "печатающая головка не найдена", 33: "головка перегрета",
    34: "крышка открыта", 35: "нет этикеток", 36: "головка открыта",
    37: "нет ленты", 38: "неподходящая лента", 39: "головка слишком холодная",
  }
  return errors[status] ?? `состояние принтера ${status}`
}

class DejenSession {
  readonly pending = new Map<number, Pending>()
  readonly decoder = new FrameDecoder()
  readonly device: DejenDevice
  readonly tx: Characteristic
  readonly rx: Characteristic
  info: DejenPrinterInfo | null = null
  closed = false
  constructor(device: DejenDevice, tx: Characteristic, rx: Characteristic) {
    this.device = device
    this.tx = tx
    this.rx = rx
    rx.addEventListener("characteristicvaluechanged", this.receive)
    device.addEventListener("gattserverdisconnected", this.disconnected)
  }

  receive = (event: unknown) => {
    const value = (event as { target?: { value?: DataView } }).target?.value
    if (!value || this.closed) return
    const chunk = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    for (const frame of this.decoder.push(chunk)) {
      const waiter = this.pending.get(frame.command)
      if (!waiter) continue
      this.pending.delete(frame.command)
      clearTimeout(waiter.timer)
      waiter.resolve(frame.payload)
    }
  }
  disconnected = () => this.dispose(new Error("Dejen: Bluetooth-соединение прервано"))

  dispose(error = new Error("Dejen: соединение закрыто")) {
    if (this.closed) return
    this.closed = true
    this.rx.removeEventListener("characteristicvaluechanged", this.receive)
    this.device.removeEventListener("gattserverdisconnected", this.disconnected)
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    this.pending.clear()
    try { this.device.gatt?.disconnect() } catch { /* Already disconnected. */ }
  }

  async write(data: Uint8Array) {
    // 20-byte ATT payload works without assuming an Android-negotiated MTU.
    // No retries: retrying a partially transmitted print can duplicate a label.
    for (let offset = 0; offset < data.length; offset += 20) {
      if (this.closed || !this.device.gatt?.connected) throw new Error("Dejen: принтер отключён")
      const chunk = data.slice(offset, offset + 20)
      let operation: Promise<unknown>
      if (this.tx.properties.write && this.tx.writeValueWithResponse) {
        operation = this.tx.writeValueWithResponse(chunk)
      } else if (this.tx.properties.writeWithoutResponse && this.tx.writeValueWithoutResponse) {
        operation = this.tx.writeValueWithoutResponse(chunk)
      } else if (this.tx.properties.write && this.tx.writeValue) {
        operation = this.tx.writeValue(chunk)
      } else {
        throw new Error("Dejen: характеристика не поддерживает запись")
      }
      try {
        await bounded(operation, 5000, "Dejen: принтер не подтвердил Bluetooth-запись")
      } catch (error) {
        this.dispose(error instanceof Error ? error : new Error("Dejen: ошибка записи"))
        throw error
      }
      await delay(this.tx.properties.write ? 10 : 20)
    }
  }

  async query(command: number, payload = new Uint8Array()): Promise<Uint8Array> {
    if (this.closed || this.pending.has(command)) throw new Error("Dejen: соединение занято или закрыто")
    const response = new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.dispose(new Error(`Dejen: нет ответа на команду 0x${command.toString(16)}. Проверьте модель и прошивку.`))
      }, 5000)
      this.pending.set(command, { resolve, reject, timer })
    })
    try {
      // Notifications may arrive before the ATT write completes. Await both
      // before allowing the next GATT operation.
      const [result] = await Promise.all([response, this.write(commandFrame(command, payload))])
      return result
    } catch (error) {
      this.dispose(error instanceof Error ? error : new Error("Dejen: ошибка команды"))
      throw error
    }
  }

  async waitReady() {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      const status = await this.query(0x70)
      if (!status.length) throw new Error("Dejen: пустой ответ состояния")
      if (status[0] === 0) return
      if (status[0] !== 1 && status[0] !== 2) throw new Error(`Dejen: ${statusError(status[0])}`)
      await delay(250)
    }
    throw new Error("Dejen: принтер занят более 30 секунд")
  }
}

let activeSession: DejenSession | null = null

/** Read-only identification before any raster or paper-feed commands. */
export async function connectDejen(model: DejenModelName): Promise<DejenSession & { info: DejenPrinterInfo }> {
  if (typeof navigator === "undefined") throw new Error("Dejen: подключение доступно только в браузере")
  const bluetooth = (navigator as unknown as {
    bluetooth?: { requestDevice(options: unknown): Promise<DejenDevice> }
  }).bluetooth
  if (!bluetooth) throw new Error("Dejen: используйте Chrome на Android и HTTPS")
  let device: DejenDevice
  try {
    device = await bluetooth.requestDevice({
      filters: [{ namePrefix: model }],
      optionalServices: [DEJEN_VENDOR_SERVICE, DEJEN_SERVICE],
    })
  } catch (cause) {
    if (cause instanceof Error && cause.name === "NotFoundError") {
      const error = new Error(`Dejen ${model}: устройство не выбрано в окне Bluetooth. Выберите принтер и повторите подключение.`)
      error.name = "PrinterChooserCancelled"
      throw error
    }
    throw connectionError(`выбор устройства ${model}`, cause)
  }
  if (activeSession?.device.id === device.id && !activeSession.closed && device.gatt?.connected) {
    if (!activeSession.info || !new RegExp(`^${model}(?:[-_ ]|$)`, "i").test(activeSession.info.name)) {
      throw new Error("Dejen: подключён другой принтер. Выберите устройство заново.")
    }
    return activeSession as DejenSession & { info: DejenPrinterInfo }
  }
  activeSession?.dispose()
  const gatt = device.gatt
  if (!gatt) throw new Error("Dejen: устройство не предоставляет BLE GATT")
  let session: DejenSession | null = null
  let stage = `подключение к ${model}`
  try {
    await bounded(gatt.connect(), 10000, "Dejen: истекло время подключения")
    stage = `устройство выбрано, поиск BLE-сервиса Dejen (${DEJEN_VENDOR_SERVICE} или FFE0)`
    const services = await bounded(gatt.getPrimaryServices(), 5000, "Dejen: не удалось прочитать BLE-сервисы")
    const service = services.find((item) => item.uuid.toLowerCase() === DEJEN_VENDOR_SERVICE)
      ?? services.find((item) => item.uuid.toLowerCase() === DEJEN_SERVICE)
    if (!service) {
      const visible = services.map((item) => item.uuid).join(", ") || "нет разрешённых сервисов"
      throw new Error(`Dejen: поддерживаемый сервис E781/FFE0 не найден. Доступны: ${visible}`)
    }
    const serviceFamily = service.uuid.toLowerCase() === DEJEN_VENDOR_SERVICE ? "E781" : "FFE0"
    stage = `чтение характеристик BLE-сервиса ${serviceFamily}`
    const characteristics = await bounded(service.getCharacteristics(), 5000, "Dejen: не удалось прочитать BLE-характеристики")
    const tx = characteristics.find((c) => c.uuid.toLowerCase() === DEJEN_WRITE && (c.properties.write || c.properties.writeWithoutResponse))
      ?? (serviceFamily === "E781" ? characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse) : undefined)
    const rx = characteristics.find((c) => c !== tx && (c.properties.notify || c.properties.indicate))
      ?? characteristics.find((c) => c === tx && (c.properties.notify || c.properties.indicate))
    if (!tx || !rx) throw new Error(`Dejen: в сервисе ${serviceFamily} не найдены доступные характеристики записи и уведомлений`)
    session = new DejenSession(device, tx, rx)
    stage = `включение ответов принтера (${serviceFamily})`
    await bounded(rx.startNotifications(), 5000, "Dejen: не удалось включить ответы принтера")
    stage = "инициализация BLE-протокола (команда 0x78)"
    await session.query(0x78, new Uint8Array([0x06]))
    stage = "проверка модели (команда 0x79)"
    const nameBytes = await session.query(0x79)
    const name = new TextDecoder().decode(nameBytes).replace(/\0.*$/, "").trim()
    if (!new RegExp(`^${model}(?:[-_ ]|$)`, "i").test(name)) {
      throw new Error(`Dejen: выбран ${model}, но устройство сообщает «${name || "неизвестная модель"}». Печать заблокирована.`)
    }
    stage = "проверка разрешения (команда 0x71)"
    const dpiBytes = await session.query(0x71)
    const dpi = dpiBytes.length >= 2 ? (dpiBytes[0] << 8) | dpiBytes[1] : 0
    if (dpi !== 300) throw new Error(`Dejen: принтер сообщил ${dpi || "неизвестное"} dpi вместо 300 dpi. Печать заблокирована, чтобы не исказить размер.`)
    stage = "проверка ширины головки (команда 0x72)"
    const widthBytes = await session.query(0x72)
    const printheadPx = widthBytes.length >= 2 ? (widthBytes[0] << 8) | widthBytes[1] : 0
    if (printheadPx < 128 || printheadPx > 2048) throw new Error("Dejen: принтер не сообщил допустимую ширину головки")
    session.info = { name, dpi, printheadPx }
    activeSession = session
    return session as DejenSession & { info: DejenPrinterInfo }
  } catch (error) {
    if (session) session.dispose()
    else { try { gatt.disconnect() } catch { /* Preserve the original failure. */ } }
    // A missing service also raises NotFoundError. Do not let the UI translate
    // it into "no printer selected" after the user has already selected one.
    throw connectionError(stage, error)
  }
}

export async function printDejenRaster(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: {
    model: DejenModelName
    copies: number
    density: number
    onProgress?: (value: string) => void
  },
) {
  if (!Number.isInteger(width) || width < 1 || width > 1528
    || !Number.isInteger(height) || height < 1 || height > 6000
    || rgba.length !== width * height * 4) throw new Error("Dejen: недопустимый размер растра")
  if (!Number.isInteger(options.copies) || options.copies < 1 || options.copies > 100) {
    throw new Error("Dejen: укажите от 1 до 100 копий")
  }
  if (!Number.isFinite(options.density)) throw new Error("Dejen: недопустимая плотность")
  const session = await connectDejen(options.model)
  if (width > session.info.printheadPx) throw new Error(`Dejen: макет ${width} px шире головки ${session.info.printheadPx} px`)
  try {
    for (let copy = 0; copy < options.copies; copy++) {
      await session.waitReady()
      await session.write(new Uint8Array([0x1b, 0x40]))
      const paper = await session.query(0x42, new Uint8Array([0x02])) // Adhesive/gap labels only.
      if (paper[0] !== 0x02) throw new Error("Dejen: принтер не подтвердил режим этикеток с зазором")
      const darkness = Math.round(Math.max(1, Math.min(5, options.density)) * 2 - 1)
      const density = await session.query(0x43, new Uint8Array([darkness]))
      if (density[0] !== darkness) throw new Error("Dejen: принтер не подтвердил плотность")
      await session.write(commandFrame(0x27, new Uint8Array([Math.ceil(width / 8)])))
      for (let y = 0; y < height; y++) {
        await session.write(rasterRow(rgba.subarray(y * width * 4, (y + 1) * width * 4), width))
        if (y % 32 === 0) options.onProgress?.(`Передача Dejen: ${Math.round((y + 1) / height * 100)}% · ${copy + 1}/${options.copies}`)
      }
      await session.write(new Uint8Array([0x0c]))
      await session.waitReady()
    }
    options.onProgress?.("Данные переданы Dejen. Проверьте напечатанную этикетку.")
  } catch (cause) {
    session.dispose()
    const error = new Error(`Передача Dejen прервана: ${cause instanceof Error ? cause.message : "ошибка"}. Этикетка могла напечататься частично. Проверьте принтер перед повтором.`)
    error.name = "DejenPrintError"
    throw error
  }
}
