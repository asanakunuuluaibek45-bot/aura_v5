import { NotificationsPage } from "@/components/notifications/NotificationsPage"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"

export const metadata = { title: "Уведомления — Админ GOLDUCHET" }

export default async function AdminNotificationsPage() {
  await requireSuperAdminPageAccess()
  return <NotificationsPage />
}
