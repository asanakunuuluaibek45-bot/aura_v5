import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const migration = read("../supabase/migrations/017_public_marketplace_products.sql")
const schema = read("../supabase/schema.sql")
const action = read("../app/actions/store.ts")
const nativeContract = read("../lib/native-action-contract.mjs")
const homePage = read("../app/page.tsx")
const storePage = read("../app/store/[store_id]/page.tsx")
const productGrid = read("../components/public/marketplace/product-grid.tsx")
const shopMarketingPage = read("../app/for-shops/page.tsx")

test("marketplace paging only returns visible, in-stock public products", () => {
  assert.match(migration, /s\.public_enabled\s*=\s*true/)
  assert.match(migration, /p\.status\s*=\s*'in_stock'/)
  assert.match(migration, /coalesce\(p\.is_hidden,\s*false\)\s*=\s*false/)
  assert.match(migration, /ORDER BY p\.created_at DESC,\s*p\.id DESC/)
  assert.match(migration, /p\.created_at,\s*p\.id\)\s*<\s*\(_before_created_at,\s*_before_id\)/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO anon,\s*authenticated/)
  assert.match(schema, /CREATE FUNCTION public\.public_marketplace_products/)
  assert.match(schema, /REVOKE ALL ON FUNCTION public\.public_marketplace_products/)
})

test("pagination action remains additive and registered for native clients", () => {
  assert.match(action, /export async function getPublicShopProducts\(/)
  assert.match(action, /export async function getPublicMarketplaceProducts\(/)
  assert.match(action, /public_marketplace_products/)
  assert.match(action, /public_shop_products/)
  assert.match(nativeContract, /"getPublicMarketplaceProducts"/)
})

test("public routes show searchable products without changing CRM routes", () => {
  assert.match(homePage, /getPublicMarketplaceProducts\(null,\s*24\)/)
  assert.match(homePage, /href="#products"/)
  assert.match(storePage, /isPublicShopEnabled\(store_id\)/)
  assert.match(storePage, /<PublicProductGrid/)
  assert.match(productGrid, /IntersectionObserver/)
  assert.match(productGrid, /Показать ещё/)
  assert.match(productGrid, /getPublicMarketplaceProducts/)
  assert.match(shopMarketingPage, /href="\/auth\/sign-up"/)
  assert.match(shopMarketingPage, /href="\/crm"/)
})
