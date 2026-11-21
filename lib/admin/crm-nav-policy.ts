const SUPER_ADMIN_CRM_ITEMS_HIDDEN_ON_WEB = new Set(["shops", "announcements"])

export function shouldHideSuperAdminCrmNavItem(
  itemId: string,
  isSuperAdmin: boolean,
  isNativeBuild: boolean,
): boolean {
  return (
    isSuperAdmin
    && !isNativeBuild
    && SUPER_ADMIN_CRM_ITEMS_HIDDEN_ON_WEB.has(itemId)
  )
}
