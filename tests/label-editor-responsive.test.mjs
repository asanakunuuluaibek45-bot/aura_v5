import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p) => readFileSync(join(root, p), "utf8")

test("label save and reset dialogs fit mobile screens and explanations open on demand", () => {
  const editor = read("components/screens/sklad/label/label-editor.tsx")
  assert.match(editor, /max-h-[calc(100dvh-1rem)]/)
  assert.match(editor, /w-[calc(100vw-1rem)]/)
  assert.match(editor, /aria-label="Пояснение к сбросу"/)
  assert.match(editor, /aria-label="Пояснение к сохранению"/)
  assert.match(editor, /templateHelpOpen/)
  assert.match(editor, /Сохранённый шаблон магазина/)
})

test("selected objects have solid blue square controls and a blue border", () => {
  const canvas = read("components/screens/sklad/label/hooks/use-fabric-canvas.ts")
  assert.match(canvas, /cornerColor: "#2563eb"/)
  assert.match(canvas, /cornerStyle: "rect"/)
  assert.match(canvas, /transparentCorners: false/)
  assert.match(canvas, /borderColor: "#1d4ed8"/)
  assert.match(canvas, /rotatingPointOffset: 24/)
})

test("photo picker accepts common image formats and keeps SVG import", () => {
  const toolbar = read("components/screens/sklad/label/components/toolbar.tsx")
  const actions = read("components/screens/sklad/label/hooks/use-label-actions.ts")
  assert.match(toolbar, /accept="image\/\*,\.svg,\.heic,\.heif"/)
  assert.match(toolbar, /convertRasterFileToSvg(file)/)
  assert.match(toolbar, /readAsText(file)/)
  assert.match(actions, /preserveAspectRatio/)
  assert.match(actions, /Фото добавлено в SVG-рамку/)
})
