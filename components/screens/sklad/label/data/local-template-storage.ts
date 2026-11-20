import {
  getLabelTemplateRefreshKey,
  getLabelTemplateStorageKey,
} from "@/lib/label-template-policy"

/** Local templates are isolated by shop, category and label size. */
export function saveLocalTemplate(shopId: string, category: string, templateJson: string, sizeKey?: string) {
  if (!shopId) return
  try {
    localStorage.setItem(getLabelTemplateStorageKey(shopId, category, sizeKey), templateJson)
  } catch (error) {
    console.error("[label] Ошибка сохранения шаблона в localStorage:", error)
  }
}

export function getLocalTemplate(shopId: string, category: string, sizeKey?: string): string | null {
  if (!shopId) return null
  try {
    const exact = localStorage.getItem(getLabelTemplateStorageKey(shopId, category, sizeKey))
    if (exact) return exact

    if (sizeKey) {
      const noSize = localStorage.getItem(getLabelTemplateStorageKey(shopId, category))
      if (noSize) return noSize

      // An explicit DB refresh must not fall back to an older category-only cache.
      if (localStorage.getItem(getLabelTemplateRefreshKey(shopId, category, sizeKey)) === "1") return null
    }
  } catch (error) {
    console.error("[label] Ошибка чтения шаблона из localStorage:", error)
  }
  return null
}

export function deleteLocalTemplate(shopId: string, category: string, sizeKey?: string) {
  if (!shopId) return
  try {
    localStorage.removeItem(getLabelTemplateStorageKey(shopId, category, sizeKey))
  } catch (error) {
    console.error("[label] Ошибка удаления шаблона из localStorage:", error)
  }
}

/** Invalidate older cache fallbacks after explicitly requesting the current DB template. */
export function clearLocalTemplateCache(shopId: string, category: string, sizeKey?: string) {
  if (!shopId) return
  try {
    localStorage.removeItem(getLabelTemplateStorageKey(shopId, category, sizeKey))
    localStorage.removeItem(getLabelTemplateStorageKey(shopId, category))
    if (sizeKey) {
      localStorage.setItem(getLabelTemplateRefreshKey(shopId, category, sizeKey), "1")
    }
  } catch (error) {
    console.error("[label] Ошибка очистки кэша шаблона:", error)
  }
}