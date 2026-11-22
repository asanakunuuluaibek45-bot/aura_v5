import assert from "node:assert/strict"
import test from "node:test"
import { parseQrCode } from "../lib/qr-code.ts"

test("label QR separates shop id from the product SKU", () => {
  assert.deepEqual(parseQrCode("12/BR00007"), { shopSeqId: 12, sku: "BR00007" })
})

test("plain barcode payload remains a searchable SKU", () => {
  assert.deepEqual(parseQrCode("RY00042"), { shopSeqId: null, sku: "RY00042" })
})


test("flat store QR URL resolves the numeric shop and SKU", () => {
  assert.deepEqual(parseQrCode("https://gold.example/store/6/EY00094"), { shopSeqId: 6, sku: "EY00094" })
})

test("legacy q URL remains parseable during the redirect transition", () => {
  assert.deepEqual(parseQrCode("https://gold.example/q/6/ey00094"), { shopSeqId: 6, sku: "EY00094" })
})

test("flat store product UUID remains a valid article", () => {
  assert.deepEqual(parseQrCode("https://gold.example/store/f3f1fe94-ebb5-49f5-a3e3-fc8c865de825/812cd73d-d7b4-46d1-8a0c-433cb850b84c"), { shopSeqId: null, sku: "812CD73D-D7B4-46D1-8A0C-433CB850B84C" })
})
