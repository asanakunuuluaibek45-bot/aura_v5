"use server"

import { revalidatePath } from "next/cache"
import { canViewAnnouncement, type PlatformAnnouncement, type UserAnnouncement } from "@/lib/admin/announcement-policy"
import { requireShopContext, requireSuperAdminContext } from "@/lib/supabase/request-context"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function getAdminAnnouncementFeed(): Promise<PlatformAnnouncement[]> {
  const { supabase } = await requireSuperAdminContext()
  const { data, error } = await supabase
    .from("platform_announcements")
    .select("id, body, scope_type, shop_id, published_at, expires_at, archived_at, created_at")
    .order("published_at", { ascending: false })

  if (error) throw new Error(`Не удалось загрузить объявления: ${error.message}`)
  return (data ?? []) as PlatformAnnouncement[]
}

export async function publishPlatformAnnouncement(input: {
  body: string
  scope_type: "all" | "shop"
  shop_id: string | null
  expires_on: string | null
}): Promise<void> {
  const { supabase } = await requireSuperAdminContext()
  if (!input || typeof input !== "object") throw new Error("Некорректные данные объявления")
  const body = typeof input.body === "string" ? input.body.trim() : ""

  if (body.length < 1 || body.length > 5000) {
    throw new Error("Текст объявления должен содержать от 1 до 5000 символов")
  }
  if (input.scope_type !== "all" && input.scope_type !== "shop") {
    throw new Error("Выберите область публикации")
  }
  if (
    (input.scope_type === "all" && input.shop_id !== null)
    || (input.scope_type === "shop" && (!input.shop_id || !UUID_PATTERN.test(input.shop_id)))
  ) {
    throw new Error("Выберите корректный магазин")
  }

  let expiresAt: string | null = null
  if (input.expires_on) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expires_on)) {
      throw new Error("Некорректная дата окончания")
    }
    const parsed = new Date(`${input.expires_on}T23:59:59.999Z`)
    if (
      Number.isNaN(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== input.expires_on
      || parsed.getTime() <= Date.now()
    ) {
      throw new Error("Дата окончания должна быть в будущем")
    }
    expiresAt = parsed.toISOString()
  }

  const { error } = await supabase.rpc("admin_create_platform_announcement", {
    _body: body,
    _scope_type: input.scope_type,
    _shop_id: input.scope_type === "shop" ? input.shop_id : null,
    _expires_at: expiresAt,
  })
  if (error) throw new Error(`Не удалось опубликовать объявление: ${error.message}`)

  revalidatePath("/admin/announcements")
  revalidatePath("/crm/announcements")
}

export async function archivePlatformAnnouncement(announcementId: string): Promise<void> {
  const { supabase } = await requireSuperAdminContext()
  if (!UUID_PATTERN.test(announcementId)) throw new Error("Некорректное объявление")

  const { error } = await supabase.rpc("admin_archive_platform_announcement", {
    _announcement_id: announcementId,
  })
  if (error) throw new Error(`Не удалось архивировать объявление: ${error.message}`)

  revalidatePath("/admin/announcements")
  revalidatePath("/crm/announcements")
}

export async function getUserAnnouncementFeed(): Promise<{
  announcements: UserAnnouncement[]
  lastViewedAt: string | null
}> {
  const { supabase, user, profile, shopId } = await requireShopContext()
  const { data, error } = await supabase
    .from("platform_announcements")
    .select("id, body, scope_type, shop_id, published_at, expires_at, archived_at, created_at")
    .is("archived_at", null)
    .order("published_at", { ascending: false })

  if (error) throw new Error(`Не удалось загрузить объявления: ${error.message}`)

  const now = Date.now()
  const announcements = ((data ?? []) as PlatformAnnouncement[])
    .filter((announcement) => canViewAnnouncement(profile.status, shopId, announcement, now))
    .map(({ id, body, scope_type, shop_id, published_at, expires_at }) => ({
      id,
      body,
      scope_type,
      shop_id,
      published_at,
      expires_at,
    }))

  const { data: state, error: stateError } = await supabase
    .from("announcement_view_state")
    .select("last_viewed_at")
    .eq("user_id", user.id)
    .eq("shop_id", shopId)
    .maybeSingle()
  if (stateError) throw new Error(`Не удалось загрузить состояние объявлений: ${stateError.message}`)

  return { announcements, lastViewedAt: state?.last_viewed_at ?? null }
}

/** One upsert per feed view; this never creates per-announcement or polling rows. */
export async function markAnnouncementFeedViewed(): Promise<string> {
  const { supabase, user, shopId } = await requireShopContext()
  const lastViewedAt = new Date().toISOString()
  const { error } = await supabase.from("announcement_view_state").upsert(
    { user_id: user.id, shop_id: shopId, last_viewed_at: lastViewedAt },
    { onConflict: "user_id,shop_id" },
  )
  if (error) throw new Error(`Не удалось сохранить просмотр объявлений: ${error.message}`)
  return lastViewedAt
}
