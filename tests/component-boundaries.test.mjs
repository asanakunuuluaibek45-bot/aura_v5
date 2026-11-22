import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import test from "node:test"

test("CRM components live under the CRM boundary", () => {
  assert.ok(existsSync("components/crm/dashboard.tsx"))
  assert.ok(existsSync("components/crm/screens/kassa/index.tsx"))
  assert.ok(existsSync("components/crm/admin/admin-nav.tsx"))
})

test("public storefront components live under the public boundary", () => {
  assert.ok(existsSync("components/public/marketplace/product-grid.tsx"))
  assert.ok(existsSync("app/page.tsx"))
  assert.ok(existsSync("app/store/[shopId]/page.tsx"))
  assert.ok(existsSync("app/store/[shopId]/[sku]/page.tsx"))
  assert.equal(existsSync("app/q/[shopId]/[sku]/page.tsx"), false)
})

test("shared UI and brand components are separated from CRM", () => {
  assert.ok(existsSync("components/shared/ui/button.tsx"))
  assert.ok(existsSync("components/shared/brand/golduchet-logo.tsx"))
  assert.ok(existsSync("components/shared/auth/auth-shell.tsx"))
})

test("confirmed unreferenced duplicate entry components are removed", () => {
  assert.equal(existsSync("components/product-dialog.tsx"), false)
  assert.equal(existsSync("components/sales-history.tsx"), false)
})

test("protected product image upload path remains stable", () => {
  assert.ok(existsSync("components/product-images.tsx"))
})
