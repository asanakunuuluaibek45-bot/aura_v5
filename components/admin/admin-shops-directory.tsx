"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Search, Store } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { filterAdminShopDirectory, type AdminShopSummary } from "@/lib/admin/shop-directory"
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/types"

export function AdminShopsDirectory({ shops }: { shops: AdminShopSummary[] }) {
  const [query, setQuery] = useState("")
  const filteredShops = useMemo(
    () => filterAdminShopDirectory(shops, query),
    [shops, query],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Магазины</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Список и основные сведения. Управляющие действия в этом разделе отключены.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {filteredShops.length} из {shops.length}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/crm/stores">Выбрать магазин для работы в CRM</Link>
          </Button>
        </div>
      </div>

      <label className="relative block max-w-xl">
        <span className="sr-only">Поиск магазинов</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Название или ID магазина"
          className="h-11 pl-9"
        />
      </label>

      {filteredShops.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Store className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-3 font-medium">
              {shops.length === 0 ? "Магазинов пока нет" : "Ничего не найдено"}
            </p>
            {shops.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">Измените поисковый запрос.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredShops.map((shop) => {
            const frozen = shop.is_frozen || shop.status === "frozen"
            const statusLabel = frozen ? "Заморожен" : SUBSCRIPTION_STATUS_LABELS[shop.status]
            const statusVariant = frozen
              ? "destructive"
              : shop.status === "active"
                ? "default"
                : "outline"

            return (
              <Link
                key={shop.shop_id}
                href={`/admin/shops/${encodeURIComponent(shop.shop_id)}`}
                className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full transition-colors hover:bg-muted/40">
                  <CardContent className="flex h-full flex-col gap-4 p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Store className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h2 className="truncate font-medium">
                            {shop.shop_name?.trim() || "Без названия"}
                          </h2>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {shop.shop_id}
                          </p>
                        </div>
                      </div>
                      <Badge variant={statusVariant}>{statusLabel}</Badge>
                    </div>
                    <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-sm">
                      <span className="text-muted-foreground">Участников</span>
                      <span className="font-medium tabular-nums">{shop.member_count}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
