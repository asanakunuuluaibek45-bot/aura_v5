"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Profile } from "@/lib/types"
import { getRequestCrmContext } from "@/lib/supabase/request-context"

async function requireProfile() {
  const { supabase, user, profile, shopId } = await getRequestCrmContext()
  if (!user) throw new Error("Unauthorized")
  if (!profile || profile.status !== "approved") throw new Error("Not approved")
  return { supabase, user, profile: profile as Profile, shopId }
}

async function requireAdmin() {
  const ctx = await requireProfile()
  if (ctx.profile.role !== "admin" && ctx.profile.role !== "super_admin") throw new Error("Forbidden")
  return ctx
}

async function requireSuperAdmin() {
  const ctx = await requireProfile()
  if (ctx.profile.role !== "super_admin") throw new Error("Forbidden")
  return ctx
}

export type CabinetData = {
  team: Profile[]
  requests: Profile[]
  defaultBonusRate: number
}

/** ÐÐ°Ð½Ð½ÑÐµ ÐºÐ°Ð±Ð¸Ð½ÐµÑÐ° Ñ ÑÑÑÑÐ¾Ð¼ ÑÐ¾Ð»Ð¸: ÑÑÐ¿ÐµÑ-Ð°Ð´Ð¼Ð¸Ð½ Ð²Ð¸Ð´Ð¸Ñ Ð²ÑÐµÑ, Ð°Ð´Ð¼Ð¸Ð½ â ÑÐ²Ð¾Ð¸Ñ Ð¿ÑÐ¾Ð´Ð°Ð²ÑÐ¾Ð². */
export async function getCabinetData(): Promise<CabinetData> {
  const { supabase, profile, shopId } = await requireProfile()

  if (profile.role === "seller") {
    return { team: [], requests: [], defaultBonusRate: profile.bonus_rate ?? 2 }
  }

  const isSuper = profile.role === "super_admin"

  // Ð¡ÑÐ¿ÐµÑ-Ð°Ð´Ð¼Ð¸Ð½ ÑÐ¸ÑÐ°ÐµÑ ÑÐ¾ÑÑÑÐ´Ð½Ð¸ÐºÐ¾Ð² ÑÐ²Ð¾ÐµÐ³Ð¾ (Ð¸Ð»Ð¸ impersonated) Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð°.
  const { data: all, error } = shopId
    ? await supabase
        .from("profiles")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
    : { data: [], error: null }
  if (error) throw error

  const rows = (all as Profile[]) ?? []
  const { data: settings } = shopId
    ? await supabase
        .from("shop_settings")
        .select("default_bonus_rate")
        .eq("shop_id", shopId)
        .maybeSingle()
    : { data: null }

  const team = rows.filter((p) => {
    if (p.id === profile.id) return false
    if (p.status !== "approved") return false
    if (isSuper) return p.role === "admin" || p.role === "seller"
    // ÐÐ´Ð¼Ð¸Ð½ Ð²Ð¸Ð´Ð¸Ñ ÑÐ¾Ð»ÑÐºÐ¾ ÑÐ²Ð¾Ð¸Ñ Ð¿ÑÐ¾Ð´Ð°Ð²ÑÐ¾Ð² (Ð¸ ÐµÑÑ Ð½Ðµ Ð·Ð°ÐºÑÐµÐ¿Ð»ÑÐ½Ð½ÑÑ).
    return p.role === "seller" && (p.manager_id === profile.id || !p.manager_id)
  })

  // Ð¡ÑÐ¿ÐµÑ-Ð°Ð´Ð¼Ð¸Ð½ Ð²Ð¸Ð´Ð¸Ñ Ð·Ð°ÑÐ²ÐºÐ¸ Ð¸Ð· ÐÐ¡ÐÐ¥ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð¾Ð² (Ð½Ðµ ÑÐ¾Ð»ÑÐºÐ¾ ÑÐ²Ð¾ÐµÐ³Ð¾).
  let requests: Profile[] = []
  if (isSuper) {
    const { data: allPending, error: pendingError } = await supabase
      .from("profiles")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
    if (pendingError) throw pendingError
    requests = (allPending as Profile[]) ?? []
  }

  return {
    team,
    requests,
    defaultBonusRate: Number(settings?.default_bonus_rate ?? 2),
  }
}

/**
 * ÐÐ´Ð¾Ð±ÑÐ¸ÑÑ Ð·Ð°ÑÐ²ÐºÑ: ÑÑÐ¿ÐµÑ-Ð°Ð´Ð¼Ð¸Ð½ Ð½Ð°Ð·Ð½Ð°ÑÐ°ÐµÑ ÑÐ¾Ð»Ñ (Ð°Ð´Ð¼Ð¸Ð½ / Ð¿ÑÐ¾Ð´Ð°Ð²ÐµÑ).
 * Ð Ð°Ð±Ð¾ÑÐ°ÐµÑ Ð´Ð»Ñ Ð·Ð°ÑÐ²Ð¾Ðº Ð¸Ð· ÐÐ®ÐÐÐÐ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð° â Ð¾Ð³ÑÐ°Ð½Ð¸ÑÐµÐ½Ð¸Ðµ .eq("shop_id") ÑÐ½ÑÑÐ¾.
 * ÐÑÐ¿Ð¾Ð»ÑÐ·ÑÐµÑÑÑ RPC-ÑÑÐ½ÐºÑÐ¸Ñ superadmin_approve_request (SECURITY DEFINER),
 * ÐºÐ¾ÑÐ¾ÑÐ°Ñ ÑÐ°Ð¼Ð° Ð¿ÑÐ¾Ð²ÐµÑÑÐµÑ Ð½Ð°Ð»Ð¸ÑÐ¸Ðµ ÑÐ¾Ð»Ð¸ super_admin Ñ Ð²ÑÐ·ÑÐ²Ð°ÑÑÐµÐ³Ð¾.
 */
