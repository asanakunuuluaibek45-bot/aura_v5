import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { stripTypeScriptTypes } from "node:module"
import { NATIVE_ACTIONS, isNativeAction } from "../lib/native-action-contract.mjs"

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const sql = read("supabase/migrations/014_store_notifications.sql")

function actions({ role = "super_admin", status = "approved", authenticated = true } = {}) {
  const calls = []
  const ctx = {
    user: authenticated ? { id: "sender" } : null,
    profile: authenticated ? { role, status } : null,
    supabase: {
      rpc: async (name, args) => { calls.push({ name, args }); return { data: "notice-id", error: null } },
    },
  }
  const source = read("app/actions/store-notifications.ts").replace(/^import .*/gm, "").replace(/^export /gm, "")
  const scope = vm.createContext({
    getRequestCrmContext: async () => ctx,
    requireApprovedContext: async () => {
      if (!ctx.user || ctx.profile.status !== "approved") throw new Error("Не авторизован")
      return ctx
    },
  })
  vm.runInContext(stripTypeScriptTypes(source) + `
    globalThis.actions = { getStoreNotifications, getStoreNotificationUnreadCount,
      markStoreNotificationRead, markAllStoreNotificationsRead, getStoreNotificationRecipients,
      getManagedStoreNotifications, createStoreNotification, deleteStoreNotification }`, scope)
  return { api: scope.actions, calls }
}

test("admin, seller, pending and anonymous callers cannot send/delete or inspect private recipient lists", async () => {
  for (const options of [
    { role: "admin" }, { role: "seller" }, { status: "pending" }, { authenticated: false },
  ]) {
    const { api, calls } = actions(options)
    assert.equal((await api.createStoreNotification("shop", null, "title", "message")).success, false)
    assert.equal((await api.deleteStoreNotification("notice")).success, false)
    assert.equal((await api.getStoreNotificationRecipients("shop")).success, false)
    assert.equal((await api.getManagedStoreNotifications()).success, false)
    assert.equal(calls.length, 0, "unauthorized callers must never reach a privileged RPC")
  }
})

test("approved super admin uses guarded RPCs without accepting a sender id", async () => {
  const { api, calls } = actions()
  assert.equal((await api.createStoreNotification("shop-a", "user-a", "title", "message")).success, true)
  assert.equal(calls[0].name, "superadmin_store_notification_create")
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args)), {
    _shop_id: "shop-a", _recipient_profile_id: "user-a", _title: "title", _message: "message",
  })
  assert.equal((await api.deleteStoreNotification("notice-a")).success, true)
  assert.equal(calls[1].name, "superadmin_store_notification_delete")
})

test("read state is resolved from verified auth, never a caller-supplied user id", async () => {
  const { api, calls } = actions({ role: "seller" })
  await api.markStoreNotificationRead("notice-a")
  await api.markAllStoreNotificationsRead()
  assert.equal(calls[0].name, "store_notification_mark_read")
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args)), { _notification_id: "notice-a" })
  assert.equal(calls[1].name, "store_notification_mark_all_read")
  const anonymous = actions({ authenticated: false })
  assert.equal((await anonymous.api.getStoreNotifications()).success, false)
  assert.equal(anonymous.calls.length, 0)
})

test("database functions scope recipients/read receipts and cannot broadcast a deleted personal profile", () => {
  assert.match(sql, /recipient_profile_id uuid REFERENCES public\.profiles\(id\) ON DELETE CASCADE/)
  assert.match(sql, /PRIMARY KEY \(notification_id, profile_id\)/)
  assert.match(sql, /p\.id = auth\.uid\(\)[\s\S]*?p\.status = 'approved'[\s\S]*?p\.shop_id = n\.shop_id/)
  assert.match(sql, /n\.recipient_profile_id IS NULL OR n\.recipient_profile_id = auth\.uid\(\)/)
  assert.match(sql, /p\.id = _recipient_profile_id[\s\S]*?p\.shop_id = _shop_id[\s\S]*?p\.status = 'approved'/)
  assert.match(sql, /VALUES \(_notification_id, auth\.uid\(\)\)/)
  assert.match(sql, /created_by, title, message\)[\s\S]*?auth\.uid\(\), v_title, v_message/)
  assert.doesNotMatch(sql, /(?:DROP|DELETE FROM|ALTER TABLE) public\.platform_announcements/)
  assert.match(sql, /\nBEGIN;/)
  assert.match(sql, /\nCOMMIT;/)
})

test("every privileged RPC checks super admin and direct access is revoked", () => {
  assert.match(sql, /REVOKE ALL ON public\.store_notifications FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON public\.store_notification_reads FROM PUBLIC, anon, authenticated/)
  for (const name of ["recipients", "list", "create", "delete"]) {
    const body = sql.split(`FUNCTION public.superadmin_store_notification_${name}(`)[1].split("$$;")[0]
    assert.match(body, /IF NOT public\.is_super_admin\(\) THEN/)
    assert.match(body, /SET search_path = ''/)
  }
  assert.match(sql, /char_length\(v_title\) NOT BETWEEN 1 AND 120/)
  assert.match(sql, /char_length\(v_message\) NOT BETWEEN 1 AND 3000/)
})

test("routes, bell and menu use Notifications and native actions retain an explicit allowlist", () => {
  const nav = read("components/app-nav.tsx")
  assert.match(nav, /id: "notifications", label: "Уведомления", icon: Bell, group: "system"/)
  assert.doesNotMatch(nav, /id: "announcements", label: "Объявления"/)
  assert.match(read("next.config.mjs"), /source: '\/crm\/announcements', destination: '\/announcements'/)
  assert.match(read("app/(crm)/announcements/page.tsx"), /screen="notifications"/)
  assert.match(read("components/app-header.tsx"), /<StoreNotificationBell key=\{profile\.id\}/)
  for (const name of NATIVE_ACTIONS["store-notifications"]) {
    assert.match(read("app/actions/store-notifications.ts"), new RegExp(`export async function ${name}\\b`))
    assert.equal(isNativeAction("store-notifications", name), true)
  }
  assert.equal(isNativeAction("store-notifications", "deleteAll"), false)
  assert.equal(isNativeAction("__proto__", "constructor"), false)
})
