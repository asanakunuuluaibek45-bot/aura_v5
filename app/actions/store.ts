"use server"

import { createClient } from "@/lib/supabase/server"

/** Публичная карточка изделия для страницы /store/[store_id]/product/[article]. */
export type PublicProduct = {
  id: string
  shop_id: string
  /** Короткий числовой ID магазина (seq_id) — используется в QR-ссылках. */
  shop_seq_id: number | null
  shop_name: string | null
  name: string
  category: string | null
  metal: string | null
  metal_color: string | null
  weight: number
  size: string | null
  sku: string | null
  stones: string | null
  description: string | null
  sale_price: number
  status: string
  images: string[] | null
  image_url: string | null
  created_at: string
}

export type PublicProductCursor = Pick<PublicProduct, "id" | "created_at">

export type PublicProductPage = {
  items: PublicProduct[]
  hasMore: boolean
  migrationPending?: boolean
  error?: string
}

export type PublicMarketplaceFilters = {
  category?: string
  metal?: string
  minPrice?: number | null
  maxPrice?: number | null
}

export type PublicMarketplaceFacets = {
  categories: string[]
  metals: string[]
}

/** Доступные категории и металлы только из публичных изделий в наличии. */
export async function getPublicMarketplaceFacets(
  storeId: string | null = null,
): Promise<PublicMarketplaceFacets> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { categories: [], metals: [] }
  }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("public_marketplace_facets", {
      _shop_id: storeId,
    })
    if (error) {
      if (!["PGRST202", "42883"].includes(error.code ?? "")) {
        console.error("[store] public_marketplace_facets error:", error.message)
      }
      return { categories: [], metals: [] }
    }
    const row = Array.isArray(data) ? data[0] : data
    const facets = row as Partial<PublicMarketplaceFacets> | null
    return {
      categories: Array.isArray(facets?.categories)
        ? facets.categories.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      metals: Array.isArray(facets?.metals)
        ? facets.metals.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
    }
  } catch (error) {
    console.error("[store] public_marketplace_facets failed:", error)
    return { categories: [], metals: [] }
  }
}

/**
 * Читает изделие по числовому seq_id магазина и SKU (новый маршрут /q/…).
 * Если shopKey — не число, автоматически fallback на UUID.
 */
export async function getPublicProductBySeqId(
  shopKey: string,
  sku: string
): Promise<PublicProduct | null> {
  const supabase = await createClient()
  const seqId = Number(shopKey)
  const { data, error } = Number.isInteger(seqId) && seqId > 0
    ? await supabase.rpc("public_product_by_seq", {
        _shop_seq_id: seqId,
        _article: decodeURIComponent(sku).toUpperCase(),
      })
    : await supabase.rpc("public_product", {
        _shop_id: shopKey,
        _article: decodeURIComponent(sku).toUpperCase(),
      })
  if (error) {
    console.error("[store] public_product error:", error.message)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  return (row as PublicProduct) ?? null
}

/**
 * Читает изделие без авторизации через security-definer функцию, которая
 * отдаёт только безопасные колонки (без закупочных цен и поставщика).
 */
export async function getPublicProduct(storeId: string, article: string): Promise<PublicProduct | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("public_product", {
    _shop_id: storeId,
    _article: decodeURIComponent(article).toUpperCase(),
  })
  if (error) {
    console.error("[store] public_product error:", error.message)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  return (row as PublicProduct) ?? null
}

/** Несколько других изделий того же магазина — блок «Смотрите также». */
export async function getPublicShopProducts(storeId: string, limit = 8): Promise<PublicProduct[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("public_shop_products", {
    _shop_id: storeId,
    _limit: limit,
  })
  if (error) {
    console.error("[store] public_shop_products error:", error.message)
    return []
  }
  return (data as PublicProduct[]) ?? []
}

/**
 * Публичный каталог маркетплейса и отдельного магазина.
 * Новая RPC-функция добавлена отдельно, чтобы сохранить существующий endpoint
 * public_shop_products для старых ссылок и клиентов на время выкладки миграции.
 */
export async function getPublicMarketplaceProducts(
  storeId: string | null = null,
  limit = 24,
  cursor?: PublicProductCursor,
  search = "",
  filters: PublicMarketplaceFilters = {},
): Promise<PublicProductPage> {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(48, Math.trunc(limit)))
    : 24
  const normalizedSearch = typeof search === "string" ? search.trim().slice(0, 100) : ""
  const category = typeof filters.category === "string" ? filters.category.trim().slice(0, 80) : ""
  const metal = typeof filters.metal === "string" ? filters.metal.trim().slice(0, 80) : ""
  const minPrice = typeof filters.minPrice === "number" && Number.isFinite(filters.minPrice) && filters.minPrice >= 0
    ? filters.minPrice
    : null
  const maxPrice = typeof filters.maxPrice === "number" && Number.isFinite(filters.maxPrice) && filters.maxPrice >= 0
    ? filters.maxPrice
    : null
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    return { items: [], hasMore: false, error: "Минимальная цена не может быть больше максимальной." }
  }
  const hasFilters = Boolean(category || metal || minPrice !== null || maxPrice !== null)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { items: [], hasMore: false, error: "Каталог временно недоступен." }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("public_marketplace_products_filtered", {
    _shop_id: storeId || null,
    _search: normalizedSearch || null,
    _category: category || null,
    _metal: metal || null,
    _min_price: minPrice,
    _max_price: maxPrice,
    _before_created_at: cursor?.created_at ?? null,
    _before_id: cursor?.id ?? null,
    // Fetch one extra row to tell the client whether another page exists.
    _limit: safeLimit + 1,
  })

  if (error) {
    if (["PGRST202", "42883"].includes(error.code ?? "")) {
      if (hasFilters) return { items: [], hasMore: false, migrationPending: true }
      const legacyMarketplace = await supabase.rpc("public_marketplace_products", {
        _shop_id: storeId || null,
        _search: normalizedSearch || null,
        _before_created_at: cursor?.created_at ?? null,
        _before_id: cursor?.id ?? null,
        _limit: safeLimit + 1,
      })
      if (!legacyMarketplace.error) {
        const legacyRows = (legacyMarketplace.data as PublicProduct[]) ?? []
        return { items: legacyRows.slice(0, safeLimit), hasMore: legacyRows.length > safeLimit }
      }

      // Keep existing store pages useful while the additive SQL migration rolls out.
      if (storeId && !cursor && !normalizedSearch) {
        const legacy = await supabase.rpc("public_shop_products", {
          _shop_id: storeId,
          _limit: safeLimit,
        })
        if (!legacy.error) {
          return {
            items: (legacy.data as PublicProduct[]) ?? [],
            hasMore: false,
            migrationPending: true,
          }
        }
      }
      return { items: [], hasMore: false, migrationPending: true }
    }

    console.error("[store] public_marketplace_products error:", error.message)
    return { items: [], hasMore: false, error: "Не удалось загрузить каталог товаров." }
  }

  const rows = (data as PublicProduct[]) ?? []
  return {
    items: rows.slice(0, safeLimit),
    hasMore: rows.length > safeLimit,
  }
}
