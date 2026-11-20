"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, LayoutDashboard, Megaphone, ShieldCheck, Store } from "lucide-react"
import { cn } from "@/lib/utils"

export function AdminNav() {
  const pathname = usePathname()
  const onOverview = pathname === "/admin"
  const onShops = pathname.startsWith("/admin/shops")
  const onAnnouncements = pathname.startsWith("/admin/announcements")

  return (
    <aside className="flex shrink-0 flex-col border-b border-border bg-card/40 px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
      <Link href="/admin" className="flex items-center gap-3 rounded-xl px-2 py-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">GOLDUCHET</span>
          <span className="block truncate text-xs text-muted-foreground">Панель владельца</span>
        </span>
      </Link>

      <nav aria-label="Навигация панели владельца" className="mt-5 flex flex-wrap gap-2 lg:flex-col">
        <Link
          href="/admin"
          aria-current={onOverview ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
            onOverview
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
          Обзор
        </Link>
        <Link
          href="/admin/shops"
          aria-current={onShops ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
            onShops
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Store className="h-4 w-4" aria-hidden="true" />
          Магазины
        </Link>
        <Link
          href="/admin/announcements"
          aria-current={onAnnouncements ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
            onAnnouncements
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          Объявления
        </Link>
      </nav>

      <div className="mt-4 lg:mt-auto">
        <Link
          href="/crm"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Вернуться в CRM
        </Link>
      </div>
    </aside>
  )
}
