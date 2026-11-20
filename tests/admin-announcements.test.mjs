import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canViewAnnouncement } from "../lib/admin/announcement-policy.ts";
import { isOfflineSection } from "../lib/offline-sections.ts";

const now = Date.parse("2026-11-21T12:00:00.000Z");
const globalNotice = {
  scope_type: "all",
  shop_id: null,
  published_at: "2026-11-20T12:00:00.000Z",
  expires_at: "2026-11-22T12:00:00.000Z",
  archived_at: null,
};
const shopNotice = {
  ...globalNotice,
  scope_type: "shop",
  shop_id: "shop-a",
};

test("all-store announcements are visible only to approved shop users", () => {
  assert.equal(canViewAnnouncement("approved", "shop-a", globalNotice, now), true);
  assert.equal(canViewAnnouncement("approved", "shop-b", globalNotice, now), true);
  assert.equal(canViewAnnouncement("pending", "shop-a", globalNotice, now), false);
  assert.equal(canViewAnnouncement("approved", null, globalNotice, now), false);
});

test("shop-scoped announcements never cross store boundaries", () => {
  assert.equal(canViewAnnouncement("approved", "shop-a", shopNotice, now), true);
  assert.equal(canViewAnnouncement("approved", "shop-b", shopNotice, now), false);
});

test("archived, future, and expired announcements are hidden", () => {
  assert.equal(canViewAnnouncement("approved", "shop-a", { ...globalNotice, archived_at: "2026-11-21T10:00:00Z" }, now), false);
  assert.equal(canViewAnnouncement("approved", "shop-a", { ...globalNotice, published_at: "2026-11-22T12:00:00Z" }, now), false);
  assert.equal(canViewAnnouncement("approved", "shop-a", { ...globalNotice, expires_at: "2026-11-21T11:00:00Z" }, now), false);
});

test("database policies enforce audience isolation and keep history without auto-deletion", () => {
  const sql = readFileSync(new URL("../supabase/migrations/012_platform_announcements.sql", import.meta.url), "utf8");
  assert.match(sql, /scope_type = 'all'[\s\S]*?shop_id = public\.current_shop_id\(\)/);
  assert.match(sql, /platform_announcements_read_audience[\s\S]*?public\.is_approved\(\)/);
  assert.match(sql, /ON DELETE RESTRICT/);
  assert.match(sql, /PRIMARY KEY \(user_id, shop_id\)/);
  assert.doesNotMatch(sql, /announcement_id uuid[^;]*PRIMARY KEY/i);
  assert.doesNotMatch(sql, /DELETE FROM public\.platform_announcements|pg_cron|CREATE POLICY[^;]+FOR DELETE/i);
});

test("publish and archive RPCs write audit records in the same transaction", () => {
  const sql = readFileSync(new URL("../supabase/migrations/012_platform_announcements.sql", import.meta.url), "utf8");
  assert.match(sql, /admin_create_platform_announcement[\s\S]*?announcement_published/);
  assert.match(sql, /admin_archive_platform_announcement[\s\S]*?announcement_archived/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.platform_admin_action_log FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /platform_admin_action_log_super_admin_read[\s\S]*?public\.is_super_admin\(\)/);
});

test("announcement APIs enforce server-side roles and the client uses one feed-view update", () => {
  const actions = readFileSync(new URL("../app/actions/admin-announcements.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../components/announcements/user-announcements-panel.tsx", import.meta.url), "utf8");
  assert.match(actions, /publishPlatformAnnouncement[\s\S]*?requireSuperAdminContext\(\)/);
  assert.match(actions, /archivePlatformAnnouncement[\s\S]*?requireSuperAdminContext\(\)/);
  assert.match(actions, /getUserAnnouncementFeed[\s\S]*?requireShopContext\(\)/);
  assert.match(actions, /markAnnouncementFeedViewed[\s\S]*?requireShopContext\(\)/);
  assert.match(actions, /onConflict: "user_id,shop_id"/);
  assert.match(panel, /setFeed\(result\)[\s\S]*?await markAnnouncementFeedViewed\(\)/);
  assert.doesNotMatch(panel, /setFeed\(\{\s*\.\.\.result,\s*lastViewedAt:/);
  assert.doesNotMatch(panel, /setInterval|setTimeout/);
  assert.equal(isOfflineSection("announcements"), false);
});
