import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  getLabelTemplateCategories,
  getLabelTemplateResetCategories,
  getLabelTemplateStorageKey,
} from "../lib/label-template-policy.ts"
import { resolveShopSeqId } from "../lib/shop-seq-cache-core.ts"
import { buildShopLabelQrPayload } from "../lib/label-qr-payload.ts"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("saving for a category targets only that category; shop scope deduplicates all current categories", () => {
  assert.deepEqual(
    getLabelTemplateCategories(" Кольца ", ["Кольца", "Серьги", "Прочее", ""], "category"),
    ["Кольца"],
  )
  assert.deepEqual(
    getLabelTemplateCategories("Кольца", ["Кольца", " Серьги ", "Прочее", ""], "shop"),
    ["Кольца", "Серьги", "Прочее"],
  )
})

test("reset scope targets one category or all active-shop categories without duplicates", () => {
  assert.deepEqual(
    getLabelTemplateResetCategories("Кольца", ["Кольца", "Серьги", "Прочее"], "category"),
    ["Кольца"],
  )
  assert.deepEqual(
    getLabelTemplateResetCategories("Кольца", ["Кольца", " Серьги ", "Прочее", "Серьги"], "shop"),
    ["Кольца", "Серьги", "Прочее"],
  )
})

test("local template keys are isolated by shop, category, and label size", () => {
  const a = getLabelTemplateStorageKey("shop-a", "Кольца", "small")
  assert.notEqual(a, getLabelTemplateStorageKey("shop-b", "Кольца", "small"))
  assert.notEqual(a, getLabelTemplateStorageKey("shop-a", "Серьги", "small"))
  assert.notEqual(a, getLabelTemplateStorageKey("shop-a", "Кольца", "large"))
  assert.throws(() => getLabelTemplateStorageKey("", "Кольца", "small"), /магазин/)

  const localStorageSource = read("components/screens/sklad/label/data/local-template-storage.ts")
  assert.match(localStorageSource, /getLabelTemplateStorageKey\(shopId, category, sizeKey\)/)
  assert.doesNotMatch(localStorageSource, /label_templates_cache/)
})

test("saving all shop categories cannot write to the global or another shop scope", () => {
  const action = read("app/actions/labels.ts")
  assert.match(action, /saveLabelTemplate\(\s*categories: string \| string\[\]/)
  assert.match(action, /scope: "category" \| "shop" = "category"/)
  assert.match(action, /scope_key: isGlobal \? GLOBAL_SCOPE : shopId/)
  assert.match(action, /shop_id: isGlobal \? null : shopId/)
  assert.match(action, /if \(isGlobal && normalizedCategories\.length > 1\)/)
  assert.match(action, /scope === "shop" && !shopId/)
  assert.match(action, /\.upsert\(\s*normalizedCategories\.map/)
})

test("reset source is explicit, shop restore is read-only, and global reset is active-shop scoped", () => {
  const editor = read("components/screens/sklad/label/label-editor.tsx")
  const action = read("app/actions/labels.ts")
  assert.match(editor, /Только этот шаблон/)
  assert.match(editor, /Все категории этого магазина/)
  assert.match(editor, /Глобальный шаблон/)
  assert.match(editor, /Восстановить сохранённый шаблон магазина/)
  assert.match(editor, /shopTemplateAvailable !== true/)
  assert.match(editor, /await actions\.handleReloadTemplate\(resetScope, resetSource\)/)
  assert.match(action, /restoreShopLabelTemplates\(/)
  assert.match(action, /\.eq\("scope_key", source === "global" \? GLOBAL_SCOPE : shopId\)/)
  assert.match(action, /\.eq\("scope_key", shopId\)\s*\.eq\("size_key", normalizedSize\)/)
  assert.match(action, /if \(scope === "category"\)\s*\{\s*deleteQuery = deleteQuery\.eq\("category", normalizedCategory\)/)
  assert.doesNotMatch(action, /deleteQuery\.eq\("scope_key", GLOBAL_SCOPE\)/)
})

test("save and reset show operation-specific pending states and preserve retry on failure", () => {
  const editor = read("components/screens/sklad/label/label-editor.tsx")
  const hook = read("components/screens/sklad/label/hooks/use-label-actions.ts")
  assert.match(editor, /Сохраняем…/)
  assert.match(editor, /Сбрасываем…/)
  assert.match(editor, /templateActionLock\.current/)
  assert.match(editor, /setTemplateDialog\(null\)/)
  assert.match(editor, /templateActionMessage\.kind === "error" \? "alert" : "status"/)
  assert.match(hook, /await saveLabelTemplate\(categories, serialized, sizeKey, scope\)/)
  assert.match(hook, /Update the local cache only after the server confirms the upsert/)
  assert.doesNotMatch(hook, /toast\.success\("Нет связи/)
})

test("offline QR sequence cache is saved online, reused offline, and isolated per shop", async () => {
  const values = new Map()
  const cache = {
    read: shopId => values.get(shopId) ?? null,
    write: (shopId, seqId) => values.set(shopId, seqId),
  }
  let fetchCount = 0
  const fetch = async shopId => {
    fetchCount += 1
    assert.equal(shopId, "shop-a")
    return 52
  }

  assert.equal(await resolveShopSeqId("shop-a", true, cache, fetch), 52)
  assert.equal(values.get("shop-a"), 52)
  assert.equal(await resolveShopSeqId("shop-a", false, cache, fetch), 52)
  assert.equal(fetchCount, 1)
  await assert.rejects(resolveShopSeqId("shop-b", false, cache, fetch), /Нет номера магазина/)
  assert.equal(values.has("shop-b"), false)

  const cacheSource = read("lib/shop-seq-cache.ts")
  const inventory = read("components/screens/sklad/index.tsx")
  assert.match(cacheSource, /aura_shop_seq_\$\{shopId\}/)
  assert.match(cacheSource, /resolveShopSeqId/)
  assert.match(inventory, /rememberShopSeqId\(p\.shop_id, p\.shop_seq_id\)/)
})

test("QR payload refuses a missing or invalid shop number instead of printing a malformed code", () => {
  assert.equal(buildShopLabelQrPayload(52, " ab-123 "), "52/AB-123")
  for (const invalid of [null, undefined, 0, -4, 1.5, "52", Number.NaN]) {
    assert.throws(() => buildShopLabelQrPayload(invalid, "AB-123"), /короткий номер магазина/)
  }
  assert.throws(() => buildShopLabelQrPayload(52, "  "), /артикул/)
})

test("inventory passes only its own product categories into label-template save", () => {
  const inventory = read("components/screens/sklad/index.tsx")
  assert.match(inventory, /products\.map\(\(product\) => product\.category\?\.trim\(\) \|\| "Прочее"\)/)
  assert.match(inventory, /shopCategories=\{shopCategories\}/)
})
