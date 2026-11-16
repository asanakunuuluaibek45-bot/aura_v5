import test from "node:test"
import assert from "node:assert/strict"
import { dejenContentLeftPx, dejenPageWidthPx } from "../lib/dejen-protocol.mjs"

const page = dejenPageWidthPx(355, 300, 72) // T25x30 at 300 dpi on DP30P

test("non-horizontal labels are centered on DP30P", () => {
  assert.equal(page, 850)
  assert.equal(dejenContentLeftPx(page, 355, false), 247)
})

test("horizontal labels stay anchored left", () => {
  assert.equal(dejenContentLeftPx(page, 355, true), 0)
})
