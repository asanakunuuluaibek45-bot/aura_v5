import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("email and Google registration both require a shop address", () => {
  const email = read("app/auth/sign-up/page.tsx")
  const google = read("app/auth/complete-profile/page.tsx")
  const migration = read("supabase/migrations/027_admin_shop_profile_and_required_address.sql")

  assert.match(email, /id="shopAddress"[\s\S]*?required/)
  assert.match(email, /shop_address:\s*shopAddress\.trim\(\)/)
  assert.match(google, /id="googleShopAddress"[\s\S]*?required/)
  assert.match(google, /_shop_address:\s*shopAddress\.trim\(\)/)
  assert.match(migration, /v_shop_address IS NULL OR length\(v_shop_address\) > 240/)
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.complete_google_registration\(text, text, text, text\)/)
})

test("admin profile updates are limited to own contact and active authorized branch", () => {
  const action = read("app/actions/cabinet.ts")
  const form = read("components/crm/screens/kabinet/shop-profile-form.tsx")
  const migration = read("supabase/migrations/027_admin_shop_profile_and_required_address.sql")
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.save_active_shop_admin_profile")
  const end = migration.indexOf("$$;", start)
  const fn = migration.slice(start, end)

  assert.match(action, /profile\.role !== "admin"/)
  assert.match(action, /save_active_shop_admin_profile/)
  assert.match(form, /Адрес активного магазина/)
  assert.match(fn, /auth\.uid\(\)/)
  assert.match(fn, /public\.current_shop_id\(\)/)
  assert.match(fn, /public\.has_branch_access\(v_shop_id\)/)
  assert.match(fn, /public\.is_business_admin\(v_business_id\)/)
  assert.match(fn, /UPDATE public\.profiles SET full_name = v_full_name, phone = v_phone WHERE id = v_user_id/)
  assert.match(fn, /WHERE shop_id = v_shop_id AND business_id = v_business_id/)
  assert.doesNotMatch(fn, /_shop_id uuid/)
})
