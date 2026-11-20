import test from "node:test"
import assert from "node:assert/strict"
import { convertRgbaToMonochrome } from "../lib/monochrome-image.ts"

const rgba = (values) => new Uint8ClampedArray(values.flatMap(([r,g,b,a=255]) => [r,g,b,a]))

test("black and white input stays black and white", () => {
  const pixels = rgba([[0,0,0],[255,255,255]])
  convertRgbaToMonochrome(pixels, 2, 1)
  assert.deepEqual([...pixels], [0,0,0,255,255,255,255,255])
})

test("mid-tone photo detail dithers into both black and white instead of a solid black block", () => {
  const pixels = rgba(Array.from({ length: 64 }, () => [128,128,128]))
  convertRgbaToMonochrome(pixels, 8, 8)
  const levels = new Set(Array.from({ length: 64 }, (_, i) => pixels[i * 4]))
  assert.deepEqual([...levels].sort((a,b) => a-b), [0,255])
  for (let i = 0; i < pixels.length; i += 4) {
    assert.equal(pixels[i], pixels[i + 1])
    assert.equal(pixels[i], pixels[i + 2])
    assert.equal(pixels[i + 3], 255)
  }
})

test("transparent photo pixels become white for thermal printing", () => {
  const pixels = rgba([[0,0,0,0]])
  convertRgbaToMonochrome(pixels, 1, 1)
  assert.deepEqual([...pixels], [255,255,255,255])
})

test("invalid pixel dimensions are rejected", () => {
  assert.throws(() => convertRgbaToMonochrome(new Uint8ClampedArray(4), 2, 2), /размеры/)
})
