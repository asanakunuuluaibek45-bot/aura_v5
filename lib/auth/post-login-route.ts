type PostLoginProfile = {
  role?: string | null
  status?: string | null
} | null | undefined

/** Keep the native CRM entry intact; approved web superadmins start in Admin. */
export function getPostLoginPath(
  profile: PostLoginProfile,
  isNativePlatform: boolean,
): "/admin" | "/crm/pos" {
  if (!isNativePlatform && profile?.role === "super_admin" && profile.status === "approved") {
    return "/admin"
  }
  return "/crm/pos"
}
