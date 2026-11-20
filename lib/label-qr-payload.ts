export function buildShopLabelQrPayload(shopSeqId: unknown, sku: string): string {
  const normalizedSku = (sku || "").trim().toUpperCase()
  if (
    typeof shopSeqId !== "number" ||
    !Number.isSafeInteger(shopSeqId) ||
    shopSeqId <= 0 ||
    !normalizedSku
  ) {
    throw new Error("Для QR-кода нужны артикул и короткий номер магазина. Синхронизируйте товар и попробуйте снова.")
  }
  return `${shopSeqId}/${encodeURIComponent(normalizedSku)}`
}