export async function approveRequest(id: string, role: "admin" | "seller") {
  const { supabase } = await requireSuperAdmin()
  const { error } = await supabase.rpc("superadmin_approve_request", {
    _profile_id: id,
    _role: role,
  })
  if (error) throw new Error(`ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð¾Ð´Ð¾Ð±ÑÐ¸ÑÑ Ð·Ð°ÑÐ²ÐºÑ: ${error.message}`)
  revalidatePath("/")
}

/**
 * ÐÑÐºÐ»Ð¾Ð½Ð¸ÑÑ Ð·Ð°ÑÐ²ÐºÑ: ÑÑÐ¿ÐµÑ-Ð°Ð´Ð¼Ð¸Ð½ Ð¼Ð¾Ð¶ÐµÑ Ð¾ÑÐºÐ»Ð¾Ð½Ð¸ÑÑ Ð¸Ð· Ð»ÑÐ±Ð¾Ð³Ð¾ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð°.
 * ÐÑÐ¿Ð¾Ð»ÑÐ·ÑÐµÑÑÑ RPC-ÑÑÐ½ÐºÑÐ¸Ñ superadmin_reject_request (SECURITY DEFINER).
 */
export async function rejectRequest(id: string) {
  const { supabase } = await requireSuperAdmin()
  const { error } = await supabase.rpc("superadmin_reject_request", {
    _profile_id: id,
  })
  if (error) throw new Error(`ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð¾ÑÐºÐ»Ð¾Ð½Ð¸ÑÑ Ð·Ð°ÑÐ²ÐºÑ: ${error.message}`)
  revalidatePath("/")
}

/** Ð£Ð´Ð°Ð»ÐµÐ½Ð¸Ðµ ÑÐ¾ÑÑÑÐ´Ð½Ð¸ÐºÐ°: Ð°Ð´Ð¼Ð¸Ð½ â ÑÐ¾Ð»ÑÐºÐ¾ ÑÐ²Ð¾Ð¸Ñ Ð¿ÑÐ¾Ð´Ð°Ð²ÑÐ¾Ð², ÑÑÐ¿ÐµÑ-Ð°Ð´Ð¼Ð¸Ð½ â Ð»ÑÐ±Ð¾Ð³Ð¾. */
export async function removeMember(id: string) {
  const { supabase, profile, shopId } = await requireAdmin()
  if (id === profile.id) throw new Error("ÐÐµÐ»ÑÐ·Ñ ÑÐ´Ð°Ð»Ð¸ÑÑ ÑÐ°Ð¼Ð¾Ð³Ð¾ ÑÐµÐ±Ñ")

  const { data: target } = await supabase.from("profiles").select("*").eq("id", id).single()
  const t = target as Profile | null
  if (!t || t.shop_id !== shopId) throw new Error("Ð¡Ð¾ÑÑÑÐ´Ð½Ð¸Ðº Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½")

  if (profile.role !== "super_admin") {
    if (t.role !== "seller" || (t.manager_id && t.manager_id !== profile.id)) {
      throw new Error("ÐÐ¾Ð¶Ð½Ð¾ ÑÐ´Ð°Ð»ÑÑÑ ÑÐ¾Ð»ÑÐºÐ¾ ÑÐ²Ð¾Ð¸Ñ Ð¿ÑÐ¾Ð´Ð°Ð²ÑÐ¾Ð²")
    }
  }

  const { error } = await supabase.from("profiles").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/")
}

/** ÐÐµÑÑÐ¾Ð½Ð°Ð»ÑÐ½ÑÐ¹ Ð¿ÑÐ¾ÑÐµÐ½Ñ Ð±Ð¾Ð½ÑÑÐ¾Ð² ÑÐ¾ÑÑÑÐ´Ð½Ð¸ÐºÐ°. */
export async function setMemberBonusRate(id: string, rate: number) {
  const { supabase, profile, shopId } = await requireAdmin()
  const value = Math.max(0, Math.min(100, Number(rate) || 0))

  const { data: target } = await supabase.from("profiles").select("*").eq("id", id).single()
  const t = target as Profile | null
  if (!t || t.shop_id !== shopId) throw new Error("Ð¡Ð¾ÑÑÑÐ´Ð½Ð¸Ðº Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½")
  if (profile.role !== "super_admin" && t.role !== "seller" && t.id !== profile.id) {
    throw new Error("ÐÐµÐ´Ð¾ÑÑÐ°ÑÐ¾ÑÐ½Ð¾ Ð¿ÑÐ°Ð²")
  }

  const { error } = await supabase.rpc("set_bonus_rate", { _user_id: id, _rate: value })
  if (error) throw error
  revalidatePath("/")
  revalidatePath("/crm")
}

