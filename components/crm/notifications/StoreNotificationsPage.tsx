"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Bell, Building2, CheckCheck, Loader2, Megaphone, RefreshCw, Send, Trash2, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { useStoreNotifications } from "@/hooks/useStoreNotifications"
import { useNotifications } from "@/hooks/useNotifications"
import { NotificationItem } from "@/components/crm/notifications/NotificationItem"
import { StoreNotificationItem } from "@/components/crm/notifications/StoreNotificationItem"
import {
  createStoreNotification,
  deleteStoreNotification,
  getManagedStoreNotifications,
  getStoreNotificationRecipients,
} from "@/app/actions/store-notifications"
import type { ManagedStoreNotification, Profile, StoreNotificationRecipient } from "@/lib/types"
import { formatDateTime } from "@/lib/format"
import { UserAnnouncementsPanel } from "@/components/crm/announcements/user-announcements-panel"

export function StoreNotificationsPage({
  profile,
  shops = [],
}: {
  profile: Profile
  shops?: { shop_id: string; shop_name: string | null }[]
}) {
  if (profile.role === "super_admin") {
    return <SuperAdminNotificationsPage shops={shops} />
  }
  return <UserNotificationsPage />
}

function UserNotificationsPage() {
  const { items, unreadCount, isLoading, isPending, error, refresh, markRead, markAllRead } = useStoreNotifications()
  const unread = items.filter((item) => !item.is_read)
  const read = items.filter((item) => item.is_read)

  return (
    <div className="mx-auto max-w-3xl px-1 py-3 sm:px-2 sm:py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Уведомления</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount ? `Непрочитанных: ${unreadCount}` : "Сообщения от суперадминистратора магазина"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading || isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Обновить
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" />
              Прочитать все
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-destructive/30 p-5 text-sm">
          <p>Не удалось загрузить уведомления. Проверьте, что миграция уведомлений применена.</p>
          <button type="button" onClick={() => void refresh()} className="mt-3 text-primary">Повторить</button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-5 py-16 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/30" />
          <p className="font-medium text-muted-foreground">Пока нет уведомлений</p>
          <p className="max-w-sm text-sm text-muted-foreground/70">
            Здесь появятся сообщения от суперадминистратора для вашего магазина или лично для вас.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {unread.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Новые ({unread.length})</h2>
              <div className="flex flex-col gap-3">
                {unread.map((item) => <StoreNotificationItem key={item.id} notification={item} onMarkRead={markRead} isPending={isPending} />)}
              </div>
            </section>
          )}
          {read.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Прочитанные ({read.length})</h2>
              <div className="flex flex-col gap-3">
                {read.map((item) => <StoreNotificationItem key={item.id} notification={item} onMarkRead={markRead} isPending={isPending} />)}
              </div>
            </section>
          )}
        </div>
      )}
      <section className="mt-8 border-t border-border pt-6">
        <UserAnnouncementsPanel />
      </section>
    </div>
  )
}

