import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

test("native Capacitor builds use packaged local assets and no production server URL", () => {
  const capacitor = read("capacitor.config.ts");
  const next = read("native/next.config.mjs");
  const script = read("scripts/build-native.mjs");

  assert.match(capacitor, /webDir: nativeBuild \? "out" : "public"/);
  assert.doesNotMatch(capacitor, /https:\/\/golduchet\.com\/crm\/pos/);
  assert.match(capacitor, /CAPACITOR_DEV_SERVER_URL/);
  assert.match(next, /output: "export"/);
  assert.match(next, /trailingSlash: true/);
  assert.match(script, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(script, /native", "--webpack"/);
  assert.match(script, /cap", "sync"/);
});

test("native entry is independent of web server actions and does not register a service worker", () => {
  const page = read("native/app/native-crm.tsx");
  const layout = read("native/app/layout.tsx");
  const config = read("lib/supabase/client.ts");
  const database = read("lib/local-db/db.ts");

  assert.match(page, /useLocalCrm/);
  assert.match(page, /localCheckout/);
  assert.match(page, /getSavedUserSession/);
  assert.match(page, /Network\.addListener/);
  assert.match(page, /CapacitorApp\.addListener\("backButton"/);
  assert.match(page, /SplashScreen\.hide/);
  assert.doesNotMatch(page, /@\/app\/actions\//);
  assert.doesNotMatch(layout, /PwaProvider|serviceWorker/);
  assert.match(config, /Preferences\.get/);
  assert.match(config, /Capacitor\.isNativePlatform/);
  assert.match(database, /session: isNative \? undefined/);
});

test("native offline screens use safe areas, touch-sized controls, and readable inputs", () => {
  const css = read("native/app/globals.css");
  const layout = read("native/app/layout.tsx");
  const page = read("native/app/native-crm.tsx");

  assert.match(layout, /viewportFit: "cover"/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /-webkit-tap-highlight-color: transparent/);
  assert.match(css, /font-size: 16px/);
  assert.match(page, /min-h-14/);
});

test("native barcode scanning supports both mobile platforms with a light haptic", () => {
  const scanner = read("lib/native-barcode-scanner.ts");
  const page = read("native/app/native-crm.tsx");

  assert.match(scanner, /Capacitor\.getPlatform\(\) === "ios" \|\| Capacitor\.getPlatform\(\) === "android"/);
  assert.match(scanner, /Haptics\.impact\(\{ style: ImpactStyle\.Light \}\)/);
  assert.match(page, /BarcodeScannerModal/);
});
