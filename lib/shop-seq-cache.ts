import { getShopSeqIdForLabel } from "@/app/actions/products"
import { resolveShopSeqId } from "@/lib/shop-seq-cache-core"

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
  const online = typeof navigator === "undefined" || navigator.onLine
  return resolveShopSeqId(
    shopId,
    online,
    { read: readCached, write: rememberShopSeqId },
    getShopSeqIdForLabel,
  )
}
