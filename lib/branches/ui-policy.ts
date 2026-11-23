import type { BranchContext } from "@/lib/supabase/current-shop"

const MULTI_BRANCH_SCREENS = new Set([
  "otchety",
  "transfers",
  "branch-summary",
  "branch-comparison",
])

/** Count only branches returned in the authenticated business context. */
export function getAccessibleBranchCount(context: BranchContext | null | undefined): number {
  if (!context?.businessId) return 0
  return new Set(
    context.branches
      .filter((branch) => branch.businessId === context.businessId)
      .map((branch) => branch.shopId),
  ).size
}

export function hasMultiBranchAccess(context: BranchContext | null | undefined): boolean {
  return getAccessibleBranchCount(context) >= 2
}

export function shouldBlockMultiBranchScreen(
  screen: string,
  context: BranchContext | null | undefined,
): boolean {
  return MULTI_BRANCH_SCREENS.has(screen) && !hasMultiBranchAccess(context)
}
