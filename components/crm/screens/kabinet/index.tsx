"use client"

import { useOnline } from "@/hooks/use-online"
import { useEffect, useState, useTransition } from "react"
import type { Profile, Role, Sale, SaleReturn } from "@/lib/types"
import {
  approveRequest,
  rejectRequest,
  removeMember,
  setDefaultBonusRate,
  setDefaultReceiptType,
  setMemberBonusRate,
  resetBonusPoints,
  setBonusPoints,
  touchPresence,
  type CabinetData,
} from "@/app/actions/cabinet"
import { getProductUnitUsageCount } from "@/app/actions/product-units"
import { RECEIPT_TYPE_SETTINGS, type ReceiptTypeSetting } from "@/lib/receipt-type"
import { Button } from "@/components/shared/ui/button"
import { Input } from "@/components/shared/ui/input"
import { Label } from "@/components/shared/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shared/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/ui/dialog"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { BadgeCheck, LogOut, Package, UserCheck, UserX, Users, Wifi } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { logoutDeviceAccount } from "@/lib/local-db/device-logout"
import { UnsyncedLogoutError } from "@/lib/offline-policy"
import { getUnresolvedOutboxOperationCount } from "@/lib/local-db/outbox"
import { syncEngine } from "@/lib/sync/sync-engine"
import { ActionHistory } from "./action-history"
import { InstallAppButton } from "@/components/crm/install-app-button"
import { CabinetProfileCard } from "./profile-card"
import { AccountDeletionControl } from "@/components/crm/account-deletion-control"
import type { UndoActionResult } from "@/lib/action-history"
import type { UndoLocalBaseline } from "@/lib/local-db/undo-cache"
import { SellerStats, TeamSales } from "./sales-analytics"
import { MemberRow } from "./team-member-row"
import { HelpDisclosure } from "./help-disclosure"

const ONLINE_WINDOW_MS = 3 * 60 * 1000

function isOnline(p: Profile) {
  if (!p.last_seen_at) return false
  return Date.now() - new Date(p.last_seen_at).getTime() < ONLINE_WINDOW_MS
}

/* --------------------------------------------------------------------- экран */

