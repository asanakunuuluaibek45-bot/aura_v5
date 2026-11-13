import type { OutboxItem } from "./schema"

type UnresolvedOutboxItem = Pick<OutboxItem, "shop_id" | "status">

/** Count every queued operation that logout would otherwise erase. */
export function countUnresolvedOutboxOperations(
  items: readonly UnresolvedOutboxItem[],
  shopId?: string,
): number {
  return items.filter(
    (item) => item.status !== "completed" && (!shopId || item.shop_id === shopId),
  ).length
}
