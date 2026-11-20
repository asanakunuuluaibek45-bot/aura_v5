import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
function load(path, expression, mocks, transform = s => s) {
  const source = transform(read(path))
    .replace(/^import[\s\S]*?from\s+["'][^"']+["']\s*;?$/gm, '')
    .replace(/^export /gm, '')
  const context = vm.createContext({ URL, console, ...mocks })
  vm.runInContext(stripTypeScriptTypes(source, { mode: 'strip' }) +
    `\nglobalThis.subject = ${expression}`, context)
  return context.subject
}

function authHarness({ failSecureWrite = false } = {}) {
  const preferences = new Map([['sb-test-auth-token', 'legacy-session']])
  const secure = new Map()
  let closes = 0
  const subject = load('lib/supabase/client.ts',
    '{ nativeAuthStorage, clearDeviceAuth, markDeviceSignedIn, prepareDeviceSignIn }', {
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co' } },
      Capacitor: { isNativePlatform: () => true },
      usesKeychain: () => true,
      Preferences: {
        get: async ({ key }) => ({ value: preferences.get(key) ?? null }),
        set: async ({ key, value }) => preferences.set(key, value),
        remove: async ({ key }) => preferences.delete(key),
      },
      AuraNative: {
        get: async ({ key }) => ({ value: secure.get(key) ?? null }),
        set: async ({ key, value }) => {
          if (failSecureWrite) throw new Error('Keychain locked')
          secure.set(key, value)
        },
        remove: async ({ key }) => secure.delete(key),
        closeOnline: async () => { closes++ },
      },
      createSupabaseClient: () => ({ auth: { startAutoRefresh() {} } }),
    })
  return { ...subject, preferences, secure, closes: () => closes }
}

test('iOS migrates Preferences to Keychain and removes plaintext only after success', async () => {
  const h = authHarness()
  assert.equal(await h.nativeAuthStorage.getItem('sb-test-auth-token'), 'legacy-session')
  assert.equal(h.preferences.has('sb-test-auth-token'), false)
  assert.equal(h.secure.get('sb-test-auth-token'), 'legacy-session')
  const locked = authHarness({ failSecureWrite: true })
  await assert.rejects(locked.nativeAuthStorage.getItem('sb-test-auth-token'), /Keychain locked/)
  assert.equal(locked.preferences.get('sb-test-auth-token'), 'legacy-session')
})

test('iOS logout clears both stores, closes remote window and fences late writes', async () => {
  const h = authHarness()
  await h.nativeAuthStorage.getItem('sb-test-auth-token')
  await h.clearDeviceAuth()
  assert.equal(h.secure.size, 0)
  assert.equal(h.closes(), 1)
  await h.nativeAuthStorage.setItem('sb-test-auth-token', 'late')
  assert.equal(h.secure.size, 0)
  h.prepareDeviceSignIn()
  await h.nativeAuthStorage.setItem('sb-test-auth-token', 'new')
  assert.equal(await h.nativeAuthStorage.getItem('sb-test-auth-token'), null)
  await h.markDeviceSignedIn()
  assert.equal(await h.nativeAuthStorage.getItem('sb-test-auth-token'), 'new')
})

function bleHarness(native = true) {
  const calls = { init: 0, chooser: [], disconnect: null }
  let services = [{ uuid: 'service', characteristics: [{
    uuid: 'characteristic', properties: { write: false, writeWithoutResponse: true, notify: true },
  }] }]
  const navigator = {}
  const BleClient = {
    initialize: async () => { calls.init++ },
    isEnabled: async () => true,
    requestDevice: async options => { calls.chooser.push(options); return { deviceId: 'one', name: 'B3S' } },
    connect: async (id, disconnected) => { calls.disconnect = disconnected },
    getServices: async () => services,
    disconnect: async () => {},
  }
  const register = load('lib/capacitor-bluetooth.ts', 'registerCapacitorBluetoothPolyfill', {
    BleClient, Capacitor: { isNativePlatform: () => native },
    window: { navigator }, EventTarget, Event, DataView, ArrayBuffer,
  })
  return { register, navigator, calls, setServices: value => { services = value } }
}

test('BLE shim never impersonates Web Bluetooth in Safari/PWA', () => {
  const h = bleHarness(false)
  h.register()
  assert.equal(h.navigator.bluetooth, undefined)
})

test('BLE initialization is shared and required services are not optional', async () => {
  const h = bleHarness()
  h.register()
  await Promise.all([h.navigator.bluetooth.getAvailability(), h.navigator.bluetooth.getAvailability()])
  assert.equal(h.calls.init, 1)
  const device = await h.navigator.bluetooth.requestDevice({
    filters: [{ services: ['service'] }], optionalServices: ['other', 'other'],
  })
  assert.deepEqual([...h.calls.chooser[0].services], ['service'])
  assert.deepEqual([...h.calls.chooser[0].optionalServices], ['other'])
  await device.gatt.connect()
  const service = await device.gatt.getPrimaryService('service')
  const characteristic = await service.getCharacteristic('characteristic')
  assert.equal(characteristic.properties.write, false)
  assert.equal(characteristic.properties.writeWithoutResponse, true)
  await assert.rejects(service.getCharacteristic('missing'), /not found/)
  let disconnects = 0
  device.addEventListener('gattserverdisconnected', () => { disconnects++ })
  h.calls.disconnect()
  assert.equal(device.gatt.connected, false)
  assert.equal(disconnects, 1)
  h.setServices([])
  await device.gatt.connect()
  await assert.rejects(device.gatt.getPrimaryService('service'), /not found/)
})

