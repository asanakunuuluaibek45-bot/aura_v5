"use client"

import Link from "next/link"
import { useOnline } from "@/hooks/use-online"
import { useState } from "react"
import type { Profile, Role } from "@/lib/types"
// import { AuraMark } from "@/components/brand/aura-mark"
import type { ScreenId } from "@/components/app-nav"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Bell,
  ChevronDown,
  Menu,
  PackagePlus,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  Users,
  X,
} from "lucide-react"
import { NotificationBell } from "@/components/notifications"
import { StoreNotificationBell } from "@/components/notifications/StoreNotificationBell"
import { SyncIndicator } from "@/components/sync/sync-indicator"

export function AppHeader({
  profile,
  currentShopName,
  onlineOnly = false,
  viewRole,
  onChangeViewRole,
  onOpenCabinet,
  onOpenNotifications,
  onOpenNav,
  onNavigate,
}: {
  profile: Profile
  currentShopName?: string | null
  onlineOnly?: boolean
  viewRole: Role
  onChangeViewRole: (role: Role) => void
  onOpenCabinet: () => void
  onOpenNotifications?: () => void
  onOpenNav: () => void
  onNavigate: (screen: ScreenId) => void
}) {
  const online = useOnline()
  const [showShopModal, setShowShopModal] = useState(false)

  const goTo = (screen: ScreenId) => {
    onNavigate(screen)
  }

  const canSwitch = profile.role === "super_admin" || profile.role === "admin"
  const fullShopName = onlineOnly
    ? currentShopName ?? "Магазин"
    : currentShopName ?? profile.shop_name ?? "Магазин"

  return (
    <header className="sticky top-0 z-40 isolate border-b border-border bg-background">
      <div className="mx-auto flex h-[calc(4rem+env(safe-area-inset-top))] w-full items-center gap-2 pt-[env(safe-area-inset-top)] px-3 sm:gap-3 sm:px-4 md:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label="Открыть меню"
          onClick={onOpenNav}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {profile.role === "super_admin" ? (
          <Link
            href="/admin"
            aria-label="Открыть панель владельца"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Админ</span>
          </Link>
        ) : (
          /* Кнопка магазина и всплывающее окно без сторонних библиотек */
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowShopModal((prev) => !prev)}
              className="flex min-w-0 max-w-[130px] xs:max-w-[160px] sm:max-w-56 items-center gap-1.5 sm:gap-2 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-left text-xs sm:text-sm transition-colors hover:bg-primary/10 active:scale-95"
              title={fullShopName}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <span className="truncate font-semibold">{fullShopName}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary" />
            </button>

            {/* Всплывающий блок с полным названием */}
            {showShopModal && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowShopModal(false)}
                />
                <div className="absolute left-0 top-full mt-2 z-50 w-64 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in-50 zoom-in-95">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <Store className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground">Текущий магазин</p>
                        <p className="text-sm font-semibold leading-snug break-words">
                          {fullShopName}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowShopModal(false)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {onlineOnly ? (
            <Badge variant="outline" className="hidden sm:inline-flex text-[10px] text-primary">
              Только онлайн
            </Badge>
          ) : (
            <SyncIndicator />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" aria-label="Быстрое создание">
                <Plus className="h-4 w-4" />
                <span className="hidden lg:inline">Создать</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Быстрое создание</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => goTo("kassa")}>
                <ShoppingCart className="mr-2 h-4 w-4" /> Новая продажа
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!online} onClick={() => goTo("sklad")}>
                <PackagePlus className="mr-2 h-4 w-4" /> Добавить товар
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!online} onClick={() => goTo("clients")}>
                <Users className="mr-2 h-4 w-4" /> Добавить клиента
              </DropdownMenuItem>
              {canSwitch && (
                <DropdownMenuItem disabled={!online} onClick={() => goTo("suppliers")}>
                  <Truck className="mr-2 h-4 w-4" /> Поставщики
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {online
            ? profile.role === "super_admin"
              ? <NotificationBell visible onSeeAll={onOpenNotifications} />
              : <StoreNotificationBell key={profile.id} onSeeAll={onOpenNotifications} />
            : <Button disabled variant="ghost" size="icon" aria-label="Уведомления — нужен интернет"><Bell /></Button>}
        </div>
      </div>
    </header>
  )
}
