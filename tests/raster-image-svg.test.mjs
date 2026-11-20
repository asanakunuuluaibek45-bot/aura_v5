import test from "node:test"
import assert from "node:assert/strict"
import { createRasterSvgContainer } from "../lib/raster-image-svg.ts"

test("raster photo becomes an SVG container with its compressed WebP data preserved", () => {
  const svg = createRasterSvgContainer("data:image/webp;base64,QUJD", 640, 480)
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'))
  assert.ok(svg.includes('viewBox="0 0 640 480"'))
  assert.ok(svg.includes('preserveAspectRatio="xMidYMid meet"'))
  assert.ok(svg.includes('href="data:image/webp;base64,QUJD"'))
  assert.ok(svg.includes('xlink:href="data:image/webp;base64,QUJD"'))
})

test("raster SVG container rejects non-WebP sources and invalid dimensions", () => {
  assert.throws(() => createRasterSvgContainer("data:image/png;base64,QUJD", 640, 480), /WebP/)
  assert.throws(() => createRasterSvgContainer("data:image/webp;base64,QUJD", 0, 480), /размер/)
})
