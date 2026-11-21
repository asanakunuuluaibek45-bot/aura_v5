"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, Loader2, ShieldCheck, ShieldOff, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  deletePlatformShop,
  setShopFrozen,
  updateShopBilling,
  type ShopBillingRow,
} from "@/app/actions/superadmin"
import { Button } from "@/components/shared/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shared/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/shared/ui/dialog"
import { Input } from "@/components/shared/ui/input"
import { Label } from "@/components/shared/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shared/ui/select"
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from "@/lib/types"

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(date)
}

export function AdminShopManagement({
  shop,
  isGlobalShop,
}: {
  shop: ShopBillingRow
  isGlobalShop: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [billingOpen, setBillingOpen] = useState(false)
  const [paidUntil, setPaidUntil] = useState(shop.paid_until ?? "")
  const [status, setStatus] = useState<SubscriptionStatus | null>(
    shop.subscription_status === "frozen" ? null : shop.subscription_status,
  )
  const [autoBlock, setAutoBlock] = useState(shop.auto_block)
  const frozen = shop.is_frozen || shop.subscription_status === "frozen"

  useEffect(() => {
    setPaidUntil(shop.paid_until ?? "")
    setStatus(shop.subscription_status === "frozen" ? null : shop.subscription_status)
    setAutoBlock(shop.auto_block)
  }, [shop.paid_until, shop.subscription_status, shop.auto_block])

  const saveBilling = () => {
    if (isGlobalShop) return
    startTransition(async () => {
      try {
        await updateShopBilling({
          shop_id: shop.shop_id,
          paid_until: paidUntil || null,
          subscription_status: status ?? undefined,
          auto_block: autoBlock,
        })
        toast.success("Биллинг магазина обновлён")
        setBillingOpen(false)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось обновить биллинг")
      }
    })
  }

  const toggleFrozen = () => {
    if (isGlobalShop) return
    const action = frozen ? "Разморозить" : "Заморозить"
    const shopName = shop.shop_name?.trim() || shop.shop_id
    const consequence = frozen
      ? "доступ магазина будет восстановлен согласно сроку оплаты"
      : "доступ магазина к CRM будет ограничен"
    if (!window.confirm(`${action} магазин «${shopName}»? ${consequence}. Продолжить?`)) return

    startTransition(async () => {
      try {
        await setShopFrozen(shop.shop_id, !frozen)
        toast.success(frozen ? "Магазин разморожен" : "Магазин заморожен")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось изменить состояние магазина")
      }
    })
  }

  const deleteShop = () => {
    if (isGlobalShop) return
    const shopName = shop.shop_name?.trim() || shop.shop_id
    const confirmation = window.prompt(
      `Удаление необратимо удалит все данные магазина и отключит доступ его пользователям. Введите название магазина «${shopName}» для подтверждения:`,
    )
    if (confirmation?.trim() !== shopName) return
    if (!window.confirm(
      `Последнее подтверждение: полностью удалить магазин «${shopName}» и его данные? Это действие нельзя отменить.`,
    )) return

    startTransition(async () => {
      try {
        await deletePlatformShop(shop.shop_id)
        toast.success("Магазин и его данные удалены")
        router.push("/admin/shops")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось удалить магазин")
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Биллинг и управление</CardTitle>
        <CardDescription>
          Срок оплаты, подписка, автозаморозка и использование лимита товаров.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Оплачено до</p>
            <p className="font-medium">{formatDate(shop.paid_until)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Подписка</p>
            <p className="font-medium">
              {frozen ? "Заморожена" : SUBSCRIPTION_STATUS_LABELS[shop.subscription_status]}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Автозаморозка</p>
            <p className="font-medium">{shop.auto_block ? "Включена" : "Выключена"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Новые товары после запуска счётчика</p>
            <p className="font-medium tabular-nums">
              {shop.product_units_used === null
                ? "Недоступно"
                : shop.product_units_used.toLocaleString("ru-RU")}
            </p>
          </div>
        </div>

        {isGlobalShop ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Глобальный магазин защищён</p>
            <p className="mt-1 text-muted-foreground">
              Он используется для общих этикеток. Изменение биллинга и заморозка здесь отключены.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setBillingOpen(true)}
              disabled={pending}
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Настроить биллинг
            </Button>
            <Button
              variant={frozen ? "outline" : "destructive"}
              className="gap-2"
              onClick={toggleFrozen}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : frozen ? (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ShieldOff className="h-4 w-4" aria-hidden="true" />
              )}
              {frozen ? "Разморозить магазин" : "Заморозить магазин"}
            </Button>
            <Button
              variant="destructive"
              className="gap-2 sm:ml-auto"
              onClick={deleteShop}
              disabled={pending}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Удалить магазин полностью
            </Button>
          </div>
        )}
      </CardContent>

      {!isGlobalShop && (
        <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Биллинг: {shop.shop_name?.trim() || "Магазин"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="grid gap-1.5">
                <Label htmlFor="admin-shop-paid-until">Оплачено до</Label>
                <Input
                  id="admin-shop-paid-until"
                  type="date"
                  value={paidUntil}
                  onChange={(event) => setPaidUntil(event.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="admin-shop-subscription-status">Статус подписки</Label>
                <Select
                  value={status ?? "frozen"}
                  onValueChange={(value) =>
                    setStatus(value === "frozen" ? null : value as SubscriptionStatus)
                  }
                  disabled={pending}
                >
                  <SelectTrigger id="admin-shop-subscription-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SUBSCRIPTION_STATUS_LABELS) as [SubscriptionStatus, string][])
                      .map(([value, label]) => (
                        <SelectItem key={value} value={value} disabled={value === "frozen"}>
                          {value === "frozen" ? `${label} — используйте кнопку разморозки` : label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoBlock}
                  aria-label="Автозаморозка по сроку оплаты"
                  onClick={() => setAutoBlock((value) => !value)}
                  disabled={pending}
                  className={`relative h-5 w-9 rounded-full border transition-colors disabled:opacity-50 ${
                    autoBlock ? "border-primary bg-primary" : "border-border bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      autoBlock ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <Label className="cursor-pointer" onClick={() => setAutoBlock((value) => !value)}>
                  Автозаморозка по сроку оплаты
                </Label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setBillingOpen(false)}
                disabled={pending}
              >
                Отмена
              </Button>
              <Button onClick={saveBilling} disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Сохранить
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}
