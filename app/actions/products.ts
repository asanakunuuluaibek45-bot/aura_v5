"use server"

import { createClient } from "@/lib/supabase/server"
import { getRequestCrmContext } from "@/lib/supabase/request-context"
import { revalidatePath } from "next/cache"
import type { Product } from "@/lib/types"

// ÐÐµ Ð¸ÑÐ¿Ð¾Ð»ÑÐ·ÑÐµÐ¼ select("*") Ð´Ð»Ñ ÐºÐ°ÑÐ°Ð»Ð¾Ð³Ð°: Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð¸ Ð¼Ð°ÑÑÐ¸Ð²Ñ Ð¸Ð·Ð¾Ð±ÑÐ°Ð¶ÐµÐ½Ð¸Ð¹
// Ð·Ð°Ð¼ÐµÑÐ½Ð¾ ÑÐ²ÐµÐ»Ð¸ÑÐ¸Ð²Ð°ÑÑ payload Ð½Ð° ÐºÐ°Ð¶Ð´Ð¾Ð¼ Ð¾ÑÐºÑÑÑÐ¸Ð¸ CRM.
const PRODUCT_COLUMNS = [
  "id",
  "shop_id",
  "created_by",
  "name",
  "category",
  "metal",
  "metal_color",
  "weight",
  "size",
  "sku",
  "article_seq",
  "is_hidden",
  "purchase_price",
  "purchase_price_visible",
  "price_per_gram_purchase_visible",
  "price_per_gram_sale",
  "price_per_gram_purchase",
  "stones",
  "description",
  "sale_price",
  "image_url",
  "images",
  "supplier_name",
  "supplier_phone",
  "consignment_operation_id",
  "consignment_at",
  "consignment_by",
  "status",
  "created_at",
].join(", ")

async function requireProfile() {
  const { supabase, user, profile, shopId } = await getRequestCrmContext()
  if (!user) throw new Error("Ð¢ÑÐµÐ±ÑÐµÑÑÑ Ð²ÑÐ¾Ð´ Ð² ÑÐ¸ÑÑÐµÐ¼Ñ")
  if (!profile || profile.status !== "approved") throw new Error("ÐÐºÐºÐ°ÑÐ½Ñ Ð½Ðµ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ¶Ð´ÑÐ½")
  return { supabase, user, profile, shopId }
}

/**
 * ÐÐ¾Ð·Ð²ÑÐ°ÑÐ°ÐµÑ ÐÐÐ¢ÐÐÐÐ«Ð shop_id ÑÐ°Ðº, ÐºÐ°Ðº ÐµÐ³Ð¾ Ð²Ð¸Ð´ÑÑ RLS-Ð¿Ð¾Ð»Ð¸ÑÐ¸ÐºÐ¸.
 *
 * RLS Ð¿ÑÐ¾Ð²ÐµÑÑÐµÑ `shop_id = public.current_shop_id()`, Ð° current_shop_id()
 * ÑÑÐ¾ COALESCE(impersonated_shop_id Ð´Ð»Ñ super_admin, profiles.shop_id).
 * Ð Ð°Ð½ÑÑÐµ INSERT Ð¿Ð¸ÑÐ°Ð» profile.shop_id: Ð´Ð»Ñ ÑÑÐ¿ÐµÑÐ°Ð´Ð¼Ð¸Ð½Ð° Ð² ÑÐµÐ¶Ð¸Ð¼Ðµ
 * Ð¸Ð¼Ð¿ÐµÑÑÐ¾Ð½Ð°ÑÐ¸Ð¸ (Ð¸ Ð´Ð»Ñ Ð¿ÑÐ¾ÑÐ¸Ð»Ñ Ð±ÐµÐ· Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð°) Ð·Ð½Ð°ÑÐµÐ½Ð¸Ñ ÑÐ°ÑÑÐ¾Ð´Ð¸Ð»Ð¸ÑÑ Ð¸ Postgres
 * Ð¾ÑÐºÐ»Ð¾Ð½ÑÐ» Ð²ÑÑÐ°Ð²ÐºÑ Ñ "new row violates row-level security policy".
 */
