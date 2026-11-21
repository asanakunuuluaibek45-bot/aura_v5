import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Resolve the authenticated profile's own store from the database context.
 * Super admins stay in their assigned global store; tenant switching is disabled.
 */
export async function getActiveShopId(
  supabase: SupabaseClient,
  fallbackShopId: string | null = null,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("current_shop_id")
  if (!error && typeof data === "string") return data
  return fallbackShopId
}