import { AdminAnnouncementsManager } from "@/components/crm/admin/admin-announcements-manager"
import { getAdminAnnouncementFeed } from "@/app/actions/admin-announcements"
import { getPlatformShopDirectory } from "@/app/actions/superadmin"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"

export const metadata = { title: "Объявления — Админ GOLDUCHET" }

export default async function AdminAnnouncementsPage() {
  await requireSuperAdminPageAccess()
  const [announcements, shops] = await Promise.all([
    getAdminAnnouncementFeed(),
    getPlatformShopDirectory(),
  ])

  return <AdminAnnouncementsManager initialAnnouncements={announcements} shops={shops} />
}