export function KabinetScreen({
  profile,
  viewRole,
  sales,
  returns = [],
  data,
  email,
  syncLocal = true,
  historyShopId,
  onActionUndone,
}: {
  profile: Profile
  viewRole: Role
  sales: Sale[]
  /** Возвраты товара — уменьшают выручку и прибыль продавцов. */
  returns?: SaleReturn[]
  data: CabinetData
  email: string
  syncLocal?: boolean
  historyShopId?: string | null
  onActionUndone?: (result: UndoActionResult, baseline: UndoLocalBaseline) => Promise<boolean>
}) {
  const connected = useOnline()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [defaultRate, setDefaultRate] = useState(String(data.defaultBonusRate))
  const [receiptDefault, setReceiptDefault] = useState<ReceiptTypeSetting>(data.defaultReceiptType)
  useEffect(() => setReceiptDefault(data.defaultReceiptType), [data.defaultReceiptType])
  const [productUnitUsage, setProductUnitUsage] = useState<{ shopId: string | null; count: number | null }>({
    shopId: null,
    count: null,
  })
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [discardCount, setDiscardCount] = useState<number | null>(null)

  const handleLogout = async (discardUnsynced = false) => {
    if (loggingOut) return
    setLoggingOut(true)

    let pendingOperations = 0
    try {
      pendingOperations = await getUnresolvedOutboxOperationCount()
      if (!discardUnsynced && pendingOperations > 0 && typeof navigator !== "undefined" && navigator.onLine) {
        try {
          await Promise.race([
            syncEngine.flushOutbox({ forceRetry: true }),
            new Promise<void>((resolve) => setTimeout(resolve, 3000)),
          ])
        } catch {
          // Keep the session if the server cannot confirm a queued operation.
        }
        pendingOperations = await getUnresolvedOutboxOperationCount()
      }
    } catch (error) {
      console.error("[Logout] Failed to verify queued changes:", error)
      setLoggingOut(false)
      toast.error("Не удалось проверить очередь изменений", {
        description: "Выход отменён, чтобы не потерять несинхронизированные изменения.",
      })
      return
    }

    if (pendingOperations > 0 && !discardUnsynced) {
      setDiscardCount(pendingOperations)
      setLoggingOut(false)
      toast.error("Выход остановлен: есть несинхронизированные изменения", {
        description: "Подтвердите отдельное предупреждение, только если согласны потерять эти данные.",
      })
      return
    }

    try {
      await logoutDeviceAccount({ discardUnsynced })
    } catch (error) {
      if (error instanceof UnsyncedLogoutError) setDiscardCount(error.count)
      setLoggingOut(false)
      toast.error(error instanceof Error ? error.message : "Не удалось безопасно завершить выход")
      return
    }
    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: "local" })
    } catch {
      // игнорируем ошибку сети — всё равно перенаправляем
    }
    // Жёсткий переход: сбрасывает состояние приложения и обходит кэш router'а
    window.location.assign("/auth/login")
  }

  const isSuper = viewRole === "super_admin"
  const isAdmin = viewRole === "admin" || isSuper
  const usageShopId = historyShopId ?? profile.shop_id ?? null

  useEffect(() => {
    if (!isAdmin || !usageShopId || !navigator.onLine) return
    let active = true
    void getProductUnitUsageCount().then((count) => {
      if (active) setProductUnitUsage({ shopId: usageShopId, count })
    }).catch(() => {})
    return () => { active = false }
  }, [isAdmin, usageShopId])

  // Отметка присутствия для виджета «онлайн».
  useEffect(() => {
    const touch = () => {
      if (navigator.onLine) void touchPresence().catch(() => {})
    }
    touch()
    const id = setInterval(touch, 60_000)
    return () => clearInterval(id)
  }, [])

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      if (!navigator.onLine) { toast.error("Это действие доступно только с интернетом"); return }
      try {
        await fn()
        toast.success(ok)
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка")
      }
    })

  const admins = data.team.filter((p) => p.role === "admin")
  const sellers = data.team.filter((p) => p.role === "seller")
  const onlineCount = data.team.filter(isOnline).length + 1 // включая текущего пользователя
  const adminRequests = data.requests.filter((p) => p.requested_role === "admin")
  const otherRequests = data.requests.filter((p) => p.requested_role !== "admin")

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 px-1 sm:px-2">
      <CabinetProfileCard profile={profile} email={email} />

      <div className="min-w-0 space-y-5">
        <section className="min-w-0 space-y-5" aria-label="Основная информация">
          {isAdmin && usageShopId && (
            <Card className="min-w-0">
              <CardContent className="flex min-w-0 items-start gap-3 pt-4">
                <Package className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-medium">Новые карточки товаров</span>
                    <span className="font-mono text-lg font-semibold tabular-nums" aria-live="polite">
                      {productUnitUsage.shopId === usageShopId && productUnitUsage.count !== null
                        ? productUnitUsage.count.toLocaleString("ru-RU")
                        : "—"}
                    </span>
                  </div>
                  <div className="mt-2">
                    <HelpDisclosure>
                      Одна единица — одна новая карточка с момента запуска. Продажа, удаление, редактирование и повторная синхронизация не меняют счётчик. Это учёт карточек, не объёма файлов; добавление товаров не блокируется.
                    </HelpDisclosure>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

        </section>

        <aside className="min-w-0 space-y-5" aria-label="Показатели и настройки">
          {!isAdmin && <SellerStats sales={sales} returns={returns} profile={profile} />}
          {isAdmin && (
            <div className="grid grid-cols-2 gap-3">
              <Card className="min-w-0">
                <CardContent className="flex min-w-0 items-center gap-3 pt-5">
                  <Wifi className="h-5 w-5 shrink-0 text-success" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Сейчас онлайн</div>
                    <div className="font-mono text-2xl font-semibold">{onlineCount}</div>
                  </div>
                </CardContent>
              </Card>
              {isSuper && (
                <Card className="min-w-0">
                  <CardContent className="flex min-w-0 items-center gap-3 pt-5">
                    <BadgeCheck className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Администраторы</div>
                      <div className="font-mono text-2xl font-semibold">{admins.length}</div>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card className="min-w-0">
                <CardContent className="flex min-w-0 items-center gap-3 pt-5">
                  <Users className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{isSuper ? "Сотрудники" : "Мои продавцы"}</div>
                    <div className="font-mono text-2xl font-semibold">{sellers.length}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {isSuper && (
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Заявки на доступ</CardTitle>
              </CardHeader>
              <CardContent>
                {data.requests.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Новых заявок нет</p>
                ) : (
                  <div className="space-y-1">
                    {[...adminRequests, ...otherRequests].map((r) => (
                      <div key={r.id} className="flex min-w-0 flex-col gap-3 border-b border-border/60 py-3 last:border-0 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-sm font-medium">{r.full_name ?? "Без имени"}</div>
                          <div className="break-words text-xs text-muted-foreground">
                            {r.requested_role === "admin" ? "Заявка на Админа" : "Заявка на Продавца"} · {r.phone ?? "—"}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex">
                          <Button
                            size="sm"
                            className="min-w-0 whitespace-nowrap px-3"
                            disabled={pending || !connected}
                            onClick={() =>
                              run(
                                () => approveRequest(r.id, r.requested_role === "admin" ? "admin" : "seller"),
                                "Заявка одобрена",
                              )
                            }
                          >
                            <UserCheck className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                            Одобрить
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-w-0 whitespace-nowrap bg-transparent px-3 text-destructive"
                            disabled={pending || !connected}
                            onClick={() => run(() => rejectRequest(r.id), "Заявка отклонена")}
                          >
                            <UserX className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                            Отклонить
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isSuper && (
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Бонусные баллы по магазину</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-stretch gap-3">
                <div className="grid max-w-sm gap-1.5">
                  <Label className="text-xs text-muted-foreground">Процент от прибыли с продаж</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={defaultRate}
                    onChange={(e) => setDefaultRate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <HelpDisclosure>
                  Применяется ко всем сотрудникам, у которых не задан персональный процент.
                </HelpDisclosure>
                <Button
                  className="w-full sm:w-fit"
                  disabled={pending || !connected}
                  onClick={() => run(() => setDefaultBonusRate(Number(defaultRate)), "Процент бонусов обновлён")}
                >
                  Сохранить
                </Button>
              </CardContent>
            </Card>
          )}

          {isAdmin && (
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Тип чека по умолчанию</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Тип чека по умолчанию">
                  {RECEIPT_TYPE_SETTINGS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={receiptDefault === option.value}
                      disabled={pending || !connected}
                      onClick={() => setReceiptDefault(option.value)}
                      className={cn(
                        "min-w-0 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors",
                        receiptDefault === option.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <HelpDisclosure>
                  В кассе этот тип будет выбран заранее; продавец может поменять его в конкретной продаже. При «Спрашивать» продажу нельзя оформить, пока тип чека не выбран.
                </HelpDisclosure>
                <Button
                  className="w-full sm:w-fit"
                  disabled={pending || !connected || receiptDefault === data.defaultReceiptType}
                  onClick={() => run(() => setDefaultReceiptType(receiptDefault), "Тип чека по умолчанию сохранён")}
                >
                  Сохранить
                </Button>
              </CardContent>
            </Card>
          )}
        </aside>

        <ActionHistory
          key={historyShopId ?? profile.shop_id ?? "no-shop"}
          syncLocal={syncLocal}
          canUndoRates={isAdmin}
          onActionUndone={onActionUndone}
        />

        {isAdmin && (
          <div className="min-w-0">
            <TeamSales
              sales={sales}
              returns={returns}
              profile={profile}
              team={data.team}
              busy={pending || !connected}
              onResetBonus={(id, name) => {
                if (confirm(`Обнулить бонусы: ${name}?`)) run(() => resetBonusPoints(id), "Бонусы обнулены")
              }}
              onSetBonus={(id, points) => run(() => setBonusPoints(id, points), "Баллы обновлены")}
            />
          </div>
        )}

        {isAdmin && (
          <div className="min-w-0">
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {isSuper ? "Персонал магазина" : "Мои продавцы"} · {data.team.length}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.team.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Сотрудников пока нет</p>
                ) : (
                  <div className="grid gap-x-6 lg:grid-cols-2">
                    {[...admins, ...sellers].map((m) => (
                      <MemberRow
                        key={m.id}
                        member={m}
                        busy={pending || !connected}
                        canEditRate={isSuper || m.role === "seller"}
                        canDelete={isSuper || m.role === "seller"}
                        onDelete={(id) => run(() => removeMember(id), "Сотрудник удалён")}
                        onRate={(id, rate) => run(() => setMemberBonusRate(id, rate), "Процент бонусов обновлён")}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <section className="space-y-4 border-t border-border/70 pt-5" aria-label="Завершение работы">
        
        <div className="flex flex-col gap-2 pb-6 sm:flex-row sm:justify-end">
          <InstallAppButton className="w-full justify-center gap-2 sm:w-auto" />
          <Button
            variant="outline"
            className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
            onClick={() => { setDiscardCount(null); setLogoutOpen(true) }}
          >
            <LogOut className="h-4 w-4" />
            Выйти из системы
          </Button>
        </div>
        <AccountDeletionControl profile={profile} />
      </section>

      <Dialog open={logoutOpen} onOpenChange={(open) => !loggingOut && setLogoutOpen(open)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{discardCount !== null ? "Данные будут стёрты навсегда" : "Выйти из учётной записи?"}</DialogTitle>
            <DialogDescription>
              {discardCount !== null
                ? `Не синхронизировано операций: ${discardCount}. Эти данные будут стёрты навсегда и не попадут на сервер. Восстановить их будет невозможно. Вы согласны удалить их и выйти?`
                : "Локальные данные и кэш будут очищены. Для повторного входа нужен интернет."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
            <Button variant="outline" onClick={() => setLogoutOpen(false)} disabled={loggingOut}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => void handleLogout(discardCount !== null)}
              disabled={loggingOut}
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Выходим…" : discardCount !== null ? "Стереть данные и выйти" : "Выйти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
