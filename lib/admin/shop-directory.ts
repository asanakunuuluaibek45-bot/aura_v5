import type { SubscriptionStatus } from "@/lib/types"

export type AdminShopSummary = {
  shop_id: string
  shop_name: string | null
  status: SubscriptionStatus
  is_frozen: boolean
  member_count: number
  created_at: string | null
}

export function isGlobalAdminShop(shopId: string, globalShopId: string | null | undefined): boolean {
  return Boolean(globalShopId && shopId === globalShopId)
}

type ShopDirectorySource = {
  shop_id: string
  shop_name: string | null
  subscription_status: SubscriptionStatus
  is_frozen: boolean
  member_count: number
  created_at: string | null
}

/** Keep billing dates, notes, and usage metering out of the platform directory. */
export function toAdminShopDirectory(rows: readonly ShopDirectorySource[]): AdminShopSummary[] {
  return rows.map((row) => ({
    shop_id: row.shop_id,
    shop_name: row.shop_name,
    status: row.subscription_status,
    is_frozen: row.is_frozen,
    member_count: row.member_count,
    created_at: row.created_at,
  }))
}

export function filterAdminShopDirectory(
  shops: readonly AdminShopSummary[],
  query: string,
): AdminShopSummary[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ru")
  if (!normalizedQuery) return [...shops]

  return shops.filter((shop) =>
    `${shop.shop_name ?? ""} ${shop.shop_id}`.toLocaleLowerCase("ru").includes(normalizedQuery),
  )
}
