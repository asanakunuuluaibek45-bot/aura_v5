import { test } from "node:test"
import assert from "node:assert/strict"
import {
  bucketStart, buildTimelineEvents, buildTimelinePoints, formatTimelineTime,
  HOUR_MS, makeTimelineWindow, MAX_TIMELINE_POINTS, recommendedGrain,
  shiftBucket, timelineBounds,
} from "../components/screens/otchety/sales-timeline.ts"

const from = Date.parse("2026-10-23T18:00:00Z") // midnight in Bishkek, Oct 24
const range = { from: new Date(from), to: new Date(from + 24 * HOUR_MS) }
const products = new Map([
  ["ring", { id: "ring", category: "Кольца" }],
  ["chain", { id: "chain", category: "Цепи" }],
])
const sale = (overrides = {}) => ({
  id: "sale", created_at: new Date(from + HOUR_MS).toISOString(), total: 320,
  items: [
    { product_id: "ring", price: 100, quantity: 1 },
    { product_id: "chain", price: 300, quantity: 1 },
  ], ...overrides,
})
const refund = (overrides = {}) => ({
  id: "refund", sale_id: "older-sale", product_id: "ring", amount: 40,
  created_at: new Date(from + 2 * HOUR_MS).toISOString(), ...overrides,
})
const sum = (rows, key = "revenue") => rows.reduce((total, row) => total + row[key], 0)

test("receipt totals preserve global discounts/bonuses; category allocations partition total", () => {
  const all = buildTimelineEvents([sale()], [], products, "all", range)
  const rings = buildTimelineEvents([sale()], [], products, "Кольца", range)
  const chains = buildTimelineEvents([sale()], [], products, "Цепи", range)
  assert.equal(sum(all), 320)
  assert.equal(sum(rings), 80)
  assert.equal(sum(chains), 240)
  assert.equal(sum(rings) + sum(chains), sum(all))
  assert.equal(sum(rings, "receipts"), 1)
})

test("refund uses its own date/category, even if its sale predates the report", () => {
  assert.equal(sum(buildTimelineEvents([sale()], [refund()], products, "all", range)), 280)
  assert.equal(sum(buildTimelineEvents([sale()], [refund()], products, "Кольца", range)), 40)
  assert.equal(sum(buildTimelineEvents([sale()], [refund()], products, "Цепи", range)), 240)
  assert.equal(sum(buildTimelineEvents([], [refund()], products, "all", range)), -40)
})

test("exclusive upper boundary and invalid/unconfirmed/deleted events are excluded", () => {
  const rows = buildTimelineEvents([
    sale({ created_at: range.from.toISOString() }),
    sale({ created_at: range.to.toISOString() }),
    sale({ sync_status: "pending" }), sale({ sync_status: "rejected" }),
    sale({ deleted_at: "2026-10-24T00:00:00Z" }), sale({ created_at: "invalid" }),
  ], [refund({ deleted_at: "2026-10-24T00:00:00Z" }), refund({ created_at: "invalid" })], products, "all", range)
  assert.equal(rows.length, 1)
  assert.equal(sum(rows), 320)
})

test("hour/day/week/month buckets are Bishkek-local, not browser-local", () => {
  assert.equal(bucketStart(from + 59 * 60_000, "hour"), from)
  assert.equal(bucketStart(from + 23 * HOUR_MS, "day"), from)
  assert.equal(new Date(bucketStart(from, "week")).toISOString(), "2026-10-18T18:00:00.000Z")
  assert.equal(new Date(bucketStart(from, "month")).toISOString(), "2026-09-30T18:00:00.000Z")
  assert.equal(formatTimelineTime(from, "hour"), "00:00")
})

test("calendar shifts handle Monday weeks, month lengths and year boundaries", () => {
  const jan = Date.parse("2026-12-31T18:00:00Z")
  assert.equal(new Date(shiftBucket(jan, "month", 1)).toISOString(), "2027-01-31T18:00:00.000Z")
  assert.equal(shiftBucket(from, "week", 1) - bucketStart(from, "week"), 7 * 24 * HOUR_MS)
})

test("zero-filled gaps and negative revenue are retained; aggregation preserves totals", () => {
  const events = buildTimelineEvents([sale({ created_at: new Date(from).toISOString() })], [refund()], products, "all", range)
  const points = buildTimelinePoints(events, { from, to: from + 3 * HOUR_MS, grain: "hour" })
  assert.deepEqual(points.map((p) => p.revenue), [320, 0, -40])
  for (const grain of ["hour", "day", "week", "month"]) {
    assert.equal(sum(buildTimelinePoints(events, { from, to: from + 24 * HOUR_MS, grain })), 280)
  }
})

test("long hourly windows are explicitly narrowed to at most 400 buckets", () => {
  const bounds = { from, to: from + 3650 * 24 * HOUR_MS }
  const window = makeTimelineWindow(bounds, bounds.from, bounds.to, "hour")
  const points = buildTimelinePoints([{ timestamp: from, revenue: 1, receipts: 1, refunds: 0 }], window)
  assert.equal(window.grain, "hour")
  assert.equal(points.length, MAX_TIMELINE_POINTS)
  assert.ok(window.from > bounds.from)
  assert.equal(window.to, bounds.to)
  assert.equal(recommendedGrain(bounds.from, bounds.to), "month")
})

test("all-time avoids allocating pre-event history; empty input stays empty", () => {
  const events = buildTimelineEvents([sale()], [], products, "all", range)
  const bounds = timelineBounds(events, { from: new Date(0), to: range.to })
  assert.equal(bounds.from, events[0].timestamp)
  assert.deepEqual(buildTimelinePoints([], { from, to: range.to.getTime(), grain: "day" }), [])
})

test("missing products/zero-priced legacy items remain categorized without NaN", () => {
  const legacy = sale({ total: 12, items: [{ product_id: null, price: 0, quantity: 1 }] })
  const events = buildTimelineEvents([legacy], [refund({ product_id: null, amount: undefined, return_amount: 2 })], products, "Прочее", range)
  assert.equal(sum(events), 10)
  assert.ok(events.every((event) => Object.values(event).every(Number.isFinite)))
})

test("zoom windows clamp to report bounds without invalid or oversized ranges", () => {
  const bounds = { from, to: from + 24 * HOUR_MS }
  for (const [start, end] of [[from - HOUR_MS, from + 99 * HOUR_MS], [from + HOUR_MS, from], [from, from + HOUR_MS]]) {
    const window = makeTimelineWindow(bounds, start, end, "hour")
    assert.ok(window.from >= bounds.from && window.to <= bounds.to && window.to > window.from)
  }
})
