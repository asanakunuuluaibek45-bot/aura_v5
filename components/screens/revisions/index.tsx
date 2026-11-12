"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Product } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProductSearch } from "@/components/product-search"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { filterProducts } from "@/lib/product-search"
import {
  getRevisionProducts,
  groupRevisionProducts,
  parseRevisionSession,
  recordRevisionScan,
} from "@/lib/inventory-revision"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { CheckCircle2, ClipboardCheck, RotateCcw } from "lucide-react"

const SESSION_PREFIX = "inventory-revision-v1"

export function RevisionsScreen({
  products,
  shopId,
  productsReady = true,
}: {
  products: Product[]
  shopId: string | null
  productsReady?: boolean
}) {
  const storageKey = shopId ? `${SESSION_PREFIX}:${shopId}` : ""
  const [loadedKey, setLoadedKey] = useState("")
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const checkedIdsRef = useRef<Set<string>>(new Set())
  const [finished, setFinished] = useState(false)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const debouncedQuery = useDebouncedValue(query)

  useEffect(() => {
    if (!storageKey) return
    setLoadedKey("")

    let session = { checkedProductIds: [] as string[], finished: false }
    try {
      session = parseRevisionSession(window.localStorage.getItem(storageKey))
    } catch (error) {
      console.warn("[revisions] Could not restore local progress:", error)
    }

    checkedIdsRef.current = new Set(session.checkedProductIds)
    setCheckedIds(session.checkedProductIds)
    setFinished(session.finished)
    setLoadedKey(storageKey)
  }, [storageKey])

  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        checkedProductIds: checkedIds,
        finished,
      }))
    } catch (error) {
      console.warn("[revisions] Could not save local progress:", error)
    }
  }, [checkedIds, finished, loadedKey, storageKey])

  const stockProducts = useMemo(() => getRevisionProducts(products), [products])
  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds])
  const totalCount = stockProducts.length
  const checkedCount = stockProducts.reduce((count, product) => count + Number(checkedSet.has(product.id)), 0)
  const remainingCount = Math.max(0, totalCount - checkedCount)
  const allGroups = useMemo(
    () => groupRevisionProducts(stockProducts, checkedSet),
    [stockProducts, checkedSet],
  )
  const categories = useMemo(
    () => [...new Set(allGroups.map((group) => group.category))].sort((a, b) => a.localeCompare(b, "ru")),
    [allGroups],
  )
  const visibleGroups = useMemo(() => {
    const searched = filterProducts(stockProducts, debouncedQuery).filter(
      (product) => !category || (product.category?.trim() || "Прочее") === category,
    )
    return groupRevisionProducts(searched, checkedSet)
  }, [category, checkedSet, debouncedQuery, stockProducts])
  const unverifiedGroups = useMemo(
    () => groupRevisionProducts(stockProducts.filter((product) => !checkedSet.has(product.id)), new Set()),
    [checkedSet, stockProducts],
  )

  const handleScan = useCallback((sku: string) => {
    if (finished) return

    const result = recordRevisionScan(products, [...checkedIdsRef.current], sku)
    if (result.status === "not_found") {
      toast.error("Изделие не найдено среди товаров в наличии")
      return
    }
    if (result.status === "already_checked") {
      toast.error("Это изделие уже проверено")
      return
    }

    checkedIdsRef.current = new Set(result.checkedIds)
    setCheckedIds(result.checkedIds)
    toast.success(`Проверено: ${result.product.name}`)
  }, [finished, products])

  const finishRevision = () => setFinished(true)

  const startNewRevision = () => {
    if (checkedIdsRef.current.size > 0 && !window.confirm("Сбросить отметки и начать новую ревизию?")) return
    checkedIdsRef.current = new Set()
    setCheckedIds([])
    setFinished(false)
    setQuery("")
    setCategory("")
  }

  if (!shopId) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Сначала выберите магазин, чтобы открыть ревизию его склада.
      </div>
    )
  }

  if (!productsReady || loadedKey !== storageKey) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground" role="status">
        Загружаем полный склад и прогресс ревизии…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="font-serif text-2xl">Ревизии</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Сверка изделий по складу. Отметки сохраняются отдельно и не меняют складские остатки.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Всего" value={totalCount} />
        <StatCard label="Проверено" value={checkedCount} />
        <StatCard label="Осталось" value={remainingCount} />
      </div>

      {finished ? (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                Ревизия завершена
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Проверено {checkedCount} из {totalCount}. Непроверенных изделий: {remainingCount}.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={startNewRevision} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Новая ревизия
            </Button>
          </div>

          {unverifiedGroups.length === 0 ? (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-800 dark:text-emerald-300">
              Все изделия проверены.
            </p>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Остаток непроверенных изделий</h3>
              {unverifiedGroups.map((group) => (
                <div key={group.key} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-medium">{group.category} · {group.metal}</h4>
                    <Badge variant="outline">{group.remaining} шт. осталось</Badge>
                  </div>
                  <ul className="mt-2 divide-y divide-border/60">
                    {group.products.map((product) => (
                      <li key={product.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="min-w-0 truncate">{product.name}</span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {product.sku || "Без артикула"} · 1 шт.
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="revision-category">Категория</label>
            <select
              id="revision-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm sm:w-56"
            >
              <option value="">Все категории</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <ProductSearch
              value={query}
              onChange={setQuery}
              onScan={handleScan}
              placeholder="Название, артикул или металл…"
              className="min-w-0 flex-1"
              inputClassName="h-10"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              В группах показаны количество изделий и остаток к проверке.
            </p>
            <Button type="button" onClick={finishRevision}>
              Завершить ревизию
            </Button>
          </div>

          {visibleGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {totalCount === 0 ? "На складе нет изделий для проверки." : "По выбранным фильтрам изделия не найдены."}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleGroups.map((group) => (
                <section key={group.key} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-4 py-3">
                    <div>
                      <h2 className="font-semibold">{group.category} · {group.metal}</h2>
                      <p className="text-xs text-muted-foreground">
                        {group.total} шт. всего · проверено {group.checked} · осталось {group.remaining} шт.
                      </p>
                    </div>
                    <Badge variant={group.remaining === 0 ? "secondary" : "outline"}>
                      {group.remaining} к проверке
                    </Badge>
                  </header>
                  <ul className="divide-y divide-border/60">
                    {group.products.map((product) => {
                      const isChecked = checkedSet.has(product.id)
                      return (
                        <li
                          key={product.id}
                          className={cn(
                            "flex min-w-0 items-center justify-between gap-3 px-4 py-3 transition-colors",
                            isChecked && "bg-emerald-500/5",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{product.name}</p>
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                              {product.sku || "Без артикула"} · 1 шт.
                            </p>
                          </div>
                          <span className={cn(
                            "shrink-0 text-xs font-medium",
                            isChecked ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
                          )}>
                            {isChecked ? "Проверено" : "К проверке"}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold sm:text-xl">{value}</div>
    </div>
  )
}
