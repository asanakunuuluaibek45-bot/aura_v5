import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  getAccessibleBranchCount,
  hasMultiBranchAccess,
  shouldBlockMultiBranchScreen,
} from "../lib/branches/ui-policy.ts"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const branch = (shopId, isActive = false, businessId = "business-a") => ({
  businessId,
  shopId,
  shopName: shopId,
  isActive,
})

test("a single accessible branch keeps ordinary sections and hides branch summaries", () => {
  const context = {
    businessId: "business-a",
    activeShopId: "branch-a",
    branches: [branch("branch-a", true)],
  }

  assert.equal(getAccessibleBranchCount(context), 1)
  assert.equal(hasMultiBranchAccess(context), false)
  assert.equal(shouldBlockMultiBranchScreen("otchety", context), true)
  assert.equal(shouldBlockMultiBranchScreen("kassa", context), false)
  assert.equal(shouldBlockMultiBranchScreen("inventory", context), false)
})

test("two authorized branches reveal multi-branch screens", () => {
  const context = {
    businessId: "business-a",
    activeShopId: "branch-a",
    branches: [branch("branch-a", true), branch("branch-b")],
  }

  assert.equal(getAccessibleBranchCount(context), 2)
  assert.equal(hasMultiBranchAccess(context), true)
  for (const screen of ["otchety", "transfers", "branch-summary", "branch-comparison"]) {
    assert.equal(shouldBlockMultiBranchScreen(screen, context), false)
  }
})

test("partial access counts only branches in the authenticated allowlist", () => {
  const partialContext = {
    businessId: "business-a",
    activeShopId: "branch-a",
    branches: [branch("branch-a", true)],
  }
  assert.equal(getAccessibleBranchCount(partialContext), 1)
  assert.equal(shouldBlockMultiBranchScreen("branch-comparison", partialContext), true)

  const mixedBusinessContext = {
    ...partialContext,
    branches: [branch("branch-a", true), branch("other-business-branch", false, "business-b")],
  }
  assert.equal(getAccessibleBranchCount(mixedBusinessContext), 1)
})

test("a failed or cancelled create cannot grant branch access or unlock screens", () => {
  const original = {
    businessId: "business-a",
    activeShopId: "branch-a",
    branches: [branch("branch-a", true)],
  }
  const failedCreate = { error: "permission denied" }
  const cancelledCreate = null
  for (const result of [failedCreate, cancelledCreate]) {
    assert.ok(result === null || result.error)
    assert.equal(shouldBlockMultiBranchScreen("otchety", original), true)
  }

  const action = read("../app/actions/shops.ts")
  const control = read("../components/crm/branch-control.tsx")
  assert.match(action, /rpc\("request_business_branch"/)
  assert.doesNotMatch(action, /rpc\("create_business_branch"/)
  assert.match(control, /await requestBusinessBranch\(name\)[\s\S]*?router\.refresh\(\)/)
  assert.match(control, /catch \(actionError\)[\s\S]*?setError/)
})

test("branch switching verifies server membership and refreshes only after success", () => {
  const action = read("../app/actions/shops.ts")
  const control = read("../components/crm/branch-control.tsx")
  assert.match(action, /branchContext\.branches\.find\(\(item\) => item\.shopId === shopId\)/)
  assert.match(action, /supabase\.rpc\("set_active_shop", \{ _shop_id: shopId \}\)/)
  assert.match(control, /await setActiveBusinessBranch\(shopId\)[\s\S]*?router\.refresh\(\)/)
})


test("shop visibility follows the server-authorized active branch after branch creation", () => {
  const actions = read("../app/actions/shops.ts")
  const start = actions.indexOf("async function requireOwnShopAdminContext()")
  const end = actions.indexOf("/** Читает состояние публичности", start)
  const guard = actions.slice(start, end)

  assert.match(guard, /branchContext\.activeShopId/)
  assert.match(guard, /branchContext\.branches\.find/)
  assert.match(guard, /branch\.businessId === branchContext\.businessId/)
  assert.doesNotMatch(guard, /profile\.shop_id/)
})

test("direct CRM URLs are blocked server-side with a safe route to the POS", () => {
  const screen = read("../app/crm/crm-screen.tsx")
  const notice = read("../components/crm/branch-feature-notice.tsx")
  assert.match(screen, /shouldBlockMultiBranchScreen\(screen, branchContext\)/)
  assert.match(screen, /return <BranchFeatureNotice \/>/)
  assert.match(notice, /href="\/crm\/pos"/)
  assert.match(notice, /доступ как минимум к двум активным филиалам/)
})

test("the branch entry point remains available to admins with only one branch", () => {
  const control = read("../components/crm/branch-control.tsx")
  const header = read("../components/crm/app-header.tsx")
  assert.match(control, /const canOpen = canManage \|\| hasSwitcher/)
  assert.match(control, /Запросить новую точку/)
  assert.match(control, /branchRequest\?\.status === "pending"/)
  assert.match(header, /canManage=\{profile\.role === "admin"/)
})
