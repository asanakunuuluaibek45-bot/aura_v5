"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { CashOperation, CashReasonPreset } from "@/lib/types"

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

async function requireAdmin() {
  const ctx = await requireProfile()
  if (ctx.profile.role !== "admin" && ctx.profile.role !== "super_admin") throw new Error("Forbidden")
  return ctx
}

export type CashData = {
  operations: CashOperation[]
  presets: CashReasonPreset[]
}

/** Операции с кассой и шаблоны причин текущего магазина. */
export async function getCashData(): Promise<CashData> {
  const { supabase, profile } = await requireProfile()

  const [ops, presets] = await Promise.all([
    supabase
      .from("cash_operations")
      .select("*")
      .eq("shop_id", profile.shop_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("cash_reason_presets")
      .select("*")
      .eq("shop_id", profile.shop_id)
      .order("created_at", { ascending: false }),
  ])

  // Таблиц может ещё не быть, пока не выполнена миграция 003 — не роняем экран.
  return {
    operations: (ops.data as CashOperation[]) ?? [],
    presets: (presets.data as CashReasonPreset[]) ?? [],
  }
}

/** Внесение, изъятие или инкассация средств. Причина обязательна. Только администратор. */
export async function createCashOperation(input: {
  type: "income" | "outcome" | "collection"
  amount: number
  reason: string
  savePreset?: boolean
}) {
  const { supabase, user, profile } = await requireAdmin()

  // Проверка на привязку магазина
  if (!profile.shop_id) {
    throw new Error("Ваш аккаунт не привязан ни к одному магазину")
  }

  const amount = Number(input.amount)
  const reason = (input.reason ?? "").trim()
  
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Укажите сумму больше нуля")
  if (!reason) throw new Error("Причина / цель операции обязательна")
  if (reason.length > 300) throw new Error("Причина слишком длинная (максимум 300 символов)")
  
  // Проверяем разрешенные типы операций с учетом инкассации
  if (input.type !== "income" && input.type !== "outcome" && input.type !== "collection") {
    throw new Error("Неверный тип операции")
  }

  const { error } = await supabase.from("cash_operations").insert({
    shop_id: profile.shop_id,
    created_by: user.id,
    author_name: profile.full_name,
    type: input.type,
    amount,
    reason,
  })
  
  if (error) throw error

  if (input.savePreset) {
    await supabase
      .from("cash_reason_presets")
      .insert({ shop_id: profile.shop_id, created_by: user.id, text: reason })
  }

  revalidatePath("/")
  return { ok: true }
}

/** Удалить шаблон причины. Только администратор. */
export async function deleteCashReasonPreset(id: string) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from("cash_reason_presets").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/")
  return { ok: true }
}