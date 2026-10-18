"use server"

import { revalidatePath } from "next/cache"
import type { CashOperation, CashReasonPreset, CashSource } from "@/lib/types"
import { getRequestCrmContext } from "@/lib/supabase/request-context"
import { resolveClientOperationId } from "@/lib/client-operation"

async function requireProfile() {
  const { supabase, user, profile, shopId } = await getRequestCrmContext()
  if (!user) throw new Error("Unauthorized")
  if (!profile || profile.status !== "approved") throw new Error("Not approved")
  return { supabase, user, profile, shopId }
}

async function requireAdmin() {
  const ctx = await requireProfile()
  if (ctx.profile.role !== "admin" && ctx.profile.role !== "super_admin") throw new Error("Forbidden")
  return ctx
}

export type CashData = {
  operations: CashOperation[]
  presets: CashReasonPreset[]
}

/** ÐÐ¿ÐµÑÐ°ÑÐ¸Ð¸ Ñ ÐºÐ°ÑÑÐ¾Ð¹ Ð¸ ÑÐ°Ð±Ð»Ð¾Ð½Ñ Ð¿ÑÐ¸ÑÐ¸Ð½ ÑÐµÐºÑÑÐµÐ³Ð¾ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð°. */
export async function getCashData(): Promise<CashData> {
  const { supabase, shopId } = await requireProfile()
  if (!shopId) return { operations: [], presets: [] }

  const [ops, presets] = await Promise.all([
    supabase
      .from("cash_operations")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .range(0, 199),
    supabase
      .from("cash_reason_presets")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false }),
  ])

  // Ð¢Ð°Ð±Ð»Ð¸Ñ Ð¼Ð¾Ð¶ÐµÑ ÐµÑÑ Ð½Ðµ Ð±ÑÑÑ, Ð¿Ð¾ÐºÐ° Ð½Ðµ Ð²ÑÐ¿Ð¾Ð»Ð½ÐµÐ½Ð° Ð¼Ð¸Ð³ÑÐ°ÑÐ¸Ñ 003 â Ð½Ðµ ÑÐ¾Ð½ÑÐµÐ¼ ÑÐºÑÐ°Ð½.
  return {
    operations: (ops.data as CashOperation[]) ?? [],
    presets: (presets.data as CashReasonPreset[]) ?? [],
  }
}

