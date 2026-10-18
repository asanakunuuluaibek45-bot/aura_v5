"use client"

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
  ChevronDown,
  Menu,
  PackagePlus,
  Plus,
  ShoppingCart,
  Store,
  Truck,
  Users,
  X,
} from "lucide-react"
import { NotificationBell } from "@/components/notifications"
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
  const [showShopModal, setShowShopModal] = useState(false)

  const goTo = (screen: ScreenId) => {
    onNavigate(screen)
  }

  const canSwitch = profile.role === "super_admin" || profile.role === "admin"
  const fullShopName = onlineOnly
    ? currentShopName ?? "ÐÐ°Ð³Ð°Ð·Ð¸Ð½"
    : currentShopName ?? profile.shop_name ?? "ÐÐ°Ð³Ð°Ð·Ð¸Ð½"

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full items-center gap-2 px-3 sm:gap-3 sm:px-4 md:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label="ÐÑÐºÑÑÑÑ Ð¼ÐµÐ½Ñ"
          onClick={onOpenNav}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* ÐÐ½Ð¾Ð¿ÐºÐ° Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð° Ð¸ Ð²ÑÐ¿Ð»ÑÐ²Ð°ÑÑÐµÐµ Ð¾ÐºÐ½Ð¾ Ð±ÐµÐ· ÑÑÐ¾ÑÐ¾Ð½Ð½Ð¸Ñ Ð±Ð¸Ð±Ð»Ð¸Ð¾ÑÐµÐº */}
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

          {/* ÐÑÐ¿Ð»ÑÐ²Ð°ÑÑÐ¸Ð¹ Ð±Ð»Ð¾Ðº Ñ Ð¿Ð¾Ð»Ð½ÑÐ¼ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸ÐµÐ¼ */}
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
                      <p className="text-[11px] font-medium text-muted-foreground">Ð¢ÐµÐºÑÑÐ¸Ð¹ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½</p>
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

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {onlineOnly ? (
            <Badge variant="outline" className="hidden sm:inline-flex text-[10px] text-primary">
              Ð¢Ð¾Ð»ÑÐºÐ¾ Ð¾Ð½Ð»Ð°Ð¹Ð½
            </Badge>
          ) : (
            <SyncIndicator />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" aria-label="ÐÑÑÑÑÐ¾Ðµ ÑÐ¾Ð·Ð´Ð°Ð½Ð¸Ðµ">
                <Plus className="h-4 w-4" />
                <span className="hidden lg:inline">Ð¡Ð¾Ð·Ð´Ð°ÑÑ</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>ÐÑÑÑÑÐ¾Ðµ ÑÐ¾Ð·Ð´Ð°Ð½Ð¸Ðµ</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => goTo("kassa")}>
                <ShoppingCart className="mr-2 h-4 w-4" /> ÐÐ¾Ð²Ð°Ñ Ð¿ÑÐ¾Ð´Ð°Ð¶Ð°
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => goTo("sklad")}>
                <PackagePlus className="mr-2 h-4 w-4" /> ÐÐ¾Ð±Ð°Ð²Ð¸ÑÑ ÑÐ¾Ð²Ð°Ñ
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => goTo("clients")}>
                <Users className="mr-2 h-4 w-4" /> ÐÐ¾Ð±Ð°Ð²Ð¸ÑÑ ÐºÐ»Ð¸ÐµÐ½ÑÐ°
              </DropdownMenuItem>
              {canSwitch && (
                <DropdownMenuItem onClick={() => goTo("suppliers")}>
                  <Truck className="mr-2 h-4 w-4" /> ÐÐ¾ÑÑÐ°Ð²ÑÐ¸ÐºÐ¸
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <NotificationBell
            visible={profile.role === "super_admin"}
            onSeeAll={onOpenNotifications}
          />
        </div>
      </div>
    </header>
  )
}