function scanHarness({ failStart = false, failRemove = false } = {}) {
  const counts = { stop: 0, remove: 0 }
  const classes = new Set()
  const classList = { add: s => classes.add(s), remove: s => classes.delete(s) }
  const scanner = {
    addListener: async () => ({ remove: async () => {
      counts.remove++
      if (failRemove) throw new Error('listener gone')
    } }),
    startScan: async () => { if (failStart) throw new Error('camera busy') },
    stopScan: async () => { counts.stop++ },
  }
  const start = load('lib/native-barcode-scanner.ts', 'startNativeScan', {
    plugin: { BarcodeScanner: scanner, BarcodeFormat: {}, LensFacing: {} },
    document: { documentElement: { style: { setProperty() {}, removeProperty() {} }, classList },
      body: { classList } },
    window: { devicePixelRatio: 3, scrollY: 20 },
  }, source => source.replace('pluginPromise ??= import("@capacitor-mlkit/barcode-scanning")', 'pluginPromise ??= Promise.resolve(plugin)'))
  return { start, counts, classes }
}

test('camera is stopped even when native startup or listener removal fails', async () => {
  const failed = scanHarness({ failStart: true })
  await assert.rejects(failed.start(() => {}), /camera busy/)
  assert.equal(failed.counts.stop, 1)
  assert.equal(failed.classes.size, 0)
  const h = scanHarness({ failRemove: true })
  const session = await h.start(() => {})
  await session.stop()
  await session.stop()
  assert.equal(h.counts.stop, 1)
  assert.equal(h.classes.size, 0)
})

function onlineHarness({ invalidUser = false } = {}) {
  const calls = []
  const post = load('app/auth/native/route.ts', 'POST', {
    createClient: async () => ({ auth: {
      getUser: async token => { calls.push(['verify', token]); return {
        data: { user: invalidUser ? null : { id: 'user' } }, error: null,
      } },
      setSession: async session => { calls.push(['session', session]); return {
        data: { session: { user: { id: 'user' } } }, error: null,
      } },
    } }),
    NextResponse: { json: (value, init) => new Response(JSON.stringify(value), init),
      redirect: (url, status) => new Response(null, { status, headers: { Location: String(url) } }) },
  })
  const request = (body, headers = {}) => {
    const req = new Request('https://golduchet.com/auth/native', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-aura-native': '1', ...headers },
      body: JSON.stringify(body),
    })
    req.nextUrl = new URL(req.url)
    return req
  }
  return { post, request, calls }
}

test('online bootstrap rejects cross-origin calls, invalid identity and open redirects', async () => {
  const h = onlineHarness()
  for (const path of ['https://attacker.invalid', '//attacker.invalid', '/crm/pos', '/crm/money?next=x']) {
    assert.equal((await h.post(h.request({ accessToken: 'test', path }))).status, 400)
  }
  assert.equal((await h.post(h.request({ accessToken: 'test', path: '/crm/money' },
    { origin: 'https://attacker.invalid' }))).status, 403)
  const invalid = onlineHarness({ invalidUser: true })
  assert.equal((await invalid.post(invalid.request({ accessToken: 'test', path: '/crm/money' }))).status, 401)
  assert.equal(invalid.calls.length, 1)
})

test('online window verifies access token without sharing the native refresh token', async () => {
  const h = onlineHarness()
  const response = await h.post(h.request({ accessToken: 'test', path: '/crm/money' }))
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('Location'), 'https://golduchet.com/crm/money')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(h.calls[0][0], 'verify')
  assert.equal(h.calls[1][1].refresh_token, 'native-access-only')
  assert.ok(!response.headers.get('Location').includes('test'))
})

test('iOS build links ML Kit through CocoaPods and compiles the Keychain bridge', () => {
  const pods = read('ios/App/Podfile')
  assert.match(pods, /platform :ios, '15.5'/)
  assert.match(pods, /CapacitorMlkitBarcodeScanning/)
  const project = read('ios/App/App.xcodeproj/project.pbxproj')
  assert.doesNotMatch(project, /CapApp-SPM/)
  assert.match(project, /AuraNativePlugin.swift in Sources/)
  const swift = read('ios/App/App/AuraNativePlugin.swift')
  assert.match(swift, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/)
  assert.match(swift, /websiteDataStore = .nonPersistent\(\)/)
  assert.doesNotMatch(swift, /addScriptMessageHandler|registerScriptMessageHandler/)
  assert.match(read('scripts/build-ios-unsigned.sh'), /npm ci/)
  assert.match(read('scripts/build-ios-unsigned.sh'), /verify-ios-native/)
})

test('native login removes logout fence before saving the new offline profile', () => {
  const login = read('native/app/native-crm.tsx').split('function formatSaleDate')[0]
  assert.ok(login.indexOf('await markDeviceSignedIn()') < login.indexOf('await saveUserSession('))
})
