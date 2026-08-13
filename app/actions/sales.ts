"use server"

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
  if (error) throw error
  return (data as Sale[]) ?? []
}

export type CheckoutInput = {
  items: SaleItem[]
  discount: number
  payment_method: string
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
