"use client"

import { useMemo, useState } from "react"
<<<<<<< HEAD
import dynamic from "next/dynamic"
import type { CashOperation, CashOpType, CashReasonPreset, Sale } from "@/lib/types"
import { formatSom } from "@/lib/format"
import { PERIOD_PRESETS, periodRange, inPeriod, type PeriodId } from "@/lib/period"
import { computeBalances } from "@/lib/cash"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, ShieldCheck, Wallet } from "lucide-react"

const CashHistory = dynamic(() => import("./cash-history").then((mod) => mod.CashHistory))
const CashOperationDialog = dynamic(() => import("./cash-operation-dialog").then((mod) => mod.CashOperationDialog))

/**
 * Сводные показатели кассы, инкассация и операции внесения/изъятия.
 * Инкассация выводит средства из кассы, поэтому уменьшает выбранный источник.
=======
import type { CashOperation, CashReasonPreset, Sale } from "@/lib/types"
import { formatDateTime, formatSom } from "@/lib/format"
import { PERIOD_PRESETS, periodRange, inPeriod, type PeriodId } from "@/lib/period"
import { createCashOperation } from "@/app/actions/cash"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, ShieldCheck, Wallet } from "lucide-react"

const ELECTRONIC = ["card", "transfer"]

/**
 * Сводные финансовые показатели кассы + изъятие/внесение/инкассация.
 * Показатели и операции — только для администратора; кассовый баланс виден всем.
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
 */
