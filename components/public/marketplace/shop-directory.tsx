"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Search, Store } from "lucide-react"
import type { PublicShop } from "@/app/actions/shops"

export function ShopDirectory({ shops }: { shops: PublicShop[] }) {
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru")
    if (!normalized) return shops
    return shops.filter((shop) =>
      (shop.shop_name ?? "Ювелирный магазин").toLocaleLowerCase("ru").includes(normalized),
    )
  }, [query, shops])

  return (
    <section aria-labelledby="shops-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Открытые витрины</p>
          <h2 id="shops-heading" className="mt-2 font-serif text-3xl">Магазины</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Перейдите в магазин, чтобы посмотреть его каталог и отфильтровать изделия.
          </p>
        </div>
        {shops.length > 0 && (
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Найти магазин</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти магазин"
              className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((shop) => (
            <Link
              key={shop.shop_id}
              href={`/store/${shop.shop_id}`}
              className="group flex min-h-24 items-center gap-4 rounded-2xl border border-border/80 bg-card p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Store aria-hidden="true" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{shop.shop_name?.trim() || "Ювелирный магазин"}</span>
                <span className="mt-1 block text-xs text-muted-foreground">Открыть каталог</span>
              </span>
              <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {shops.length ? "Магазины по такому названию не найдены." : "Пока нет открытых витрин. Откройте публичную витрину магазина, чтобы она появилась здесь."}
        </p>
      )}
    </section>
  )
}
