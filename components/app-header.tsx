"use client"

<<<<<<< HEAD
import { useState } from "react"
import type { Profile, Role } from "@/lib/types"
// import { AuraMark } from "@/components/brand/aura-mark"
import type { ScreenId } from "@/components/app-nav"
=======
import type { Profile, Role } from "@/lib/types"
import { AuraMark } from "@/components/brand/aura-mark"
import { roleLabel } from "@/lib/format"
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
<<<<<<< HEAD
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
    ? currentShopName ?? "Магазин"
    : currentShopName ?? profile.shop_name ?? "Магазин"

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full items-center gap-2 px-3 sm:gap-3 sm:px-4 md:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label="Открыть меню"
          onClick={onOpenNav}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Кнопка магазина и всплывающее окно без сторонних библиотек */}
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
              <DropdownMenuItem onClick={() => goTo("sklad")}>
                <PackagePlus className="mr-2 h-4 w-4" /> Добавить товар
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => goTo("clients")}>
                <Users className="mr-2 h-4 w-4" /> Добавить клиента
              </DropdownMenuItem>
              {canSwitch && (
                <DropdownMenuItem onClick={() => goTo("suppliers")}>
                  <Truck className="mr-2 h-4 w-4" /> Поставщики
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <NotificationBell
            visible={profile.role === "super_admin"}
            onSeeAll={onOpenNotifications}
          />
=======
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { LogOut, Eye, ChevronDown, UserRound } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

export function AppHeader({
  profile,
  viewRole,
  onChangeViewRole,
  onOpenCabinet,
}: {
  profile: Profile
  viewRole: Role
  onChangeViewRole: (role: Role) => void
  onOpenCabinet: () => void
}) {
  const router = useRouter()
  const canSwitch = profile.role === "admin" || profile.role === "super_admin"

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  const initials = (profile.full_name ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-3">
          <AuraMark className="h-8 w-8" />
          <div className="leading-tight">
            <div className="font-serif text-xl">Aura</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-primary">{profile.shop_name}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {canSwitch && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 bg-transparent">
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  <span className="hidden sm:inline">Просмотр как</span>
                  <span className="font-medium">{roleLabel(viewRole)}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Режим просмотра</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={viewRole} onValueChange={(v) => onChangeViewRole(v as Role)}>
                  <DropdownMenuRadioItem value="seller">Продавец</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="admin">Администратор</DropdownMenuRadioItem>
                  {profile.role === "super_admin" && (
                    <DropdownMenuRadioItem value="super_admin">Супер-админ</DropdownMenuRadioItem>
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-accent">
                <Avatar className="h-8 w-8 border border-border">
                  <AvatarFallback className="bg-primary/15 text-xs font-medium text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden text-left leading-tight sm:block">
                  <div className="text-sm font-medium">{profile.full_name}</div>
                  <div className="text-[11px] text-muted-foreground">{roleLabel(profile.role)}</div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="flex flex-col gap-1">
                <span>{profile.full_name}</span>
                <Badge variant="secondary" className="w-fit text-[10px]">
                  {roleLabel(profile.role)}
                </Badge>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenCabinet}>
                <UserRound className="mr-2 h-4 w-4" />
                Кабинет
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
        </div>
      </div>
    </header>
  )
<<<<<<< HEAD
}
=======
}
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
