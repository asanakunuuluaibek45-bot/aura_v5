"use client"

import { useCallback, useMemo, useRef, useState, useTransition } from "react"
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Camera, Check, LoaderCircle, RotateCcw, X } from "lucide-react"
import { toast } from "sonner"
import { BarcodeScannerModal } from "@/components/crm/BarcodeScannerModal"
import { Button } from "@/components/shared/ui/button"
import { Input } from "@/components/shared/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shared/ui/dialog"
import {
  cancelBranchTransferItems,
  getBranchTransferDetails,
  getBranchTransfers,
  receiveBranchTransferItems,
  resolveBranchTransferScan,
  startBranchTransfer,
  type BranchTransferDetails,
  type BranchTransferStatus,
  type BranchTransferSummary,
} from "@/app/actions/transfers"
import type { BranchContext } from "@/lib/supabase/current-shop"
import { parseQrCode } from "@/lib/qr-code"
import { useOnline } from "@/hooks/use-online"

type TransferMode = "send" | "receive" | "cancel"
type ScannedProduct = { id: string; sku: string; name: string }

function statusLabel(status: BranchTransferStatus): string {
  switch (status) {
    case "in_transit": return "В пути"
    case "partially_received": return "Принято частично"
    case "partially_cancelled": return "Частично отменено"
    case "received": return "Получено"
    case "cancelled": return "Отменено"
  }
}

function formatTransferDate(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
    : "Дата неизвестна"
}

function makeRequestId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Устройство не поддерживает безопасную отправку запроса. Обновите браузер.")
  }
  return globalThis.crypto.randomUUID()
}

