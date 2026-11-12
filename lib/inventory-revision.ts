import type { Product } from "@/lib/types"

export type RevisionGroup = {
  key: string
  category: string
  metal: string
  products: Product[]
  total: number
  checked: number
  remaining: number
}

export type RevisionScanResult =
  | { status: "checked"; product: Product; checkedIds: string[] }
  | { status: "already_checked"; product: Product }
  | { status: "not_found" }

export type RevisionSession = {
  checkedProductIds: string[]
  finished: boolean
}

export function getRevisionProducts(products: Product[]): Product[] {
  return products.filter(
    (product) =>
      !product.deleted_at &&
      (product.status === "in_stock" || product.status === "reserved"),
  )
}

export function groupRevisionProducts(
  products: Product[],
  checkedIds: ReadonlySet<string>,
): RevisionGroup[] {
  const groups = new Map<string, RevisionGroup>()

  for (const product of products) {
    const category = product.category?.trim() || "Прочее"
    const metal = product.metal?.trim() || "Металл не указан"
    const key = JSON.stringify([category.toLocaleLowerCase("ru-RU"), metal.toLocaleLowerCase("ru-RU")])
    let group = groups.get(key)

    if (!group) {
      group = { key, category, metal, products: [], total: 0, checked: 0, remaining: 0 }
      groups.set(key, group)
    }

    group.products.push(product)
    group.total += 1
    if (checkedIds.has(product.id)) group.checked += 1
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      products: group.products.sort((a, b) => a.name.localeCompare(b.name, "ru")),
      remaining: group.total - group.checked,
    }))
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category, "ru") ||
        a.metal.localeCompare(b.metal, "ru"),
    )
}

export function recordRevisionScan(
  products: Product[],
  checkedIds: readonly string[],
  rawSku: string,
): RevisionScanResult {
  const sku = rawSku.trim().toLocaleUpperCase("ru-RU")
  if (!sku) return { status: "not_found" }

  const product = getRevisionProducts(products).find(
    (item) => item.sku?.trim().toLocaleUpperCase("ru-RU") === sku,
  )
  if (!product) return { status: "not_found" }
  if (checkedIds.includes(product.id)) return { status: "already_checked", product }

  return { status: "checked", product, checkedIds: [...checkedIds, product.id] }
}

export function filterRevisionCategory(products: Product[], category: string): Product[] {
  const selected = category.trim()
  if (!selected) return products
  return products.filter((product) => (product.category?.trim() || "Прочее") === selected)
}

export function filterRevisionMetal(products: Product[], metal: string): Product[] {
  const selected = metal.trim()
  if (!selected) return products
  return products.filter((product) => (product.metal?.trim() || "Металл не указан") === selected)
}

export function toggleRevisionCheck(checkedIds: readonly string[], productId: string, checked: boolean): string[] {
  if (checked) return checkedIds.includes(productId) ? [...checkedIds] : [...checkedIds, productId]
  return checkedIds.filter((id) => id !== productId)
}

export function parseRevisionSession(raw: string | null): RevisionSession {
  if (!raw) return { checkedProductIds: [], finished: false }

  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object") return { checkedProductIds: [], finished: false }
    const session = value as { checkedProductIds?: unknown; finished?: unknown }
    return {
      checkedProductIds: Array.isArray(session.checkedProductIds)
        ? [...new Set(session.checkedProductIds.filter((id): id is string => typeof id === "string"))]
        : [],
      finished: session.finished === true,
    }
  } catch {
    return { checkedProductIds: [], finished: false }
  }
}
