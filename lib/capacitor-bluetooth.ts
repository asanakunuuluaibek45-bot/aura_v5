import { BleClient } from "@capacitor-community/bluetooth-le"

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

  constructor(uuid: string, service: MockGattService) {
    super()
    this.uuid = uuid
    this.service = service
    this.properties = {
      write: true,
      writeWithoutResponse: true,
      notify: true,
      indicate: true,
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
    let char = this.characteristics.get(norm)
    if (!char) {
      char = new MockGattCharacteristic(uuid, this)
      this.characteristics.set(norm, char)
    }
    return char
  }

  async getCharacteristics(): Promise<MockGattCharacteristic[]> {
    try {
      const services = await BleClient.getServices(this.device.id)
      const thisService = services.find(
        (s) => s.uuid.toLowerCase() === this.uuid.toLowerCase()
      )
      if (thisService && thisService.characteristics) {
        return thisService.characteristics.map((c) => {
          const norm = c.uuid.toLowerCase()
          let char = this.characteristics.get(norm)
          if (!char) {
            char = new MockGattCharacteristic(c.uuid, this)
            this.characteristics.set(norm, char)
          }
          return char
        })
      }
    } catch {
      /* Fallback to returning known characteristics */
    }
    return Array.from(this.characteristics.values())
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
    await BleClient.connect(this.device.id, () => {
      this.connected = false
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
    let service = this.services.get(norm)
    if (!service) {
      service = new MockGattService(uuid, this.device)
      this.services.set(norm, service)
    }
    return service
  }

  async getPrimaryServices(): Promise<MockGattService[]> {
    try {
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
    } catch {
      return Array.from(this.services.values())
    }
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

let initialized = false

export function registerCapacitorBluetoothPolyfill() {
  if (typeof window === "undefined") return
  // Already supported natively (e.g. Chrome on Windows/Android/Mac)
  if (window.navigator && "bluetooth" in window.navigator && window.navigator.bluetooth) {
    return
  }

  let bleInitialized = false
  const ensureBle = async () => {
    if (!bleInitialized) {
      await BleClient.initialize()
      bleInitialized = true
    }
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
      let name: string | undefined
      let namePrefix: string | undefined

      if (options?.filters) {
        for (const f of options.filters) {
          if (f.name) name = f.name
          if (f.namePrefix) namePrefix = f.namePrefix
          if (f.services) services.push(...f.services)
        }
      }
      if (options?.optionalServices) {
        services.push(...options.optionalServices)
      }

      const device = await BleClient.requestDevice({
        name,
        namePrefix,
        optionalServices: services.length ? services : undefined,
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
