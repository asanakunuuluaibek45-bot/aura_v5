export type DeletionProfile = {
  id: string
  shop_id: string | null
  role: string | null
  status: string
}

export type AccountDeletionPlan = {
  shopId: string | null
  deleteShop: boolean
  relatedUserIds: string[]
}

/**
 * Shop admins remove the shop's sellers. The last approved admin also removes
 * any remaining non-admin profiles attached to that shop.
 */
export function buildAccountDeletionPlan(
  actorId: string,
  actor: DeletionProfile | null,
  shopProfiles: DeletionProfile[],
): AccountDeletionPlan {
  if (
    !actor ||
    actor.id !== actorId
  ) {
    return { shopId: null, deleteShop: false, relatedUserIds: [] }
  }

  if (actor.role !== "admin" || actor.status !== "approved" || !actor.shop_id) {
    return { shopId: actor.shop_id, deleteShop: false, relatedUserIds: [] }
  }

  const otherProfiles = shopProfiles.filter(
    (profile) => profile.shop_id === actor.shop_id && profile.id !== actorId,
  )
  const otherApprovedAdmins = otherProfiles.filter(
    (profile) => profile.role === "admin" && profile.status === "approved",
  )
  const deleteShop = otherApprovedAdmins.length === 0
  const relatedUserIds = otherProfiles
    .filter((profile) => deleteShop || profile.role === "seller")
    .map((profile) => profile.id)

  return {
    shopId: actor.shop_id,
    deleteShop,
    relatedUserIds: [...new Set(relatedUserIds)],
  }
}

function isSafeShopPath(path: string, shopId: string) {
  return (
    path.startsWith(`${shopId}/`) &&
    path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  )
}

/** Convert a product image URL/path to a safe object path in this shop's bucket. */
export function getShopProductImagePath(
  value: unknown,
  shopId: string,
  supabaseUrl: string,
): string | null {
  if (typeof value !== "string" || !shopId || shopId.includes("/")) return null

  if (isSafeShopPath(value, shopId)) return value

  try {
    const imageUrl = new URL(value)
    const projectUrl = new URL(supabaseUrl)
    if (imageUrl.origin !== projectUrl.origin) return null

    const bucketPrefix = "/storage/v1/object/public/product-images/"
    const prefixIndex = imageUrl.pathname.indexOf(bucketPrefix)
    if (prefixIndex < 0) return null

    const path = decodeURIComponent(imageUrl.pathname.slice(prefixIndex + bucketPrefix.length))
    return isSafeShopPath(path, shopId) ? path : null
  } catch {
    return null
  }
}
