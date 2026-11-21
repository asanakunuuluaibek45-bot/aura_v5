import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAdminRouteDecision } from "../lib/admin/access-policy.ts";
import { getPostLoginPath } from "../lib/auth/post-login-route.ts";

test("direct admin route access requires an authenticated approved super_admin", () => {
  assert.equal(getAdminRouteDecision(false, null), "redirect-login");
  assert.equal(getAdminRouteDecision(true, { role: "seller", status: "approved" }), "not-found");
  assert.equal(getAdminRouteDecision(true, { role: "admin", status: "approved" }), "not-found");
  assert.equal(getAdminRouteDecision(true, { role: "super_admin", status: "pending" }), "not-found");
  assert.equal(getAdminRouteDecision(true, { role: "super_admin", status: "approved" }), "allow");
});

test("the /admin route applies the server guard in its layout and page", () => {
  const layout = readFileSync(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(layout, /await requireSuperAdminPageAccess\(\)/);
  assert.match(page, /await requireSuperAdminPageAccess\(\)/);
});

test("admin dashboard does not import store cash or inventory operations", () => {
  const page = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /getCashData|cash-operation|KassaScreen|Inventory|SkladScreen/i);
});

test("only super_admin gets the admin link; other roles keep the shop control", () => {
  const header = readFileSync(new URL("../components/app-header.tsx", import.meta.url), "utf8");
  assert.match(header, /profile\.role === "super_admin" \?/);
  assert.match(header, /href="\/admin"/);
  assert.match(header, /fullShopName/);
});

test("approved web super_admin lands in Admin while native and ordinary CRM entry stays unchanged", () => {
  assert.equal(getPostLoginPath({ role: "super_admin", status: "approved" }, false), "/admin");
  assert.equal(getPostLoginPath({ role: "super_admin", status: "pending" }, false), "/crm/pos");
  assert.equal(getPostLoginPath({ role: "admin", status: "approved" }, false), "/crm/pos");
  assert.equal(getPostLoginPath({ role: "super_admin", status: "approved" }, true), "/crm/pos");
});

test("system notifications are available inside the separately guarded Admin area", () => {
  const page = readFileSync(new URL("../app/admin/notifications/page.tsx", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../components/admin/admin-nav.tsx", import.meta.url), "utf8");
  assert.match(page, /await requireSuperAdminPageAccess\(\)/);
  assert.match(page, /<NotificationsPage \/>/);
  assert.match(nav, /href="\/admin\/notifications"/);
});
