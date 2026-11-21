import { StoreNotificationsPage } from "@/components/crm/notifications/StoreNotificationsPage"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"
import { getPlatformShopDirectory } from "@/app/actions/superadmin"
import { getRequestCrmContext } from "@/lib/supabase/request-context"
import type { Profile } from "@/lib/types"

export const metadata = { title: "Уведомления — Админ GOLDUCHET" }

export default async function AdminNotificationsPage() {
  await requireSuperAdminPageAccess()
  const [{ profile }, shops] = await Promise.all([getRequestCrmContext(), getPlatformShopDirectory()])
  return <StoreNotificationsPage profile={profile as Profile} shops={shops} />
}