function SuperAdminNotificationsPage({ shops }: { shops: { shop_id: string; shop_name: string | null }[] }) {
  const [shopId, setShopId] = useState(shops[0]?.shop_id ?? "")
  const [recipients, setRecipients] = useState<StoreNotificationRecipient[]>([])
  const [recipientTarget, setRecipientTarget] = useState("all")
  const [managedItems, setManagedItems] = useState<ManagedStoreNotification[]>([])
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  const refreshManaged = useCallback(async () => {
    const result = await getManagedStoreNotifications(100)
    if (result.success) setManagedItems(result.data)
    else toast.error("Не удалось загрузить список уведомлений", { description: result.error })
    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (!shopId) {
      setRecipients([])
      return
    }
    let active = true
    setRecipients([])
    setRecipientTarget("all")
    void getStoreNotificationRecipients(shopId).then((result) => {
      if (!active) return
      if (result.success) setRecipients(result.data)
      else toast.error("Не удалось загрузить сотрудников", { description: result.error })
    }).catch(() => {
      if (active) toast.error("Не удалось загрузить сотрудников")
    })
    return () => { active = false }
  }, [shopId])

  useEffect(() => {
    void refreshManaged().catch(() => setIsLoading(false))
  }, [refreshManaged])

  const handleSend = () => {
    if (!shopId) return
    const selectedRecipient = recipientTarget === "all" ? null : recipientTarget
    startTransition(async () => {
      const result = await createStoreNotification(shopId, selectedRecipient, title, message)
      if (!result.success) {
        toast.error("Не удалось отправить уведомление", { description: result.error })
        return
      }
      toast.success(selectedRecipient ? "Уведомление отправлено сотруднику" : "Уведомление отправлено магазину")
      setTitle("")
      setMessage("")
      await refreshManaged()
    })
  }

  const handleDelete = (item: ManagedStoreNotification) => {
    if (!window.confirm(`Удалить уведомление «${item.title}»? Оно исчезнет у получателя.`)) return
    startTransition(async () => {
      const result = await deleteStoreNotification(item.id)
      if (!result.success) {
        toast.error("Не удалось удалить уведомление", { description: result.error })
        return
      }
      toast.success("Уведомление удалено")
      setManagedItems((current) => current.filter((entry) => entry.id !== item.id))
    })
  }

  return (
    <div className="mx-auto max-w-4xl px-1 py-3 sm:px-2 sm:py-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Уведомления</h1>
          <p className="text-sm text-muted-foreground">Односторонние сообщения пользователям магазинов</p>
        </div>
      </div>

      <section className="mb-8 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Megaphone className="h-4 w-4" /></div>
          <div>
            <h2 className="font-semibold">Новое уведомление</h2>
            <p className="mt-1 text-sm text-muted-foreground">Отправлять сообщения может только суперадминистратор. Ответить на уведомление нельзя.</p>
          </div>
        </div>

        {shops.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Магазины не найдены.</p>
        ) : (
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">
              Магазин
              <span className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select value={shopId} onChange={(event) => setShopId(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-input bg-background pl-9 pr-3 text-sm">
                  {shops.map((shop) => <option key={shop.shop_id} value={shop.shop_id}>{shop.shop_name || "Без названия"}</option>)}
                </select>
              </span>
            </label>

            <label className="grid gap-1.5 text-sm font-medium">
              Кому
              <span className="relative">
                <UsersRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select value={recipientTarget} onChange={(event) => setRecipientTarget(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-input bg-background pl-9 pr-3 text-sm">
                  <option value="all">Всем пользователям магазина</option>
                  {recipients.map((recipient) => (
                    <option key={recipient.profile_id} value={recipient.profile_id}>
                      {(recipient.full_name || "Без имени") + (recipient.role === "admin" ? " · Администратор" : " · Продавец")}
                    </option>
                  ))}
                </select>
              </span>
              {recipientTarget === "all" && recipients.length === 0 && (
                <span className="text-xs font-normal text-muted-foreground">В магазине пока нет подтверждённых администраторов или продавцов.</span>
              )}
            </label>

            <label className="grid gap-1.5 text-sm font-medium">
              Заголовок
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Например, график работы в праздничные дни" className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <span className="text-right text-xs font-normal text-muted-foreground">{title.length}/120</span>
            </label>

            <label className="grid gap-1.5 text-sm font-medium">
              Текст уведомления
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={3000} rows={4} placeholder="Введите сообщение для выбранного получателя…" className="min-h-28 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <span className="text-right text-xs font-normal text-muted-foreground">{message.length}/3000</span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">Уведомление появится у пользователя с колокольчиком и в разделе «Уведомления».</p>
              <button
                type="button"
                onClick={handleSend}
                disabled={isPending || !shopId || !title.trim() || !message.trim() || (recipientTarget !== "all" && !recipients.some((r) => r.profile_id === recipientTarget))}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Отправить уведомление
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Отправленные уведомления</h2>
            <p className="text-sm text-muted-foreground">Удалить сообщение может только суперадминистратор.</p>
          </div>
          <button type="button" onClick={() => void refreshManaged()} disabled={isLoading || isPending} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Обновить список">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : managedItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">Пока ничего не отправлено.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {managedItems.map((item) => (
              <article key={item.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{item.title}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {item.recipient_profile_id ? item.recipient_name || "Личное уведомление" : "Весь магазин"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.shop_name || "Магазин"} · {formatDateTime(item.created_at)}</p>
                  </div>
                  <button type="button" onClick={() => handleDelete(item)} disabled={isPending} aria-label={`Удалить уведомление «${item.title}»`} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{item.message}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <LegacySuperAdminNotifications />
    </div>
  )
}

function LegacySuperAdminNotifications() {
  const {
    items, unreadCount, isLoading, isPending, refresh, markRead, markAllRead, approve, reject,
  } = useNotifications()
  const unread = items.filter((item) => !item.is_read)
  const read = items.filter((item) => item.is_read)

  return (
    <section className="border-t border-border pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Системные уведомления</h2>
          <p className="text-sm text-muted-foreground">Заявки пользователей, ожидающие решения.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void refresh()} disabled={isLoading || isPending} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Обновить системные уведомления">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          {unreadCount > 0 && (
            <button type="button" onClick={markAllRead} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50">
              <CheckCheck className="h-3.5 w-3.5" /> Прочитать все
            </button>
          )}
        </div>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Нет системных уведомлений.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {unread.length > 0 && <div className="flex flex-col gap-2">{unread.map((item) => <NotificationItem key={item.id} notification={item} onMarkRead={markRead} onApprove={approve} onReject={reject} isPending={isPending} />)}</div>}
          {read.length > 0 && <div className="flex flex-col gap-2">{read.map((item) => <NotificationItem key={item.id} notification={item} onMarkRead={markRead} onApprove={approve} onReject={reject} isPending={isPending} />)}</div>}
        </div>
      )}
    </section>
  )
}
