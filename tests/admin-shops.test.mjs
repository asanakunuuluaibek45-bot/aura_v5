import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  filterAdminShopDirectory,
  isGlobalAdminShop,
  toAdminShopDirectory,
} from "../lib/admin/shop-directory.ts";

test("shop directory exposes only status and non-financial metadata", () => {
  const rows = toAdminShopDirectory([{
    shop_id: "shop-1",
    shop_name: "Аура",
    subscription_status: "active",
    is_frozen: false,
    member_count: 4,
    created_at: "2026-01-01T00:00:00.000Z",
    paid_until: "2027-01-01",
    notes: "private billing note",
    product_units_used: 120,
  }]);

  assert.deepEqual(rows, [{
    shop_id: "shop-1",
    shop_name: "Аура",
    status: "active",
    is_frozen: false,
    member_count: 4,
    created_at: "2026-01-01T00:00:00.000Z",
  }]);
});

test("shop search matches names and IDs without changing the source list", () => {
  const shops = toAdminShopDirectory([
    { shop_id: "shop-A1", shop_name: "Аура", subscription_status: "active", is_frozen: false, member_count: 2, created_at: null },
    { shop_id: "shop-B2", shop_name: "Бриллиант", subscription_status: "trial", is_frozen: false, member_count: 3, created_at: null },
  ]);

  assert.deepEqual(filterAdminShopDirectory(shops, "БРИЛЛ"), [shops[1]]);
  assert.deepEqual(filterAdminShopDirectory(shops, "shop-a1"), [shops[0]]);
  assert.equal(filterAdminShopDirectory(shops, "  ").length, 2);
  assert.equal(shops.length, 2);
});

test("global shop identity is exact and does not match an unknown ID", () => {
  assert.equal(isGlobalAdminShop("global-shop", "global-shop"), true);
  assert.equal(isGlobalAdminShop("tenant-shop", "global-shop"), false);
  assert.equal(isGlobalAdminShop("global-shop", null), false);
});

test("shop cards open guarded Admin details with billing controls, not CRM links", () => {
  const action = readFileSync(new URL("../app/actions/superadmin.ts", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/admin/shops/[shopId]/page.tsx", import.meta.url), "utf8");
  const directory = readFileSync(new URL("../components/admin/admin-shops-directory.tsx", import.meta.url), "utf8");
  const management = readFileSync(new URL("../components/admin/admin-shop-management.tsx", import.meta.url), "utf8");

  assert.match(action, /getPlatformShopDirectory[\s\S]*?requireSuperAdmin\(\)/);
  assert.match(action, /export async function updateShopBilling[\s\S]*?requireSuperAdmin\(\)/);
  assert.match(action, /export async function setShopFrozen[\s\S]*?requireSuperAdmin\(\)/);
  assert.match(detail, /await requireSuperAdminPageAccess\(\)/);
  assert.match(detail, /if \(!shop\) notFound\(\)/);
  assert.doesNotMatch(directory, /setShopFrozen|updateShopBilling|impersonateShop|deleteShop/i);
  assert.match(detail, /getSuperAdminShops/);
  assert.match(detail, /<AdminShopManagement/);
  assert.match(management, /updateShopBilling/);
  assert.match(management, /setShopFrozen/);
  assert.match(management, /if \(isGlobalShop\) return/);
  assert.match(management, /window\.confirm/);
  assert.doesNotMatch(directory, /href="\/crm\/stores"/);
});

test("shop hard deletion is separately confirmed and unavailable for the platform shop", () => {
  const action = readFileSync(new URL("../app/actions/superadmin.ts", import.meta.url), "utf8");
  const management = readFileSync(new URL("../components/admin/admin-shop-management.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/016_platform_admin_management.sql", import.meta.url), "utf8");

  assert.match(action, /deletePlatformShop[\s\S]*?requireSuperAdmin\(\)/);
  assert.match(management, /if \(isGlobalShop\) return/);
  assert.match(management, /window\.prompt/);
  assert.match(management, /window\.confirm/);
  assert.match(migration, /public\.superadmin_delete_shop/);
  assert.match(migration, /Нельзя удалить глобальный магазин платформы/);
});
