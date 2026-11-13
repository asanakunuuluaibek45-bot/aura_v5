import type { OutboxItem } from "./schema"

type ProductDeletionOutboxItem = Pick<OutboxItem, "entity" | "op_type" | "shop_id" | "status">

export function countUnresolvedProductDeletions(
  items: readonly ProductDeletionOutboxItem[],
  shopId?: string,
): number {
  return items.filter((item) => {
    const isProductDeletion = item.op_type === "product_delete" ||
      (item.op_type === "delete" && item.entity === "products")
    return isProductDeletion && item.status !== "completed" && (!shopId || item.shop_id === shopId)
  }).length
}
