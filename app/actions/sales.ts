"use server"

import { revalidatePath } from "next/cache"
import type { Sale, SaleItem } from "@/lib/types"
import { DEFAULT_RATES } from "@/lib/rates"
import { getRequestCrmContext } from "@/lib/supabase/request-context"
import { resolveClientOperationId } from "@/lib/client-operation"

async function requireProfile() {
  const { supabase, user, profile, shopId } = await getRequestCrmContext()
  if (!user) throw new Error("Ð¡ÐµÑÑÐ¸Ñ Ð¸ÑÑÐµÐºÐ»Ð°. ÐÐ¾Ð¹Ð´Ð¸ÑÐµ Ð² ÑÐ¸ÑÑÐµÐ¼Ñ Ð·Ð°Ð½Ð¾Ð²Ð¾")
  if (!profile) throw new Error("ÐÑÐ¾ÑÐ¸Ð»Ñ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½")
  if (profile.status !== "approved") throw new Error("ÐÐ°Ñ Ð°ÐºÐºÐ°ÑÐ½Ñ ÐµÑÑ Ð½Ðµ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ¶Ð´ÑÐ½ Ð°Ð´Ð¼Ð¸Ð½Ð¸ÑÑÑÐ°ÑÐ¾ÑÐ¾Ð¼")
  if (!shopId) throw new Error("ÐÐ°Ñ Ð°ÐºÐºÐ°ÑÐ½Ñ Ð½Ðµ Ð¿ÑÐ¸Ð²ÑÐ·Ð°Ð½ Ðº Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ñ")
  return { supabase, user, profile, shopId }
}

export async function getSales(): Promise<Sale[]> {
  const { supabase, shopId } = await requireProfile()
  if (!shopId) return []
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, shop_id, seller_id, seller_name, customer_id, customer_name, customer_phone, payment_method, amount_cash, amount_electronic, subtotal, discount, total, cost_total, profit, bonus_earned, bonus_used, items, created_at, updated_at, deleted_at, client_op_id, cash_operation_id",
    )
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .range(0, 49)
  if (error) throw error
  return (data as Sale[]) ?? []
}

export type CheckoutInput = {
  items: SaleItem[]
  discount: number
  payment_method: string
  amount_cash?: number
  amount_electronic?: number
  customer_name: string
  customer_phone: string
  bonus_used: number
  /** Generate once on the client and reuse when retrying an uncertain result. */
  client_op_id?: string
}

const PAYMENTS = new Set(["cash", "card", "transfer", "mixed"])

