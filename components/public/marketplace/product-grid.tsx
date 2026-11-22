"use client"

import Link from "next/link"
import { useCallback, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, LoaderCircle, Search } from "lucide-react"
import {
  getPublicMarketplacePage,
  type PublicMarketplaceFacets,
  type PublicMarketplaceQueryPage,
  type PublicProduct,
} from "@/app/actions/store"
import { Button } from "@/components/shared/ui/button"
import { formatSom, formatWeight } from "@/lib/format"

type PublicProductGridProps = {
  initialPage: PublicMarketplaceQueryPage
  shopId?: string
  title: string
  searchPlaceholder?: string
  facets?: PublicMarketplaceFacets
  pageSize: number
  hideProductsWithoutPhoto: boolean
}

export function PublicProductGrid({
  initialPage,
  shopId,
  title,
  searchPlaceholder = "Название, артикул, металл или магазин",
  facets = { categories: [], metals: [] },
  pageSize,
  hideProductsWithoutPhoto,
}: PublicProductGridProps) {
  const [products, setProducts] = useState(initialPage.items)
  const [currentPage, setCurrentPage] = useState(initialPage.page)
  const [totalCount, setTotalCount] = useState(initialPage.totalCount)
  const [migrationPending, setMigrationPending] = useState(Boolean(initialPage.migrationPending))
  const [searchInput, setSearchInput] = useState("")
  const [activeSearch, setActiveSearch] = useState("")
  const [draftFilters, setDraftFilters] = useState({ category: "", metal: "", minPrice: "", maxPrice: "" })
  const [activeFilters, setActiveFilters] = useState({ category: "", metal: "", minPrice: "", maxPrice: "" })
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState(initialPage.error ?? "")
  const loadingRef = useRef(false)
  const requestIdRef = useRef(0)
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const loadPage = useCallback(async (
    targetPage: number,
    searchTerm: string,
    filters: typeof activeFilters,
  ) => {
    if (loadingRef.current) return
    loadingRef.current = true
    const requestId = ++requestIdRef.current

    setLoading(true)
    setErrorMessage("")
    setMigrationPending(false)

    try {
      const page = await getPublicMarketplacePage(
        shopId ?? null,
        targetPage,
        pageSize,
        searchTerm,
        {
          category: filters.category || undefined,
          metal: filters.metal || undefined,
          minPrice: filters.minPrice ? Number(filters.minPrice) : null,
          maxPrice: filters.maxPrice ? Number(filters.maxPrice) : null,
        },
        hideProductsWithoutPhoto,
      )
      if (requestId !== requestIdRef.current) return

      if (page.error) {
        setErrorMessage(page.error)
        return
      }

      setProducts(page.items)
      setCurrentPage(page.page)
      setTotalCount(page.totalCount)
      setMigrationPending(Boolean(page.migrationPending))
    } catch {
      if (requestId === requestIdRef.current) {
        setErrorMessage("Не удалось загрузить товары. Попробуйте ещё раз.")
      }
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [hideProductsWithoutPhoto, pageSize, shopId])

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextSearch = searchInput.trim().slice(0, 100)
    const min = draftFilters.minPrice.trim()
    const max = draftFilters.maxPrice.trim()
    if (min && (!Number.isFinite(Number(min)) || Number(min) < 0)) {
      setErrorMessage("Укажите корректную минимальную цену.")
      return
    }
    if (max && (!Number.isFinite(Number(max)) || Number(max) < 0)) {
      setErrorMessage("Укажите корректную максимальную цену.")
      return
    }
    if (min && max && Number(min) > Number(max)) {
      setErrorMessage("Минимальная цена не может быть больше максимальной.")
      return
    }
    if (loadingRef.current) return
    const nextFilters = { ...draftFilters, minPrice: min, maxPrice: max }
    setActiveSearch(nextSearch)
    setActiveFilters(nextFilters)
    void loadPage(1, nextSearch, nextFilters)
  }

  function clearFilters() {
    if (loadingRef.current) return
    const empty = { category: "", metal: "", minPrice: "", maxPrice: "" }
    setSearchInput("")
    setActiveSearch("")
    setDraftFilters(empty)
    setActiveFilters(empty)
    void loadPage(1, "", empty)
  }

  return (
    <section aria-labelledby="public-products-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Подбор по каталогу</p>
          <h2 id="public-products-heading" className="mt-2 font-serif text-3xl">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Поиск и фильтры применяются ко всем открытым изделиям в наличии.
          </p>
        </div>
        <form onSubmit={submitSearch} className="mt-4 w-full rounded-2xl border border-border/80 bg-card p-3 shadow-sm sm:p-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.6fr)_minmax(9rem,1fr)_minmax(8rem,0.85fr)_minmax(7rem,0.7fr)_minmax(7rem,0.7fr)_auto]">
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Поиск</span>
          <input
            id="public-marketplace-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            maxLength={100}
            placeholder={searchPlaceholder}
            className="h-10 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Категория</span>
            <select
              value={draftFilters.category}
              onChange={(event) => setDraftFilters((current) => ({ ...current, category: event.target.value }))}
              className="h-10 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Все категории</option>
              {facets.categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Металл</span>
            <select
              value={draftFilters.metal}
              onChange={(event) => setDraftFilters((current) => ({ ...current, metal: event.target.value }))}
              className="h-10 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Любой металл</option>
              {facets.metals.map((metal) => <option key={metal} value={metal}>{metal}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Цена от, сом</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={draftFilters.minPrice}
              onChange={(event) => setDraftFilters((current) => ({ ...current, minPrice: event.target.value }))}
              placeholder="Без минимума"
              className="h-10 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Цена до, сом</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={draftFilters.maxPrice}
              onChange={(event) => setDraftFilters((current) => ({ ...current, maxPrice: event.target.value }))}
              placeholder="Без максимума"
              className="h-10 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" size="sm" className="h-10 flex-1 gap-2 whitespace-nowrap rounded-xl px-4" disabled={loading}>
            <Search aria-hidden="true" className="h-4 w-4" />
            Найти
          </Button>
          {(activeSearch || activeFilters.category || activeFilters.metal || activeFilters.minPrice || activeFilters.maxPrice) && (
            <Button type="button" size="sm" variant="ghost" className="h-10 shrink-0 rounded-xl px-3" onClick={clearFilters} disabled={loading}>
              Сбросить
            </Button>
          )}
          </div>
          </div>
        </form>
      </div>

      {products.length > 0 && (
        <p className="mt-5 text-xs text-muted-foreground">
          {migrationPending
            ? `Показано ${products.length} изделий. Каталог обновляется.`
            : `Показано ${products.length} из ${totalCount.toLocaleString("ru")} изделий · страница ${currentPage} из ${totalPages}`}
        </p>
      )}

      {products.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <MarketplaceProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : errorMessage ? (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm">
          {errorMessage}
        </p>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {errorMessage
            ? errorMessage
            : migrationPending
              ? "Каталог временно обновляется. Попробуйте зайти позже."
              : activeSearch
                ? "По вашему запросу ничего не найдено."
                : "В открытых витринах пока нет товаров."}
        </p>
      )}

      {errorMessage && products.length === 0 && (
        <div className="mt-4 text-center">
          <Button type="button" variant="outline" onClick={() => void loadPage(currentPage, activeSearch, activeFilters)} disabled={loading}>
            {loading ? "Загружаем…" : "Повторить"}
          </Button>
        </div>
      )}

      {migrationPending && (
        <p role="status" className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
          {activeFilters.category || activeFilters.metal || activeFilters.minPrice || activeFilters.maxPrice
            ? "Фильтры и страницы каталога станут доступны после обновления базы данных."
            : "Показана первая страница каталога. Нумерованные страницы станут доступны после обновления базы данных."}
        </p>
      )}

      {errorMessage && products.length > 0 && (
        <div className="mt-5 text-center">
          <p role="alert" className="mb-2 text-sm text-destructive">{errorMessage}</p>
          <Button type="button" variant="outline" onClick={() => void loadPage(currentPage, activeSearch, activeFilters)} disabled={loading}>
            Повторить
          </Button>
        </div>
      )}

      {totalPages > 1 && !migrationPending && !errorMessage && (
        <nav aria-label="Страницы каталога" className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-busy={loading}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full"
            aria-label="Предыдущая страница"
            disabled={currentPage <= 1 || loading}
            onClick={() => void loadPage(currentPage - 1, activeSearch, activeFilters)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="flex items-center gap-1">
            {getVisiblePageNumbers(currentPage, totalPages).map((page, index) => (
              typeof page === "number" ? (
                <Button
                  key={page}
                  type="button"
                  variant={currentPage === page ? "default" : "ghost"}
                  className="h-10 w-10 rounded-full p-0"
                  aria-label={`Страница ${page}`}
                  aria-current={currentPage === page ? "page" : undefined}
                  disabled={loading}
                  onClick={() => void loadPage(page, activeSearch, activeFilters)}
                >
                  {page}
                </Button>
              ) : (
                <span key={`${page}-${index}`} aria-hidden="true" className="px-1 text-muted-foreground">…</span>
              )
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full"
            aria-label="Следующая страница"
            disabled={currentPage >= totalPages || loading}
            onClick={() => void loadPage(currentPage + 1, activeSearch, activeFilters)}
          >
            {loading
              ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </nav>
      )}
    </section>
  )
}

function getVisiblePageNumbers(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)

  const visible = new Set([1, totalPages])
  for (let page = Math.max(2, currentPage - 1); page <= Math.min(totalPages - 1, currentPage + 1); page += 1) {
    visible.add(page)
  }
  const sorted = [...visible].sort((a, b) => a - b)
  const result: Array<number | "ellipsis"> = []
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push("ellipsis")
    result.push(page)
  })
  return result
}

function MarketplaceProductCard({ product }: { product: PublicProduct }) {
  const cover = product.images?.[0] ?? product.image_url
  const shopKey = product.sku?.trim() ? product.shop_seq_id ?? product.shop_id : product.shop_id
  const article = product.sku?.trim().toUpperCase() || product.id
  const href = `/store/${encodeURIComponent(String(shopKey))}/${encodeURIComponent(article)}`
  const content = (
    <>
      <div className="aspect-square bg-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Нет фото</div>
        )}
      </div>
      <div className="p-4">
        <p className="line-clamp-1 text-sm font-medium">{product.name}</p>
        {product.shop_name && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{product.shop_name}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {product.metal ?? "—"} · {formatWeight(product.weight)}
        </p>
        <p className="mt-2 min-w-0 break-words font-mono text-sm font-semibold text-primary [overflow-wrap:anywhere]">
          {formatSom(product.sale_price)}
        </p>
        {!product.sku && <p className="mt-2 text-xs text-muted-foreground">Артикул пока не указан</p>}
      </div>
    </>
  )

  const className = "block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary"
  return href ? (
    <Link href={href} className={className}>{content}</Link>
  ) : (
    <article className={className}>{content}</article>
  )
}
