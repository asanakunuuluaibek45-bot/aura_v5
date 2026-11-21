"use client"

import { cn } from "@/lib/utils"
import { Input } from "@/components/shared/ui/input"
import { Label } from "@/components/shared/ui/label"

export type RangeId = "today" | "yesterday" | "7d" | "30d" | "month" | "all" | "custom"

const RANGES: { id: RangeId; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "yesterday", label: "Вчера" },
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "month", label: "Текущий месяц" },
  { id: "all", label: "За всё время" },
  { id: "custom", label: "Период" },
]

export function rangeBounds(id: RangeId, from: string, to: string): [number, number] {
  const now = new Date()
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const today = startOfDay(now)
  const day = 86400000
  switch (id) {
    case "today":
      return [today, today + day]
    case "yesterday":
      return [today - day, today]
    case "7d":
      return [today - 6 * day, today + day]
    case "30d":
      return [today - 29 * day, today + day]
    case "month":
      return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), today + day]
    case "custom": {
      const start = from ? new Date(from).getTime() : 0
      const end = to ? new Date(to).getTime() + day : Number.POSITIVE_INFINITY
      return [start, end]
    }
    default:
      return [0, Number.POSITIVE_INFINITY]
  }
}

export function RangeFilters({
  range,
  setRange,
  from,
  setFrom,
  to,
  setTo,
}: {
  range: RangeId
  setRange: (range: RangeId) => void
  from: string
  setFrom: (value: string) => void
  to: string
  setTo: (value: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {RANGES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={range === item.id}
            onClick={() => setRange(item.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              range === item.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {range === "custom" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="grid min-w-0 gap-1">
            <Label className="text-xs text-muted-foreground">С</Label>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 min-w-0" />
          </div>
          <div className="grid min-w-0 gap-1">
            <Label className="text-xs text-muted-foreground">По</Label>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 min-w-0" />
          </div>
        </div>
      )}
    </div>
  )
}
