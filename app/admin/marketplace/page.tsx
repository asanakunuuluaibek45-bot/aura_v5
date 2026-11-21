import { getPublicMarketplaceSettings } from "@/app/actions/store"
import { AdminMarketplaceSettings } from "@/components/crm/admin/admin-marketplace-settings"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"

export const metadata = { title: "Маркетплейс — Админ GOLDUCHET" }

export default async function AdminMarketplacePage() {
  await requireSuperAdminPageAccess()
  const settings = await getPublicMarketplaceSettings()
  return <AdminMarketplaceSettings initialSettings={settings} />
}
