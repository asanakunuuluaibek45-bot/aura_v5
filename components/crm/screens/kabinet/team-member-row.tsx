"use client"

import { useState } from "react"
import type { Profile } from "@/lib/types"
import { roleLabel } from "@/lib/format"
import { Button } from "@/components/shared/ui/button"
import { Input } from "@/components/shared/ui/input"
import { Badge } from "@/components/shared/ui/badge"
import { Avatar, AvatarFallback } from "@/components/shared/ui/avatar"
import { cn } from "@/lib/utils"
import { Trash2 } from "lucide-react"

function initialsOf(name: string | null) {
  return (name ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function isOnline(profile: Profile) {
  if (!profile.last_seen_at) return false
  return Date.now() - new Date(profile.last_seen_at).getTime() < 3 * 60 * 1000
}

export function MemberRow({
  member,
  canEditRate,
  canDelete,
  onDelete,
  onRate,
  busy,
}: {
  member: Profile
  canEditRate: boolean
  canDelete: boolean
  onDelete: (id: string) => void
  onRate: (id: string, rate: number) => void
  busy: boolean
}) {
  const [rate, setRate] = useState(String(member.bonus_rate ?? 2))
  const online = isOnline(member)

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 border-b border-border/60 py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="h-9 w-9 border border-border">
            <AvatarFallback className="bg-primary/15 text-xs text-primary">{initialsOf(member.full_name)}</AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
              online ? "bg-success" : "bg-muted-foreground/40",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-words text-sm font-medium">{member.full_name ?? "Без имени"}</span>
            <Badge variant="secondary" className="text-[10px]">{roleLabel(member.role)}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {online ? "Онлайн" : "Не в сети"} · бонусы: {Number(member.bonus_points ?? 0).toFixed(0)}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
        {canEditRate && (
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
            <Input
              type="number"
              min={0}
              max={100}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="h-9 w-20"
              aria-label="Процент бонусов"
            />
            <span className="text-xs text-muted-foreground">%</span>
            <Button
              size="sm"
              variant="outline"
              className="h-9 bg-transparent"
              disabled={busy}
              onClick={() => onRate(member.id, Number(rate))}
            >
              Сохранить
            </Button>
          </div>
        )}
        {canDelete && (
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0 text-destructive"
            disabled={busy}
            aria-label="Удалить сотрудника"
            onClick={() => {
              if (confirm(`Удалить ${member.full_name ?? "сотрудника"} из системы?`)) onDelete(member.id)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
