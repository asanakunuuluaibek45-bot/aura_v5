import { BleClient } from "@capacitor-community/bluetooth-le"
import { Capacitor } from "@capacitor/core"

class MockGattCharacteristic extends EventTarget {
  readonly uuid: string
  readonly service: MockGattService
  readonly properties: {
    write: boolean
    writeWithoutResponse: boolean
    notify: boolean
    indicate: boolean
  }
  value?: DataView

  constructor(uuid: string, service: MockGattService, properties: Partial<MockGattCharacteristic["properties"]>) {
    super()
    this.uuid = uuid
    this.service = service
    this.properties = {
      write: Boolean(properties.write),
      writeWithoutResponse: Boolean(properties.writeWithoutResponse),
      notify: Boolean(properties.notify),
      indicate: Boolean(properties.indicate),
    }
  }

  async writeValue(value: BufferSource): Promise<void> {
    return this.writeValueWithResponse(value)
  }

  async writeValueWithResponse(value: BufferSource): Promise<void> {
    const dv = toDataView(value)
    await BleClient.write(
      this.service.device.id,
      this.service.uuid,
      this.uuid,
      dv
    )
  }

  async writeValueWithoutResponse(value: BufferSource): Promise<void> {
    const dv = toDataView(value)
    await BleClient.writeWithoutResponse(
      this.service.device.id,
      this.service.uuid,
      this.uuid,
      dv
    )
  }

  async startNotifications(): Promise<this> {
    await BleClient.startNotifications(
      this.service.device.id,
      this.service.uuid,
      this.uuid,
      (data: DataView) => {
        this.value = data
        const event = new Event("characteristicvaluechanged")
        Object.defineProperty(event, "target", { value: this, writable: false })
        this.dispatchEvent(event)
      }
    )
    return this
  }

  async stopNotifications(): Promise<this> {
    await BleClient.stopNotifications(
      this.service.device.id,
      this.service.uuid,
      this.uuid
    )
    return this
  }
}

class MockGattService {
  readonly uuid: string
  readonly device: MockBluetoothDevice
  readonly isPrimary = true
  private characteristics = new Map<string, MockGattCharacteristic>()

  constructor(uuid: string, device: MockBluetoothDevice) {
    this.uuid = uuid
    this.device = device
  }

  async getCharacteristic(uuid: string): Promise<MockGattCharacteristic> {
    const norm = uuid.toLowerCase()
    await this.getCharacteristics()
    const char = this.characteristics.get(norm)
    if (!char) throw new Error(`BLE characteristic not found: ${uuid}`)
    return char
  }

  async getCharacteristics(): Promise<MockGattCharacteristic[]> {
      const services = await BleClient.getServices(this.device.id)
      const thisService = services.find(
        (s) => s.uuid.toLowerCase() === this.uuid.toLowerCase()
      )
      if (thisService && thisService.characteristics) {
        return thisService.characteristics.map((c) => {
          const norm = c.uuid.toLowerCase()
          let char = this.characteristics.get(norm)
          if (!char) {
            char = new MockGattCharacteristic(c.uuid, this, c.properties)
            this.characteristics.set(norm, char)
          }
          return char
        })
      }
    throw new Error(`BLE service not found: ${this.uuid}`)
  }
}

class MockGattServer {
  readonly device: MockBluetoothDevice
  connected = false
  private services = new Map<string, MockGattService>()

  constructor(device: MockBluetoothDevice) {
    this.device = device
  }

  async connect(): Promise<this> {
    if (this.connected) return this
    this.services.clear()
    await BleClient.connect(this.device.id, () => {
      this.connected = false
      this.services.clear()
      this.device.dispatchEvent(new Event("gattserverdisconnected"))
    })
    this.connected = true
    return this
  }

  async disconnect(): Promise<void> {
    this.connected = false
    try {
      await BleClient.disconnect(this.device.id)
    } catch {
      /* Ignore disconnect errors */
    }
    this.device.dispatchEvent(new Event("gattserverdisconnected"))
  }

  async getPrimaryService(uuid: string): Promise<MockGattService> {
    const norm = uuid.toLowerCase()
    await this.getPrimaryServices()
    const service = this.services.get(norm)
    if (!service) throw new Error(`BLE service not found: ${uuid}`)
    return service
  }

  async getPrimaryServices(): Promise<MockGattService[]> {
      const services = await BleClient.getServices(this.device.id)
      return services.map((s) => {
        const norm = s.uuid.toLowerCase()
        let service = this.services.get(norm)
        if (!service) {
          service = new MockGattService(s.uuid, this.device)
          this.services.set(norm, service)
        }
        return service
      })
  }
}

class MockBluetoothDevice extends EventTarget {
  readonly id: string
  readonly name: string
  readonly gatt: MockGattServer

  constructor(id: string, name: string) {
    super()
    this.id = id
    this.name = name
    this.gatt = new MockGattServer(this)
  }
}

function toDataView(bufferSource: BufferSource): DataView {
  if (bufferSource instanceof DataView) return bufferSource
  if (ArrayBuffer.isView(bufferSource)) {
    return new DataView(
      bufferSource.buffer,
      bufferSource.byteOffset,
      bufferSource.byteLength
    )
  }
  return new DataView(bufferSource)
}

export function registerCapacitorBluetoothPolyfill() {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return
  // Already supported natively (e.g. Chrome on Windows/Android/Mac)
  if (window.navigator && "bluetooth" in window.navigator && window.navigator.bluetooth) {
    return
  }

  let initialization: Promise<void> | null = null
  const ensureBle = async () => {
    initialization ??= BleClient.initialize().catch((error) => {
      initialization = null
      throw error
    })
    await initialization
  }

  const mockBluetooth = {
    async getAvailability() {
      try {
        await ensureBle()
        return await BleClient.isEnabled()
      } catch {
        return false
      }
    },

    async requestDevice(options?: {
      filters?: Array<{ name?: string; namePrefix?: string; services?: string[] }>
      optionalServices?: string[]
    }) {
      await ensureBle()
      
      const services: string[] = []
      const filterServices: string[] = []
      let name: string | undefined
      let namePrefix: string | undefined

      if (options?.filters) {
        for (const f of options.filters) {
          if (f.name) name = f.name
          if (f.namePrefix) namePrefix = f.namePrefix
          if (f.services) filterServices.push(...f.services)
        }
      }
      if (options?.optionalServices) {
        services.push(...options.optionalServices)
      }

      const device = await BleClient.requestDevice({
        name,
        namePrefix,
        services: filterServices.length ? [...new Set(filterServices)] : undefined,
        optionalServices: services.length ? [...new Set(services)] : undefined,
      })

      return new MockBluetoothDevice(device.deviceId, device.name || name || "Bluetooth Device")
    },
  }

  try {
    Object.defineProperty(window.navigator, "bluetooth", {
      value: mockBluetooth,
      configurable: true,
      writable: true,
    })
  } catch {
    ;(window.navigator as unknown as { bluetooth: unknown }).bluetooth = mockBluetooth
  }
}