/** ÐÐ½ÐµÑÐµÐ½Ð¸Ðµ, Ð¸Ð·ÑÑÑÐ¸Ðµ Ð¸Ð»Ð¸ Ð¸Ð½ÐºÐ°ÑÑÐ°ÑÐ¸Ñ ÑÑÐµÐ´ÑÑÐ². ÐÑÐ¸ÑÐ¸Ð½Ð° Ð¾Ð±ÑÐ·Ð°ÑÐµÐ»ÑÐ½Ð°. Ð¢Ð¾Ð»ÑÐºÐ¾ Ð°Ð´Ð¼Ð¸Ð½Ð¸ÑÑÑÐ°ÑÐ¾Ñ. */
export async function createCashOperation(input: {
  type: "income" | "outcome" | "collection"
  amount: number
  /** ÐÑÑÐ¾ÑÐ½Ð¸Ðº ÑÑÐµÐ´ÑÑÐ²: Ð½Ð°Ð»Ð¸ÑÐ½ÑÐµ, ÑÐ»ÐµÐºÑÑÐ¾Ð½Ð½ÑÐµ Ð¸Ð»Ð¸ Ð¾Ð±Ð°. */
  source?: CashSource
  amount_cash?: number
  amount_electronic?: number
  reason: string
  savePreset?: boolean
  /** Ð¡Ð¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð·Ð° Ð»Ð¾Ð¼ Ð¿ÑÐ¾Ð²Ð¾Ð´Ð¸ÑÑÑ Ð¿ÑÐ¾Ð´Ð°Ð²ÑÐ¾Ð¼, Ð° Ð½Ðµ ÑÐ¾Ð»ÑÐºÐ¾ Ð°Ð´Ð¼Ð¸Ð½Ð¸ÑÑÑÐ°ÑÐ¾ÑÐ¾Ð¼. */
  allowSeller?: boolean
  /** Keep this UUID unchanged when retrying after a network failure. */
  client_op_id?: string
}) {
  const { supabase, shopId } = input.allowSeller ? await requireProfile() : await requireAdmin()
  const clientOpId = resolveClientOperationId(input.client_op_id)

  // ÐÑÐ¾Ð²ÐµÑÐºÐ° Ð½Ð° Ð¿ÑÐ¸Ð²ÑÐ·ÐºÑ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð°
  if (!shopId) {
    throw new Error("ÐÐ°Ñ Ð°ÐºÐºÐ°ÑÐ½Ñ Ð½Ðµ Ð¿ÑÐ¸Ð²ÑÐ·Ð°Ð½ Ð½Ð¸ Ðº Ð¾Ð´Ð½Ð¾Ð¼Ñ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ñ")
  }

  const amount = Math.round(Number(input.amount) * 100) / 100
  const reason = (input.reason ?? "").trim()
  
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Ð£ÐºÐ°Ð¶Ð¸ÑÐµ ÑÑÐ¼Ð¼Ñ Ð±Ð¾Ð»ÑÑÐµ Ð½ÑÐ»Ñ")
  if (!reason) throw new Error("ÐÑÐ¸ÑÐ¸Ð½Ð° / ÑÐµÐ»Ñ Ð¾Ð¿ÐµÑÐ°ÑÐ¸Ð¸ Ð¾Ð±ÑÐ·Ð°ÑÐµÐ»ÑÐ½Ð°")
  if (reason.length > 300) throw new Error("ÐÑÐ¸ÑÐ¸Ð½Ð° ÑÐ»Ð¸ÑÐºÐ¾Ð¼ Ð´Ð»Ð¸Ð½Ð½Ð°Ñ (Ð¼Ð°ÐºÑÐ¸Ð¼ÑÐ¼ 300 ÑÐ¸Ð¼Ð²Ð¾Ð»Ð¾Ð²)")
  
  // ÐÑÐ¾Ð²ÐµÑÑÐµÐ¼ ÑÐ°Ð·ÑÐµÑÐµÐ½Ð½ÑÐµ ÑÐ¸Ð¿Ñ Ð¾Ð¿ÐµÑÐ°ÑÐ¸Ð¹ Ñ ÑÑÐµÑÐ¾Ð¼ Ð¸Ð½ÐºÐ°ÑÑÐ°ÑÐ¸Ð¸
  if (input.type !== "income" && input.type !== "outcome" && input.type !== "collection") {
    throw new Error("ÐÐµÐ²ÐµÑÐ½ÑÐ¹ ÑÐ¸Ð¿ Ð¾Ð¿ÐµÑÐ°ÑÐ¸Ð¸")
  }

  // ------------------------------------------------- Ð¸ÑÑÐ¾ÑÐ½Ð¸Ðº Ð¸ ÐµÐ³Ð¾ ÑÐ°Ð·Ð±Ð¸Ð²ÐºÐ°
  // ÐÐ½ÐºÐ°ÑÑÐ°ÑÐ¸Ñ Ð²ÑÐµÐ³Ð´Ð° Ð¿ÐµÑÐµÐ²Ð¾Ð´Ð¸Ñ Ð½Ð°Ð»Ð¸ÑÐ½ÑÐµ Ð² ÑÐ»ÐµÐºÑÑÐ¾Ð½Ð½ÑÐµ ÑÑÐµÐ´ÑÑÐ²Ð°.
  const source: CashSource = input.type === "collection" ? "cash" : (input.source ?? "cash")
  if (source !== "cash" && source !== "electronic" && source !== "mixed") {
    throw new Error("ÐÐµÐ²ÐµÑÐ½ÑÐ¹ Ð¸ÑÑÐ¾ÑÐ½Ð¸Ðº ÑÑÐµÐ´ÑÑÐ²")
  }

  let fromCash = source === "cash" ? amount : 0
  let fromElectronic = source === "electronic" ? amount : 0
  if (source === "mixed") {
    fromCash = Math.round(Number(input.amount_cash ?? 0) * 100) / 100
    fromElectronic = Math.round(Number(input.amount_electronic ?? 0) * 100) / 100
    if (!Number.isFinite(fromCash) || !Number.isFinite(fromElectronic)) {
      throw new Error("Ð£ÐºÐ°Ð¶Ð¸ÑÐµ ÐºÐ¾ÑÑÐµÐºÑÐ½ÑÐµ ÑÑÐ¼Ð¼Ñ Ð¾Ð¿Ð»Ð°ÑÑ")
    }
    if (fromCash < 0 || fromElectronic < 0) throw new Error("Ð¡ÑÐ¼Ð¼Ñ Ð½Ðµ Ð¼Ð¾Ð³ÑÑ Ð±ÑÑÑ Ð¾ÑÑÐ¸ÑÐ°ÑÐµÐ»ÑÐ½ÑÐ¼Ð¸")
    if (Math.round(fromCash * 100) + Math.round(fromElectronic * 100) !== Math.round(amount * 100)) {
      throw new Error("Ð¡ÑÐ¼Ð¼Ð° Ð½Ð°Ð»Ð¸ÑÐ½ÑÑ Ð¸ ÑÐ»ÐµÐºÑÑÐ¾Ð½Ð½ÑÑ Ð´Ð¾Ð»Ð¶Ð½Ð° ÑÐ¾Ð²Ð¿Ð°Ð´Ð°ÑÑ Ñ Ð¾Ð±ÑÐµÐ¹ ÑÑÐ¼Ð¼Ð¾Ð¹")
    }
  }

  const { data: result, error } = await supabase.rpc("create_cash_operation_atomic", {
    _client_op_id: clientOpId,
    _type: input.type,
    _amount: amount,
    _source: source,
    _amount_cash: fromCash,
    _amount_electronic: fromElectronic,
    _reason: reason,
    _allow_seller: input.allowSeller === true,
    _save_preset: input.savePreset === true,
  })
  if (error) throw new Error(`ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð¿ÑÐ¾Ð²ÐµÑÑÐ¸ ÐºÐ°ÑÑÐ¾Ð²ÑÑ Ð¾Ð¿ÐµÑÐ°ÑÐ¸Ñ: ${error.message}`)
  if (result?.accepted !== true) {
    throw new Error("ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ´Ð¸ÑÑ ÐºÐ°ÑÑÐ¾Ð²ÑÑ Ð¾Ð¿ÐµÑÐ°ÑÐ¸Ñ. ÐÐ¾Ð²ÑÐ¾ÑÐ¸ÑÐµ Ñ ÑÐµÐ¼ Ð¶Ðµ Ð¸Ð´ÐµÐ½ÑÐ¸ÑÐ¸ÐºÐ°ÑÐ¾ÑÐ¾Ð¼.")
  }

  revalidatePath("/crm")
  return { ok: true, operationId: result.operation_id, clientOpId, duplicate: result.duplicate === true }
}

/** Ð£Ð´Ð°Ð»Ð¸ÑÑ ÑÐ°Ð±Ð»Ð¾Ð½ Ð¿ÑÐ¸ÑÐ¸Ð½Ñ. Ð¢Ð¾Ð»ÑÐºÐ¾ Ð°Ð´Ð¼Ð¸Ð½Ð¸ÑÑÑÐ°ÑÐ¾Ñ. */
export async function deleteCashReasonPreset(id: string) {
  const { supabase, shopId } = await requireAdmin()
  if (!shopId) throw new Error("ÐÐ°Ñ Ð°ÐºÐºÐ°ÑÐ½Ñ Ð½Ðµ Ð¿ÑÐ¸Ð²ÑÐ·Ð°Ð½ Ð½Ð¸ Ðº Ð¾Ð´Ð½Ð¾Ð¼Ñ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ñ")
  const { error } = await supabase.from("cash_reason_presets").delete().eq("id", id).eq("shop_id", shopId)
  if (error) throw error
  revalidatePath("/crm")
  return { ok: true }
}
