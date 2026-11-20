import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p) => readFileSync(join(root, p), "utf8")

test("label save and reset dialogs fit mobile screens and explanations open on demand", () => {
  const editor = read("components/screens/sklad/label/label-editor.tsx")
  assert.ok(editor.includes("max-h-[calc(100dvh-1rem)]"))
  assert.ok(editor.includes("w-[calc(100vw-1rem)]"))
  assert.ok(editor.includes('aria-label="Пояснение к сбросу"'))
  assert.ok(editor.includes('aria-label="Пояснение к сохранению"'))
  assert.ok(editor.includes("templateHelpOpen"))
  assert.ok(editor.includes("Восстановить сохранённый шаблон магазина"))
})

test("selected objects have solid blue square controls and a blue border", () => {
  const canvas = read("components/screens/sklad/label/hooks/use-fabric-canvas.ts")
  assert.ok(canvas.includes('cornerColor: "#2563eb"'))
  assert.ok(canvas.includes('cornerStyle: "rect"'))
  assert.ok(canvas.includes("transparentCorners: false"))
  assert.ok(canvas.includes('borderColor: "#1d4ed8"'))
  assert.ok(canvas.includes("rotatingPointOffset: 24"))
})

test("photo picker accepts common image formats and keeps SVG import", () => {
  const toolbar = read("components/screens/sklad/label/components/toolbar.tsx")
  const actions = read("components/screens/sklad/label/hooks/use-label-actions.ts")
  assert.ok(toolbar.includes('accept="image/*,.svg,.heic,.heif"'))
  assert.ok(toolbar.includes("onLoadPhoto(file)"))
  assert.ok(toolbar.includes("onLoadSvgFrame"))
  assert.ok(toolbar.includes("readAsText(file)"))
  assert.ok(actions.includes("compressToWebp(file, { monochrome: true })"))
  assert.ok(actions.includes("FabricImage.fromURL(dataUrl)"))
  assert.ok(actions.includes("label-photo"))
  const template = read("components/screens/sklad/label/data/template.ts")
  assert.ok(template.includes("item.src = src"))
  assert.ok(template.includes("applyTemplateImages"))
  const image = read("lib/image.ts")
  assert.ok(image.includes("convertRgbaToMonochrome(pixels.data, w, h)"))
})
