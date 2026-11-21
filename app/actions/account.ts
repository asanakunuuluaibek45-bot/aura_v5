"use server"

import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js"
import { getRequestCrmContext } from "@/lib/supabase/request-context"
import {
  buildAccountDeletionPlan,
  getShopProductImagePath,
  type DeletionProfile,
} from "@/lib/account-deletion"

const STORAGE_BUCKET = "product-images"
const STORAGE_PAGE_SIZE = 1000
const STORAGE_DELETE_BATCH_SIZE = 100

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Удаление аккаунта пока не настроено на сервере. Обратитесь к администратору.")
  }
  return createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function listShopStoragePaths(
  storage: ReturnType<ReturnType<typeof createAdminClient>["storage"]["from"]>,
  folder: string,
  depth = 0,
): Promise<string[]> {
  if (depth > 32) throw new Error("Слишком глубокая структура фотографий магазина")

  const filePaths: string[] = []
  const folders: string[] = []
  let offset = 0

  while (true) {
    const { data, error } = await storage.list(folder, {
      limit: STORAGE_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    })
    if (error) throw new Error("Не удалось проверить фотографии магазина перед удалением")

    for (const item of data ?? []) {
      if (!item.name || item.name === "." || item.name === "..") continue
      const path = `${folder}/${item.name}`
      if (!item.id) folders.push(path)
      else filePaths.push(path)
    }

    if (!data || data.length < STORAGE_PAGE_SIZE) break
    offset += data.length
  }

  for (const childFolder of folders) {
    filePaths.push(...await listShopStoragePaths(storage, childFolder, depth + 1))
  }
  return filePaths
}

async function removeStoragePaths(
  storage: ReturnType<ReturnType<typeof createAdminClient>["storage"]["from"]>,
  paths: string[],
) {
  const uniquePaths = [...new Set(paths)]
  for (let index = 0; index < uniquePaths.length; index += STORAGE_DELETE_BATCH_SIZE) {
    const { error } = await storage.remove(uniquePaths.slice(index, index + STORAGE_DELETE_BATCH_SIZE))
    if (error) throw new Error("Не удалось удалить фотографии магазина. Повторите попытку.")
  }
}

async function deleteAuthUser(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (!error) return

  // An earlier retry may already have deleted this related user.
  const { data, error: lookupError } = await admin.auth.admin.getUserById(userId)
  if ((!lookupError && !data.user) || lookupError?.status === 404) return
  throw new Error("Не удалось удалить связанный аккаунт. Повторите попытку.")
}

export async function deleteMyAccount(): Promise<{
  deleted: true
  shopDeleted: boolean
  cleanupPending: boolean
}> {
  const { user, profile } = await getRequestCrmContext()
  if (!user) throw new Error("Требуется вход в систему")

  const admin = createAdminClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  let shopProfiles: DeletionProfile[] = []
  if (profile?.role === "admin" && profile.status === "approved" && profile.shop_id) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, shop_id, role, status")
      .eq("shop_id", profile.shop_id)
    if (error) throw new Error("Не удалось проверить состав администраторов магазина")
    shopProfiles = (data ?? []) as DeletionProfile[]
  }

  const plan = buildAccountDeletionPlan(user.id, profile as DeletionProfile | null, shopProfiles)
  const relatedUserIds = plan.relatedUserIds.filter((id) => id !== user.id)
  const usersToDelete = [...relatedUserIds, user.id]
  const storage = admin.storage.from(STORAGE_BUCKET)
  const productImagePaths: string[] = []

  if (plan.shopId && usersToDelete.length > 0) {
    const { data, error } = await admin
      .from("products")
      .select("images, image_url")
      .eq("shop_id", plan.shopId)
      .in("created_by", usersToDelete)
    if (error) throw new Error("Не удалось проверить фотографии, связанные с аккаунтом")

    for (const product of data ?? []) {
      for (const image of product.images ?? []) {
        const path = getShopProductImagePath(image, plan.shopId, supabaseUrl)
        if (path) productImagePaths.push(path)
      }
      const imagePath = getShopProductImagePath(product.image_url, plan.shopId, supabaseUrl)
      if (imagePath) productImagePaths.push(imagePath)
    }
    await removeStoragePaths(storage, productImagePaths)
  }

  // Delete related sellers before the initiating admin. A failure leaves the
  // admin able to retry; the database trigger removes their related records.
  for (const relatedUserId of relatedUserIds) {
    await deleteAuthUser(admin, relatedUserId)
  }

  await deleteAuthUser(admin, user.id)

  let shopDeleted = false
  let cleanupPending = false
  if (plan.shopId) {
    const { data: shop, error } = await admin
      .from("shop_settings")
      .select("shop_id")
      .eq("shop_id", plan.shopId)
      .maybeSingle()

    if (error) {
      cleanupPending = true
    } else if (!shop) {
      shopDeleted = true
      try {
        const paths = await listShopStoragePaths(storage, plan.shopId)
        await removeStoragePaths(storage, paths)
      } catch {
        cleanupPending = true
      }
    }
  }

  return { deleted: true, shopDeleted, cleanupPending }
}
