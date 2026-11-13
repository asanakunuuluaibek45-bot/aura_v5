export type ScanPoint = { x: number; y: number }
export type OverlayTrack = {
  key: string
  text: string
  points: ScanPoint[]
  lastSeenAt: number
}

export type VideoCoverTransform = {
  scale: number
  offsetX: number
  offsetY: number
}

export const OVERLAY_TRACK_RETENTION_MS = 320
const OVERLAY_TRACK_FADE_START_MS = 120

export function shouldProcessRevisionSku(
  rawSku: string,
  checkedSkus: Set<string>,
  handledSkus: Set<string>,
): boolean {
  const sku = rawSku.trim().toLocaleUpperCase("ru-RU")
  if (!sku || checkedSkus.has(sku) || handledSkus.has(sku)) return false
  handledSkus.add(sku)
  return true
}

export function updateOverlayTrackCache(
  cache: Map<string, OverlayTrack>,
  detections: OverlayTrack[],
  now: number,
  retentionMs = OVERLAY_TRACK_RETENTION_MS,
): OverlayTrack[] {
  for (const detection of detections) {
    if (detection.points.length >= 2) {
      cache.set(detection.key, { ...detection, points: detection.points.map((point) => ({ ...point })) })
    }
  }

  for (const [key, track] of cache) {
    if (now - track.lastSeenAt >= retentionMs) cache.delete(key)
  }

  return [...cache.values()]
}

export function getOverlayTrackOpacity(
  ageMs: number,
  retentionMs = OVERLAY_TRACK_RETENTION_MS,
): number {
  if (ageMs <= OVERLAY_TRACK_FADE_START_MS) return 1
  if (ageMs >= retentionMs) return 0
  return 1 - (ageMs - OVERLAY_TRACK_FADE_START_MS) / (retentionMs - OVERLAY_TRACK_FADE_START_MS)
}

export function getVideoCoverTransform(
  videoWidth: number,
  videoHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): VideoCoverTransform {
  if (videoWidth <= 0 || videoHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 }
  }

  const scale = Math.max(viewportWidth / videoWidth, viewportHeight / videoHeight)
  return {
    scale,
    offsetX: (viewportWidth - videoWidth * scale) / 2,
    offsetY: (viewportHeight - videoHeight * scale) / 2,
  }
}

export function mapVideoPointsToViewport(
  points: ScanPoint[],
  transform: VideoCoverTransform,
): ScanPoint[] {
  return points.map(({ x, y }) => ({
    x: x * transform.scale + transform.offsetX,
    y: y * transform.scale + transform.offsetY,
  }))
}

export function rectangleCorners(
  box: { x: number; y: number; width: number; height: number },
): ScanPoint[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ]
}

/**
 * ZXing's QR detector returns bottom-left, top-left and top-right points.
 * Complete that three-point shape to a quadrilateral; linear formats often
 * return only two points, so give those a small visible rectangular outline.
 */
export function zxingPointsToPolygon(points: ScanPoint[]): ScanPoint[] {
  if (points.length >= 3) {
    const [bottomLeft, topLeft, topRight] = points
    return [
      bottomLeft,
      topLeft,
      topRight,
      {
        x: bottomLeft.x + topRight.x - topLeft.x,
        y: bottomLeft.y + topRight.y - topLeft.y,
      },
    ]
  }

  if (points.length === 2) {
    const [first, second] = points
    const pad = Math.max(12, Math.max(Math.abs(second.x - first.x), Math.abs(second.y - first.y)) * 0.08)
    const left = Math.min(first.x, second.x) - pad
    const right = Math.max(first.x, second.x) + pad
    const top = Math.min(first.y, second.y) - pad
    const bottom = Math.max(first.y, second.y) + pad
    return [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ]
  }

  return []
}
