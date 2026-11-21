"use client"

import { useEffect, useRef, useState } from "react"
import { Bell, CheckCheck, Loader2 } from "lucide-react"
import { useStoreNotifications } from "@/hooks/useStoreNotifications"
import { StoreNotificationItem } from "@/components/crm/notifications/StoreNotificationItem"
import { cn } from "@/lib/utils"

export function StoreNotificationBell({ onSeeAll }: { onSeeAll?: () => void }) {
  const { items, unreadCount, isLoading, isPending, error, refresh, markRead, markAllRead } = useStoreNotifications()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus() } }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  const badge = Math.min(unreadCount, 99)
  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          open && "bg-muted text-foreground",
        )}
        aria-label={`Уведомления${unreadCount ? `, непрочитанных: ${unreadCount}` : ""}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div ref={panelRef} className="absolute right-0 top-11 z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-xl border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Уведомления</h2>
              {unreadCount > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{unreadCount}</span>}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={isPending}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Прочитать все
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : error ? (
              <div className="space-y-2 px-2 py-6 text-center text-sm" role="alert">
                <p>Не удалось загрузить уведомления.</p>
                <button type="button" onClick={() => void refresh()} className="text-primary">Повторить</button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Пока нет уведомлений</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {items.slice(0, 8).map((item) => (
                  <StoreNotificationItem key={item.id} notification={item} onMarkRead={markRead} isPending={isPending} compact />
                ))}
              </div>
            )}
          </div>
          {onSeeAll && (
            <button
              type="button"
              onClick={() => { setOpen(false); onSeeAll() }}
              className="border-t border-border py-2.5 text-center text-xs font-medium text-primary transition-colors hover:bg-muted"
            >
              Все уведомления
            </button>
          )}
        </div>
      )}
    </div>
  )
}