async function requireShopId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: { shop_id: string | null; impersonated_shop_id?: string | null; role?: string | null },
  resolvedShopId?: string | null,
): Promise<string> {
  const fallbackShopId =
    profile.role === "super_admin" ? profile.impersonated_shop_id ?? profile.shop_id : profile.shop_id
  const shopId = resolvedShopId ?? fallbackShopId
  if (!shopId) {
    throw new Error("ÐÐ°Ñ Ð°ÐºÐºÐ°ÑÐ½Ñ Ð½Ðµ Ð¿ÑÐ¸Ð²ÑÐ·Ð°Ð½ Ðº Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ñ â Ð¾Ð±ÑÐ°ÑÐ¸ÑÐµÑÑ Ðº Ð°Ð´Ð¼Ð¸Ð½Ð¸ÑÑÑÐ°ÑÐ¾ÑÑ")
  }
  return shopId
}

/**
 * ÐÐ¾Ð¿Ð¾Ð»Ð½ÑÐµÑ ÑÐ¾Ð²Ð°ÑÑ ÐºÐ¾ÑÐ¾ÑÐºÐ¸Ð¼ ÑÐ¸ÑÐ»Ð¾Ð²ÑÐ¼ ID Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð° (shop_settings.seq_id).
 * ÐÐµÐ· Ð½ÐµÐ³Ð¾ QR-ÑÑÑÐ»ÐºÐ° ÑÐµÑÑÐµÑ Ð¸Ð´ÐµÐ½ÑÐ¸ÑÐ¸ÐºÐ°ÑÐ¾Ñ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð° Ð¸ Ð¿ÑÐµÐ²ÑÐ°ÑÐ°ÐµÑÑÑ Ð² /q//SKU.
 */
async function withShopSeqId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Product[],
): Promise<Product[]> {
  const shopIds = [...new Set(rows.map((p) => p.shop_id).filter(Boolean))]
  if (shopIds.length === 0) return rows

  const { data: shops } = await supabase
    .from("shop_settings")
    .select("shop_id, seq_id")
    .in("shop_id", shopIds)

  const seqByShop = new Map<string, number | null>(
    (shops ?? []).map((s: { shop_id: string; seq_id: number | null }) => [s.shop_id, s.seq_id]),
  )

  return rows.map((p) => ({ ...p, shop_seq_id: seqByShop.get(p.shop_id) ?? null }))
}

