"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useOnline } from "@/hooks/use-online"
import type { StoreNotification } from "@/lib/types"
import {
  getStoreNotifications,
  getStoreNotificationUnreadCount,
  markStoreNotificationRead,
  markAllStoreNotificationsRead,
} from "@/app/actions/store-notifications"
import { toast } from "sonner"

const STORE_NOTIFICATION_POLL_MS = 60_000

export function useStoreNotifications() {
  const online = useOnline()
  const [items, setItems] = useState<StoreNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const refresh = useCallback(async () => {
    if (!navigator.onLine) {
      setIsLoading(false)
      return
    }
    try {
      const [list, count] = await Promise.all([
        getStoreNotifications(50),
        getStoreNotificationUnreadCount(),
      ])
      if (!list.success) throw new Error(list.error)
      if (!count.success) throw new Error(count.error)
      setItems(list.data)
      setUnreadCount(count.data)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить уведомления")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    setIsLoading(true)
    void refresh().catch(() => setIsLoading(false))
    if (!online) return
    const timer = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") {
        void refresh().catch(() => {})
      }
    }, STORE_NOTIFICATION_POLL_MS)
    return () => window.clearInterval(timer)
  }, [online, refresh])

  const markRead = useCallback((id: string) => {
    startTransition(async () => {
      const wasUnread = items.some((item) => item.id === id && !item.is_read)
      setItems((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item))
      if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1))
      try {
        const result = await markStoreNotificationRead(id)
        if (!result.success) throw new Error(result.error)
        window.dispatchEvent(new Event("aura:notifications-changed"))
      } catch (cause) {
        toast.error("Не удалось отметить уведомление прочитанным", { description: cause instanceof Error ? cause.message : undefined })
        void refresh()
      }
    })
  }, [items, refresh])

  const markAllRead = useCallback(() => {
    startTransition(async () => {
      setItems((current) => current.map((item) => ({ ...item, is_read: true })))
      setUnreadCount(0)
      try {
        const result = await markAllStoreNotificationsRead()
        if (!result.success) throw new Error(result.error)
        window.dispatchEvent(new Event("aura:notifications-changed"))
      } catch (cause) {
        toast.error("Не удалось обновить уведомления", { description: cause instanceof Error ? cause.message : undefined })
        void refresh()
      }
    })
  }, [refresh])

  useEffect(() => {
    const update = () => { void refresh() }
    window.addEventListener("aura:notifications-changed", update)
    window.addEventListener("focus", update)
    return () => {
      window.removeEventListener("aura:notifications-changed", update)
      window.removeEventListener("focus", update)
    }
  }, [refresh])

  return { items, unreadCount, isLoading, isPending, error, refresh, markRead, markAllRead }
}
