"use client"

import { useCallback, useRef, useState } from "react"
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { parseQrCode } from "@/lib/qr-code"
import { getLocalDB } from "@/lib/local-db/db"
import { checkLocalRevisionShop } from "@/lib/revision-offline"
import { processRevisionLabel, type RevisionScanTransaction } from "@/lib/revision-label-scan"

type RevisionLabelScannerProps = {
  shopId: string | null
  onScan: (sku: string) => RevisionScanTransaction
  checkedSkus: Set<string>
  stats: { total: number; checked: number; remaining: number }
}

export function RevisionLabelScanner({ onScan, checkedSkus, stats, shopId }: RevisionLabelScannerProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState("")
  const pendingSkusRef = useRef(new Set<string>())
  const latestScanRef = useRef(0)

  const handleScan = useCallback(async (raw: string) => {
    const parsed = parseQrCode(raw)
    if (!parsed.sku) {
      const message = "В коде этикетки не найден артикул"
      setStatus(message)
      return
    }

    const sku = parsed.sku.trim().toLocaleUpperCase("ru-RU")
    if (pendingSkusRef.current.has(sku)) {
      setStatus("Эта этикетка ещё проверяется")
      return
    }
    pendingSkusRef.current.add(sku)
    const scanId = ++latestScanRef.current
    try {
      const outcome = await processRevisionLabel(
        { ...parsed, sku },
        onScan,
        async (seqId) => {
          if (!shopId) return { ok: false, reason: "unauthorized" }
          const db = await getLocalDB()
          const settings = await db.get("shop_settings", shopId)
          const ownSeqId = typeof settings?.seq_id === "number" ? settings.seq_id : null
          if (ownSeqId !== null) return checkLocalRevisionShop(seqId, ownSeqId)
          if (!navigator.onLine) return { ok: false, reason: "unauthorized" }
          // Browser SDK respects the existing RLS, and works in both native and web.
          const { createClient } = await import("@/lib/supabase/client")
          const { data, error } = await createClient().from("shop_settings").select("shop_id, seq_id, shop_name").eq("shop_id", shopId).maybeSingle()
          if (error || !data) return { ok: false, reason: "unauthorized" }
          await db.put("shop_settings", data)
          return checkLocalRevisionShop(seqId, data.seq_id)
        },
        (result, pending) => {
          const message = result.status === "not_found"
            ? "Не найдено на складе: " + sku
            : (result.status === "checked" ? "Отмечено: " : "Уже проверено: ") + result.product.name
          setStatus(message + (pending ? " · проверка магазина…" : ""))
        },
      )
      if (outcome.kind === "rejected") {
        const prefix = outcome.rolledBack ? "Отметка отменена. " : ""
        const message = outcome.reason === "foreign_shop"
          ? prefix + "Этикетка от другого магазина."
          : prefix + (outcome.reason === "unauthorized"
            ? "Сессия не подтверждена. Войдите снова и повторите сканирование."
            : "Не удалось проверить магазин. Повторите сканирование.")
        // A late rejection must still be visible; late successes must not
        // replace the status of a more recently scanned label.
        setStatus(message)
        return
      }
      const result = outcome.result
      const message = result.status === "not_found"
        ? "Не найдено на складе: " + sku
        : (result.status === "checked" ? "Отмечено: " : "Уже проверено: ") + result.product.name
      if (scanId === latestScanRef.current) setStatus(message)
    } finally {
      pendingSkusRef.current.delete(sku)
    }
  }, [onScan, shopId])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        title="Сканировать этикетку"
        aria-label="Сканировать этикетку"
        onClick={() => {
          setStatus("")
          setOpen(true)
        }}
      >
        <Camera className="h-4 w-4 text-primary" />
      </Button>
      {open && (
        <>
          <BarcodeScannerModal
            continuousScan
            checkedSkus={checkedSkus}
            revisionStats={stats}
            onClose={() => setOpen(false)}
            onScan={(raw) => { void handleScan(raw) }}
          />
          {status && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none fixed inset-x-4 bottom-36 z-[120] mx-auto max-w-md rounded-lg border border-white/15 bg-black/85 px-4 py-3 text-center text-sm text-white shadow-xl"
            >
              {status}
            </div>
          )}
        </>
      )}
    </>
  )
}
