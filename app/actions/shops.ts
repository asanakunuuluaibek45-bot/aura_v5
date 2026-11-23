"use server"

import { createClient } from "@/lib/supabase/server"
import { getRequestCrmContext } from "@/lib/supabase/request-context"
import { revalidatePath } from "next/cache"
import type { AccessibleBranch } from "@/lib/supabase/current-shop"

export type PublicShop = {
  shop_id: string
  shop_name: string | null
}

/** Список публичных магазинов для главной страницы (витрина маркетплейса). */
export async function getPublicShops(limit = 100): Promise<PublicShop[]> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return []
    }
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 100
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("shop_settings")
      .select("shop_id, shop_name")
      .eq("public_enabled", true)
      .limit(safeLimit)

    if (error) {
      console.error("[shops] public shops error:", error.message)
      return []
    }
    return (data as PublicShop[]) ?? []
  } catch (err) {
    console.warn("[shops] public shops fallback:", err)
    return []
  }
}

export type OwnShopPublicState = { enabled: boolean; canToggle: boolean }

async function requireBusinessAdminBranchContext() {
  const { supabase, user, profile, branchContext } = await getRequestCrmContext()
  if (!user) throw new Error("Требуется вход в систему")
  if (!profile || profile.status !== "approved" || profile.role !== "admin") {
    throw new Error("Только владелец бизнеса может управлять филиалами")
  }
  if (!branchContext.businessId || !branchContext.activeShopId) {
    throw new Error("Не удалось подтвердить бизнес и активный филиал")
  }
  return { supabase, branchContext }
}

/** Creates a branch for the authenticated admin's business. */
export async function createBusinessBranch(shopName: string): Promise<string> {
  const name = typeof shopName === "string" ? shopName.trim() : ""
  if (!name || name.length > 200) {
    throw new Error("Укажите название филиала длиной от 1 до 200 символов")
  }

  const { supabase, branchContext } = await requireBusinessAdminBranchContext()
  const { data, error } = await supabase.rpc("create_business_branch", {
    _business_id: branchContext.businessId,
    _shop_name: name,
  })
  if (error || typeof data !== "string") {
    throw new Error("Не удалось создать филиал" + (error ? `: ${error.message}` : ""))
  }

  revalidatePath("/crm/pos")
  revalidatePath("/crm/reports")
  return data
}

/** Rename only the active accessible branch; database policies remain authoritative. */
export async function renameActiveBusinessBranch(shopName: string): Promise<void> {
  const name = typeof shopName === "string" ? shopName.trim() : ""
  if (!name || name.length > 200) {
    throw new Error("Укажите название филиала длиной от 1 до 200 символов")
  }

  const { supabase, branchContext } = await requireBusinessAdminBranchContext()
  const activeBranch = branchContext.branches.find(
    (branch: AccessibleBranch) => branch.shopId === branchContext.activeShopId,
  )
  if (!activeBranch || activeBranch.businessId !== branchContext.businessId) {
    throw new Error("Нет доступа к выбранному филиалу")
  }

  const { data, error } = await supabase
    .from("shop_settings")
    .update({ shop_name: name, updated_at: new Date().toISOString() })
    .eq("shop_id", activeBranch.shopId)
    .select("shop_id, shop_name")
    .maybeSingle()
  if (error || data?.shop_id !== activeBranch.shopId || data.shop_name !== name) {
    throw new Error("Не удалось переименовать филиал" + (error ? `: ${error.message}` : ""))
  }

  revalidatePath("/crm/pos")
  revalidatePath("/crm/reports")
}

/** Select an active branch only from the authenticated server-provided allowlist. */
export async function setActiveBusinessBranch(shopId: string): Promise<void> {
  if (typeof shopId !== "string" || !shopId.trim()) {
    throw new Error("Выберите филиал")
  }
  const { supabase, user, profile, branchContext } = await getRequestCrmContext()
  if (!user) throw new Error("Требуется вход в систему")
  if (!profile || profile.status !== "approved") throw new Error("Аккаунт не подтверждён")

  const branch = branchContext.branches.find((item) => item.shopId === shopId)
  if (!branch || branch.businessId !== branchContext.businessId) {
    throw new Error("У вас нет доступа к выбранному филиалу")
  }

  const { data, error } = await supabase.rpc("set_active_shop", { _shop_id: shopId })
  if (error || data !== shopId) {
    throw new Error("Не удалось переключить филиал" + (error ? `: ${error.message}` : ""))
  }

  revalidatePath("/crm/pos")
  revalidatePath("/crm/reports")
}

