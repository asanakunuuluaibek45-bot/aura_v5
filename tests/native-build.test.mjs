import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("native Capacitor builds use packaged local assets and no production server URL", () => {
  const capacitor = read("capacitor.config.ts")
  const next = read("native/next.config.mjs")
  const script = read("scripts/build-native.mjs")
  assert.match(capacitor, /webDir: nativeBuild \? "out" : "public"/)
  assert.match(capacitor, /CAPACITOR_DEV_SERVER_URL/)
  assert.match(next, /output: "export"/)
  assert.match(next, /trailingSlash: true/)
  assert.match(script, /NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(script, /native", "--webpack"/)
  assert.match(script, /cap", "sync"/)
  assert.match(script, /cp\(publicDir/)
  assert.match(read("scripts/verify-ios-native.mjs"), /Missing shared PWA asset/)
  assert.match(capacitor, /contentInset: "never"/)
})

test("native app renders the actual PWA, not a separately implemented CRM", () => {
  const page = read("native/app/native-crm.tsx")
  assert.match(page, /import \{ Dashboard \} from "@\/components\/crm\/dashboard"/)
  assert.match(page, /<Dashboard/)
  assert.doesNotMatch(page, /NativeInventory|native-inventory|BarcodeScannerModal|localCheckout|openOnlineSection/)
  const dashboard = read("components/crm/dashboard.tsx")
  for (const component of ["KassaScreen", "OfflineSkladScreen", "OfflineKabinetScreen", "OfflineRevisionsScreen", "AppHeader", "AppNav"]) {
    assert.ok(dashboard.includes(component))
  }
  assert.match(dashboard, /onLocalCheckout=/)
  assert.match(read("native/app/layout.tsx"), /from "..\/..\/app\/layout"/)
  assert.match(read("native/app/auth/login/page.tsx"), /app\/auth\/login\/page/)
  assert.match(read("components/shared/pwa-provider.tsx"), /NEXT_PUBLIC_BUILD_TARGET === "native"\) return/)
})

test("native bootstrap restores identity before network work and retains lifecycle integration", () => {
  const page = read("native/app/native-crm.tsx")
  assert.match(page, /getSavedUserSession/)
  assert.match(read("lib/native-connectivity.ts"), /Network\.addListener/)
  assert.match(page, /CapacitorApp\.addListener\("backButton"/)
  assert.match(page, /SplashScreen\.hide/)
  assert.ok(page.indexOf("setIdentity({ profile: saved.profile") < page.indexOf("await supabase.auth.getSession()"))
  assert.match(read("lib/local-db/db.ts"), /session: isNative \? undefined/)
  assert.match(read("lib/supabase/client.ts"), /Preferences\.get/)
})

test("native packaged PWA replaces Next server actions only at the transport boundary", () => {
  const next = read("native/next.config.mjs")
  assert.match(next, /"@\/app\/actions": path.join\(nativeDir, "generated-actions"\)/)
  assert.match(read("scripts/build-native.mjs"), /generate-native-actions/)
  const generator = read("scripts/generate-native-actions.mjs")
  assert.match(generator, /export type \* from/)
  assert.match(generator, /nativeAction<Actions/)
})

test("native scanner still supports Android and iOS hardware with haptic feedback", () => {
  const scanner = read("lib/native-barcode-scanner.ts")
  assert.match(scanner, /Capacitor\.getPlatform\(\) === "ios" \|\| Capacitor\.getPlatform\(\) === "android"/)
  assert.match(scanner, /Haptics\.impact\(\{ style: ImpactStyle\.Light \}\)/)
  assert.match(read("components/crm/screens/kassa/kassa-search.tsx"), /ProductSearch/)
  assert.match(read("components/crm/product-search.tsx"), /BarcodeScannerModal/)
})
