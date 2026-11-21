"use client"

import { Bell, Check, CheckCheck } from "lucide-react"
import type { StoreNotification } from "@/lib/types"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export function StoreNotificationItem({
  notification,
  onMarkRead,
  isPending = false,
  compact = false,
}: {
  notification: StoreNotification
  onMarkRead: (id: string) => void
  isPending?: boolean
  compact?: boolean
}) {
  return (
    <article className={cn(
      "rounded-xl border p-4 transition-colors",
      notification.is_read ? "border-border bg-card" : "border-primary/25 bg-primary/[0.04]",
      compact && "p-3",
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          notification.is_read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
          compact && "h-8 w-8",
        )}>
          {notification.is_read ? <CheckCheck className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="font-semibold leading-snug">{notification.title}</h3>
            <time className="text-xs text-muted-foreground">{formatDateTime(notification.created_at)}</time>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
            {notification.message}
          </p>
          {!notification.is_read && (
            <button
              type="button"
              onClick={() => onMarkRead(notification.id)}
              disabled={isPending}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Прочитано
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