async function requireOwnShopAdminContext() {
  const { supabase, user, profile, shopId } = await getRequestCrmContext()
  if (!user) throw new Error("Требуется вход в систему")
  if (!profile || profile.status !== "approved" || profile.role !== "admin") {
    throw new Error("Только администратор магазина может менять публичность витрины")
  }
  if (!profile.shop_id || shopId !== profile.shop_id) {
    throw new Error("Не удалось подтвердить ваш магазин")
  }
  return { supabase, shopId: profile.shop_id }
}

/** Читает состояние публичности только собственного магазина администратора. */
export async function getOwnShopPublicState(): Promise<OwnShopPublicState> {
  const { supabase, shopId } = await requireOwnShopAdminContext()
  const { data: settings, error } = await supabase
    .from("shop_settings")
    .select("public_enabled")
    .eq("shop_id", shopId)
    .single()
  if (error || !settings) throw new Error("Не удалось загрузить настройки публичной витрины")

  // До применения SQL-миграции переключатель остаётся выключенным, чтобы
  // нельзя было скрыть магазин, пока прямые публичные URL ещё не защищены.
  const { data: rpcEnabled, error: visibilityError } = await supabase.rpc(
    "public_shop_is_enabled",
    { _shop_id: shopId },
  )
  return {
    enabled: Boolean(settings.public_enabled),
    canToggle: !visibilityError && typeof rpcEnabled === "boolean" && rpcEnabled === Boolean(settings.public_enabled),
  }
}

/** Меняет публичность только для магазина, привязанного к текущему admin-профилю. */
export async function setOwnShopPublicEnabled(enabled: boolean): Promise<void> {
  if (typeof enabled !== "boolean") throw new Error("Некорректное значение публичности витрины")
  const { supabase, shopId } = await requireOwnShopAdminContext()
  const { data: rpcEnabled, error: visibilityError } = await supabase.rpc("public_shop_is_enabled", { _shop_id: shopId })
  if (!visibilityError && typeof rpcEnabled !== "boolean") {
    throw new Error("Не удалось подтвердить состояние публичной витрины")
  }
  if (visibilityError) {
    if (["PGRST202", "42883"].includes(visibilityError.code ?? "")) {
      throw new Error("Сначала необходимо обновить базу данных для управления публичной витриной")
    }
    throw new Error("Не удалось проверить публичную витрину: " + visibilityError.message)
  }

  const { data, error } = await supabase
    .from("shop_settings")
    .update({ public_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("shop_id", shopId)
    .select("public_enabled")
    .single()
  if (error || !data || data.public_enabled !== enabled) {
    throw new Error("Не удалось изменить публичность витрины" + (error ? ": " + error.message : ""))
  }

  revalidatePath("/crm/showcase")
  revalidatePath("/")
  revalidatePath("/store/[shopId]", "page")
  revalidatePath("/store/[shopId]/[sku]", "page")
  revalidatePath("/store/[shopId]/product/[article]", "page")
}

/** Проверяет, доступна ли публичная витрина для посетителя. */
export async function isPublicShopEnabled(shopId: string): Promise<boolean> {
  if (!shopId) return false
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("public_shop_is_enabled", { _shop_id: shopId })
    if (!error) return data === true
    if (["PGRST202", "42883"].includes(error.code ?? "")) {
      // Preserve existing public pages until the rollout migration is deployed.
      console.warn("[shops] Public visibility migration is not applied yet")
      return true
    }
    console.error("[shops] Public visibility check failed:", error.message)
    return false
  } catch (error) {
    console.error("[shops] Public visibility check failed:", error)
    return false
  }
}
