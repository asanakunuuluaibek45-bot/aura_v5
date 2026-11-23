import { AdminBranchRequests } from "@/components/crm/admin/admin-branch-requests"
import { getBranchCreationRequests } from "@/app/actions/superadmin"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"

export const metadata = { title: "Запросы точек — Админ GOLDUCHET" }

export default async function BranchRequestsPage() {
  await requireSuperAdminPageAccess()
  const requests = await getBranchCreationRequests()
  return <AdminBranchRequests requests={requests} />
}
