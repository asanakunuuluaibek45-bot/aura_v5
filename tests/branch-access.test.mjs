import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { getBranchContext } from "../lib/supabase/current-shop.ts"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

test("server branch context uses only the authorized database response", async () => {
  const context = await getBranchContext({
    rpc: async (name) => {
      assert.equal(name, "get_branch_context")
      return {
        data: [
          { business_id: "biz-a", shop_id: "branch-a", shop_name: "Первый", is_active: false },
          { business_id: "biz-a", shop_id: "branch-b", shop_name: "Второй", is_active: true },
          { business_id: null, shop_id: "forged", shop_name: "Нельзя", is_active: true },
        ],
        error: null,
      }
    },
  })

  assert.deepEqual(context, {
    businessId: "biz-a",
    activeShopId: "branch-b",
    branches: [
      { businessId: "biz-a", shopId: "branch-a", shopName: "Первый", isActive: false },
      { businessId: "biz-a", shopId: "branch-b", shopName: "Второй", isActive: true },
    ],
  })
})

test("server branch context fails closed when the authorization RPC fails", async () => {
  await assert.rejects(
    getBranchContext({
      rpc: async () => ({ data: null, error: { message: "permission denied" } }),
    }),
    /Не удалось получить доступные филиалы/,
  )
})

test("legacy shops and user access are mapped without replacing shop identity", () => {
  const migration = read("../supabase/migrations/021_branch_access_and_transfers.sql")
  assert.match(migration, /business_id = shop_id/)
  assert.match(migration, /active_shop_id = coalesce\(p\.active_shop_id, p\.shop_id\)/)
  assert.match(migration, /INSERT INTO public\.profile_branch_access[\s\S]*?FROM public\.profiles AS p/)
  assert.match(migration, /FOREIGN KEY \(business_id, shop_id\)[\s\S]*?shop_settings \(business_id, shop_id\)/)
  assert.match(migration, /FUNCTION public\.has_branch_access\(_shop_id uuid\)[\s\S]*?a\.business_id = p\.business_id/)
  assert.match(migration, /public\.get_branch_context\(\)[\s\S]*?p\.status::text = 'approved'/)
  assert.match(migration, /CREATE POLICY businesses_member_read[\s\S]*?public\.has_business_access\(id\)/)
  assert.match(migration, /CREATE POLICY shop_settings_accessible_branches_read[\s\S]*?public\.has_branch_access\(shop_id\)/)
})

test("QR identity stays immutable while current location is transfer-controlled", () => {
  const migration = read("../supabase/migrations/021_branch_access_and_transfers.sql")
  const contract = read("../docs/branch-data-contract.md")
  assert.match(migration, /NEW\.shop_id IS DISTINCT FROM OLD\.shop_id[\s\S]*?Исходный магазин QR-метки неизменяем/)
  assert.match(migration, /current_location_shop_id IS DISTINCT FROM OLD\.current_location_shop_id[\s\S]*?app\.branch_transfer_operation/)
  assert.match(migration, /SET current_location_shop_id = v_transfer\.destination_shop_id/)
  assert.match(contract, /`products\.shop_id` is immutable/)
  assert.match(contract, /`products\.current_location_shop_id` is the server-checked/)
})

