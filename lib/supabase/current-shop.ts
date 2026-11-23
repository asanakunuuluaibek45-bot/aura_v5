import type { SupabaseClient } from "@supabase/supabase-js"

export type AccessibleBranch = {
  businessId: string
  shopId: string
  shopName: string | null
  isActive: boolean
}

export type BranchContext = {
  businessId: string | null
  activeShopId: string | null
  branches: AccessibleBranch[]
}

type BranchContextRow = {
  business_id: string
  shop_id: string
  shop_name: string | null
  is_active: boolean
}

function isBranchContextRow(value: unknown): value is BranchContextRow {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return (
    typeof row.business_id === "string" &&
    typeof row.shop_id === "string" &&
    (typeof row.shop_name === "string" || row.shop_name === null) &&
    typeof row.is_active === "boolean"
  )
}

/**
 * Resolve the user's allowed branches and active branch from the database.
 * The RPC enforces approval and membership; callers must not infer access from
 * a client-side profile or offline session.
 */
export async function getBranchContext(
  supabase: SupabaseClient,
): Promise<BranchContext> {
  const { data, error } = await supabase.rpc("get_branch_context")
  if (error) {
    throw new Error(`Не удалось получить доступные филиалы: ${error.message}`)
  }

  const rows: unknown[] = Array.isArray(data) ? data : []
  const branches: AccessibleBranch[] = rows
    .filter(isBranchContextRow)
    .map((row) => ({
      businessId: row.business_id,
      shopId: row.shop_id,
      shopName: row.shop_name,
      isActive: row.is_active,
    }))

  const activeBranch = branches.find((branch) => branch.isActive) ?? null
  return {
    businessId: branches[0]?.businessId ?? null,
    activeShopId: activeBranch?.shopId ?? null,
    branches,
  }
}

/** Resolve the authorized active branch through the shared branch context. */
export async function getActiveShopId(supabase: SupabaseClient): Promise<string | null> {
  return (await getBranchContext(supabase)).activeShopId
}