/** ÐÐ°Ð¿ÑÐ°ÑÐ¸Ð²Ð°ÐµÑ ÐºÐ¾ÑÐ¾ÑÐºÐ¸Ð¹ Ð½Ð¾Ð¼ÐµÑ Ð°ÐºÑÐ¸Ð²Ð½Ð¾Ð³Ð¾ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð° Ð´Ð»Ñ Ð»Ð¾ÐºÐ°Ð»ÑÐ½Ð¾ ÑÐ¾ÑÑÐ°Ð½ÑÐ½Ð½Ð¾Ð¹ ÑÑÐ¸ÐºÐµÑÐºÐ¸. */
export async function getShopSeqIdForLabel(productShopId: string): Promise<number> {
  const { supabase, profile, shopId: resolvedShopId } = await requireProfile()
  const shopId = await requireShopId(supabase, profile, resolvedShopId)
  if (productShopId !== shopId) {
    throw new Error("Ð¢Ð¾Ð²Ð°Ñ Ð¿ÑÐ¸Ð½Ð°Ð´Ð»ÐµÐ¶Ð¸Ñ Ð´ÑÑÐ³Ð¾Ð¼Ñ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ñ. ÐÐ±Ð½Ð¾Ð²Ð¸ÑÐµ ÐºÐ°ÑÐ°Ð»Ð¾Ð³ Ð¿ÐµÑÐµÐ´ Ð¿ÐµÑÐ°ÑÑÑ.")
  }
  const { data, error } = await supabase
    .from("shop_settings")
    .select("seq_id")
    .eq("shop_id", shopId)
    .single()
  if (error) throw new Error(`ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð¿Ð¾Ð»ÑÑÐ¸ÑÑ ÐºÐ¾ÑÐ¾ÑÐºÐ¸Ð¹ Ð½Ð¾Ð¼ÐµÑ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð°: ${error.message}`)
  const seqId = data?.seq_id
  if (typeof seqId !== "number" || !Number.isSafeInteger(seqId) || seqId <= 0) {
    throw new Error("Ð£ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð° Ð½ÐµÑ ÐºÐ¾ÑÐ¾ÑÐºÐ¾Ð³Ð¾ Ð½Ð¾Ð¼ÐµÑÐ° Ð´Ð»Ñ QR-ÐºÐ¾Ð´Ð°. Ð¡Ð¸Ð½ÑÑÐ¾Ð½Ð¸Ð·Ð¸ÑÑÐ¹ÑÐµ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½ Ð¿ÐµÑÐµÐ´ Ð¿ÐµÑÐ°ÑÑÑ.")
  }
  return seqId
}

export async function getProducts(): Promise<Product[]> {
  // Ship only the first 50 catalog rows with the server-rendered page. The
  // local-first sync engine continues its resumable, paginated full catalog
  // pull into IndexedDB, so POS/offline search still receives the whole catalog.
  const page = await getProductsPage({ limit: 50, offset: 0 })
  return page.items
}

export type ProductPage = {
  items: Product[]
  offset: number
  limit: number
  hasMore: boolean
}

/**
 * ÐÐ³ÑÐ°Ð½Ð¸ÑÐµÐ½Ð½Ð°Ñ Ð²ÑÐ±Ð¾ÑÐºÐ° Ð´Ð»Ñ ÑÐºÑÐ°Ð½Ð¾Ð² Ð¸ lazy-load ÑÑÐµÐ½Ð°ÑÐ¸ÐµÐ². ÐÐµÑÑÐ¼ Ð¾Ð´Ð½Ñ
 * Ð´Ð¾Ð¿Ð¾Ð»Ð½Ð¸ÑÐµÐ»ÑÐ½ÑÑ ÑÑÑÐ¾ÐºÑ, ÑÑÐ¾Ð±Ñ ÐºÐ¾ÑÑÐµÐºÑÐ½Ð¾ Ð²ÑÑÐ¸ÑÐ»Ð¸ÑÑ hasMore.
 */
export async function getProductsPage(
  input: { limit?: number; offset?: number } = {},
): Promise<ProductPage> {
  const { supabase, shopId } = await requireProfile()
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), 100)
  const offset = Math.max(Math.floor(input.offset ?? 0), 0)
  if (!shopId) return { items: [], offset, limit, hasMore: false }
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit)

  if (error) throw error
  const rows = await withShopSeqId(supabase, (data as unknown as Product[]) ?? [])
  return {
    items: rows.slice(0, limit),
    offset,
    limit,
    hasMore: rows.length > limit,
  }
}


