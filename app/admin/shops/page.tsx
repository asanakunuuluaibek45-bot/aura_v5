import { AdminShopsDirectory } from "@/components/admin/admin-shops-directory"
import { getPlatformShopDirectory } from "@/app/actions/superadmin"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"
import { getRequestCrmContext } from "@/lib/supabase/request-context"

export const metadata = { title: "Магазины — Админ GOLDUCHET" }

export default async function AdminShopsPage() {
  await requireSuperAdminPageAccess()
  const [{ profile }, shops] = await Promise.all([
    getRequestCrmContext(),
    getPlatformShopDirectory(),
  ])

  return (
    <AdminShopsDirectory
      shops={shops}
      globalShopId={profile?.role === "super_admin" ? profile.shop_id : null}
    />
  )
}
