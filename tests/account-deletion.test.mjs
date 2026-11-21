import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildAccountDeletionPlan, getShopProductImagePath } from "../lib/account-deletion.ts"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const shopId = "11111111-1111-4111-8111-111111111111"
const actorId = "22222222-2222-4222-8222-222222222222"
const secondAdminId = "33333333-3333-4333-8333-333333333333"
const sellerId = "44444444-4444-4444-8444-444444444444"

test("deleting one admin keeps the shop and preserves the other admin", () => {
  const plan = buildAccountDeletionPlan(actorId, {
    id: actorId, shop_id: shopId, role: "admin", status: "approved",
  }, [
    { id: actorId, shop_id: shopId, role: "admin", status: "approved" },
    { id: secondAdminId, shop_id: shopId, role: "admin", status: "approved" },
    { id: sellerId, shop_id: shopId, role: "seller", status: "approved" },
  ])

  assert.equal(plan.shopId, shopId)
  assert.equal(plan.deleteShop, false)
  assert.deepEqual(plan.relatedUserIds, [sellerId])
})

test("deleting the final admin removes every other account attached to the shop", () => {
  const pendingId = "55555555-5555-4555-8555-555555555555"
  const plan = buildAccountDeletionPlan(actorId, {
    id: actorId, shop_id: shopId, role: "admin", status: "approved",
  }, [
    { id: actorId, shop_id: shopId, role: "admin", status: "approved" },
    { id: sellerId, shop_id: shopId, role: "seller", status: "approved" },
    { id: pendingId, shop_id: shopId, role: null, status: "pending" },
    { id: secondAdminId, shop_id: "66666666-6666-4666-8666-666666666666", role: "admin", status: "approved" },
  ])

  assert.equal(plan.deleteShop, true)
  assert.deepEqual(plan.relatedUserIds, [sellerId, pendingId])
})

test("seller and unapproved accounts can delete themselves without deleting a shop", () => {
  const seller = buildAccountDeletionPlan(actorId, {
    id: actorId, shop_id: shopId, role: "seller", status: "approved",
  }, [{ id: sellerId, shop_id: shopId, role: "seller", status: "approved" }])
  const pending = buildAccountDeletionPlan(actorId, {
    id: actorId, shop_id: shopId, role: null, status: "pending",
  }, [])

  assert.deepEqual(seller, { shopId, deleteShop: false, relatedUserIds: [] })
  assert.deepEqual(pending, { shopId, deleteShop: false, relatedUserIds: [] })
})

test("product image paths are restricted to this shop and this Supabase project", () => {
  const projectUrl = "https://project.supabase.co"
  const ownPath = `${shopId}/one.webp`
  assert.equal(getShopProductImagePath(ownPath, shopId, projectUrl), ownPath)
  assert.equal(
    getShopProductImagePath(`${projectUrl}/storage/v1/object/public/product-images/${ownPath}`, shopId, projectUrl),
    ownPath,
  )
  assert.equal(
    getShopProductImagePath("https://other.example/storage/v1/object/public/product-images/" + ownPath, shopId, projectUrl),
    null,
  )
  assert.equal(
    getShopProductImagePath(`${projectUrl}/storage/v1/object/public/product-images/${shopId}/../other.webp`, shopId, projectUrl),
    null,
  )
  assert.equal(getShopProductImagePath(`${shopId}/../other.webp`, shopId, projectUrl), null)
  assert.equal(getShopProductImagePath("66666666-6666-4666-8666-666666666666/other.webp", shopId, projectUrl), null)
})

test("Auth deletion is server-only and the native action is explicitly allowlisted", () => {
  const action = read("app/actions/account.ts")
  const contract = read("lib/native-action-contract.mjs")
  const route = read("app/api/native-actions/route.ts")

  assert.match(action, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(action, /auth\.admin\.deleteUser/)
  assert.doesNotMatch(action, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(contract, /account:\s*\["deleteMyAccount"\]/)
  assert.match(route, /body\.module === "account" && body\.action === "deleteMyAccount"/)
})

test("the UI repeats the irreversible warning and exposes deletion before approval", () => {
  const control = read("components/crm/account-deletion-control.tsx")
  const pending = read("components/crm/pending-screen.tsx")
  const cabinet = read("components/crm/screens/kabinet/index.tsx")
  const nativeStartup = read("native/app/native-crm.tsx")
  const login = read("app/auth/login/page.tsx")

  assert.match(control, /Предупреждение 1 из 2/)
  assert.match(control, /Предупреждение 2 из 2/)
  assert.match(control, /аккаунт нельзя восстановить/)
  assert.match(control, /данными и фотографиями/)
  assert.doesNotMatch(control, /DialogDescription asChild/)
  assert.match(pending, /AccountDeletionControl/)
  assert.match(cabinet, /AccountDeletionControl/)
  assert.match(nativeStartup, /!profileError && !profile/)
  assert.match(nativeStartup, /purgeDeletedAccountData\(\)/)
  assert.match(login, /params\.get\("accountDeleted"\) === "1"/)
})

test("the Auth trigger keeps a shop with another admin and removes all shop-scoped data for the last", () => {
  const migration = read("supabase/migrations/016_account_deletion.sql")
  assert.match(migration, /BEFORE DELETE ON auth\.users/)
  assert.match(migration, /SECURITY DEFINER/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /remaining\.role = 'admin'/)
  assert.match(migration, /remaining\.status = 'approved'/)
  assert.match(migration, /DELETE FROM public\.shop_settings WHERE shop_id = v_shop_id/)
  for (const table of [
    "supplier_debt_operations", "sale_returns", "products", "product_unit_usage",
    "action_history", "cash_operations", "cash_reason_presets", "customers",
    "label_templates", "metal_rates", "product_deletion_tombstones", "sales",
    "superadmin_notifications", "supplier_profiles", "store_notifications",
    "platform_announcements", "announcement_view_state",
  ]) {
    assert.match(migration, new RegExp(`DELETE FROM public\\.${table}`), table)
  }
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.cleanup_user_data_before_auth_delete\(\) FROM PUBLIC, anon, authenticated/)
})
