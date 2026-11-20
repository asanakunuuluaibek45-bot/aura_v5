import { AdminShopsDirectory } from "@/components/admin/admin-shops-directory"
import { getPlatformShopDirectory } from "@/app/actions/superadmin"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"

export const metadata = { title: "Магазины — Админ GOLDUCHET" }

export default async function AdminShopsPage() {
  await requireSuperAdminPageAccess()
  const shops = await getPlatformShopDirectory()

  return <AdminShopsDirectory shops={shops} />
}
