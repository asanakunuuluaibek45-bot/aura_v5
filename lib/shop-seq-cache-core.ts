export interface ShopSeqIdCache {
  read(shopId: string): number | null
  write(shopId: string, seqId: number): void
}

export function isValidShopSeqId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

export async function resolveShopSeqId(
  shopId: string,
  online: boolean,
  cache: ShopSeqIdCache,
  fetchFromServer: (shopId: string) => Promise<number>,
): Promise<number> {
  if (!shopId) throw new Error("Не выбран магазин для QR-этикетки")

  const cached = cache.read(shopId)
  if (isValidShopSeqId(cached)) {
    if (online) {
      void fetchFromServer(shopId)
        .then((seqId) => {
          if (isValidShopSeqId(seqId)) cache.write(shopId, seqId)
        })
        .catch(() => {})
    }
    return cached
  }

  if (!online) {
    throw new Error("Нет номера магазина для QR. Подключитесь к интернету и синхронизируйте магазин.")
  }

  const seqId = await fetchFromServer(shopId)
  if (!isValidShopSeqId(seqId)) {
    throw new Error("Не удалось получить корректный номер магазина для QR-кода")
  }
  cache.write(shopId, seqId)
  return seqId
}
