import test from "node:test"
import assert from "node:assert/strict"
import {
  getVideoCoverTransform,
  getOverlayTrackOpacity,
  mapVideoPointsToViewport,
  rectangleCorners,
  shouldProcessRevisionSku,
  updateOverlayTrackCache,
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

test("last known label frame stays available across missed camera frames", () => {
  const cache = new Map()
  const detection = {
    key: "ring-42",
    text: "4/RING-42",
    points: rectangleCorners({ x: 12, y: 20, width: 80, height: 70 }),
    lastSeenAt: 1_000,
  }
  updateOverlayTrackCache(cache, [detection], 1_000)
  const remembered = updateOverlayTrackCache(cache, [], 1_200)
  assert.equal(remembered.length, 1)
  assert.equal(remembered[0].key, "ring-42")
  assert.deepEqual(remembered[0].points, detection.points)
})

test("a newly read position replaces the remembered frame and expires after its retention window", () => {
  const cache = new Map()
  updateOverlayTrackCache(cache, [{
    key: "ring-42",
    text: "4/RING-42",
    points: rectangleCorners({ x: 12, y: 20, width: 80, height: 70 }),
    lastSeenAt: 1_000,
  }], 1_000)
  const moved = rectangleCorners({ x: 30, y: 40, width: 80, height: 70 })
  updateOverlayTrackCache(cache, [{
    key: "ring-42",
    text: "4/RING-42",
    points: moved,
    lastSeenAt: 5_000,
  }], 5_000)
  assert.deepEqual(updateOverlayTrackCache(cache, [], 5_200)[0].points, moved)
  assert.equal(updateOverlayTrackCache(cache, [], 5_321).length, 0)
})

test("remembered frame fades gradually before it expires", () => {
  assert.equal(getOverlayTrackOpacity(100), 1)
  assert.ok(getOverlayTrackOpacity(220) > 0 && getOverlayTrackOpacity(220) < 1)
  assert.equal(getOverlayTrackOpacity(320), 0)
})

test("a remembered SKU is sent to onScan once per scanner session", () => {
  const checked = new Set(["READY-1"])
  const handled = new Set()
  assert.equal(shouldProcessRevisionSku(" ring-42 ", checked, handled), true)
  assert.equal(shouldProcessRevisionSku("RING-42", checked, handled), false)
  assert.equal(shouldProcessRevisionSku("ready-1", checked, handled), false)
  assert.equal(handled.has("RING-42"), true)
})