export type ProductInput = {
  name: string
  category: string
  metal: string
  metal_color?: string | null
  weight: number
  size: string
  sku: string
  purchase_price: number
  /** ÐÐ°ÐºÑÐ¿Ð¾ÑÐ½Ð°Ñ ÑÐµÐ½Ð° Ð²Ð¸Ð´Ð¸Ð¼Ð°Ñ Ð´Ð»Ñ Ð¿ÑÐ¾Ð´Ð°Ð²ÑÐ° (Ð¿ÐµÑÐµÐ¸Ð¼ÐµÐ½Ð¾Ð²Ð°Ð½Ð¾ Ð¸Ð· purchase_price_seller). */
  purchase_price_visible?: number | null
  price_per_gram_sale?: number | null
  price_per_gram_purchase?: number | null
  /** ÐÑÑÑ Ð·Ð°ÐºÑÐ¿ÐºÐ¸ Ð²Ð¸Ð´Ð¸Ð¼ÑÐ¹ Ð´Ð»Ñ Ð¿ÑÐ¾Ð´Ð°Ð²ÑÐ° (Ð¿ÐµÑÐµÐ¸Ð¼ÐµÐ½Ð¾Ð²Ð°Ð½Ð¾ Ð¸Ð· price_per_gram_purchase_seller). */
  price_per_gram_purchase_visible?: number | null
  stones?: string | null
  description?: string | null
  sale_price: number
  image_url?: string | null
  images?: string[]
  supplier_name?: string | null
  supplier_phone?: string | null
}

