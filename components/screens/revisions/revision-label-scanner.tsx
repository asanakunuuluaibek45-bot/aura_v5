"use client"

import { useCallback, useState } from "react"
import dynamic from "next/dynamic"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { parseQrCode } from "@/lib/qr-code"
import { checkQrShop } from "@/app/actions/qr"
import type { RevisionScanResult } from "@/lib/inventory-revision"
import { toast } from "sonner"

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
  onScan: (sku: string) => RevisionScanResult
}

export function RevisionLabelScanner({ onScan }: RevisionLabelScannerProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState("")

  const handleScan = useCallback(async (raw: string) => {
    setStatus("Проверяю этикетку…")
    const parsed = parseQrCode(raw)
    if (!parsed.sku) {
      const message = "В коде этикетки не найден артикул"
      setStatus(message)
      toast.error(message)
      return
    }

    if (parsed.shopSeqId !== null) {
      try {
        const check = await checkQrShop(parsed.shopSeqId)
        if (!check.ok) {
          if (check.reason === "foreign_shop") {
            const own = check.ownShopName
              ? check.ownShopName + ", ID " + check.ownSeqId
              : "ID " + check.ownSeqId
            const message = "Этикетка относится к другому магазину (ID " + check.scannedSeqId + "). Ваш магазин: " + own
            setStatus(message)
            toast.error(message, { duration: 6000 })
          } else {
            const message = "Не удалось подтвердить магазин. Войдите снова и повторите сканирование."
            setStatus(message)
            toast.error(message)
          }
          return
        }
      } catch {
        const message = "Не удалось проверить этикетку. Повторите сканирование."
        setStatus(message)
        toast.error(message)
        return
      }
    }

    const result = onScan(parsed.sku)
    if (result.status === "checked") {
      const message = "Отмечено: " + result.product.name
      setStatus(message)
      toast.success(message)
    } else if (result.status === "already_checked") {
      const message = "Уже проверено: " + result.product.name
      setStatus(message)
      toast.error(message)
    } else {
      const message = "Не найдено на складе: " + parsed.sku
      setStatus(message)
      toast.error(message)
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
