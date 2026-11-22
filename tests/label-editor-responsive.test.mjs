import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p) => readFileSync(join(root, p), "utf8")

test("label save and reset dialogs fit mobile screens and explanations open on demand", () => {
  const editor = read("components/crm/screens/sklad/label/label-editor.tsx")
  assert.ok(editor.includes("max-h-[calc(100dvh-1rem)]"))
  assert.ok(editor.includes("w-[calc(100vw-1rem)]"))
  assert.ok(editor.includes('aria-label="Пояснение к сбросу"'))
  assert.ok(editor.includes('aria-label="Пояснение к сохранению"'))
  assert.ok(editor.includes("templateHelpOpen"))
  assert.ok(editor.includes("Восстановить сохранённый шаблон магазина"))
})

test("selected objects have solid blue square controls and a blue border", () => {
  const canvas = read("components/crm/screens/sklad/label/hooks/use-fabric-canvas.ts")
  assert.ok(canvas.includes('cornerColor: "#2563eb"'))
  assert.ok(canvas.includes('cornerStyle: "rect"'))
  assert.ok(canvas.includes("transparentCorners: false"))
  assert.ok(canvas.includes('borderColor: "#1d4ed8"'))
  assert.ok(canvas.includes("rotatingPointOffset: 24"))
})

test("photo picker accepts common image formats and keeps SVG import", () => {
  const toolbar = read("components/crm/screens/sklad/label/components/toolbar.tsx")
  const actions = read("components/crm/screens/sklad/label/hooks/use-label-actions.ts")
  assert.ok(toolbar.includes('accept="image/*,.svg,.heic,.heif"'))
  assert.ok(toolbar.includes("onLoadPhoto(file)"))
  assert.ok(toolbar.includes("onLoadSvgFrame"))
  assert.ok(toolbar.includes("readAsText(file)"))
  assert.ok(actions.includes("compressToWebp(file, { monochrome: true })"))
  assert.ok(actions.includes("FabricImage.fromURL(dataUrl)"))
  assert.ok(actions.includes("label-photo"))
  const template = read("components/crm/screens/sklad/label/data/template.ts")
  assert.ok(template.includes("item.src = src"))
  assert.ok(template.includes("applyTemplateImages"))
  const image = read("lib/image.ts")
  assert.ok(image.includes('convertRgbaToMonochrome(pixels.data, w, h, { mode: "dither" })'))
})

test("template confirmation dialogs fit mobile without internal scrolling", () => {
  const editor = read("components/crm/screens/sklad/label/label-editor.tsx")
  const start = editor.indexOf('<DialogContent\n          className="z-[10101]')
  const end = editor.indexOf("</DialogContent>", start)
  assert.ok(start >= 0 && end > start, "template dialog markup should be present")
  const dialog = editor.slice(start, end)
  assert.ok(dialog.includes("overflow-hidden"))
  assert.ok(dialog.includes("overscroll-none"))
  assert.ok(!dialog.includes("overflow-y-auto"))
  assert.ok(dialog.includes("showCloseButton={false}"))
  assert.ok(dialog.includes("grid-cols-2"), "reset choices should use compact paired controls")
  assert.ok(dialog.includes("line-clamp-2"), "long status messages should not create a scrolling dialog")
})
