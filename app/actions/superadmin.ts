"use server"

import { revalidatePath } from "next/cache"
import type { SubscriptionStatus } from "@/lib/types"
import { getRequestCrmContext } from "@/lib/supabase/request-context"
import { toAdminShopDirectory, type AdminShopSummary } from "@/lib/admin/shop-directory"

// ---------------------------------------------------------------------------
// Типы (реэкспорт для обратной совместимости импортов)
// ---------------------------------------------------------------------------

export type { SubscriptionStatus } from "@/lib/types"

export type ShopBillingRow = {
  shop_id: string
  shop_name: string | null
  paid_until: string | null          // ISO date "YYYY-MM-DD"
  subscription_status: SubscriptionStatus
  auto_block: boolean
  is_frozen: boolean
  frozen_at: string | null
  member_count: number
  created_at: string | null
  /** Cards created after product-unit metering was enabled; null until its migration is applied. */
  product_units_used: number | null
}

export type UpdateShopBillingInput = {
  shop_id:             string
  paid_until?:         string | null
  subscription_status?: SubscriptionStatus
  auto_block?:         boolean
  is_frozen?:          boolean
  notes?:              string | null
}

export type BranchCreationRequestSummary = {
  id: string
  business_id: string
  business_name: string
  requested_by: string
  requester_name: string | null
  requested_shop_name: string
  source_shop_name: string
  status: "pending" | "approved" | "rejected"
  requested_at: string
  reviewed_at: string | null
  reviewer_name: string | null
  created_shop_id: string | null
}

export type AdminUserRow = {
  user_id: string
  full_name: string | null
  phone: string | null
  email: string | null
  role: "seller" | "admin" | "super_admin" | null
  status: "pending" | "approved" | "rejected"
  shop_id: string | null
  shop_name: string | null
  requested_role: string | null
  created_at: string
  has_business_data: boolean
}

export type UpdateAdminUserInput = {
  user_id: string
  full_name: string
  phone: string
  role: "seller" | "admin" | "super_admin"
  status: "pending" | "approved" | "rejected"
  shop_id: string | null
}

type RequestSupabase = Awaited<ReturnType<typeof getRequestCrmContext>>["supabase"]

async function getShopStoragePaths(supabase: RequestSupabase, folder: string): Promise<string[]> {
  const pageSize = 100
  const paths: string[] = []

  async function visit(currentFolder: string): Promise<void> {
    let offset = 0
    while (true) {
      const { data, error } = await supabase.storage
        .from("product-images")
        .list(currentFolder, { limit: pageSize, offset })
      if (error) throw new Error(`Не удалось прочитать фотографии магазина: ${error.message}`)

      const entries = data ?? []
      for (const entry of entries) {
        const path = `${currentFolder}/${entry.name}`
        if (entry.id === null) await visit(path)
        else paths.push(path)
      }
      if (entries.length < pageSize) break
      offset += pageSize
    }
  }

  await visit(folder)
  return paths
}

// ---------------------------------------------------------------------------
// Хелпер: проверить права суперадмина
// ---------------------------------------------------------------------------

async function requireSuperAdmin() {
  const { supabase, user, profile } = await getRequestCrmContext()
  if (!user) throw new Error("Требуется вход в систему")
  if (!profile || profile.status !== "approved" || profile.role !== "super_admin") {
    throw new Error("Доступ запрещён: требуется роль суперадмина")
  }
  return { supabase, user, profile }
}

// ---------------------------------------------------------------------------
// Получить список всех магазинов с биллингом
// ---------------------------------------------------------------------------

export async function getSuperAdminShops(): Promise<ShopBillingRow[]> {
  const { supabase } = await requireSuperAdmin()
  const [{ data, error }, { data: unitRows, error: unitError }] = await Promise.all([
    supabase.rpc("superadmin_list_shops"),
    supabase.rpc("superadmin_list_product_units"),
  ])
  if (error) throw new Error(`Не удалось загрузить список магазинов: ${error.message}`)
  if (unitError) console.warn("[superadmin] Product-unit usage is not available:", unitError.code)
  const unitsByShop = new Map<string, number>(
    (unitRows ?? []).map((row: { shop_id: string; units_used: number | string }) => [
      row.shop_id,
      Number(row.units_used) || 0,
    ]),
  )
  return ((data as Omit<ShopBillingRow, "product_units_used">[]) ?? []).map((shop) => ({
    ...shop,
    product_units_used: unitError ? null : unitsByShop.get(shop.shop_id) ?? 0,
  }))
}

/** Read-only platform directory. Only approved super_admin data reaches the UI. */
export async function getPlatformShopDirectory(): Promise<AdminShopSummary[]> {
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase.rpc("superadmin_list_shops")
  if (error) throw new Error(`Не удалось загрузить список магазинов: ${error.message}`)
  return toAdminShopDirectory((data ?? []) as ShopBillingRow[])
}

/** Platform-wide account list; hard deletion is flagged when business history exists. */
export async function getPlatformUsers(): Promise<AdminUserRow[]> {
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase.rpc("superadmin_list_users")
  if (error) throw new Error(`Не удалось загрузить список пользователей: ${error.message}`)
  return (data ?? []) as AdminUserRow[]
}


