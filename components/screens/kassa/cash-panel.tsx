"use client"

import { useMemo, useState } from "react"
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
 */
export function CashPanel({
  sales,
  operations,
  presets,
  isAdmin,
}: {
  sales: Sale[]
  operations: CashOperation[]
  presets: CashReasonPreset[]
  isAdmin: boolean
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
  }

  return (
    <section className="space-y-3">
      {/* Актуальный баланс — виден и продавцу */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs text-muted-foreground">Кассовый баланс</div>
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
            >
              <ShieldCheck className="mr-1 h-4 w-4" />
              Инкассация
            </Button>
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
              <ArrowDownLeft className="mr-1 h-4 w-4" />
              Внести
            </Button>
          </div>
        )}
      </div>

      {isAdmin && (
        <>
          {/* Пресеты периодов */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
                  period === p.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

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
              accent
            />
          </div>

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
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {formatSom(value)}
      </div>
    </div>
  )
}