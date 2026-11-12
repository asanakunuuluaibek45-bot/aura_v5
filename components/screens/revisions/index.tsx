"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Product } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProductSearch } from "@/components/product-search"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { filterProducts, normalizeText, parseProductSearchQuery } from "@/lib/product-search"
import {
  getRevisionProducts,
  groupRevisionProducts,
  filterRevisionCategory,
  filterRevisionMetal,
  parseRevisionSession,
  recordRevisionScan,
  toggleRevisionCheck,
} from "@/lib/inventory-revision"
import { toast } from "sonner"
import { Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, RotateCcw, Undo2 } from "lucide-react"

const SESSION_PREFIX = "inventory-revision-v1"
const PAGE_SIZE = 10

type CategorySection = {
  category: string
  total: number
  checked: number
  remaining: number
  products: Product[]
}

export function RevisionsScreen({
  products,
  shopId,
  productsReady = true,
}: {
  products: Product[]
  shopId: string | null
  productsReady?: boolean
}) {
  const storageKey = shopId ? SESSION_PREFIX + ":" + shopId : ""
  const [loadedKey, setLoadedKey] = useState("")
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const checkedIdsRef = useRef<string[]>([])
  const autoHandledQueryRef = useRef("")
  const [finished, setFinished] = useState(false)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [metal, setMetal] = useState("")
  const [pageByCategory, setPageByCategory] = useState<Record<string, number>>({})
  const [autoMarkNotice, setAutoMarkNotice] = useState("")
  const [showUnverified, setShowUnverified] = useState(true)
  const [showChecked, setShowChecked] = useState(false)
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

    checkedIdsRef.current = session.checkedProductIds
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
  const stockById = useMemo(() => new Map(stockProducts.map((product) => [product.id, product])), [stockProducts])
  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds])
  const categoryProducts = useMemo(
    () => filterRevisionMetal(filterRevisionCategory(stockProducts, category), metal),
    [category, metal, stockProducts],
  )
  const checkedProducts = useMemo(
    () => checkedIds.slice().reverse().map((id) => stockById.get(id)).filter((product): product is Product => Boolean(product)),
    [checkedIds, stockById],
  )
  const selectedCheckedProducts = useMemo(
    () => filterRevisionMetal(filterRevisionCategory(checkedProducts, category), metal),
    [category, metal, checkedProducts],
  )
  const totalCount = categoryProducts.length
  const checkedCount = selectedCheckedProducts.length
  const remainingCount = Math.max(0, totalCount - checkedCount)
  const allGroups = useMemo(
    () => groupRevisionProducts(stockProducts, checkedSet),
    [stockProducts, checkedSet],
  )
  const debouncedMatches = useMemo(
    () => filterProducts(categoryProducts, debouncedQuery),
    [categoryProducts, debouncedQuery],
  )
  const categorySections = useMemo<CategorySection[]>(() => {
    const totals = new Map<string, CategorySection>()
    for (const group of allGroups) {
      if (category && group.category !== category) continue
      if (metal && group.metal !== metal) continue
      const current = totals.get(group.category) ?? {
        category: group.category,
        total: 0,
        checked: 0,
        remaining: 0,
        products: [],
      }
      current.total += group.total
      current.checked += group.checked
      current.remaining += group.remaining
      totals.set(group.category, current)
    }

    for (const product of debouncedMatches) {
      const productCategory = product.category?.trim() || "Прочее"
      if (checkedSet.has(product.id)) continue
      const current = totals.get(productCategory)
      if (current) current.products.push(product)
    }

    return [...totals.values()]
      .filter((section) => !category || section.category === category)
      .filter((section) => section.products.length > 0)
      .sort((a, b) => a.category.localeCompare(b.category, "ru"))
  }, [allGroups, category, checkedSet, debouncedMatches, metal])
  const categories = useMemo(
    () => [...new Set(allGroups.map((group) => group.category))].sort((a, b) => a.localeCompare(b, "ru")),
    [allGroups],
  )
  const metals = useMemo(
    () => [...new Set(filterRevisionCategory(stockProducts, category).map((product) => product.metal?.trim() || "Металл не указан"))]
      .sort((a, b) => a.localeCompare(b, "ru")),
    [category, stockProducts],
  )

  const markProduct = useCallback((product: Product, announce = true) => {
    if (finished || checkedIdsRef.current.includes(product.id)) return false
    const next = toggleRevisionCheck(checkedIdsRef.current, product.id, true)
    checkedIdsRef.current = next
    setCheckedIds(next)
    if (announce) toast.success("Проверено: " + product.name)
    return true
  }, [finished])

  const undoProduct = useCallback((product: Product) => {
    const next = toggleRevisionCheck(checkedIdsRef.current, product.id, false)
    if (next.length === checkedIdsRef.current.length) return
    checkedIdsRef.current = next
    setCheckedIds(next)
    setFinished(false)
    toast("Отметка отменена: " + product.name)
  }, [])

  const handleScan = useCallback((sku: string) => {
    const result = recordRevisionScan(products, checkedIdsRef.current, sku)
    if (result.status === "not_found") {
      toast.error("Изделие не найдено среди товаров в наличии")
      return
    }
    if (result.status === "already_checked") {
      toast.error("Это изделие уже проверено")
      return
    }
    markProduct(result.product)
  }, [markProduct, products])

  useEffect(() => {
    if (query !== debouncedQuery) {
      autoHandledQueryRef.current = ""
      return
    }
    const raw = debouncedQuery.trim()
    if (!raw || finished || !loadedKey || loadedKey !== storageKey) return

    const trigger = normalizeText(raw) + "|" + category + "|" + metal
    if (autoHandledQueryRef.current === trigger) return
    autoHandledQueryRef.current = trigger

    const eligible = filterRevisionMetal(filterRevisionCategory(stockProducts, category), metal)
    const exactSku = raw.toLocaleUpperCase("ru-RU")
    let match = eligible.find((product) => product.sku?.trim().toLocaleUpperCase("ru-RU") === exactSku) ?? null

    if (!match) {
      const parsed = parseProductSearchQuery(raw)
      if (parsed.kind === "weight") {
        const matches = filterProducts(eligible, raw)
        if (matches.length === 1) match = matches[0]
      } else if (parsed.kind === "text" && parsed.value.length >= 3) {
        const matches = eligible.filter((product) => normalizeText(product.name).includes(parsed.value))
        if (matches.length === 1) match = matches[0]
      }
    }

    if (match && !checkedIdsRef.current.includes(match.id)) {
      if (markProduct(match, false)) setAutoMarkNotice("Автоматически отмечено: " + match.name)
    }
  }, [category, debouncedQuery, finished, loadedKey, markProduct, metal, query, stockProducts, storageKey])

  useEffect(() => {
    setPageByCategory({})
  }, [category, debouncedQuery, metal])

  const finishRevision = () => {
    setQuery("")
    setCategory("")
    setMetal("")
    setPageByCategory({})
    setFinished(true)
    setShowUnverified(true)
  }

  const startNewRevision = () => {
    if (checkedIdsRef.current.length > 0 && !window.confirm("Сбросить отметки и начать новую ревизию?")) return
    checkedIdsRef.current = []
    setCheckedIds([])
    setFinished(false)
    setQuery("")
    setCategory("")
    setMetal("")
    setPageByCategory({})
    setAutoMarkNotice("")
  }

  if (!shopId) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Сначала выберите магазин, чтобы открыть ревизию его склада.
      </div>
    )
  }

  if (!productsReady || loadedKey !== storageKey) {
    return (
      <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground" role="status">
        Загружаем склад и прогресс ревизии…
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardCheck className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" aria-hidden="true" />
          <div className="min-w-0">
            <h1 className="font-serif text-xl sm:text-2xl">Ревизии</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">Проверка склада · отметки не меняют остатки</p>
          </div>
        </div>
        {finished && (
          <Button type="button" variant="outline" size="sm" onClick={startNewRevision} className="h-9 shrink-0 gap-1.5 px-2.5 sm:px-3">
            <RotateCcw className="h-4 w-4" />
            <span>Новая</span>
          </Button>
        )}
      </header>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        <StatCard label="Всего" value={totalCount} />
        <StatCard label="Отмечено" value={checkedCount} />
        <StatCard label="Осталось" value={remainingCount} />
      </div>

      {!finished && (
        <section className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-2.5 sm:flex sm:items-center sm:p-3">
          <label className="sr-only" htmlFor="revision-category">Категория</label>
          <select
            id="revision-category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value)
              setMetal("")
              setAutoMarkNotice("")
            }}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm sm:w-48"
          >
            <option value="">Все категории</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <label className="sr-only" htmlFor="revision-metal">Металл</label>
          <select
            id="revision-metal"
            value={metal}
            onChange={(event) => {
              setMetal(event.target.value)
              setAutoMarkNotice("")
            }}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm sm:w-40"
          >
            <option value="">Все металлы</option>
            {metals.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <ProductSearch
            value={query}
            onChange={(value) => {
              setQuery(value)
              setAutoMarkNotice("")
            }}
            onScan={handleScan}
            placeholder="Название, точный артикул или вес…"
            className="col-span-2 min-w-0 flex-1 sm:col-span-1"
            inputClassName="h-9"
          />
        </section>
      )}

      {finished ? (
        <section className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Ревизия завершена</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Проверено {checkedCount} из {totalCount}. Непроверенных изделий: {remainingCount}.
            </p>
          </div>
        </section>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-xs text-muted-foreground" aria-live="polite">
            {autoMarkNotice || (query ? "Совпадений: " + debouncedMatches.length : "Выберите изделие или отсканируйте этикетку")}
          </p>
          <Button type="button" onClick={finishRevision} size="sm" className="h-9 shrink-0 px-3">
            Завершить
          </Button>
        </div>
      )}

      <details
        open={showUnverified}
        onToggle={(event) => setShowUnverified(event.currentTarget.open)}
        className="overflow-hidden rounded-xl border border-border bg-card"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 text-sm font-semibold">Непроверенные товары</span>
          <span className="shrink-0 text-xs text-muted-foreground">{remainingCount} осталось</span>
        </summary>
        <div className="space-y-2 border-t border-border p-2.5 sm:p-3">
          {categorySections.length === 0 ? (
            <p className="rounded-lg bg-muted/40 px-3 py-5 text-center text-sm text-muted-foreground">
              {remainingCount === 0
                ? "Все изделия проверены."
                : selectedCheckedProducts.some((product) => filterProducts([product], debouncedQuery).length > 0)
                  ? "Совпадение уже проверено и находится в отмеченных ниже."
                  : "По выбранным фильтрам изделия не найдены."}
            </p>
          ) : categorySections.map((section, sectionIndex) => {
            const pageCount = Math.max(1, Math.ceil(section.products.length / PAGE_SIZE))
            const page = Math.min(pageByCategory[section.category] ?? 0, pageCount - 1)
            const pageProducts = section.products.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
            const metalGroups = groupRevisionProducts(pageProducts, new Set())
            const fullGroups = allGroups.filter((group) =>
              group.category === section.category && (!metal || group.metal === metal),
            )

            return (
              <details key={section.category} open={sectionIndex === 0} className="rounded-lg border border-border/80">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 truncate text-sm font-medium">{section.category}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {section.checked} / {section.total} · осталось {section.remaining}
                  </span>
                </summary>
                <div className="border-t border-border/70 px-2.5 py-2">
                  <div className="space-y-3">
                    {metalGroups.map((metalGroup) => {
                      const totals = fullGroups.find((group) => group.metal === metalGroup.metal)
                      return (
                        <section key={metalGroup.key}>
                          <div className="mb-1 flex items-baseline justify-between gap-2">
                            <h3 className="truncate text-xs font-semibold">{metalGroup.metal}</h3>
                            {totals && <span className="shrink-0 text-[10px] text-muted-foreground">
                              {totals.checked} / {totals.total} · осталось {totals.remaining}
                            </span>}
                          </div>
                          <ul className="divide-y divide-border/50">
                            {metalGroup.products.map((product) => (
                              <li key={product.id} className="flex min-w-0 items-center justify-between gap-2 py-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{product.name}</p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {product.sku || "Без артикула"}{product.weight ? " · " + product.weight + " г" : ""}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={finished}
                                  onClick={() => markProduct(product)}
                                  className="h-8 shrink-0 gap-1 px-2.5 text-xs"
                                  aria-label={"Отметить " + product.name}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Отметить</span>
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )
                    })}
                  </div>
                  {pageCount > 1 && (
                    <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
                      <span className="text-[11px] text-muted-foreground">
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, section.products.length)} из {section.products.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={page === 0}
                          onClick={() => setPageByCategory((current) => ({ ...current, [section.category]: page - 1 }))}
                          className="h-8 w-8"
                          aria-label="Предыдущая страница"
                        ><ChevronLeft className="h-4 w-4" /></Button>
                        <span className="min-w-10 text-center text-xs tabular-nums">{page + 1} / {pageCount}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={page >= pageCount - 1}
                          onClick={() => setPageByCategory((current) => ({ ...current, [section.category]: page + 1 }))}
                          className="h-8 w-8"
                          aria-label="Следующая страница"
                        ><ChevronRight className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            )
          })}
        </div>
      </details>

      <details
        open={showChecked}
        onToggle={(event) => setShowChecked(event.currentTarget.open)}
        className="overflow-hidden rounded-xl border border-emerald-600/20 bg-card"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 text-sm font-semibold">Отмеченные товары</span>
          <span className="shrink-0 text-xs text-muted-foreground">{checkedCount} отмечено / {remainingCount} осталось</span>
        </summary>
        <div className="border-t border-border p-2.5 sm:p-3">
          {checkedProducts.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">Пока нет отмеченных изделий.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {selectedCheckedProducts.map((product) => (
                <li key={product.id} className="flex min-w-0 items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-emerald-700 dark:text-emerald-400">{product.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {product.category?.trim() || "Прочее"} · {product.metal?.trim() || "Металл не указан"} · {product.sku || "Без артикула"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => undoProduct(product)}
                    className="h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                    aria-label={"Отменить отметку " + product.name}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Отменить</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-2.5 py-2 sm:rounded-xl sm:p-3">
      <div className="truncate text-[11px] text-muted-foreground sm:text-xs">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold tabular-nums sm:text-lg">{value}</div>
    </div>
  )
}
