import assert from "node:assert/strict"
import test from "node:test"
import { parseQrCode } from "../lib/qr-code.ts"

test("label QR separates shop id from the product SKU", () => {
  assert.deepEqual(parseQrCode("12/BR00007"), { shopSeqId: 12, sku: "BR00007" })
})

test("plain barcode payload remains a searchable SKU", () => {
  assert.deepEqual(parseQrCode("RY00042"), { shopSeqId: null, sku: "RY00042" })
})
