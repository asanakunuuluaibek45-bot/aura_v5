"use client"

import { useCallback, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { parseQrCode } from "@/lib/qr-code"
import { checkQrShop } from "@/app/actions/qr"
import { processRevisionLabel, type RevisionScanTransaction } from "@/lib/revision-label-scan"

const BarcodeScannerModal = dynamic(
  () => import("@/components/BarcodeScannerModal").then((mod) => mod.BarcodeScannerModal),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 text-center text-sm text-muted-foreground" role="status">
        Подготавливаем сканер этикеток…
      </div>
    ),
  },
)

type RevisionLabelScannerProps = {
  onScan: (sku: string) => RevisionScanTransaction
  checkedSkus: Set<string>
  stats: { total: number; checked: number; remaining: number }
}

export function RevisionLabelScanner({ onScan, checkedSkus, stats }: RevisionLabelScannerProps) {
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
        checkQrShop,
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
  }, [onScan])

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
              className="fixed inset-x-4 top-16 z-[120] mx-auto max-w-md rounded-lg border border-white/15 bg-black/85 px-4 py-3 text-center text-sm text-white shadow-xl"
            >
              {status}
            </div>
          )}
        </>
      )}
    </>
  )
}