function validate(input: Partial<ProductInput>) {
  if (input.name !== undefined && !String(input.name).trim()) {
    throw new Error("Ð£ÐºÐ°Ð¶Ð¸ÑÐµ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¸Ð·Ð´ÐµÐ»Ð¸Ñ")
  }
  const numeric: [keyof ProductInput, string][] = [
    ["weight", "ÐÐµÑ"],
    ["sale_price", "Ð¦ÐµÐ½Ð° Ð¿ÑÐ¾Ð´Ð°Ð¶Ð¸"],
    ["purchase_price", "ÐÐ°ÐºÑÐ¿Ð¾ÑÐ½Ð°Ñ ÑÐµÐ½Ð°"],
  ]
  for (const [key, label] of numeric) {
    const v = input[key]
    if (v === undefined || v === null) continue
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label}: ÑÐºÐ°Ð¶Ð¸ÑÐµ ÐºÐ¾ÑÑÐµÐºÑÐ½Ð¾Ðµ ÑÐ¸ÑÐ»Ð¾`)
  }
}

type ArticleRow = { article: string; prefix: string; seq: number; reused: boolean }

/** RPC next_article Ð²Ð¾Ð·Ð²ÑÐ°ÑÐ°ÐµÑ out_article/out_prefix/out_seq/out_reused. */
function normalizeArticle(row: Record<string, unknown>): ArticleRow {
  return {
    article: String(row["out_article"] ?? row["article"] ?? ""),
    prefix: String(row["out_prefix"] ?? row["prefix"] ?? ""),
    seq: Number(row["out_seq"] ?? row["seq"] ?? 0),
    reused: Boolean(row["out_reused"] ?? row["reused"] ?? false),
  }
}

/**
 * ÐÐ·Ð²Ð»ÐµÐºÐ°ÐµÑ Ð´Ð²ÑÑÐ±ÑÐºÐ²ÐµÐ½Ð½ÑÐ¹ ASCII-Ð¿ÑÐµÑÐ¸ÐºÑ Ð¸Ð· Ð°ÑÑÐ¸ÐºÑÐ»Ð° Ð¸Ð»Ð¸ ÑÑÑÐ¾ÐºÐ¸-Ð¿ÑÐµÑÐ¸ÐºÑÐ°.
 * ÐÑÐ¸Ð½Ð¸Ð¼Ð°ÐµÑ ÑÐ¾Ð»ÑÐºÐ¾ Ð»Ð°ÑÐ¸Ð½ÑÐºÐ¸Ðµ Ð±ÑÐºÐ²Ñ A-Z. ÐÑÐ»Ð¸ Ð¿ÐµÑÐµÐ´Ð°Ð½ ÐºÐ¸ÑÐ¸Ð»Ð»Ð¸ÑÐµÑÐºÐ¸Ð¹
 * Ð¿ÑÐµÑÐ¸ÐºÑ (Ð½Ð°ÑÐ»ÐµÐ´Ð¸Ðµ ÑÑÐ°ÑÑÑ Ð´Ð°Ð½Ð½ÑÑ) â Ð²Ð¾Ð·Ð²ÑÐ°ÑÐ°ÐµÑ Ð±ÐµÐ·Ð¾Ð¿Ð°ÑÐ½ÑÐ¹ Ð´ÐµÑÐ¾Ð»Ñ "RY".
 */
function extractPrefix(value: string | null | undefined): string {
  const match = (value ?? "").match(/^[A-Za-z]{2}/)
  if (match) return match[0].toUpperCase()
  return "RY" // Ð´ÐµÑÐ¾Ð»Ñ: ÐÐ¾Ð»ÑÑÐ¾ / ÐÑÐ»ÑÐ¾Ðµ Ð·Ð¾Ð»Ð¾ÑÐ¾ â Ring Yellow
}

/**
 * Ð¡Ð¾Ð·Ð´Ð°ÑÑ ÑÐ¾Ð²Ð°Ñ Ð¸ ÐÐÐÐÐ ÐÐ©ÐÐÐ¢ ÑÐ¾ÑÑÐ°Ð½ÑÐ½Ð½ÑÑ ÑÑÑÐ¾ÐºÑ (Ñ ÑÐµÐ°Ð»ÑÐ½ÑÐ¼Ð¸ id / sku /
 * shop_id / shop_seq_id). Ð Ð°Ð½ÑÑÐµ ÑÐºÑÐ½ Ð½Ð¸ÑÐµÐ³Ð¾ Ð½Ðµ Ð²Ð¾Ð·Ð²ÑÐ°ÑÐ°Ð», Ð¿Ð¾ÑÑÐ¾Ð¼Ñ ÑÑÐ¸ÐºÐµÑÐºÐ°
 * Ð¿ÐµÑÐ°ÑÐ°Ð»Ð°ÑÑ Ð¿Ð¾ ÑÐµÑÐ½Ð¾Ð²Ð¸ÐºÑ (id: "draft", shop_id Ð¾ÑÑÑÑÑÑÐ²Ð¾Ð²Ð°Ð») â Ð¸ ID Ð½Ðµ
 * Ð¿Ð¾Ð¿Ð°Ð´Ð°Ð» Ð² QR-ÐºÐ¾Ð´.
 */
export async function createProduct(input: ProductInput): Promise<Product> {
  const { supabase, user, profile, shopId: resolvedShopId } = await requireProfile()
  validate(input)

  // shop_id Ð±ÐµÑÑÐ¼ Ð¸Ð· ÑÐ¾Ð³Ð¾ Ð¶Ðµ Ð¸ÑÑÐ¾ÑÐ½Ð¸ÐºÐ°, ÑÑÐ¾ Ð¸ RLS-Ð¿Ð¾Ð»Ð¸ÑÐ¸ÐºÐ° (ÑÐ¼. requireShopId).
  const shopId = await requireShopId(supabase, profile, resolvedShopId)

  const prefix = extractPrefix(input.sku)

  const { data: artData, error: artErr } = await supabase.rpc("next_article", { p_prefix: prefix }).single()
  if (artErr) throw new Error(`ÐÑÐ¸Ð±ÐºÐ° Ð³ÐµÐ½ÐµÑÐ°ÑÐ¸Ð¸ Ð°ÑÑÐ¸ÐºÑÐ»Ð°: ${artErr.message}`)

  const art = normalizeArticle((artData ?? {}) as Record<string, unknown>)

  const { data, error } = await supabase
    .from("products")
    .insert({
      ...input,
      name: input.name.trim(),
      sku: art.article,
      article_prefix: art.prefix,
      article_seq: art.seq,
      shop_id: shopId,
      created_by: user.id,
      status: "in_stock",
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      throw new Error("ÐÑÑÐ¸ÐºÑÐ» ÑÐ¾Ð»ÑÐºÐ¾ ÑÑÐ¾ Ð±ÑÐ» Ð·Ð°Ð½ÑÑ Ð´ÑÑÐ³Ð¸Ð¼ ÑÐ¾Ð²Ð°ÑÐ¾Ð¼. ÐÐ¾Ð¿ÑÐ¾Ð±ÑÐ¹ÑÐµ Ð½Ð°Ð¶Ð°ÑÑ Â«Ð¡Ð¾ÑÑÐ°Ð½Ð¸ÑÑÂ» ÐµÑÑ ÑÐ°Ð·.")
    }
    throw new Error(`ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ ÑÐ¾ÑÑÐ°Ð½Ð¸ÑÑ ÑÐ¾Ð²Ð°Ñ: ${error.message}`)
  }

  revalidatePath("/crm")

  const [saved] = await withShopSeqId(supabase, [data as Product])
  return saved
}

/** ÐÐ±Ð½Ð¾Ð²Ð»ÑÐµÑ ÑÐ¾Ð²Ð°Ñ Ð¸ Ð²Ð¾Ð·Ð²ÑÐ°ÑÐ°ÐµÑ Ð°ÐºÑÑÐ°Ð»ÑÐ½ÑÑ ÑÑÑÐ¾ÐºÑ (Ð½ÑÐ¶Ð½Ð° Ð´Ð»Ñ Ð¿ÐµÑÐ°ÑÐ¸ ÑÑÐ¸ÐºÐµÑÐºÐ¸). */
export async function updateProduct(
  id: string,
  input: Partial<ProductInput> & { is_hidden?: boolean; is_secondary?: never },
): Promise<Product> {
  const { supabase } = await requireProfile()
  const { data: current } = await supabase
    .from("products")
    .select("consignment_operation_id, purchase_price, supplier_name, supplier_phone")
    .eq("id", id)
    .single()
  const restrictedChanged = current?.consignment_operation_id && (
    (input.purchase_price !== undefined && Number(input.purchase_price) !== Number(current.purchase_price)) ||
    (input.supplier_name !== undefined && (input.supplier_name ?? null) !== (current.supplier_name ?? null)) ||
    (input.supplier_phone !== undefined && (input.supplier_phone ?? null) !== (current.supplier_phone ?? null))
  )
  if (restrictedChanged) {
    throw new Error("Ð¢Ð¾Ð²Ð°Ñ ÑÐ¶Ðµ Ð²Ð·ÑÑ Ð½Ð° ÑÐµÐ°Ð»Ð¸Ð·Ð°ÑÐ¸Ñ: Ð·Ð°ÐºÑÐ¿Ð¾ÑÐ½ÑÑ ÑÐµÐ½Ñ Ð¸ Ð¿Ð¾ÑÑÐ°Ð²ÑÐ¸ÐºÐ° Ð¼ÐµÐ½ÑÑÑ Ð½ÐµÐ»ÑÐ·Ñ")
  }
  validate(input)
  // Ð Ð°Ð·ÑÐµÑÐ°ÐµÐ¼ Ð¼ÐµÐ½ÑÑÑ ÑÐ¾Ð»ÑÐºÐ¾ Ð¿Ð¾Ð»Ñ ÐºÐ°ÑÑÐ¾ÑÐºÐ¸: ÑÑÐ°ÑÑÑ, Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½, Ð°ÑÑÐ¸ÐºÑÐ» Ð¸ Ð°Ð²ÑÐ¾ÑÐ°
  // Ð½ÐµÐ»ÑÐ·Ñ Ð¿Ð¾Ð´Ð¼ÐµÐ½Ð¸ÑÑ Ñ ÐºÐ»Ð¸ÐµÐ½ÑÐ° (Ð¸Ð½Ð°ÑÐµ Ð¿ÑÐ¾Ð´Ð°Ð½Ð½ÑÐ¹ ÑÐ¾Ð²Ð°Ñ Ð¼Ð¾Ð¶Ð½Ð¾ Â«Ð²ÐµÑÐ½ÑÑÑÂ» Ð½Ð° ÑÐºÐ»Ð°Ð´).
  const ALLOWED: (keyof ProductInput | "is_hidden")[] = [
    "name", "category", "metal", "metal_color", "weight", "size",
    "purchase_price", "purchase_price_visible", "price_per_gram_sale",
    "price_per_gram_purchase", "price_per_gram_purchase_visible", "stones",
    "description", "sale_price", "image_url", "images", "supplier_name",
    "supplier_phone", "is_hidden",
  ]
  const patch: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if ((input as Record<string, unknown>)[key] !== undefined) patch[key] = (input as Record<string, unknown>)[key]
  }
  if (typeof patch.name === "string") patch.name = patch.name.trim()
  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw new Error(`ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð¾Ð±Ð½Ð¾Ð²Ð¸ÑÑ ÑÐ¾Ð²Ð°Ñ: ${error.message}`)
  revalidatePath("/crm")
  const [saved] = await withShopSeqId(supabase, [data as Product])
  return saved
}


export async function deleteProduct(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Server Action Ð½Ð¸ÐºÐ¾Ð³Ð´Ð° Ð½Ðµ Ð±ÑÐ¾ÑÐ°ÐµÑ Ð¸ÑÐºÐ»ÑÑÐµÐ½Ð¸Ðµ: Ð² production Next.js ÑÐºÑÑÐ²Ð°ÐµÑ
  // ÑÐµÐºÑÑ Ð¾ÑÐ¸Ð±ÐºÐ¸ Ð¸ ÐºÐ»Ð¸ÐµÐ½Ñ Ð¿Ð¾Ð»ÑÑÐ°ÐµÑ Ð»Ð¸ÑÑ "React error #441" / HTTP 500.
  try {
    const { supabase } = await requireProfile()
    const { error } = await supabase.rpc("delete_product", { _product_id: id })
    if (error) {
      // ÐÐ¸Ð³ÑÐ°ÑÐ¸Ñ v44 ÐµÑÑ Ð½Ðµ Ð¿ÑÐ¸Ð¼ÐµÐ½ÐµÐ½Ð° â Ð¼ÑÐ³ÐºÐ¾Ðµ ÑÐ´Ð°Ð»ÐµÐ½Ð¸Ðµ ÐºÐ°Ðº Ð·Ð°Ð¿Ð°ÑÐ½Ð¾Ð¹ Ð²Ð°ÑÐ¸Ð°Ð½Ñ.
      if (["PGRST202", "42883"].includes(error.code ?? "")) {
        const now = new Date().toISOString()
        const { error: softErr } = await supabase
          .from("products")
          .update({ deleted_at: now, updated_at: now })
          .eq("id", id)
        if (softErr) return { ok: false, error: `ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ ÑÐ´Ð°Ð»Ð¸ÑÑ ÑÐ¾Ð²Ð°Ñ: ${softErr.message}` }
      } else if (!/Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½/i.test(error.message)) {
        return { ok: false, error: `ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ ÑÐ´Ð°Ð»Ð¸ÑÑ ÑÐ¾Ð²Ð°Ñ: ${error.message}` }
      }
    }
    try {
      revalidatePath("/crm")
      revalidatePath("/crm/inventory")
    } catch {}
    return { ok: true }
  } catch (e) {
    console.error("[deleteProduct]", e)
    return { ok: false, error: e instanceof Error ? e.message : "ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ ÑÐ´Ð°Ð»Ð¸ÑÑ ÑÐ¾Ð²Ð°Ñ" }
  }
}

export async function generateArticle(prefix: string) {
  const { supabase } = await requireProfile()

  const { data: artData, error } = await supabase
    .rpc("next_article", { p_prefix: extractPrefix(prefix) })
    .single()

  if (error) throw new Error(error.message)

  return normalizeArticle((artData ?? {}) as Record<string, unknown>)
}

