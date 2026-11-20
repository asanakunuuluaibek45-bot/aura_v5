import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAdminRouteDecision } from "../lib/admin/access-policy.ts";

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
