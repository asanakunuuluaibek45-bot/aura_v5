export type LabelTemplateSaveScope = "category" | "shop"
export type LabelTemplateResetScope = "category" | "shop"
export type LabelTemplateResetSource = "global" | "shop"

const DEFAULT_CATEGORY = "Прочее"

export function getLabelTemplateCategories(
  currentCategory: string,
  shopCategories: readonly string[],
  scope: LabelTemplateSaveScope,
): string[] {
  const normalize = (category: string) => category.trim() || DEFAULT_CATEGORY
  const current = normalize(currentCategory)
  const candidates = scope === "shop" ? [...shopCategories, current] : [current]
  return [...new Set(candidates.map(normalize))]
}

export function getLabelTemplateResetCategories(
  currentCategory: string,
  shopCategories: readonly string[],
  scope: LabelTemplateResetScope,
): string[] {
  return getLabelTemplateCategories(currentCategory, shopCategories, scope)
}

export function getLabelTemplateStorageKey(
  shopId: string,
  category: string,
  sizeKey?: string,
): string {
  if (!shopId) throw new Error("Для локального шаблона нужен магазин")
  const cat = category.trim() || DEFAULT_CATEGORY
  return [
    "label_tpl",
    encodeURIComponent(shopId),
    encodeURIComponent(sizeKey || "default"),
    encodeURIComponent(cat),
  ].join(":")
}

export function getLabelTemplateRefreshKey(
  shopId: string,
  category: string,
  sizeKey?: string,
): string {
  return `${getLabelTemplateStorageKey(shopId, category, sizeKey)}:db-refreshed`
}
