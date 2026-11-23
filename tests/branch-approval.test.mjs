import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

test("the CRM header displays only the active shop name", () => {
  const control = read("../components/crm/branch-control.tsx")
  const start = control.indexOf("const trigger = (")
  const end = control.indexOf("if (!canOpen)", start)
  const trigger = control.slice(start, end)
  const staticLabel = control.slice(end, control.indexOf("return (\n    <Dialog", end))

  assert.match(trigger, /{activeName}/)
  assert.doesNotMatch(trigger, /businessName/)
  assert.match(staticLabel, /{activeName}/)
  assert.doesNotMatch(staticLabel, /businessName/)
})

test("branch opening is requested first and cannot be created directly", () => {
  const action = read("../app/actions/shops.ts")
  const control = read("../components/crm/branch-control.tsx")
  const migration = read("../supabase/migrations/026_branch_creation_approval.sql")
  const reviewStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.superadmin_review_branch_creation_request")
  const reviewEnd = migration.indexOf("$$;", reviewStart)
  const reviewFunction = migration.slice(reviewStart, reviewEnd)

  assert.match(action, /rpc\("request_business_branch"/)
  assert.match(control, /await requestBusinessBranch\(name\)/)
  assert.match(control, /До решения вы останетесь в текущем магазине/)
  assert.match(migration, /CREATE TABLE public\.branch_creation_requests/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.create_business_branch\(uuid, text\) FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /IF NOT public\.is_super_admin\(\)/)
  assert.match(reviewFunction, /INSERT INTO public\.profile_branch_access/)
  assert.doesNotMatch(reviewFunction, /active_shop_id/)
})

test("only the guarded super-admin page can review requests", () => {
  const page = read("../app/admin/branch-requests/page.tsx")
  const action = read("../app/actions/superadmin.ts")
  const nav = read("../components/crm/admin/admin-nav.tsx")
  const component = read("../components/crm/admin/admin-branch-requests.tsx")

  assert.match(page, /requireSuperAdminPageAccess\(\)/)
  assert.match(action, /getBranchCreationRequests[\s\S]*?requireSuperAdmin\(\)/)
  assert.match(action, /reviewBranchCreationRequest[\s\S]*?requireSuperAdmin\(\)/)
  assert.match(nav, /href="\/admin\/branch-requests"/)
  assert.match(component, /Одобрить/)
  assert.match(component, /Отклонить/)
})
