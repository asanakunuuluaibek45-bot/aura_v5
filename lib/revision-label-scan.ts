import type { RevisionScanResult } from "@/lib/inventory-revision"
import type { QrShopCheck } from "@/app/actions/qr"

export type RevisionScanTransaction = {
  result: RevisionScanResult
  confirm: () => void
  rollback: () => boolean
}

export type RevisionLabelOutcome =
  | { kind: "accepted"; result: RevisionScanResult }
  | {
      kind: "rejected"
      result: RevisionScanResult
      reason: "foreign_shop" | "unauthorized" | "validation_error"
      rolledBack: boolean
      check?: QrShopCheck
    }

/** Owns only tentative marks created by scanning, never earlier/manual marks. */
export function createRevisionScanTracker() {
  const pending = new Map<string, symbol>()
  return {
    begin(productId: string, introduced: boolean) {
      const token = Symbol(productId)
      if (introduced) pending.set(productId, token)
      const release = () => {
        if (!introduced || pending.get(productId) !== token) return false
        pending.delete(productId)
        return true
      }
      return { confirm: release, rollback: release }
    },
    invalidate: (productId: string) => pending.delete(productId),
    isPending: (productId: string) => pending.has(productId),
    reset: () => pending.clear(),
    get pendingCount() { return pending.size },
  }
}

/** Local lookup/mark happens synchronously, before the first server await. */
export async function processRevisionLabel(
  label: { sku: string; shopSeqId: number | null },
  begin: (sku: string) => RevisionScanTransaction,
  validateShop: (shopSeqId: number) => Promise<QrShopCheck>,
  onLocal?: (result: RevisionScanResult, pending: boolean) => void,
): Promise<RevisionLabelOutcome> {
  const transaction = begin(label.sku)
  onLocal?.(transaction.result, label.shopSeqId !== null)

  if (label.shopSeqId === null) {
    transaction.confirm()
    return { kind: "accepted", result: transaction.result }
  }

  let check: QrShopCheck
  try {
    check = await validateShop(label.shopSeqId)
  } catch {
    return {
      kind: "rejected",
      result: transaction.result,
      reason: "validation_error",
      rolledBack: transaction.rollback(),
    }
  }

  if (check.ok) {
    transaction.confirm()
    return { kind: "accepted", result: transaction.result }
  }

  return {
    kind: "rejected",
    result: transaction.result,
    reason: check.reason,
    check,
    rolledBack: transaction.rollback(),
  }
}