test("transfers enforce business boundaries, idempotency, locking, and audit", () => {
  const migration = read("../supabase/migrations/021_branch_access_and_transfers.sql")
  const followUpMigration = read("../supabase/migrations/023_branch_transfer_partial_receipt_and_cancel.sql")
  const schema = read("../supabase/schema.sql")
  assert.match(migration, /branch_transfers_request_key UNIQUE \(business_id, created_by, client_request_id\)/)
  assert.match(migration, /branch_transfer_items_one_active_transfer_idx[\s\S]*?WHERE status = 'in_transit'/)
  assert.match(migration, /ORDER BY p\.id\s+FOR UPDATE/)
  assert.match(migration, /Ключ запроса уже использован для другого перемещения/)
  assert.match(migration, /branch_transfer_audit[\s\S]*?'started'[\s\S]*?'received'/)
  assert.match(migration, /Нет доступа к филиалу-получателю/)
  assert.match(migration, /Товар в пути или в другом филиале нельзя продать здесь/)
  assert.match(migration, /FOREIGN KEY \(business_id, destination_shop_id\)[\s\S]*?shop_settings \(business_id, shop_id\)/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.businesses, public\.profile_branch_access,[\s\S]*?FROM PUBLIC, anon, authenticated/)
  assert.match(schema, /\\ir migrations\/021_branch_access_and_transfers\.sql/)
  assert.match(schema, /\\ir migrations\/023_branch_transfer_partial_receipt_and_cancel\.sql/)
  assert.match(schema, /\\ir migrations\/024_branch_transfer_scan_access\.sql/)
  assert.match(followUpMigration, /FUNCTION public\.receive_branch_transfer_items\(/)
  assert.match(followUpMigration, /FUNCTION public\.cancel_branch_transfer\(/)
  assert.match(followUpMigration, /client_request_id/)
  assert.match(followUpMigration, /partially_received/)
  assert.match(followUpMigration, /partially_cancelled/)
  const scanMigration = read("../supabase/migrations/024_branch_transfer_scan_access.sql")
  assert.match(scanMigration, /FUNCTION public\.get_branch_transfer_details\(/)
  assert.match(scanMigration, /FUNCTION public\.resolve_branch_transfer_scan\(/)
  assert.match(scanMigration, /v_active_shop_id NOT IN \(v_transfer\.source_shop_id, v_transfer\.destination_shop_id\)/)
  assert.doesNotMatch(scanMigration, /CREATE POLICY[\s\S]*?products/i)
  assert.doesNotMatch(scanMigration, /purchase_price|selling_price|cost_price/i)
})

test("transfer controls appear only for users with multiple accessible branches", () => {
  const inventory = read("../components/crm/screens/sklad/index.tsx")
  const actions = read("../app/actions/transfers.ts")

  assert.match(inventory, /hasMultiBranchAccess\(branchContext\) && <BranchTransferDialog context=\{branchContext\} \/>/)
  assert.match(actions, /context\.profile\.status !== "approved"/)
  assert.match(actions, /branchContext\.branches\.find/)
  assert.match(actions, /rpc\("begin_branch_transfer"/)
  assert.match(actions, /rpc\("receive_branch_transfer_items"/)
  assert.match(actions, /rpc\("cancel_branch_transfer"/)
  assert.match(actions, /rpc\("resolve_branch_transfer_scan"/)
})

test("request context exposes the database-authorized branch context", () => {
  const context = read("../lib/supabase/request-context.ts")
  assert.match(context, /getBranchContext\(supabase\)/)
  assert.match(context, /shopId: branchContext\.activeShopId/)
  assert.match(context, /branchContext,/)
  assert.doesNotMatch(context, /profile\.shop_id \?\? null/)
})

test("product actions scope stock by active location and preserve QR source identity", () => {
  const actions = read("../app/actions/products.ts")
  const article = read("../app/actions/article.ts")
  const migration = read("../supabase/migrations/022_branch_aware_products_and_sales.sql")

  assert.match(actions, /branchContext\.activeShopId !== shopId/)
  assert.match(actions, /business_id: businessId,[\s\S]*current_location_shop_id: shopId/)
  assert.match(actions, /\.eq\("current_location_shop_id", shopId\)/)
  assert.match(article, /business_id: branchContext\.businessId,[\s\S]*current_location_shop_id: shopId/)
  assert.match(migration, /DROP POLICY IF EXISTS "products: shop read"/)
  assert.match(migration, /current_location_shop_id = public\.current_shop_id\(\)/)
  assert.match(migration, /product keeps its original shop_id for QR identity/i)
  assert.match(read("../supabase/schema.sql"), /\\ir migrations\/022_branch_aware_products_and_sales\.sql/)
})

test("local POS cache and product sync follow the active physical branch", () => {
  const dashboard = read("../components/crm/dashboard.tsx")
  const localCrm = read("../lib/local-db/use-local-crm.ts")
  const sync = read("../lib/sync/sync-engine.ts")

  assert.match(dashboard, /branchContext\.activeShopId \?\? profile\.shop_id/)
  assert.match(localCrm, /product\.current_location_shop_id \?\? product\.shop_id/)
  assert.match(sync, /spec\.table === 'products' \? 'current_location_shop_id' : 'shop_id'/)
  assert.equal((sync.match(/\.eq\(shopColumn, shopId\)/g) ?? []).length, 2)
  assert.match(sync, /\.eq\('current_location_shop_id', item\.shop_id\)/)
})

test("branch sale rules require persisted receipt and report safe rejection reasons", () => {
  const migration = read("../supabase/migrations/022_branch_aware_products_and_sales.sql")
  const transferMigration = read("../supabase/migrations/023_branch_transfer_partial_receipt_and_cancel.sql")
  const transferSaleHelper = transferMigration
    .split("CREATE OR REPLACE FUNCTION public.branch_sale_product_failure")[1]
    .split("\n$$;")[0]
  const sales = read("../app/actions/sales.ts")
  const originalSale = read("../supabase/migrations/001_customer_credit_sales.sql")

  assert.equal((originalSale.match(/p\.shop_id = v_shop_id/g) ?? []).length, 2)
  assert.match(originalSale, /IF NOT FOUND OR v_profile\.status::text <> 'approved' OR v_shop_id IS NULL THEN/)
  assert.match(migration, /public\.branch_sale_product_failure/)
  assert.match(migration, /public\.has_branch_access\(v_shop_id\)/)
  assert.match(migration, /p\.current_location_shop_id = v_shop_id/)
  assert.match(migration, /i\.qr_shop_id = p\.shop_id/)
  assert.match(migration, /i\.status = 'received'/)
  assert.match(migration, /t\.status = 'received'/)
  assert.match(transferSaleHelper, /i\.status = 'received'[\s\S]*?t\.destination_shop_id = _shop_id/)
  assert.doesNotMatch(transferSaleHelper, /t\.status = 'received'/)
  assert.match(migration, /t\.destination_shop_id = v_shop_id/)
  assert.match(migration, /'awaiting_receipt'/)
  assert.match(migration, /'wrong_branch'/)
  assert.match(migration, /'foreign_business'/)
  assert.match(sales, /awaiting_receipt:[\s\S]*?wrong_branch:[\s\S]*?foreign_business:/)
})
