export type AdminProfileLike = {
  role?: string | null
  status?: string | null
} | null

export type AdminRouteDecision = "redirect-login" | "not-found" | "allow"

/**
 * Pure authorization decision shared by the server route guard and its tests.
 * A UI link is never sufficient to grant access to the platform admin area.
 */
export function getAdminRouteDecision(
  isAuthenticated: boolean,
  profile: AdminProfileLike,
): AdminRouteDecision {
  if (!isAuthenticated) return "redirect-login"
  if (profile?.role !== "super_admin" || profile.status !== "approved") {
    return "not-found"
  }
  return "allow"
}
