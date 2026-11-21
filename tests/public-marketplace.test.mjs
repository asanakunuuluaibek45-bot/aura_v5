import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const migration = read("../supabase/migrations/017_public_marketplace_products.sql")
const filterMigration = read("../supabase/migrations/018_public_marketplace_filters.sql")
const schema = read("../supabase/schema.sql")
const action = read("../app/actions/store.ts")
const sessionProxy = read("../lib/supabase/proxy.ts")
const nativeContract = read("../lib/native-action-contract.mjs")
const homePage = read("../app/page.tsx")
const storePage = read("../app/store/[store_id]/page.tsx")
const productGrid = read("../components/public/marketplace/product-grid.tsx")
const appHeader = read("../components/crm/app-header.tsx")
const cabinet = read("../components/crm/screens/kabinet/index.tsx")
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

test("public catalogue filters stay scoped to visible stock and support full pagination", () => {
  assert.match(filterMigration, /CREATE FUNCTION public\.public_marketplace_products_filtered/)
  assert.match(filterMigration, /p\.category = btrim\(_category\)/)
  assert.match(filterMigration, /p\.metal = btrim\(_metal\)/)
  assert.match(filterMigration, /p\.sale_price >= _min_price/)
  assert.match(filterMigration, /p\.sale_price <= _max_price/)
  assert.match(filterMigration, /s\.public_enabled = true/)
  assert.match(filterMigration, /p\.status = 'in_stock'/)
  assert.match(filterMigration, /coalesce\(p\.is_hidden,\s*false\) = false/)
  assert.match(filterMigration, /CREATE FUNCTION public\.public_marketplace_facets/)
  assert.match(filterMigration, /GRANT EXECUTE ON FUNCTION public\.public_marketplace_facets\(uuid\) TO anon,\s*authenticated/)
  assert.match(action, /public_marketplace_products_filtered/)
  assert.match(action, /public_marketplace_facets/)
  assert.match(productGrid, /Цена от, сом/)
  assert.match(productGrid, /Цена до, сом/)
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
  assert.match(homePage, /<ShopDirectory shops={shops} \/>/)
  assert.match(storePage, /getPublicMarketplaceFacets\(store_id\)/)
  assert.match(shopMarketingPage, /href="\/auth\/sign-up"/)
  assert.match(shopMarketingPage, /href="\/crm"/)
})

test("signed-in CRM users can open the public marketplace", () => {
  assert.match(sessionProxy, /const isLoginRoute = path === "\/auth\/login" \|\| path === "\/auth\/login\/"/)
  assert.match(sessionProxy, /if \(user && isLoginRoute\)/)
  assert.doesNotMatch(sessionProxy, /path === "\/" \|\| path === "\/auth\/login"/)
  assert.match(appHeader, /href="\/"/)
})

test("cabinet uses a single-column desktop flow and compact action labels", () => {
  assert.doesNotMatch(cabinet, /xl:grid-cols-12/)
  assert.match(cabinet, /whitespace-nowrap px-3/)
})
