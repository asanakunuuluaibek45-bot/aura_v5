import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import vm from "node:vm"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("template confirmation and backdrop are above the fullscreen editor and portalled menus", () => {
  const editor = read("components/screens/sklad/label/label-editor.tsx")
  const inventory = read("components/screens/sklad/index.tsx")
  const toolbar = read("components/screens/sklad/label/components/toolbar.tsx")
  const confirmation = editor.match(/<DialogContent\s+className="([^"]+)"\s+overlayClassName="([^"]+)"/)
  assert.ok(confirmation, "the nested template dialog must set both layers explicitly")
  const layer = (classes) => Number(classes.match(/z-\[(\d+)\]/)?.[1])
  const parentLayer = Number(inventory.match(/zIndex:\s*(\d+)/)?.[1])
  const menuLayer = Number(toolbar.match(/zIndex:\s*(\d+)/)?.[1])
  assert.ok(parentLayer > 0 && menuLayer > 0)
  assert.ok(layer(confirmation[2]) > Math.max(parentLayer, menuLayer))
  assert.ok(layer(confirmation[1]) > layer(confirmation[2]))
})

test("Save and Reset close the format menu before opening their confirmation dialog", () => {
  const toolbar = read("components/screens/sklad/label/components/toolbar.tsx")
  for (const action of ["onSaveTemplate", "onReloadTemplate"]) {
    const handler = toolbar.match(new RegExp(`onClick=\\{\\(\\) => \\{([^}]*${action}\\(\\)[^}]*)\\}\\}`))
    assert.ok(handler, `${action} must use a menu-closing handler`)
    const events = []
    vm.runInNewContext(`(() => { ${handler[1]} })()`, {
      setOpen: (value) => events.push(["menu", value]),
      [action]: () => events.push(["dialog", action]),
    })
    assert.deepEqual(events, [["menu", false], ["dialog", action]])
  }
})

test("shared dialog applies the optional backdrop class without changing its default layer", () => {
  const dialog = read("components/ui/dialog.tsx")
  assert.match(dialog, /overlayClassName\?: string/)
  assert.match(dialog, /<DialogOverlay className=\{overlayClassName\}/)
  assert.match(dialog, /fixed inset-0 isolate z-50/)
  assert.match(dialog, /className,\s*overlayClassName,\s*children/)
})

function actions() {
  const rows = [
    { scope_key: "shop-a", shop_id: "shop-a", category: "Кольца", size_key: "small", template_json: "shop-ring" },
    { scope_key: "shop-a", shop_id: "shop-a", category: "Серьги", size_key: "small", template_json: "shop-ear" },
    { scope_key: "shop-a", shop_id: "shop-a", category: "Кольца", size_key: "large", template_json: "shop-large" },
    { scope_key: "shop-b", shop_id: "shop-b", category: "Кольца", size_key: "small", template_json: "other-shop" },
    { scope_key: "global", shop_id: null, category: "Кольца", size_key: "small", template_json: "global-ring" },
    { scope_key: "global", shop_id: null, category: "Серьги", size_key: "small", template_json: "global-ear" },
  ]
  const writes = []
  let error = null
  const supabase = {
    from(table) {
      assert.equal(table, "label_templates")
      const filters = []
      let operation = "select"
      let payload
      const query = {
        select() { return query },
        eq(key, value) { filters.push([key, value]); return query },
        delete() { operation = "delete"; return query },
        upsert(value) { operation = "upsert"; payload = value; return query },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (error) return { data: null, error: { message: error } }
            const matches = (row) => filters.every(([key, value]) => row[key] === value)
            if (operation === "delete") {
              const removed = rows.filter(matches)
              writes.push({ operation, removed })
              for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i])) rows.splice(i, 1)
              return { data: null, error: null }
            }
            if (operation === "upsert") {
              writes.push({ operation, payload })
              return { data: null, error: null }
            }
            return { data: rows.filter(matches), error: null }
          }).then(resolve, reject)
        },
      }
      return query
    },
  }
  let source = read("app/actions/labels.ts").replace(/^import .*$/gm, "")
  const contextStart = source.indexOf("async function getContext()")
  const contextEnd = source.indexOf("function normalizeKey", contextStart)
  source = source.slice(0, contextStart) + source.slice(contextEnd)
  source = source.replace(/^export /gm, "")
  const context = vm.createContext({
    getContext: async () => ({
      supabase, shopId: "shop-a", user: { id: "user-a" }, profile: { role: "admin" },
    }),
    revalidatePath: () => {},
  })
  vm.runInContext(stripTypeScriptTypes(source) + "\nglobalThis.subject = { saveLabelTemplate, restoreShopLabelTemplates }", context)
  return { ...context.subject, rows, writes, fail: (message) => { error = message } }
}

test("global reset changes only one active-shop category in the selected label size", async () => {
  const h = actions()
  const restored = await h.restoreShopLabelTemplates("Кольца", "small", "category", "global")
  assert.equal(restored["Кольца"], "global-ring")
  assert.equal(h.rows.some((r) => r.scope_key === "shop-a" && r.category === "Кольца" && r.size_key === "small"), false)
  assert.equal(h.rows.length, 5)
  assert.ok(h.rows.some((r) => r.template_json === "other-shop"))
  assert.ok(h.rows.some((r) => r.template_json === "shop-large"))
})

test("all-category global reset retains other shops, other label sizes and global templates", async () => {
  const h = actions()
  const restored = await h.restoreShopLabelTemplates("Кольца", "small", "shop", "global")
  assert.equal(Object.keys(restored).length, 2)
  assert.deepEqual(h.rows.map((r) => r.template_json).sort(), ["global-ear", "global-ring", "other-shop", "shop-large"])
})

test("restoring shop templates reloads saved versions without any database writes", async () => {
  for (const scope of ["category", "shop"]) {
    const h = actions()
    const restored = await h.restoreShopLabelTemplates("Кольца", "small", scope, "shop")
    assert.equal(restored["Кольца"], "shop-ring")
    assert.equal(Object.keys(restored).length, scope === "shop" ? 2 : 1)
    assert.equal(h.writes.length, 0)
    assert.equal(h.rows.length, 6)
  }
})

test("missing shop template and load errors stop reset before any deletion", async () => {
  const missing = actions()
  await assert.rejects(missing.restoreShopLabelTemplates("Браслеты", "small", "category", "shop"), /нет сохранённого/)
  assert.equal(missing.writes.length, 0)
  const failed = actions()
  failed.fail("test network failure")
  await assert.rejects(failed.restoreShopLabelTemplates("Кольца", "small", "shop", "global"), /test network failure/)
  assert.equal(failed.writes.length, 0)
})

test("category and all-category saves write only the authenticated active shop", async () => {
  for (const [categories, scope] of [[["Кольца"], "category"], [["Кольца", "Серьги"], "shop"]]) {
    const h = actions()
    await h.saveLabelTemplate(categories, "layout", "small", scope)
    const payload = h.writes[0].payload
    assert.equal(payload.length, categories.length)
    assert.ok(payload.every((r) => r.shop_id === "shop-a" && r.scope_key === "shop-a" && r.template_json === "layout"))
    h.fail("permission denied")
    await assert.rejects(h.saveLabelTemplate(categories, "layout", "small", scope), /permission denied/)
  }
})
