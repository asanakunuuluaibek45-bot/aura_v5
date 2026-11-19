import { getShopSeqIdForLabel } from "@/app/actions/products"

/**
 * Short shop number used in label QR codes. It never changes for a shop, so it
 * is cached on the device: labels can then be printed without internet instead
 * of failing with ERR_INTERNET_DISCONNECTED on the server request.
 */
const key = (shopId: string) => `aura_shop_seq_${shopId}`

function readCached(shopId: string): number | null {
  try {
    const n = Number(localStorage.getItem(key(shopId)))
    return Number.isSafeInteger(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function rememberShopSeqId(shopId: string, seq: number | null | undefined) {
  if (!shopId || typeof seq !== "number" || !Number.isSafeInteger(seq) || seq <= 0) return
  try { localStorage.setItem(key(shopId), String(seq)) } catch {}
}

export async function getShopSeqIdCached(shopId: string): Promise<number> {
  const cached = readCached(shopId)
  if (cached) {
    // Refresh in the background when online; the cached value is used right away.
    if (typeof navigator === "undefined" || navigator.onLine) {
      void getShopSeqIdForLabel(shopId).then((s) => rememberShopSeqId(shopId, s)).catch(() => {})
    }
    return cached
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Нет интернета: откройте этикетку один раз онлайн, чтобы номер магазина сохранился на устройстве")
  }
  const seq = await getShopSeqIdForLabel(shopId)
  rememberShopSeqId(shopId, seq)
  return seq
}
