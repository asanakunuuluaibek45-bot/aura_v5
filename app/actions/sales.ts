"use server"

<<<<<<< HEAD
import { revalidatePath } from "next/cache"
import type { Sale, SaleItem } from "@/lib/types"
import { DEFAULT_RATES } from "@/lib/rates"
import { getRequestCrmContext } from "@/lib/supabase/request-context"
import { resolveClientOperationId } from "@/lib/client-operation"

async function requireProfile() {
  const { supabase, user, profile, shopId } = await getRequestCrmContext()
  if (!user) throw new Error("Сессия истекла. Войдите в систему заново")
  if (!profile) throw new Error("Профиль не найден")
  if (profile.status !== "approved") throw new Error("Ваш аккаунт ещё не подтверждён администратором")
  if (!shopId) throw new Error("Ваш аккаунт не привязан к магазину")
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
=======
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Sale, SaleItem } from "@/lib/types"

const DEFAULT_BONUS_RATE = 2 // % от прибыли, если не задано иное

async function requireProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()
  if (!profile || profile.status !== "approved") throw new Error("Not approved")
  return { supabase, user, profile }
}

export async function getSales(): Promise<Sale[]> {
  const { supabase } = await requireProfile()
  const { data, error } = await supabase.from("sales").select("*").order("created_at", { ascending: false })
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
  if (error) throw error
  return (data as Sale[]) ?? []
}

export type CheckoutInput = {
  items: SaleItem[]
  discount: number
  payment_method: string
<<<<<<< HEAD
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
  if (items.length === 0) throw new Error("Чек пуст — добавьте хотя бы одну позицию")
  if (items.length > 200) throw new Error("Слишком много позиций в одном чеке")
  if (!PAYMENTS.has(input.payment_method)) throw new Error("Выберите корректный способ оплаты")
  if (items.some((item) => Number(item.quantity) !== 1)) {
    throw new Error("Количество каждой позиции должно быть равно 1")
  }
  const phone = (input.customer_phone ?? "").trim()
  if (phone && !/^[\d+()\s-]{5,20}$/.test(phone)) throw new Error("Проверьте номер телефона клиента")

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
    if (rateError) throw new Error(`Не удалось прочитать курс лома: ${rateError.message}`)
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
        throw new Error("Укажите корректный вес лома")
      }
      const metal = item.metal ?? ""
      const rate = scrapRates.get(metal) || DEFAULT_RATES[metal]?.scrap || 0
      if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Не задан курс лома для «${metal || "металла"}»`)
      validated.push({
        product_id: null, kind: "scrap", quantity: 1,
        name: item.name?.trim() || `Лом · ${metal}`,
        weight, metal, price_per_gram: rate, price: Math.round(weight * rate), cost: Math.round(weight * rate),
      })
    } else {
      const price = Number(item.price)
      if (!Number.isFinite(price) || price < 0) throw new Error("В чеке указана некорректная цена")
      if (!item.product_id) throw new Error("В позиции не указан товар")
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
  if (error) throw new Error(`Не удалось провести продажу: ${error.message}`)
  if (result?.accepted === false) {
    const product = result.product_name ? ` «${result.product_name}»` : ""
    throw new Error(`Конфликт остатков: товар${product} уже продан или недоступен. Обновите склад и проверьте чек.`)
  }
  if (result?.accepted !== true || !result.sale_id) {
    throw new Error("Не удалось подтвердить продажу. Повторите отправку с тем же идентификатором операции.")
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
    throw new Error("Продажа проведена, но ответ не получен. Повторите отправку с тем же идентификатором — повторного списания не будет.")
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
=======
  customer_name: string
  customer_phone: string
  bonus_used: number
}

export async function checkout(input: CheckoutInput) {
  const { supabase, user, profile } = await requireProfile()

  // Recompute all monetary values on the server from stored product prices.
  const productIds = input.items.map((i) => i.product_id)
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, sale_price, purchase_price, quantity, name")
    .in("id", productIds)
  if (prodErr) throw prodErr

  const priceMap = new Map(products?.map((p) => [p.id, p]) ?? [])

  let subtotal = 0
  let costTotal = 0
  const validated: SaleItem[] = []

  for (const item of input.items) {
    const p = priceMap.get(item.product_id)
    if (!p) throw new Error("Товар не найден")
    const qty = Math.max(1, Math.floor(item.quantity))
    if (qty > p.quantity) throw new Error(`Недостаточно на складе: ${p.name}`)
    subtotal += Number(p.sale_price) * qty
    costTotal += Number(p.purchase_price) * qty
    validated.push({
      product_id: item.product_id,
      name: p.name,
      weight: item.weight,
      metal: item.metal,
      quantity: qty,
      price: Number(p.sale_price),
      cost: Number(p.purchase_price),
    })
  }

  const discount = Math.max(0, Math.min(input.discount || 0, subtotal))
  const bonusUsed = Math.max(0, Math.min(input.bonus_used || 0, subtotal - discount))
  const total = Math.max(0, subtotal - discount - bonusUsed)
  const profit = total - costTotal

  // Процент бонусов: персональный у продавца, иначе общий по магазину.
  const { data: settings } = await supabase
    .from("shop_settings")
    .select("default_bonus_rate")
    .eq("shop_id", profile.shop_id)
    .maybeSingle()
  const rate = Number(profile.bonus_rate ?? settings?.default_bonus_rate ?? DEFAULT_BONUS_RATE)
  const bonusEarned = Math.round(Math.max(0, profit) * (rate / 100))

  const { error: saleErr } = await supabase.from("sales").insert({
    shop_id: profile.shop_id,
    seller_id: user.id,
    seller_name: profile.full_name,
    customer_name: input.customer_name || null,
    customer_phone: input.customer_phone || null,
    payment_method: input.payment_method,
    subtotal,
    discount,
    total,
    cost_total: costTotal,
    profit,
    bonus_earned: bonusEarned,
    bonus_used: bonusUsed,
    items: validated,
  })
  if (saleErr) throw saleErr

  // Decrement inventory
  for (const item of validated) {
    const p = priceMap.get(item.product_id)!
    const remaining = p.quantity - item.quantity
    await supabase
      .from("products")
      .update({ quantity: remaining, status: remaining <= 0 ? "sold" : "in_stock" })
      .eq("id", item.product_id)
  }

  // Начисляем бонусные баллы продавцу.
  if (bonusEarned > 0) {
    await supabase.rpc("add_bonus_points", { _amount: bonusEarned })
  }

  revalidatePath("/")
  return { total, bonusEarned, profit }
}
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
