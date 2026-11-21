import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the users page and all account mutations are guarded as platform-admin operations", () => {
  const page = read("../app/admin/users/page.tsx");
  const actions = read("../app/actions/superadmin.ts");
  const nav = read("../components/admin/admin-nav.tsx");

  assert.match(page, /await requireSuperAdminPageAccess\(\)/);
  assert.match(page, /getPlatformUsers\(\)/);
  assert.match(nav, /href="\/admin\/users"/);
  assert.match(actions, /getPlatformUsers[\s\S]*?requireSuperAdmin\(\)/);
  assert.match(actions, /updatePlatformUser[\s\S]*?requireSuperAdmin\(\)/);
  assert.match(actions, /deletePlatformUser[\s\S]*?requireSuperAdmin\(\)/);
});

test("user management exposes role, name, phone, access status and shop assignment", () => {
  const component = read("../components/admin/admin-users-directory.tsx");
  const migration = read("../supabase/migrations/016_platform_admin_management.sql");

  assert.match(component, /Изменить данные/);
  assert.match(component, /admin-user-name/);
  assert.match(component, /admin-user-phone/);
  assert.match(component, /admin-user-role/);
  assert.match(component, /admin-user-status/);
  assert.match(component, /admin-user-shop/);
  assert.match(component, /onValueChange=\{\(value\) => setShopId\(value \?\? "unassigned"\)\}/);
  assert.match(migration, /public\.superadmin_update_user/);
  assert.match(migration, /role = v_role/);
  assert.match(migration, /status = v_status/);
  assert.match(migration, /full_name = NULLIF/);
  assert.match(migration, /phone = NULLIF/);
  assert.match(migration, /Нельзя перенести аккаунт с товарами или финансовой историей/);
});

test("account deletion preserves business history and protects the last owner", () => {
  const migration = read("../supabase/migrations/016_platform_admin_management.sql");
  const component = read("../components/admin/admin-users-directory.tsx");

  assert.match(migration, /public\.sales WHERE seller_id = _user_id/);
  assert.match(migration, /public\.products WHERE created_by = _user_id/);
  assert.match(migration, /public\.cash_operations WHERE created_by = _user_id/);
  assert.match(migration, /public\.cash_reason_presets WHERE created_by = _user_id/);
  assert.match(migration, /public\.sale_returns WHERE created_by = _user_id/);
  assert.match(migration, /Нельзя удалить последнего действующего суперадминистратора/);
  assert.match(migration, /Нельзя менять собственные роль, статус или магазин/);
  assert.match(migration, /DELETE FROM auth\.users WHERE id = _user_id/);
  assert.match(component, /user\.has_business_data/);
  assert.match(component, /Нельзя удалить собственный аккаунт/);
});

test("shop deletion is transactional, retains disabled user identities and protects the global shop", () => {
  const migration = read("../supabase/migrations/016_platform_admin_management.sql");
  const component = read("../components/admin/admin-shop-management.tsx");
  const action = read("../app/actions/superadmin.ts");

  assert.match(migration, /public\.superadmin_delete_shop/);
  assert.match(migration, /Нельзя удалить глобальный магазин платформы/);
  assert.match(migration, /SET status = 'rejected'[\s\S]*?role = NULL[\s\S]*?shop_id = NULL/);
  assert.match(migration, /pg_catalog\.pg_attribute/);
  assert.match(migration, /platform_admin_shop_storage_delete/);
  assert.match(migration, /Сначала удалите фотографии магазина/);
  assert.match(migration, /DELETE FROM public\.shop_settings WHERE shop_id = _shop_id/);
  assert.match(component, /Введите название магазина/);
  assert.match(component, /deletePlatformShop\(shop\.shop_id\)/);
  assert.match(action, /superadmin_authorize_shop_storage_cleanup/);
  assert.match(action, /getShopStoragePaths\(supabase, shopId\)/);
  assert.match(action, /\.remove\(paths\.slice\(offset, offset \+ 100\)\)/);
});

test("new privileged RPCs are executable by authenticated users but not anonymous users", () => {
  const migration = read("../supabase/migrations/016_platform_admin_management.sql");

  assert.match(migration, /REVOKE ALL ON FUNCTION public\.superadmin_list_users\(\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.superadmin_list_users\(\) TO authenticated/);
  assert.match(migration, /IF NOT public\.is_super_admin\(\) THEN/g);
  assert.match(migration, /platform_admin_action_log/);
});
