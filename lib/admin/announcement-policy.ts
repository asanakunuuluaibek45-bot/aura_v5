export type AnnouncementScope = "all" | "shop"

export type AnnouncementVisibilityRecord = {
  scope_type: AnnouncementScope
  shop_id: string | null
  published_at: string
  expires_at: string | null
  archived_at: string | null
}

export type PlatformAnnouncement = AnnouncementVisibilityRecord & {
  id: string
  body: string
  created_at: string
}

export type UserAnnouncement = Pick<
  PlatformAnnouncement,
  "id" | "body" | "scope_type" | "shop_id" | "published_at" | "expires_at"
>

export function canViewAnnouncement(
  profileStatus: string | null | undefined,
  activeShopId: string | null | undefined,
  announcement: AnnouncementVisibilityRecord,
  nowMs = Date.now(),
): boolean {
  if (profileStatus !== "approved" || !activeShopId || announcement.archived_at) return false

  const publishedAt = Date.parse(announcement.published_at)
  if (!Number.isFinite(publishedAt) || publishedAt > nowMs) return false

  if (announcement.expires_at) {
    const expiresAt = Date.parse(announcement.expires_at)
    if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return false
  }

  if (announcement.scope_type === "all") return true
  return announcement.scope_type === "shop" && announcement.shop_id === activeShopId
}
