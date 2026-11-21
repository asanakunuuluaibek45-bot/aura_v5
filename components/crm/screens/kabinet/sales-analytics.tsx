"use client"

import { useEffect, useMemo, useState } from "react"
import type { Profile, Sale, SaleReturn } from "@/lib/types"
import { formatSom, roleLabel } from "@/lib/format"
import { useServerSalesRange } from "@/hooks/use-server-sales"
import { Button } from "@/components/shared/ui/button"
import { Input } from "@/components/shared/ui/input"
import { Badge } from "@/components/shared/ui/badge"
import { Avatar, AvatarFallback } from "@/components/shared/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shared/ui/card"
import { cn } from "@/lib/utils"
import { Coins, RotateCcw } from "lucide-react"
import { RangeFilters, rangeBounds, type RangeId } from "./sales-range"

export function SellerStats({
  sales: localSales,
  returns,
  profile,
}: {
  sales: Sale[]
  returns: SaleReturn[]
  profile: Profile
}) {
  const [range, setRange] = useState<RangeId>("today")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const bounds = useMemo(() => rangeBounds(range, from, to), [range, from, to])
  const returnSaleIds = useMemo(
    () => returns
      .filter((r) => {
        const t = new Date(r.created_at).getTime()
        return t >= bounds[0] && t < bounds[1]
      })
      .map((r) => r.sale_id),
    [returns, bounds],
  )
  const { sales } = useServerSalesRange({
    from: bounds[0],
    to: Number.isFinite(bounds[1]) ? bounds[1] : null,
    localSales,
    includeSaleIds: returnSaleIds,
  })
  const mine = useMemo(() => sales.filter((s) => s.seller_id === profile.id), [sales, profile.id])
  const mySaleIds = useMemo(() => new Set(mine.map((s) => s.id)), [mine])
  const myReturns = useMemo(
    () => returns.filter((r) => mySaleIds.has(r.sale_id)),
    [returns, mySaleIds],
  )
  const stats = useMemo(() => {
    const [a, b] = rangeBounds(range, from, to)
    const inWindow = (iso: string) => {
      const t = new Date(iso).getTime()
      return t >= a && t < b
    }
    const rows = mine.filter((s) => inWindow(s.created_at))
    const retRows = myReturns.filter((r) => inWindow(r.created_at))
    const returnedAmount = retRows.reduce((s, r) => s + Number(r.amount), 0)
    const returnedCost = retRows.reduce((s, r) => s + Number(r.cost), 0)
    return {
      count: rows.length,
      revenue: rows.reduce((s, r) => s + Number(r.total), 0) - returnedAmount,
      profit: rows.reduce((s, r) => s + Number(r.profit), 0) - (returnedAmount - returnedCost),
      bonus: rows.reduce((s, r) => s + Number(r.bonus_earned), 0),
    }
  }, [mine, myReturns, range, from, to])

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-primary" />
          Мои продажи
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RangeFilters range={range} setRange={setRange} from={from} setFrom={setFrom} to={to} setTo={setTo} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Количество продаж</div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{stats.count}</div>
          </div>
          <div className="min-w-0 rounded-xl border border-border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Выручка</div>
            <div className="mt-1 break-words font-mono text-2xl font-semibold text-primary">{formatSom(stats.revenue)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function TeamSales({
  sales: localSales,
  returns,
  profile,
  team,
  onResetBonus,
  onSetBonus,
  busy,
}: {
  sales: Sale[]
  returns: SaleReturn[]
  profile: Profile
  team: Profile[]
  onResetBonus: (id: string, name: string) => void
  onSetBonus: (id: string, points: number) => void
  busy: boolean
}) {
  const [range, setRange] = useState<RangeId>("30d")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const bounds = useMemo(() => rangeBounds(range, from, to), [range, from, to])
  const returnSaleIds = useMemo(
    () => returns
      .filter((r) => {
        const t = new Date(r.created_at).getTime()
        return t >= bounds[0] && t < bounds[1]
      })
      .map((r) => r.sale_id),
    [returns, bounds],
  )
  const { sales } = useServerSalesRange({
    from: bounds[0],
    to: Number.isFinite(bounds[1]) ? bounds[1] : null,
    localSales,
    includeSaleIds: returnSaleIds,
  })
  const people = useMemo(() => {
    const map = new Map<string, Profile>()
    map.set(profile.id, profile)
    team.forEach((m) => map.set(m.id, m))
    return [...map.values()]
  }, [team, profile])
  const rows = useMemo(() => {
    const [a, b] = rangeBounds(range, from, to)
    const inWindow = (iso: string) => {
      const t = new Date(iso).getTime()
      return t >= a && t < b
    }
    const inRange = sales.filter((s) => inWindow(s.created_at))
    const sellerBySale = new Map<string, string>()
    for (const s of sales) sellerBySale.set(s.id, s.seller_id)
    const returnsBySeller = new Map<string, { amount: number; cost: number }>()
    for (const r of returns) {
      if (!inWindow(r.created_at)) continue
      const sellerId = sellerBySale.get(r.sale_id)
      if (!sellerId) continue
      const acc = returnsBySeller.get(sellerId) ?? { amount: 0, cost: 0 }
      acc.amount += Number(r.amount)
      acc.cost += Number(r.cost)
      returnsBySeller.set(sellerId, acc)
    }
    return people
      .map((p) => {
        const own = inRange.filter((s) => s.seller_id === p.id)
        const units = own.reduce(
          (sum, s) => sum + (s.items ?? []).reduce((n, it) => n + Number(it.quantity || 0), 0),
          0,
        )
        const ret = returnsBySeller.get(p.id) ?? { amount: 0, cost: 0 }
        return {
          profile: p,
          revenue: own.reduce((sum, s) => sum + Number(s.total), 0) - ret.amount,
          profit: own.reduce((sum, s) => sum + Number(s.profit), 0) - (ret.amount - ret.cost),
          units,
          receipts: own.length,
          bonus: Number(p.bonus_points ?? 0),
        }
      })
      .sort((x, y) => y.revenue - x.revenue)
  }, [people, sales, returns, range, from, to])

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-primary" />
          Продажи по сотрудникам
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RangeFilters range={range} setRange={setRange} from={from} setFrom={setFrom} to={to} setTo={setTo} />
        <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((row) => (
            <div key={row.profile.id} className="min-w-0 rounded-xl border border-border/70 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0 border border-border">
                  <AvatarFallback className="bg-primary/15 text-xs text-primary">
                    {(row.profile.full_name ?? "?")
                      .split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-words text-sm font-medium">{row.profile.full_name ?? "Без имени"}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">{roleLabel(row.profile.role)}</Badge>
                    {row.profile.id === profile.id && <span className="text-[10px] text-muted-foreground">это вы</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    чеков: {row.receipts} · штук: {row.units} · прибыль {formatSom(row.profit)}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                  <div className="text-[11px] text-muted-foreground">Выручка</div>
                  <div className="break-words font-mono text-sm font-semibold text-primary">{formatSom(row.revenue)}</div>
                </div>
                <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                  <div className="text-[11px] text-muted-foreground">Бонусы</div>
                  <div className="font-mono text-sm font-semibold tabular-nums">{row.bonus.toFixed(0)}</div>
                </div>
              </div>
              <BonusPointsEditor
                member={row.profile}
                busy={busy}
                onSetBonus={onSetBonus}
                onResetBonus={onResetBonus}
                className="mt-3"
              />
            </div>
          ))}
          {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Нет данных</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function BonusPointsEditor({
  member,
  busy,
  onSetBonus,
  onResetBonus,
  className,
}: {
  member: Profile
  busy: boolean
  onSetBonus: (id: string, points: number) => void
  onResetBonus: (id: string, name: string) => void
  className?: string
}) {
  const [points, setPoints] = useState(String(Number(member.bonus_points ?? 0).toFixed(0)))
  useEffect(() => {
    setPoints(String(Number(member.bonus_points ?? 0).toFixed(0)))
  }, [member.bonus_points])

  return (
    <div className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5", className)}>
      <Input
        type="number"
        min={0}
        value={points}
        onChange={(e) => setPoints(e.target.value)}
        className="h-9 w-full min-w-0"
        aria-label="Бонусные баллы"
      />
      <Button
        size="sm"
        variant="outline"
        className="h-9 whitespace-nowrap bg-transparent"
        disabled={busy}
        onClick={() => onSetBonus(member.id, Number(points))}
      >
        Обновить
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9"
        title="Обнулить баллы"
        disabled={busy}
        onClick={() => onResetBonus(member.id, member.full_name ?? "сотрудника")}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