export function CashPanel({
  sales,
  operations,
  presets,
  isAdmin,
<<<<<<< HEAD
  balanceOnly = false,
=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
}: {
  sales: Sale[]
  operations: CashOperation[]
  presets: CashReasonPreset[]
  isAdmin: boolean
<<<<<<< HEAD
  balanceOnly?: boolean
}) {
  const [period, setPeriod] = useState<PeriodId>("today")
  const [dialog, setDialog] = useState<{ type: CashOpType; amount?: string; reason?: string } | null>(null)

  const range = useMemo(() => periodRange(period), [period])

  const confirmedSales = useMemo(
    () => sales.filter((sale) => sale.sync_status !== "pending" && sale.sync_status !== "rejected"),
    [sales],
  )
  const provisionalCashOperationIds = useMemo(
    () =>
      new Set(
        sales
          .filter((sale) => sale.sync_status === "pending" || sale.sync_status === "rejected")
          .map((sale) => sale.cash_operation_id)
          .filter((id): id is string => Boolean(id)),
      ),
    [sales],
  )
  const confirmedOperations = useMemo(
    () => operations.filter((operation) => !provisionalCashOperationIds.has(operation.id)),
    [operations, provisionalCashOperationIds],
  )

  const stats = useMemo(() => {
    const rows = confirmedSales.filter((s) => inPeriod(s.created_at, range))
    const b = computeBalances(confirmedSales, confirmedOperations, (d) => inPeriod(d, range))
    return { ...b, count: rows.length }
  }, [confirmedSales, confirmedOperations, range])

  // Балансы за всё время — именно из них ведутся списания.
  const balances = useMemo(
    () => computeBalances(confirmedSales, confirmedOperations),
    [confirmedSales, confirmedOperations],
  )

  const authors = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of operations) if (o.created_by) map.set(o.created_by, o.author_name ?? "—")
    return [...map].map(([id, name]) => ({ id, name }))
  }, [operations])

  const handleCollection = () => {
    if (balances.cash <= 0) {
      toast.error("В кассе нет наличных для инкассации")
      return
    }
    setDialog({
      type: "collection",
      amount: String(Math.round(balances.cash)),
      reason: "Инкассация в банк",
    })
=======
}) {
  const router = useRouter()
  const [period, setPeriod] = useState<PeriodId>("today")
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"income" | "outcome" | "collection">("outcome")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [savePreset, setSavePreset] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const range = useMemo(() => periodRange(period), [period])

  const stats = useMemo(() => {
    const rows = sales.filter((s) => inPeriod(s.created_at, range))
    let cash = 0
    let electronic = 0
    for (const s of rows) {
      const total = Number(s.total) || 0
      if (s.payment_method === "cash") cash += total
      else if (ELECTRONIC.includes(s.payment_method)) electronic += total
    }
    return { cash, electronic, revenue: cash + electronic, count: rows.length }
  }, [sales, range])

  // Фактический остаток кассы за всё время: продажи + внесения (income) − изъятия (outcome) − инкассации (collection).
  const balance = useMemo(() => {
    const salesTotal = sales.reduce((s, x) => s + (Number(x.total) || 0), 0)
    const opsTotal = operations.reduce(
      (s, o) => s + (o.type === "income" ? Number(o.amount) : -Number(o.amount)),
      0,
    )
    return salesTotal + opsTotal
  }, [sales, operations])

  // Расчет текущих наличных в кассе (наличные продажи + внесения - изъятия - инкассации)
  const currentCashBalance = useMemo(() => {
    const totalCashSales = sales
      .filter((s) => s.payment_method === "cash")
      .reduce((acc, s) => acc + (Number(s.total) || 0), 0)
    
    const opsTotal = operations.reduce(
      (acc, o) => acc + (o.type === "income" ? Number(o.amount) : -Number(o.amount)),
      0,
    )
    return Math.max(0, totalCashSales + opsTotal)
  }, [sales, operations])

  const amountNum = Number(amount)
  const valid = Number.isFinite(amountNum) && amountNum > 0 && reason.trim().length > 0

  const submit = async () => {
    if (!valid) {
      toast.error("Укажите сумму и обязательную причину операции")
      return
    }
    setSubmitting(true)
    try {
      await createCashOperation({ type, amount: amountNum, reason: reason.trim(), savePreset })
      const successText = 
        type === "income" ? "Внесение проведено" :
        type === "collection" ? "Инкассация проведена" : "Изъятие проведено"
      toast.success(successText)
      setOpen(false)
      setAmount("")
      setReason("")
      setSavePreset(false)
      router.refresh()
    } catch (e) {
      console.error("[kassa] cash operation error:", e)
      toast.error(e instanceof Error ? e.message : "Не удалось провести операцию")
    } finally {
      setSubmitting(false)
    }
  }

  // Функция для быстрой инкассации всей наличности
  const handleCollection = () => {
    if (currentCashBalance <= 0) {
      toast.error("В кассе нет наличных для инкассации")
      return
    }
    setType("collection")
    setAmount(currentCashBalance.toString())
    setReason("Инкассация наличных в банк")
    setSavePreset(false)
    setOpen(true)
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
  }

  return (
    <section className="space-y-3">
<<<<<<< HEAD
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
=======
      {/* Актуальный баланс — виден и продавцу */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs text-muted-foreground">Кассовый баланс</div>
<<<<<<< HEAD
            {/* Продавец видит только наличные; администратор видит полный баланс */}
            {isAdmin ? (
              <>
                <div className="font-mono text-2xl font-semibold text-primary">{formatSom(balances.total)}</div>
                <div className="text-[11px] text-muted-foreground">
                  наличные: <span className="font-mono">{formatSom(balances.cash)}</span> · электронные:{" "}
                  <span className="font-mono">{formatSom(balances.electronic)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-2xl font-semibold text-primary">{formatSom(balances.cash)}</div>
                <div className="text-[11px] text-muted-foreground">наличные в кассе</div>
              </>
            )}
          </div>
        </div>
        {isAdmin && !balanceOnly && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-primary/50 bg-transparent text-primary hover:bg-primary/10"
              onClick={handleCollection}
              title="Инкассация: перевод наличных в электронные средства"
=======
            <div className="font-mono text-xl font-semibold text-primary">{formatSom(balance)}</div>
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            
            <Button
              variant="outline"
              className="bg-transparent border-primary/30 text-primary hover:bg-primary/10"
              onClick={handleCollection}
              title="Инкассировать всю наличность из кассы"
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
            >
              <ShieldCheck className="mr-1 h-4 w-4" />
              Инкассация
            </Button>
<<<<<<< HEAD
            <Button variant="outline" className="bg-transparent" onClick={() => setDialog({ type: "outcome" })}>
              <ArrowUpRight className="mr-1 h-4 w-4" />
              Изъять
            </Button>
            <Button onClick={() => setDialog({ type: "income" })}>
=======
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => {
                setType("outcome")
                setAmount("")
                setReason("")
                setOpen(true)
              }}
            >
              <ArrowUpRight className="mr-1 h-4 w-4" />
              Изъять
            </Button>
            <Button
              onClick={() => {
                setType("income")
                setAmount("")
                setReason("")
                setOpen(true)
              }}
            >
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
              <ArrowDownLeft className="mr-1 h-4 w-4" />
              Внести
            </Button>
          </div>
        )}
      </div>

<<<<<<< HEAD
      {isAdmin && !balanceOnly && (
        <>
=======
      {isAdmin && (
        <>
          {/* Пресеты периодов */}
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
<<<<<<< HEAD
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
=======
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
                  period === p.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

<<<<<<< HEAD
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric icon={<Banknote className="h-4 w-4" />} label="Наличные" value={stats.cash} />
            <Metric icon={<CreditCard className="h-4 w-4" />} label="Электронные" value={stats.electronic} />
            <Metric
              icon={<Wallet className="h-4 w-4" />}
              label={`Оборот · ${stats.count} чек.`}
              value={stats.total}
=======
          {/* Метрики периода */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric
              icon={<Banknote className="h-4 w-4" />}
              label="В кассе (наличные)"
              value={stats.cash}
            />
            <Metric
              icon={<CreditCard className="h-4 w-4" />}
              label="В кассе (электронные)"
              value={stats.electronic}
            />
            <Metric
              icon={<Wallet className="h-4 w-4" />}
              label={`Общая выручка · ${stats.count} чек.`}
              value={stats.revenue}
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
              accent
            />
          </div>

<<<<<<< HEAD
          <CashHistory operations={confirmedOperations} period={period} authors={authors} />
        </>
      )}

      {!balanceOnly && dialog && (
        <CashOperationDialog
          type={dialog.type}
          balances={balances}
          presets={presets}
          initialAmount={dialog.amount}
          initialReason={dialog.reason}
          onClose={() => setDialog(null)}
        />
=======
          {/* История операций с кассой */}
          {operations.length > 0 && (
            <div className="rounded-2xl border border-border bg-card">
              <div className="border-b border-border px-4 py-2 text-sm font-medium">
                История операций кассы
              </div>
              <div className="max-h-64 divide-y divide-border/60 overflow-y-auto">
                {operations.map((o) => {
                  const isIncome = o.type === "income"
                  const isCollection = o.type === "collection"
                  const isNegative = !isIncome

                  return (
                    <div key={o.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              isIncome
                                ? "bg-success/15 text-success"
                                : isCollection
                                ? "bg-primary/15 text-primary"
                                : "bg-destructive/15 text-destructive",
                            )}
                          >
                            {isIncome ? "Внесение" : isCollection ? "Инкассация" : "Изъятие"}
                          </span>
                          <span className="line-clamp-2 text-sm">{o.reason}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTime(o.created_at)} · {o.author_name ?? "—"}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "shrink-0 font-mono text-sm font-semibold",
                          isNegative ? "text-destructive" : "text-success",
                        )}
                      >
                        {isNegative ? "−" : "+"}
                        {formatSom(Number(o.amount))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Модальное окно изъятия / внесения / инкассации */}
      {open && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="font-semibold">
              {type === "collection"
                ? "Проведение инкассации"
                : type === "outcome"
                ? "Изъятие из кассы"
                : "Внесение в кассу"}
            </h3>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Сумма (с)</span>
                  {(type === "outcome" || type === "collection") && (
                    <span className="text-[11px]">Доступно наличных: {formatSom(currentCashBalance)}</span>
                  )}
                </div>
                <Input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9"
                  autoFocus
                />
              </div>

              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">
                  Причина / цель <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Например: Инкассация в банк"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-9"
                />
                {reason.trim().length === 0 && (
                  <p className="text-xs text-destructive">Поле причины обязательно для заполнения</p>
                )}
              </div>

              {presets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setReason(p.text)}
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {p.text}
                    </button>
                  ))}
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={savePreset}
                  onChange={(e) => setSavePreset(e.target.checked)}
                />
                Сохранить причину как шаблон
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" className="bg-transparent" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button disabled={!valid || submitting} onClick={() => void submit()}>
                {submitting ? "Сохранение..." : "Подтвердить"}
              </Button>
            </div>
          </div>
        </div>
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
      )}
    </section>
  )
}

function Metric({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
<<<<<<< HEAD
      <div className={cn("mt-1 font-mono text-lg font-semibold", accent ? "text-primary" : "text-foreground")}>
=======
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold",
          accent ? "text-primary" : "text-foreground",
        )}
      >
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
        {formatSom(value)}
      </div>
    </div>
  )
<<<<<<< HEAD
}
=======
}
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
