import type { QrShopCheck } from '../app/actions/qr'
export function checkLocalRevisionShop(scannedSeqId: number, ownSeqId: number | null): QrShopCheck {
  if (!Number.isSafeInteger(ownSeqId) || !ownSeqId || ownSeqId < 1) return { ok: false, reason: 'unauthorized' }
  if (scannedSeqId === ownSeqId) return { ok: true, shopSeqId: ownSeqId, shopName: null }
  return { ok: false, reason: 'foreign_shop', scannedSeqId, ownSeqId, ownShopName: null }
}