export function BranchTransferDialog({ context }: { context: BranchContext }) {
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<TransferMode>("send")
  const [transfers, setTransfers] = useState<BranchTransferSummary[]>([])
  const [details, setDetails] = useState<BranchTransferDetails | null>(null)
  const [selectedTransferId, setSelectedTransferId] = useState("")
  const [destinationShopId, setDestinationShopId] = useState("")
  const [scannedProducts, setScannedProducts] = useState<ScannedProduct[]>([])
  const [reason, setReason] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [scannerOpen, setScannerOpen] = useState(false)
  const [loadingTransfers, setLoadingTransfers] = useState(false)
  const [pending, startTransition] = useTransition()
  const pendingScansRef = useRef(new Set<string>())
  const selectedProductIdsRef = useRef(new Set<string>())
  const scanGenerationRef = useRef(0)
  const operationRunningRef = useRef(false)
  const sendRequestIdRef = useRef<string | null>(null)
  const receiveRequestIdRef = useRef<string | null>(null)
  const cancelRequestIdRef = useRef<string | null>(null)

  const activeShopId = context.activeShopId
  const branches = useMemo(
    () => context.branches.filter((branch) => branch.businessId === context.businessId),
    [context.branches, context.businessId],
  )
  const destinationBranches = branches.filter((branch) => branch.shopId !== activeShopId)
  const incomingTransfers = transfers.filter(
    (transfer) =>
      transfer.destinationShopId === activeShopId &&
      transfer.inTransitCount > 0,
  )
  const outgoingTransfers = transfers.filter(
    (transfer) =>
      transfer.sourceShopId === activeShopId &&
      transfer.inTransitCount > 0,
  )
  const remainingItems = details?.items.filter((item) => item.status === "in_transit") ?? []
  const partialReceipt = mode === "receive" && scannedProducts.length < remainingItems.length
  const canSubmit =
    online &&
    !pending &&
    scannedProducts.length > 0 &&
    (mode !== "send" || Boolean(destinationShopId)) &&
    (mode !== "receive" || (Boolean(selectedTransferId) && (!partialReceipt || Boolean(reason.trim())))) &&
    (mode !== "cancel" || (Boolean(selectedTransferId) && Boolean(reason.trim())))

  const refreshTransfers = useCallback(async () => {
    setLoadingTransfers(true)
    try {
      setTransfers(await getBranchTransfers())
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить перемещения"
      setStatusMessage(message)
      toast.error(message)
    } finally {
      setLoadingTransfers(false)
    }
  }, [])

  const resetOperation = useCallback(() => {
    setDetails(null)
    setSelectedTransferId("")
    setScannedProducts([])
    setReason("")
    setStatusMessage("")
    scanGenerationRef.current += 1
    pendingScansRef.current.clear()
    selectedProductIdsRef.current.clear()
    sendRequestIdRef.current = null
    receiveRequestIdRef.current = null
    cancelRequestIdRef.current = null
  }, [])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && pending) return
    setOpen(nextOpen)
    if (nextOpen) {
      setMode("send")
      resetOperation()
      void refreshTransfers()
    } else {
      setScannerOpen(false)
    }
  }

  const handleModeChange = (nextMode: TransferMode) => {
    if (pending) return
    setMode(nextMode)
    resetOperation()
  }

  const handleSelectTransfer = (transferId: string) => {
    if (!transferId || pending) return
    setSelectedTransferId(transferId)
    setDetails(null)
    setScannedProducts([])
    scanGenerationRef.current += 1
    pendingScansRef.current.clear()
    selectedProductIdsRef.current.clear()
    setReason("")
    setStatusMessage("")
    receiveRequestIdRef.current = null
    cancelRequestIdRef.current = null
    startTransition(async () => {
      try {
        const nextDetails = await getBranchTransferDetails(transferId)
        setDetails(nextDetails)
        setStatusMessage("")
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось открыть перемещение"
        setStatusMessage(message)
        toast.error(message)
      }
    })
  }

  const handleScan = useCallback(async (rawValue: string) => {
    if (pending || operationRunningRef.current) return
    const parsed = parseQrCode(rawValue)
    const sku = parsed.sku.trim().toUpperCase()
    if (!sku) {
      setStatusMessage("В QR-коде не найден артикул товара.")
      return
    }
    if (mode !== "send" && !selectedTransferId) {
      setStatusMessage("Сначала выберите перемещение.")
      return
    }
    const generation = scanGenerationRef.current
    const scanKey = `${generation}:${parsed.shopSeqId ?? "legacy"}:${sku}`
    if (pendingScansRef.current.has(scanKey)) return
    pendingScansRef.current.add(scanKey)
    setStatusMessage("Проверяю QR-код…")
    try {
      const result = await resolveBranchTransferScan(
        sku,
        parsed.shopSeqId,
        mode === "send" ? null : selectedTransferId,
      )
      if (generation !== scanGenerationRef.current) return
      if (result.kind === "ambiguous") {
        setStatusMessage("Найдено несколько товаров с таким артикулом. Отсканируйте полный QR-код.")
        return
      }
      if (result.kind === "not_found") {
        setStatusMessage(mode === "send"
          ? "Товар не найден в остатках активного филиала или QR-код не совпадает."
          : "Этот товар не входит в выбранное перемещение либо уже обработан.")
        return
      }
      if (mode === "send" && result.product.status !== "source_stock") {
        setStatusMessage("Отправлять можно только товар из остатка активного филиала.")
        return
      }
      if (mode !== "send" && result.product.status !== "in_transit") {
        setStatusMessage("Этот товар уже не находится в пути.")
        return
      }
      if (selectedProductIdsRef.current.has(result.product.id)) {
        setStatusMessage(`Уже добавлен: ${result.product.name}`)
        return
      }
      selectedProductIdsRef.current.add(result.product.id)
      setScannedProducts((current) => [
        ...current,
        { id: result.product.id, sku: result.product.sku, name: result.product.name },
      ])
      sendRequestIdRef.current = null
      receiveRequestIdRef.current = null
      cancelRequestIdRef.current = null
      setStatusMessage(`Добавлен: ${result.product.name}`)
    } catch (error) {
      if (generation !== scanGenerationRef.current) return
      const message = error instanceof Error ? error.message : "Не удалось проверить QR-код"
      setStatusMessage(message)
      toast.error(message)
    } finally {
      pendingScansRef.current.delete(scanKey)
    }
  }, [mode, pending, selectedTransferId])

  const removeScannedProduct = (productId: string) => {
    selectedProductIdsRef.current.delete(productId)
    setScannedProducts((current) => current.filter((product) => product.id !== productId))
    sendRequestIdRef.current = null
    receiveRequestIdRef.current = null
    cancelRequestIdRef.current = null
  }

  const handleSubmit = () => {
    if (!canSubmit) return
    operationRunningRef.current = true
    scanGenerationRef.current += 1
    pendingScansRef.current.clear()
    setStatusMessage("")
    let operationSucceeded = false
    startTransition(async () => {
      try {
        if (mode === "send") {
          sendRequestIdRef.current ??= makeRequestId()
          const transferId = await startBranchTransfer(
            destinationShopId,
            scannedProducts.map((product) => product.id),
            sendRequestIdRef.current,
          )
          sendRequestIdRef.current = null
          setScannedProducts([])
          selectedProductIdsRef.current.clear()
          setStatusMessage(`Отправка подтверждена. Перемещение ${transferId.slice(0, 8)} создано.`)
          toast.success("Товары отмечены «В пути»")
          operationSucceeded = true
        } else if (mode === "receive") {
          receiveRequestIdRef.current ??= makeRequestId()
          await receiveBranchTransferItems(
            selectedTransferId,
            scannedProducts.map((product) => product.id),
            receiveRequestIdRef.current,
            reason.trim(),
          )
          receiveRequestIdRef.current = null
          setScannedProducts([])
          selectedProductIdsRef.current.clear()
          setReason("")
          setStatusMessage("Приёмка подтверждена.")
          toast.success("Товары приняты")
          operationSucceeded = true
          try {
            setDetails(await getBranchTransferDetails(selectedTransferId))
          } catch {
            setStatusMessage("Приёмка сохранена. Не удалось обновить карточку перемещения.")
          }
        } else {
          cancelRequestIdRef.current ??= makeRequestId()
          await cancelBranchTransferItems(
            selectedTransferId,
            scannedProducts.map((product) => product.id),
            cancelRequestIdRef.current,
            reason.trim(),
          )
          cancelRequestIdRef.current = null
          setScannedProducts([])
          selectedProductIdsRef.current.clear()
          setReason("")
          setStatusMessage("Возврат и отмена записаны в аудит.")
          toast.success("Возврат подтверждён")
          operationSucceeded = true
          try {
            setDetails(await getBranchTransferDetails(selectedTransferId))
          } catch {
            setStatusMessage("Возврат сохранён. Не удалось обновить карточку перемещения.")
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось выполнить операцию"
        setStatusMessage(message)
        toast.error(message)
      } finally {
        operationRunningRef.current = false
      }
      if (operationSucceeded) await refreshTransfers()
    })
  }

  const transferOptions = mode === "receive" ? incomingTransfers : outgoingTransfers

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            <Button type="button" variant="outline" className="gap-2" disabled={!online}>
              <ArrowLeftRight className="h-4 w-4" />
              Перемещения
            </Button>
          }
        />
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Перемещение товаров</DialogTitle>
            <DialogDescription>
              Сканирование добавляет товары в список; остатки меняются только после подтверждения.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-1">
            <ModeButton mode="send" current={mode} disabled={pending} onClick={handleModeChange}>
              <ArrowUpFromLine className="h-4 w-4" />
              Отправка
            </ModeButton>
            <ModeButton mode="receive" current={mode} disabled={pending} onClick={handleModeChange}>
              <ArrowDownToLine className="h-4 w-4" />
              Приёмка
            </ModeButton>
            <ModeButton mode="cancel" current={mode} disabled={pending} onClick={handleModeChange}>
              <RotateCcw className="h-4 w-4" />
              Возврат
            </ModeButton>
          </div>

          {mode === "send" ? (
            <div className="space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Филиал-получатель</span>
                <select
                  value={destinationShopId}
                  disabled={pending || destinationBranches.length === 0}
                  onChange={(event) => {
                    setDestinationShopId(event.target.value)
                    sendRequestIdRef.current = null
                  }}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Выберите филиал</option>
                  {destinationBranches.map((branch) => (
                    <option key={branch.shopId} value={branch.shopId}>
                      {branch.shopName?.trim() || "Филиал без названия"}
                    </option>
                  ))}
                </select>
              </label>
              <ScanButton
                disabled={!online || pending}
                onClick={() => setScannerOpen(true)}
                label="Сканировать товары для отправки"
              />
              <ScannedProductList
                products={scannedProducts}
                disabled={pending}
                onRemove={removeScannedProduct}
                emptyText="Отсканируйте товары, которые нужно отправить."
              />
              <Button type="button" className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
                {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Подтвердить отправку · {scannedProducts.length}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <TransferPicker
                transfers={transferOptions}
                selectedTransferId={selectedTransferId}
                mode={mode}
                loading={loadingTransfers || pending}
                onSelect={handleSelectTransfer}
              />
              {details && details.id === selectedTransferId && (
                <>
                  <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {details.sourceShopName?.trim() || `Филиал ${details.sourceShopId.slice(0, 8)}`}
                        {" → "}
                        {details.destinationShopName?.trim() || `Филиал ${details.destinationShopId.slice(0, 8)}`}
                      </p>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                        {statusLabel(details.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {details.items.length} товаров · {remainingItems.length} в пути · {formatTransferDate(details.createdAt)}
                    </p>
                  </div>
                  <ScanButton
                    disabled={!online || pending || remainingItems.length === 0}
                    onClick={() => setScannerOpen(true)}
                    label={mode === "receive" ? "Сканировать полученные товары" : "Сканировать возвращённые товары"}
                  />
                  <ScannedProductList
                    products={scannedProducts}
                    disabled={pending}
                    onRemove={removeScannedProduct}
                    emptyText={mode === "receive"
                      ? "Отсканируйте фактически полученные товары."
                      : "Отсканируйте товары, физически возвращённые отправителю."}
                  />
                  {mode === "receive" && partialReceipt && (
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">Причина расхождения</span>
                      <Input
                        value={reason}
                        maxLength={500}
                        onChange={(event) => {
                          setReason(event.target.value)
                          receiveRequestIdRef.current = null
                        }}
                        placeholder="Например, часть товара ещё не поступила"
                      />
                    </label>
                  )}
                  {mode === "cancel" && (
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">Причина возврата</span>
                      <Input
                        value={reason}
                        maxLength={500}
                        onChange={(event) => {
                          setReason(event.target.value)
                          cancelRequestIdRef.current = null
                        }}
                        placeholder="Например, товар физически вернули отправителю"
                      />
                    </label>
                  )}
                  <Button type="button" className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
                    {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    {mode === "receive"
                      ? `Подтвердить приёмку · ${scannedProducts.length}`
                      : `Подтвердить возврат · ${scannedProducts.length}`}
                  </Button>
                </>
              )}
            </div>
          )}

          {!online && (
            <p className="text-xs text-muted-foreground" role="status">
              Перемещения доступны только при подключении к интернету.
            </p>
          )}
          {statusMessage && (
            <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm" role="status" aria-live="polite">
              {statusMessage}
            </p>
          )}
        </DialogContent>
      </Dialog>
      {scannerOpen && (
        <BarcodeScannerModal
          continuousScan
          onClose={() => setScannerOpen(false)}
          onScan={(rawValue) => { void handleScan(rawValue) }}
        />
      )}
    </>
  )
}

function ModeButton({
  mode,
  current,
  disabled,
  onClick,
  children,
}: {
  mode: TransferMode
  current: TransferMode
  disabled: boolean
  onClick: (mode: TransferMode) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={mode === current}
      disabled={disabled}
      onClick={() => onClick(mode)}
      className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors disabled:opacity-50 sm:text-sm ${
        mode === current ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function ScanButton({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean
  onClick: () => void
  label: string
}) {
  return (
    <Button type="button" variant="outline" className="w-full justify-center gap-2" disabled={disabled} onClick={onClick}>
      <Camera className="h-4 w-4" />
      {label}
    </Button>
  )
}

function ScannedProductList({
  products,
  disabled,
  onRemove,
  emptyText,
}: {
  products: ScannedProduct[]
  disabled: boolean
  onRemove: (productId: string) => void
  emptyText: string
}) {
  if (products.length === 0) {
    return <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">{emptyText}</p>
  }
  return (
    <ul className="max-h-52 divide-y divide-border overflow-y-auto rounded-xl border border-border">
      {products.map((product) => (
        <li key={product.id} className="flex items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{product.name}</span>
            <span className="text-xs text-muted-foreground">{product.sku}</span>
          </span>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Убрать ${product.name}`}
            onClick={() => onRemove(product.id)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function TransferPicker({
  transfers,
  selectedTransferId,
  mode,
  loading,
  onSelect,
}: {
  transfers: BranchTransferSummary[]
  selectedTransferId: string
  mode: Exclude<TransferMode, "send">
  loading: boolean
  onSelect: (transferId: string) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {mode === "receive" ? "Входящие перемещения" : "Ваши перемещения"}
      </p>
      {loading && transfers.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Загружаю список…
        </p>
      ) : transfers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          {mode === "receive" ? "Нет товаров, ожидающих приёмки." : "Нет перемещений с товарами в пути."}
        </p>
      ) : (
        <div className="max-h-48 space-y-2 overflow-y-auto">
          {transfers.map((transfer) => {
            const selected = transfer.id === selectedTransferId
            const counterpartName = mode === "receive"
              ? transfer.sourceShopName
              : transfer.destinationShopName
            return (
              <button
                type="button"
                key={transfer.id}
                aria-pressed={selected}
                disabled={loading}
                onClick={() => onSelect(transfer.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
                  selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {counterpartName?.trim() || `Филиал ${(
                      mode === "receive" ? transfer.sourceShopId : transfer.destinationShopId
                    ).slice(0, 8)}`}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{statusLabel(transfer.status)}</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {transfer.inTransitCount} в пути из {transfer.itemCount} · {formatTransferDate(transfer.createdAt)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
