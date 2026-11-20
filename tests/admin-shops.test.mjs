import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  filterAdminShopDirectory,
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

test("shop pages and data action are guarded and read-only", () => {
  const action = readFileSync(new URL("../app/actions/superadmin.ts", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/admin/shops/[shopId]/page.tsx", import.meta.url), "utf8");
  const directory = readFileSync(new URL("../components/admin/admin-shops-directory.tsx", import.meta.url), "utf8");

  assert.match(action, /getPlatformShopDirectory[\s\S]*?requireSuperAdmin\(\)/);
  assert.match(detail, /await requireSuperAdminPageAccess\(\)/);
  assert.match(detail, /if \(!shop\) notFound\(\)/);
  assert.doesNotMatch(directory, /setShopFrozen|updateShopBilling|impersonateShop|deleteShop/i);
});
