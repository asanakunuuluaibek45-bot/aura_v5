import type { OutboxItem } from "./schema"

type OutboxSummaryItem = Pick<OutboxItem, "shop_id" | "status"> & Partial<Pick<OutboxItem, "error">>

export type OutboxStatusSummary = {
  pendingCount: number
  needsAttentionCount: number
  unresolvedCount: number
  lastError: string | null
}

/** Summarize every operation that logout could otherwise erase. */
export function summarizeOutboxOperations(
  items: readonly OutboxSummaryItem[],
  shopId?: string,
): OutboxStatusSummary {
  const scoped = items.filter((item) => !shopId || item.shop_id === shopId)
  const pendingCount = scoped.filter(
    (item) => item.status === "pending" || item.status === "failed" || item.status === "syncing",
  ).length
  const needsAttentionCount = scoped.filter((item) => item.status === "dead").length

  return {
    pendingCount,
    needsAttentionCount,
    unresolvedCount: pendingCount + needsAttentionCount,
    lastError: scoped.find(
      (item) => (item.status === "failed" || item.status === "dead") && item.error,
    )?.error ?? null,
  }
}

export function countUnresolvedOutboxOperations(
  items: readonly OutboxSummaryItem[],
  shopId?: string,
): number {
  return summarizeOutboxOperations(items, shopId).unresolvedCount
}
