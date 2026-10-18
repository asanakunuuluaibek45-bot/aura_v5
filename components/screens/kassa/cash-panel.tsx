"use client"

import { useMemo, useState } from "react"
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
 * Ð¡Ð²Ð¾Ð´Ð½ÑÐµ Ð¿Ð¾ÐºÐ°Ð·Ð°ÑÐµÐ»Ð¸ ÐºÐ°ÑÑÑ, Ð¸Ð½ÐºÐ°ÑÑÐ°ÑÐ¸Ñ Ð¸ Ð¾Ð¿ÐµÑÐ°ÑÐ¸Ð¸ Ð²Ð½ÐµÑÐµÐ½Ð¸Ñ/Ð¸Ð·ÑÑÑÐ¸Ñ.
 * ÐÐ½ÐºÐ°ÑÑÐ°ÑÐ¸Ñ Ð²ÑÐ²Ð¾Ð´Ð¸Ñ ÑÑÐµÐ´ÑÑÐ²Ð° Ð¸Ð· ÐºÐ°ÑÑÑ, Ð¿Ð¾ÑÑÐ¾Ð¼Ñ ÑÐ¼ÐµÐ½ÑÑÐ°ÐµÑ Ð²ÑÐ±ÑÐ°Ð½Ð½ÑÐ¹ Ð¸ÑÑÐ¾ÑÐ½Ð¸Ðº.
 */
export function CashPanel({
  sales,
  operations,
  presets,
  isAdmin,
  balanceOnly = false,
}: {
  sales: Sale[]
  operations: CashOperation[]
  presets: CashReasonPreset[]
  isAdmin: boolean
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

  // ÐÐ°Ð»Ð°Ð½ÑÑ Ð·Ð° Ð²ÑÑ Ð²ÑÐµÐ¼Ñ â Ð¸Ð¼ÐµÐ½Ð½Ð¾ Ð¸Ð· Ð½Ð¸Ñ Ð²ÐµÐ´ÑÑÑÑ ÑÐ¿Ð¸ÑÐ°Ð½Ð¸Ñ.
  const balances = useMemo(
    () => computeBalances(confirmedSales, confirmedOperations),
    [confirmedSales, confirmedOperations],
  )

  const authors = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of operations) if (o.created_by) map.set(o.created_by, o.author_name ?? "â")
    return [...map].map(([id, name]) => ({ id, name }))
  }, [operations])

  const handleCollection = () => {
    if (balances.cash <= 0) {
      toast.error("Ð ÐºÐ°ÑÑÐµ Ð½ÐµÑ Ð½Ð°Ð»Ð¸ÑÐ½ÑÑ Ð´Ð»Ñ Ð¸Ð½ÐºÐ°ÑÑÐ°ÑÐ¸Ð¸")
      return
    }
    setDialog({
      type: "collection",
      amount: String(Math.round(balances.cash)),
      reason: "ÐÐ½ÐºÐ°ÑÑÐ°ÑÐ¸Ñ Ð² Ð±Ð°Ð½Ðº",
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs text-muted-foreground">ÐÐ°ÑÑÐ¾Ð²ÑÐ¹ Ð±Ð°Ð»Ð°Ð½Ñ</div>
            {/* ÐÑÐ¾Ð´Ð°Ð²ÐµÑ Ð²Ð¸Ð´Ð¸Ñ ÑÐ¾Ð»ÑÐºÐ¾ Ð½Ð°Ð»Ð¸ÑÐ½ÑÐµ; Ð°Ð´Ð¼Ð¸Ð½Ð¸ÑÑÑÐ°ÑÐ¾Ñ Ð²Ð¸Ð´Ð¸Ñ Ð¿Ð¾Ð»Ð½ÑÐ¹ Ð±Ð°Ð»Ð°Ð½Ñ */}
            {isAdmin ? (
              <>
                <div className="font-mono text-2xl font-semibold text-primary">{formatSom(balances.total)}</div>
                <div className="text-[11px] text-muted-foreground">
                  Ð½Ð°Ð»Ð¸ÑÐ½ÑÐµ: <span className="font-mono">{formatSom(balances.cash)}</span> Â· ÑÐ»ÐµÐºÑÑÐ¾Ð½Ð½ÑÐµ:{" "}
                  <span className="font-mono">{formatSom(balances.electronic)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-2xl font-semibold text-primary">{formatSom(balances.cash)}</div>
                <div className="text-[11px] text-muted-foreground">Ð½Ð°Ð»Ð¸ÑÐ½ÑÐµ Ð² ÐºÐ°ÑÑÐµ</div>
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
              title="ÐÐ½ÐºÐ°ÑÑÐ°ÑÐ¸Ñ: Ð¿ÐµÑÐµÐ²Ð¾Ð´ Ð½Ð°Ð»Ð¸ÑÐ½ÑÑ Ð² ÑÐ»ÐµÐºÑÑÐ¾Ð½Ð½ÑÐµ ÑÑÐµÐ´ÑÑÐ²Ð°"
            >
              <ShieldCheck className="mr-1 h-4 w-4" />
              ÐÐ½ÐºÐ°ÑÑÐ°ÑÐ¸Ñ
            </Button>
            <Button variant="outline" className="bg-transparent" onClick={() => setDialog({ type: "outcome" })}>
              <ArrowUpRight className="mr-1 h-4 w-4" />
              ÐÐ·ÑÑÑÑ
            </Button>
            <Button onClick={() => setDialog({ type: "income" })}>
              <ArrowDownLeft className="mr-1 h-4 w-4" />
              ÐÐ½ÐµÑÑÐ¸
            </Button>
          </div>
        )}
      </div>

      {isAdmin && !balanceOnly && (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  period === p.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric icon={<Banknote className="h-4 w-4" />} label="ÐÐ°Ð»Ð¸ÑÐ½ÑÐµ" value={stats.cash} />
            <Metric icon={<CreditCard className="h-4 w-4" />} label="Ð­Ð»ÐµÐºÑÑÐ¾Ð½Ð½ÑÐµ" value={stats.electronic} />
            <Metric
              icon={<Wallet className="h-4 w-4" />}
              label={`ÐÐ±Ð¾ÑÐ¾Ñ Â· ${stats.count} ÑÐµÐº.`}
              value={stats.total}
              accent
            />
          </div>

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
      <div className={cn("mt-1 font-mono text-lg font-semibold", accent ? "text-primary" : "text-foreground")}>
        {formatSom(value)}
      </div>
    </div>
  )
}
