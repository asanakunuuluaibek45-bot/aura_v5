"use client"

import { cn } from "@/lib/utils"
import { LayoutGrid, ShoppingCart, Warehouse, BarChart3 } from "lucide-react"

export type ScreenId = "kassa" | "vitrina" | "sklad" | "otchety" | "kabinet"

const ITEMS: { id: ScreenId; label: string; icon: typeof ShoppingCart; adminOnly?: boolean }[] = [
  { id: "kassa", label: "Касса", icon: ShoppingCart },
  { id: "vitrina", label: "Витрина", icon: LayoutGrid },
  { id: "sklad", label: "Склад", icon: Warehouse },
  { id: "otchety", label: "Отчёты", icon: BarChart3, adminOnly: true },
]

export function AppNav({
  screen,
  onChange,
  isAdmin,
}: {
  screen: ScreenId
  onChange: (id: ScreenId) => void
  isAdmin: boolean
}) {
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin)

  return (
    <nav className="sticky top-16 z-10 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 md:px-6">
        {items.map((item) => {
          const active = screen === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={cn(
                "relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium transition-colors md:px-4",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
