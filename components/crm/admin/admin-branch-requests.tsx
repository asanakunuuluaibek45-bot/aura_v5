"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, MapPin, X } from "lucide-react"
import { reviewBranchCreationRequest, type BranchCreationRequestSummary } from "@/app/actions/superadmin"
import { Badge } from "@/components/shared/ui/badge"
import { Button } from "@/components/shared/ui/button"
import { Card, CardContent } from "@/components/shared/ui/card"
import { toast } from "sonner"

const statusLabels: Record<BranchCreationRequestSummary["status"], string> = {
  pending: "Ожидает решения",
  approved: "Одобрено",
  rejected: "Отклонено",
}

export function AdminBranchRequests({ requests }: { requests: BranchCreationRequestSummary[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const review = (request: BranchCreationRequestSummary, approve: boolean) => {
    const message = approve
      ? "Одобрить открытие точки? Она появится у владельца, но его активный магазин не изменится."
      : "Отклонить запрос на открытие точки?"
    if (!window.confirm(message)) return
    setError(null)
    startTransition(async () => {
      try {
        await reviewBranchCreationRequest(request.id, approve)
        toast.success(approve ? "Точка одобрена и добавлена в список филиалов" : "Запрос отклонён")
        router.refresh()
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Не удалось обработать запрос"
        setError(message)
        toast.error(message)
      }
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">GOLDUCHET · Платформа</p>
        <h1 className="font-serif text-3xl tracking-tight">Запросы на открытие точек</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Одобрение создаёт точку и выдаёт доступ заявителю. Его текущий магазин остаётся активным.
        </p>
      </header>

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
      {requests.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Пока нет запросов на открытие точек.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <h2 className="truncate font-semibold">{request.requested_shop_name}</h2>
                    <Badge variant="outline">{statusLabels[request.status]}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Бизнес: {request.business_name} · запросил: {request.requester_name || "Администратор"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Текущий магазин: {request.source_shop_name} · {new Date(request.requested_at).toLocaleString("ru-RU")}
                  </p>
                  {request.status === "approved" && (
                    <p className="text-xs text-muted-foreground">Созданная точка доступна владельцу для ручного переключения.</p>
                  )}
                </div>
                {request.status === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <Button disabled={pending} onClick={() => review(request, true)}>
                      <Check className="mr-2 h-4 w-4" /> Одобрить
                    </Button>
                    <Button disabled={pending} variant="outline" onClick={() => review(request, false)}>
                      <X className="mr-2 h-4 w-4" /> Отклонить
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
