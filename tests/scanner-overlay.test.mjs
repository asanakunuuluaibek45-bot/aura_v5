import test from "node:test"
import assert from "node:assert/strict"
import {
  getVideoCoverTransform,
  mapVideoPointsToViewport,
  rectangleCorners,
  zxingPointsToPolygon,
} from "../lib/scanner-overlay.ts"

test("cover transform maps corners while cropping the overflowed video axis", () => {
  const transform = getVideoCoverTransform(1920, 1080, 400, 400)
  assert.equal(transform.scale, 400 / 1080)
  assert.equal(transform.offsetX, -transform.scale * 420)
  assert.equal(transform.offsetY, 0)
  assert.deepEqual(
    mapVideoPointsToViewport([{ x: 420, y: 0 }, { x: 1500, y: 1080 }], transform),
    [{ x: 0, y: 0 }, { x: 400, y: 400 }],
  )
})

test("cover transform leaves no crop for matching aspect ratios", () => {
  assert.deepEqual(getVideoCoverTransform(1280, 720, 640, 360), {
    scale: 0.5,
    offsetX: 0,
    offsetY: 0,
  })
})

test("barcode bounding boxes become four canvas corners", () => {
  assert.deepEqual(rectangleCorners({ x: 10, y: 20, width: 30, height: 40 }), [
    { x: 10, y: 20 },
    { x: 40, y: 20 },
    { x: 40, y: 60 },
    { x: 10, y: 60 },
  ])
})

test("ZXing's three QR points are completed to a four-corner polygon", () => {
  assert.deepEqual(zxingPointsToPolygon([
    { x: 10, y: 30 },
    { x: 10, y: 10 },
    { x: 30, y: 10 },
  ]), [
    { x: 10, y: 30 },
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 30, y: 30 },
  ])
})

test("ZXing's two linear-code points receive a visible box", () => {
  const polygon = zxingPointsToPolygon([{ x: 10, y: 10 }, { x: 90, y: 10 }])
  assert.equal(polygon.length, 4)
  assert.ok(polygon[0].y < 10)
  assert.ok(polygon[2].y > 10)
})
