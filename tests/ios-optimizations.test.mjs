import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const read = (path) => readFileSync(join(root, path), "utf8")

test("iOS scanner prefers native ML Kit before asking the WebView for a camera stream", () => {
  const modal = read("components/crm/BarcodeScannerModal.tsx")
  const nativeBranch = modal.indexOf("if (canUseNativeScanner())")
  const webCameraFallback = modal.indexOf("navigator.mediaDevices?.getUserMedia")

  assert.notEqual(nativeBranch, -1)
  assert.notEqual(webCameraFallback, -1)
  assert.ok(nativeBranch < webCameraFallback)
  assert.match(modal, /startNativeScan\(/)
  assert.match(modal, /nativeSession\.toggleTorch\(\)/)
  assert.match(read("lib/native-barcode-scanner.ts"), /facing === "user" \? LensFacing\.Front : LensFacing\.Back/)
})

test("the original drawer keeps its profile menu fixed within the iPhone viewport", () => {
  const nav = read("components/crm/app-nav.tsx")
  const header = read("components/crm/app-header.tsx")

  assert.doesNotMatch(nav, /MobileBottomNav/)
  assert.match(nav, /h-\[100dvh\] max-h-\[100dvh\] min-h-0 flex-col/)
  assert.match(nav, /min-h-0 flex-1 overflow-y-auto overscroll-contain/)
  assert.match(nav, /relative z-10 shrink-0 border-t border-border bg-background/)
  assert.match(nav, /aria-label="Открыть меню профиля"/)
  assert.match(nav, /DropdownMenuContent align="end" side="top" sideOffset=\{8\}/)
  assert.match(nav, /env\(safe-area-inset-bottom\)/)
  assert.match(header, /sticky top-0 z-40 isolate border-b border-border bg-background/)
  assert.doesNotMatch(header, /bg-background\/95 backdrop-blur/)
})

test("the Xcode app icon catalog references correctly sized PNG files", () => {
  const catalogPath = "resources/ios/AppIcon.appiconset/Contents.json"
  const catalog = JSON.parse(read(catalogPath))

  assert.ok(catalog.images.some((image) => image.idiom === "ios-marketing" && image.size === "1024x1024"))
  for (const image of catalog.images) {
    const filename = join(root, "resources/ios/AppIcon.appiconset", image.filename)
    const png = readFileSync(filename)
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a", `${image.filename} is a PNG`)
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    const scale = Number.parseInt(image.scale, 10)
    const [logicalWidth, logicalHeight] = image.size.split("x").map(Number)
    assert.equal(width, logicalWidth * scale, image.filename)
    assert.equal(height, logicalHeight * scale, image.filename)
  }
})