export async function checkout(input: CheckoutInput) {
  const { supabase, shopId } = await requireProfile()
  const clientOpId = resolveClientOperationId(input.client_op_id)
  const items = Array.isArray(input.items) ? input.items : []
  if (items.length === 0) throw new Error("Ð§ÐµÐº Ð¿ÑÑÑ â Ð´Ð¾Ð±Ð°Ð²ÑÑÐµ ÑÐ¾ÑÑ Ð±Ñ Ð¾Ð´Ð½Ñ Ð¿Ð¾Ð·Ð¸ÑÐ¸Ñ")
  if (items.length > 200) throw new Error("Ð¡Ð»Ð¸ÑÐºÐ¾Ð¼ Ð¼Ð½Ð¾Ð³Ð¾ Ð¿Ð¾Ð·Ð¸ÑÐ¸Ð¹ Ð² Ð¾Ð´Ð½Ð¾Ð¼ ÑÐµÐºÐµ")
  if (!PAYMENTS.has(input.payment_method)) throw new Error("ÐÑÐ±ÐµÑÐ¸ÑÐµ ÐºÐ¾ÑÑÐµÐºÑÐ½ÑÐ¹ ÑÐ¿Ð¾ÑÐ¾Ð± Ð¾Ð¿Ð»Ð°ÑÑ")
  if (items.some((item) => Number(item.quantity) !== 1)) {
    throw new Error("ÐÐ¾Ð»Ð¸ÑÐµÑÑÐ²Ð¾ ÐºÐ°Ð¶Ð´Ð¾Ð¹ Ð¿Ð¾Ð·Ð¸ÑÐ¸Ð¸ Ð´Ð¾Ð»Ð¶Ð½Ð¾ Ð±ÑÑÑ ÑÐ°Ð²Ð½Ð¾ 1")
  }
  const phone = (input.customer_phone ?? "").trim()
  if (phone && !/^[\d+()\s-]{5,20}$/.test(phone)) throw new Error("ÐÑÐ¾Ð²ÐµÑÑÑÐµ Ð½Ð¾Ð¼ÐµÑ ÑÐµÐ»ÐµÑÐ¾Ð½Ð° ÐºÐ»Ð¸ÐµÐ½ÑÐ°")

  // Resolve all scrap prices in one round trip instead of querying once per
  // scrap line. Checkouts with several scrap items now make at most one lookup.
  const scrapMetals = [...new Set(
    items
      .filter((item) => item.kind === "scrap")
      .map((item) => item.metal ?? "")
      .filter(Boolean),
  )]
  const scrapRates = new Map<string, number>()
  if (scrapMetals.length > 0) {
    const { data: rateRows, error: rateError } = await supabase
      .from("metal_rates")
      .select("metal, scrap_price_per_gram")
      .eq("shop_id", shopId)
      .in("metal", scrapMetals)
    if (rateError) throw new Error(`ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð¿ÑÐ¾ÑÐ¸ÑÐ°ÑÑ ÐºÑÑÑ Ð»Ð¾Ð¼Ð°: ${rateError.message}`)
    for (const row of rateRows ?? []) {
      scrapRates.set(row.metal, Number(row.scrap_price_per_gram) || 0)
    }
  }

  // Only validate the payload here. Do not check product availability or bonus
  // balances before the RPC: on an idempotent retry they have already changed.
  const validated: SaleItem[] = []
  for (const item of items) {
    if (item.kind === "scrap") {
      const weight = Number(item.weight)
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100000) {
        throw new Error("Ð£ÐºÐ°Ð¶Ð¸ÑÐµ ÐºÐ¾ÑÑÐµÐºÑÐ½ÑÐ¹ Ð²ÐµÑ Ð»Ð¾Ð¼Ð°")
      }
      const metal = item.metal ?? ""
      const rate = scrapRates.get(metal) || DEFAULT_RATES[metal]?.scrap || 0
      if (!Number.isFinite(rate) || rate <= 0) throw new Error(`ÐÐµ Ð·Ð°Ð´Ð°Ð½ ÐºÑÑÑ Ð»Ð¾Ð¼Ð° Ð´Ð»Ñ Â«${metal || "Ð¼ÐµÑÐ°Ð»Ð»Ð°"}Â»`)
      validated.push({
        product_id: null, kind: "scrap", quantity: 1,
        name: item.name?.trim() || `ÐÐ¾Ð¼ Â· ${metal}`,
        weight, metal, price_per_gram: rate, price: Math.round(weight * rate), cost: Math.round(weight * rate),
      })
    } else {
      const price = Number(item.price)
      if (!Number.isFinite(price) || price < 0) throw new Error("Ð ÑÐµÐºÐµ ÑÐºÐ°Ð·Ð°Ð½Ð° Ð½ÐµÐºÐ¾ÑÑÐµÐºÑÐ½Ð°Ñ ÑÐµÐ½Ð°")
      if (!item.product_id) throw new Error("Ð Ð¿Ð¾Ð·Ð¸ÑÐ¸Ð¸ Ð½Ðµ ÑÐºÐ°Ð·Ð°Ð½ ÑÐ¾Ð²Ð°Ñ")
      validated.push({ ...item, kind: "product", quantity: 1, price: Math.round(price) })
    }
  }

  const { data: result, error } = await supabase.rpc("commit_offline_sale", {
    _client_op_id: clientOpId,
    _sale: {
      items: validated,
      payment_method: input.payment_method,
      amount_cash: input.amount_cash,
      amount_electronic: input.amount_electronic,
      bonus_used: input.bonus_used,
      customer_name: (input.customer_name ?? "").trim() || null,
      customer_phone: phone || null,
    },
  })
  if (error) throw new Error(`ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð¿ÑÐ¾Ð²ÐµÑÑÐ¸ Ð¿ÑÐ¾Ð´Ð°Ð¶Ñ: ${error.message}`)
  if (result?.accepted === false) {
    const product = result.product_name ? ` Â«${result.product_name}Â»` : ""
    throw new Error(`ÐÐ¾Ð½ÑÐ»Ð¸ÐºÑ Ð¾ÑÑÐ°ÑÐºÐ¾Ð²: ÑÐ¾Ð²Ð°Ñ${product} ÑÐ¶Ðµ Ð¿ÑÐ¾Ð´Ð°Ð½ Ð¸Ð»Ð¸ Ð½ÐµÐ´Ð¾ÑÑÑÐ¿ÐµÐ½. ÐÐ±Ð½Ð¾Ð²Ð¸ÑÐµ ÑÐºÐ»Ð°Ð´ Ð¸ Ð¿ÑÐ¾Ð²ÐµÑÑÑÐµ ÑÐµÐº.`)
  }
  if (result?.accepted !== true || !result.sale_id) {
    throw new Error("ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ´Ð¸ÑÑ Ð¿ÑÐ¾Ð´Ð°Ð¶Ñ. ÐÐ¾Ð²ÑÐ¾ÑÐ¸ÑÐµ Ð¾ÑÐ¿ÑÐ°Ð²ÐºÑ Ñ ÑÐµÐ¼ Ð¶Ðµ Ð¸Ð´ÐµÐ½ÑÐ¸ÑÐ¸ÐºÐ°ÑÐ¾ÑÐ¾Ð¼ Ð¾Ð¿ÐµÑÐ°ÑÐ¸Ð¸.")
  }

  // Read the committed receipt, including on duplicate=true. Never recompute
  // totals or award bonuses here: the RPC commits those changes exactly once.
  const { data: sale, error: readError } = await supabase
    .from("sales")
    .select("id, total, bonus_earned, profit")
    .eq("id", result.sale_id)
    .eq("shop_id", shopId)
    .single()
  if (readError || !sale) {
    throw new Error("ÐÑÐ¾Ð´Ð°Ð¶Ð° Ð¿ÑÐ¾Ð²ÐµÐ´ÐµÐ½Ð°, Ð½Ð¾ Ð¾ÑÐ²ÐµÑ Ð½Ðµ Ð¿Ð¾Ð»ÑÑÐµÐ½. ÐÐ¾Ð²ÑÐ¾ÑÐ¸ÑÐµ Ð¾ÑÐ¿ÑÐ°Ð²ÐºÑ Ñ ÑÐµÐ¼ Ð¶Ðµ Ð¸Ð´ÐµÐ½ÑÐ¸ÑÐ¸ÐºÐ°ÑÐ¾ÑÐ¾Ð¼ â Ð¿Ð¾Ð²ÑÐ¾ÑÐ½Ð¾Ð³Ð¾ ÑÐ¿Ð¸ÑÐ°Ð½Ð¸Ñ Ð½Ðµ Ð±ÑÐ´ÐµÑ.")
  }

  revalidatePath("/crm")
  return {
    total: Number(sale.total),
    bonusEarned: Number(sale.bonus_earned),
    profit: Number(sale.profit),
    saleId: sale.id,
    clientOpId,
    duplicate: result.duplicate === true,
  }
}
