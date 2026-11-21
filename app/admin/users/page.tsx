import { AdminUsersDirectory } from "@/components/crm/admin/admin-users-directory"
import { getPlatformShopDirectory, getPlatformUsers } from "@/app/actions/superadmin"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"
import { getRequestCrmContext } from "@/lib/supabase/request-context"

export const metadata = { title: "Пользователи — Админ GOLDUCHET" }

export default async function AdminUsersPage() {
  await requireSuperAdminPageAccess()
  const [{ user }, users, shops] = await Promise.all([
    getRequestCrmContext(),
    getPlatformUsers(),
    getPlatformShopDirectory(),
  ])

  return (
    <AdminUsersDirectory
      users={users}
      shops={shops}
      currentUserId={user?.id ?? null}
    />
  )
}
