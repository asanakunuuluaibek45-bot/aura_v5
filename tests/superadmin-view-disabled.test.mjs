import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("superadmin tenant-view UI and server-action routes are removed", () => {
  const action = read("../app/actions/superadmin.ts");
  const dashboard = read("../components/dashboard.tsx");
  const shopsPanel = read("../components/screens/superadmin/shops-panel.tsx");
  const nativeContract = read("../lib/native-action-contract.mjs");
  const nativeCrm = read("../native/app/native-crm.tsx");

  assert.doesNotMatch(action, /impersonateShop|getImpersonatedShop/);
  assert.doesNotMatch(dashboard, /impersonat|ImpersonationBanner/);
  assert.doesNotMatch(shopsPanel, /impersonateShop|handleImpersonate|ImpersonationBanner/);
  assert.doesNotMatch(nativeContract, /impersonateShop|getImpersonatedShop/);
  assert.doesNotMatch(nativeCrm, /getImpersonatedShop|impersonatedShop|impersonate/);
});

test("tenant RLS uses the assigned shop and migration clears only temporary contexts", () => {
  const migration = read("../supabase/migrations/013_disable_superadmin_shop_view.sql");
  const schema = read("../supabase/schema.sql");
  const functionStart = schema.indexOf("CREATE FUNCTION public.current_shop_id()");
  const functionEnd = schema.indexOf("CREATE FUNCTION public.delete_product", functionStart);
  const currentShopFunction = schema.slice(functionStart, functionEnd);

  assert.match(migration, /UPDATE public\.profiles[\s\S]*SET impersonated_shop_id = NULL/);
  assert.match(migration, /WHERE role = 'super_admin'[\s\S]*AND impersonated_shop_id IS NOT NULL/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.current_shop_id/);
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.superadmin_impersonate\(uuid\)/);
  assert.match(currentShopFunction, /SELECT shop_id FROM public\.profiles WHERE id = auth\.uid\(\)/);
  assert.doesNotMatch(currentShopFunction, /impersonated_shop_id/);
});

test("superadmin label templates remain in the shared global scope", () => {
  const labels = read("../app/actions/labels.ts");
  assert.match(labels, /profile\.role === "super_admin" \? null : profile\.shop_id/);
});
