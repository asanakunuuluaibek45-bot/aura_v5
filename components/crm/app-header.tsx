"use client"

import Link from "next/link"
import { useOnline } from "@/hooks/use-online"
import type { Profile, Role } from "@/lib/types"
import type { ScreenId } from "@/components/crm/app-nav"
import type { BranchContext } from "@/lib/supabase/current-shop"
import { BranchControl } from "@/components/crm/branch-control"
import { Button } from "@/components/shared/ui/button"
import { Badge } from "@/components/shared/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shared/ui/dropdown-menu"
import {
  Bell,
  Menu,
  PackagePlus,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react"
import { NotificationBell } from "@/components/crm/notifications"
import { StoreNotificationBell } from "@/components/crm/notifications/StoreNotificationBell"
import { SyncIndicator } from "@/components/crm/sync/sync-indicator"
import { ThemeToggle } from "@/components/shared/theme-toggle"

export function AppHeader({
  profile,
  branchContext,
  businessName,
  onlineOnly = false,
  viewRole,
  onChangeViewRole,
  onOpenCabinet,
  onOpenNotifications,
  onOpenNav,
  onNavigate,
}: {
  profile: Profile
  branchContext: BranchContext
  businessName: string | null
  onlineOnly?: boolean
  viewRole: Role
  onChangeViewRole: (role: Role) => void
  onOpenCabinet: () => void
  onOpenNotifications?: () => void
  onOpenNav: () => void
  onNavigate: (screen: ScreenId) => void
}) {
  const online = useOnline()

  const goTo = (screen: ScreenId) => {
    onNavigate(screen)
  }

  const canSwitch = profile.role === "super_admin" || profile.role === "admin"
  const branchControl = (
    <BranchControl
      context={branchContext}
      businessName={businessName}
      canManage={profile.role === "admin" && process.env.NEXT_PUBLIC_BUILD_TARGET !== "native"}
      online={online}
    />
  )
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
          branchContext.branches.length === 0 ? (
            <Link
              href="/admin"
              aria-label="Открыть панель владельца"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Админ</span>
            </Link>
          ) : branchControl
        ) : branchControl}

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
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