export async function getBranchCreationRequests(): Promise<BranchCreationRequestSummary[]> {
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase.rpc("superadmin_list_branch_creation_requests")
  if (error) throw new Error(`Не удалось загрузить запросы на открытие точек: ${error.message}`)
  return (data ?? []) as BranchCreationRequestSummary[]
}

export async function reviewBranchCreationRequest(requestId: string, approve: boolean): Promise<void> {
  if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    throw new Error("Некорректный запрос на открытие точки")
  }
  if (typeof approve !== "boolean") throw new Error("Выберите решение по заявке")
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase.rpc("superadmin_review_branch_creation_request", {
    _request_id: requestId,
    _approve: approve,
  })
  if (error) throw new Error(`Не удалось ${approve ? "одобрить" : "отклонить"} запрос: ${error.message}`)
  if (approve && typeof data !== "string") throw new Error("Точка не была создана после одобрения")
  if (!approve && data !== null) throw new Error("Запрос отклонён, но сервер вернул неожиданный результат")
  revalidatePath("/admin/branch-requests")
  revalidatePath("/admin/shops")
  revalidatePath("/crm/pos")
  revalidatePath("/crm/reports")
}

export async function updatePlatformUser(input: UpdateAdminUserInput): Promise<void> {
  const { supabase } = await requireSuperAdmin()
  const { error } = await supabase.rpc("superadmin_update_user", {
    _user_id: input.user_id,
    _full_name: input.full_name,
    _phone: input.phone,
    _role: input.role,
    _status: input.status,
    _shop_id: input.shop_id,
  })
  if (error) throw new Error(`Не удалось обновить пользователя: ${error.message}`)
  revalidatePath("/admin/users")
  revalidatePath("/admin/shops")
  revalidatePath("/crm")
}

export async function deletePlatformUser(userId: string): Promise<void> {
  const { supabase } = await requireSuperAdmin()
  const { error } = await supabase.rpc("superadmin_delete_user", { _user_id: userId })
  if (error) throw new Error(`Не удалось удалить пользователя: ${error.message}`)
  revalidatePath("/admin/users")
  revalidatePath("/admin/shops")
  revalidatePath("/crm")
}

export async function deletePlatformShop(shopId: string): Promise<void> {
  const { supabase } = await requireSuperAdmin()
  const { error: authorizationError } = await supabase.rpc(
    "superadmin_authorize_shop_storage_cleanup",
    { _shop_id: shopId },
  )
  if (authorizationError) {
    throw new Error(`Не удалось подготовить безопасное удаление магазина: ${authorizationError.message}`)
  }

  const paths = await getShopStoragePaths(supabase, shopId)
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error } = await supabase.storage
      .from("product-images")
      .remove(paths.slice(offset, offset + 100))
    if (error) throw new Error(`Не удалось удалить фотографии магазина: ${error.message}`)
  }

  const { error } = await supabase.rpc("superadmin_delete_shop", { _shop_id: shopId })
  if (error) throw new Error(`Не удалось удалить магазин: ${error.message}`)
  revalidatePath("/admin")
  revalidatePath("/admin/shops")
  revalidatePath("/admin/users")
  revalidatePath("/admin/notifications")
  revalidatePath("/crm")
}

// ---------------------------------------------------------------------------
// Обновить биллинг магазина
// ---------------------------------------------------------------------------

export async function updateShopBilling(input: UpdateShopBillingInput): Promise<void> {
  const { supabase } = await requireSuperAdmin()
  const { error } = await supabase.rpc("superadmin_update_shop_billing", {
    _shop_id:             input.shop_id,
    _paid_until:          input.paid_until ?? null,
    _subscription_status: input.subscription_status ?? null,
    _auto_block:          input.auto_block ?? null,
    _is_frozen:           input.is_frozen  ?? null,
    _notes:               input.notes      ?? null,
  })
  if (error) throw new Error(`Не удалось обновить биллинг: ${error.message}`)
  revalidatePath("/crm")
  revalidatePath("/admin/shops")
  revalidatePath(`/admin/shops/${encodeURIComponent(input.shop_id)}`)
}

// ---------------------------------------------------------------------------
// Заморозка / разморозка магазина (единый эндпоинт-переключатель)
// ---------------------------------------------------------------------------

/**
 * Переключает состояние магазина.
 *  frozen = true  → магазин заморожен (subscription_status = 'frozen')
 *  frozen = false → магазин разморожен, статус подписки восстанавливается
 *                   на стороне БД по дате paid_until (active / past_due / trial).
 */
export async function setShopFrozen(shopId: string, frozen: boolean): Promise<void> {
  const { supabase } = await requireSuperAdmin()
  const { error } = await supabase.rpc("superadmin_set_shop_frozen", {
    _shop_id: shopId,
    _frozen: frozen,
  })
  if (error) {
    throw new Error(
      `Не удалось ${frozen ? "заморозить" : "разморозить"} магазин: ${error.message}`,
    )
  }
  revalidatePath("/crm")
  revalidatePath("/admin/shops")
  revalidatePath(`/admin/shops/${encodeURIComponent(shopId)}`)
}
