import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import vm from "node:vm"
import { NATIVE_ACTIONS, isNativeAction } from "../lib/native-action-contract.mjs"
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

function gateway({ authenticated = true, approved = true, actionError = false } = {}) {
  const calls = []
  const modules = Object.fromEntries(Object.keys(NATIVE_ACTIONS).map(key => [
    key, Object.fromEntries(NATIVE_ACTIONS[key].map(name => [name, async (...args) => {
      calls.push(["action", key, name, args])
      if (actionError) throw new Error("Недостаточно прав")
      return { ok: true }
    }])),
  ]))
  const supabase = { auth: {
    getUser: async token => { calls.push(["verify", token]); return {
      error: authenticated ? null : new Error("invalid"),
      data: { user: authenticated ? { id: "verified-user" } : null },
    } },
    setSession: async session => { calls.push(["session", session]); return { error: null } },
  } }
  const source = read("app/api/native-actions/route.ts")
    .replace(/^import .*$/gm, "")
    .replace(/const modules = \{[\s\S]*?\n\}/, "")
    .replace(/^export /gm, "")
  const context = vm.createContext({
    TextEncoder, Error, modules, isNativeAction,
    NextResponse: { json: (value, { status, headers }) => ({ status, value, headers }) },
    createClient: async () => supabase,
    requireApprovedContext: async () => {
      calls.push(["approved"])
      if (!approved) throw new Error("pending")
    },
  })
  vm.runInContext(stripTypeScriptTypes(source) + "\nglobalThis.subject = { POST, GET }", context)
  const request = (body = { module: "sales", action: "checkout", args: [{ total: 123 }] }, token = "test-token") => ({
    headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  })
  return { ...context.subject, request, calls }
}

test("native gateway allowlist matches real server exports, rejects prototype/import injection", () => {
  for (const [module, actions] of Object.entries(NATIVE_ACTIONS)) {
    const source = read(`app/actions/${module}.ts`)
    for (const action of actions) {
      assert.match(source, new RegExp(`export async function ${action}\\b`))
      assert.ok(isNativeAction(module, action))
    }
  }
  for (const [module, action] of [["__proto__", "toString"], ["sales", "constructor"], ["../../secrets", "get"], ["sales", "deleteAll"]]) {
    assert.equal(isNativeAction(module, action), false)
  }
})

test("native announcements expose only the shop-scoped feed and its compact view marker", () => {
  assert.deepEqual(NATIVE_ACTIONS["admin-announcements"], [
    "getUserAnnouncementFeed",
    "markAnnouncementFeedViewed",
  ])
  assert.equal(isNativeAction("admin-announcements", "publishPlatformAnnouncement"), false)
  assert.equal(isNativeAction("admin-announcements", "archivePlatformAnnouncement"), false)
  assert.match(read("native/native-action.ts"), /action !== "markAnnouncementFeedViewed"/)
})

test("native gateway rejects missing, invalid and unapproved sessions without invoking any action", async () => {
  const missing = gateway()
  assert.equal((await missing.POST(missing.request(undefined, ""))).status, 401)
  assert.equal(missing.calls.length, 0)
  const invalid = gateway({ authenticated: false })
  assert.equal((await invalid.POST(invalid.request())).status, 401)
  assert.equal(invalid.calls.length, 1)
  const pending = gateway({ approved: false })
  assert.equal((await pending.POST(pending.request())).status, 403)
  assert.equal(pending.calls.some(call => call[0] === "action"), false)
})

test("native gateway validates action/JSON before authentication or execution", async () => {
  const h = gateway()
  for (const body of ["{", null, { module: "__proto__", action: "constructor", args: [] }, { module: "sales", action: "checkout", args: "bad" }]) {
    assert.equal((await h.POST(h.request(body))).status, 400)
  }
  assert.equal(h.calls.length, 0)
})

test("native gateway verifies identity and sets request auth before original role-checked action", async () => {
  const h = gateway()
  const response = await h.POST(h.request())
  assert.equal(response.status, 200)
  assert.equal(response.headers["Cache-Control"], "no-store")
  assert.deepEqual(h.calls.map(call => call[0]), ["verify", "session", "approved", "action"])
  assert.equal(h.calls[1][1].refresh_token, "native-request-no-refresh")
  assert.equal(h.calls[3][1], "sales")
  assert.equal(h.calls[3][2], "checkout")
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[3][3])), [{ total: 123 }])
  const denied = gateway({ actionError: true })
  assert.equal((await denied.POST(denied.request())).value.error, "Недостаточно прав")
  assert.equal(h.GET().value.contract, "aura-native-actions-v1")
})

test("native HTTPS bridge rejects redirects and never shares cookies or remote HTML", () => {
  const swift = read("ios/App/App/AuraNativePlugin.swift")
  assert.match(swift, /base.scheme == "https"/)
  assert.match(swift, /URL\(string: "\/api\/native-actions"/)
  assert.match(swift, /httpCookieStorage = nil/)
  assert.match(swift, /completionHandler\(nil\)/)
  assert.doesNotMatch(swift, /WKWebView|openOnline|AuraOnlineController/)
})
