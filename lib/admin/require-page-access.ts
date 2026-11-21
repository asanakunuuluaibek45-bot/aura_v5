import { notFound, redirect } from "next/navigation"
import { getRequestCrmContext } from "@/lib/supabase/request-context"
import { getAdminRouteDecision } from "@/lib/admin/access-policy"

export async function requireSuperAdminPageAccess(): Promise<void> {
  const { user, profile } = await getRequestCrmContext()
  const decision = getAdminRouteDecision(Boolean(user), profile)

  if (decision === "redirect-login") redirect("/auth/login")
  if (decision === "not-found") notFound()
}