/** ÐÐ±ÑÐ¸Ð¹ Ð¿ÑÐ¾ÑÐµÐ½Ñ Ð±Ð¾Ð½ÑÑÐ¾Ð² Ð¿Ð¾ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ñ â ÑÐ¾Ð»ÑÐºÐ¾ ÑÑÐ¿ÐµÑ-Ð°Ð´Ð¼Ð¸Ð½. */
export async function setDefaultBonusRate(rate: number) {
  const { supabase, shopId } = await requireSuperAdmin()
  const value = Math.max(0, Math.min(100, Number(rate) || 0))
  if (!shopId) throw new Error("Ð¡Ð½Ð°ÑÐ°Ð»Ð° Ð²ÑÐ±ÐµÑÐ¸ÑÐµ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½")
  const { error } = await supabase
    .from("shop_settings")
    .upsert(
      { shop_id: shopId, default_bonus_rate: value, updated_at: new Date().toISOString() },
      { onConflict: "shop_id" },
    )
  if (error) throw error
  revalidatePath("/")
}

/** ÐÑÐ¼ÐµÑÐºÐ° Ð¿ÑÐ¸ÑÑÑÑÑÐ²Ð¸Ñ â Ð²ÑÐ·ÑÐ²Ð°ÐµÑÑÑ ÐºÐ»Ð¸ÐµÐ½ÑÐ¾Ð¼ ÑÐ°Ð· Ð² Ð¼Ð¸Ð½ÑÑÑ. */
export async function touchPresence() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await supabase.rpc("touch_presence")
}

/** ÐÐ±Ð½ÑÐ»Ð¸ÑÑ Ð±Ð¾Ð½ÑÑÐ½ÑÐ¹ Ð±Ð°Ð»Ð°Ð½Ñ ÑÐ¾ÑÑÑÐ´Ð½Ð¸ÐºÐ° â ÑÐ¾Ð»ÑÐºÐ¾ Ð°Ð´Ð¼Ð¸Ð½ / ÑÑÐ¿ÐµÑ-Ð°Ð´Ð¼Ð¸Ð½. */
export async function resetBonusPoints(id: string) {
  const { supabase, profile, shopId } = await requireAdmin()

  const { data: target } = await supabase.from("profiles").select("*").eq("id", id).single()
  const t = target as Profile | null
  if (!t || t.shop_id !== shopId) throw new Error("Ð¡Ð¾ÑÑÑÐ´Ð½Ð¸Ðº Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½")

  // ÐÐ¼Ñ Ð¿Ð°ÑÐ°Ð¼ÐµÑÑÐ° ÑÑÐ½ÐºÑÐ¸Ð¸ â _user_id (ÑÐ°Ð½ÐµÐµ Ð¿ÐµÑÐµÐ´Ð°Ð²Ð°Ð»ÑÑ Ð½ÐµÐ²ÐµÑÐ½ÑÐ¹ target_id,
  // Ð¸Ð·-Ð·Ð° ÑÐµÐ³Ð¾ Ð°Ð´Ð¼Ð¸Ð½Ñ Ð¸ ÑÑÐ¿ÐµÑ-Ð°Ð´Ð¼Ð¸Ð½Ñ Ð¿Ð¾Ð»ÑÑÐ°Ð»Ð¸ Ð¾ÑÐ¸Ð±ÐºÑ).
  const { error } = await supabase.rpc("reset_bonus_points", { _user_id: id })
  if (error) throw error
  revalidatePath("/")
  revalidatePath("/crm")
}

/** Ð£ÑÑÐ°Ð½Ð¾Ð²Ð¸ÑÑ ÑÐ¾ÑÐ½Ð¾Ðµ ÐºÐ¾Ð»Ð¸ÑÐµÑÑÐ²Ð¾ Ð±Ð¾Ð½ÑÑÐ½ÑÑ Ð±Ð°Ð»Ð»Ð¾Ð² ÑÐ¾ÑÑÑÐ´Ð½Ð¸ÐºÐ° â Ð°Ð´Ð¼Ð¸Ð½ / ÑÑÐ¿ÐµÑ-Ð°Ð´Ð¼Ð¸Ð½. */
export async function setBonusPoints(id: string, points: number) {
  const { supabase, profile, shopId } = await requireAdmin()
  const value = Math.max(0, Number(points) || 0)

  const { data: target } = await supabase.from("profiles").select("*").eq("id", id).single()
  const t = target as Profile | null
  if (!t || t.shop_id !== shopId) throw new Error("Ð¡Ð¾ÑÑÑÐ´Ð½Ð¸Ðº Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½")

  const { error } = await supabase.rpc("set_bonus_points", { _user_id: id, _points: value })
  if (error) throw error
  revalidatePath("/")
  revalidatePath("/crm")
}
