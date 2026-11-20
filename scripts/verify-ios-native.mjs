import { readFileSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = p => readFileSync(path.join(root, p), 'utf8')
const config = JSON.parse(read('ios/App/App/capacitor.config.json'))
assert.equal(config.webDir, 'out', 'iOS must use the packaged native export')
assert.ok(!config.server?.url, 'Release build must not load a remote Capacitor bridge')
assert.ok(existsSync(path.join(root, 'ios/App/App/public/index.html')), 'Missing packaged shell')
for (const asset of ['golduchet-icon-transparent.svg', 'golduchet-logo.svg', 'golduchet-logo-dark.svg']) {
  assert.ok(existsSync(path.join(root, 'ios/App/App/public', asset)), `Missing shared PWA asset: ${asset}`)
}
const pods = read('ios/App/Podfile')
const lock = read('ios/App/Pods/Manifest.lock')
for (const plugin of ['CapacitorMlkitBarcodeScanning', 'CapacitorCommunityBluetoothLe',
  'CapacitorPreferences', 'CapacitorNetwork', 'CapacitorApp', 'CapacitorCamera']) {
  assert.ok(pods.includes(plugin), `Podfile missing ${plugin}`)
  assert.ok(lock.includes(plugin), `Installed pods missing ${plugin}`)
}
assert.ok(lock.includes('GoogleMLKit/BarcodeScanning'), 'Missing actual ML Kit SDK')
const project = read('ios/App/App.xcodeproj/project.pbxproj')
assert.ok(!project.includes('CapApp-SPM'), 'Do not mix SPM Capacitor with CocoaPods Capacitor')
assert.ok(project.includes('AuraNativePlugin.swift in Sources'), 'Keychain bridge not compiled')
for (const key of ['NSCameraUsageDescription', 'NSBluetoothAlwaysUsageDescription']) {
  assert.ok(read('ios/App/App/Info.plist').includes(key), `Missing ${key}`)
}
console.log('iOS native dependencies and packaged shell verified')
