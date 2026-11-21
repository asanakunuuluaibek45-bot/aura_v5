"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, LoaderCircle, Search } from "lucide-react"
import {
  getPublicMarketplaceProducts,
  type PublicProduct,
  type PublicProductPage,
} from "@/app/actions/store"
import { Button } from "@/components/shared/ui/button"
import { formatSom, formatWeight } from "@/lib/format"

const PAGE_SIZE = 24

type PublicProductGridProps = {
  initialPage: PublicProductPage
  shopId?: string
  title: string
  searchPlaceholder?: string
}

export function PublicProductGrid({
  initialPage,
  shopId,
  title,
  searchPlaceholder = "Название, артикул, металл или магазин",
}: PublicProductGridProps) {
  const [products, setProducts] = useState(initialPage.items)
  const [hasMore, setHasMore] = useState(initialPage.hasMore)
  const [migrationPending, setMigrationPending] = useState(Boolean(initialPage.migrationPending))
  const [searchInput, setSearchInput] = useState("")
  const [activeSearch, setActiveSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState(initialPage.error ?? "")
  const loadingRef = useRef(false)
  const requestIdRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadPage = useCallback(async (replace: boolean, searchTerm: string) => {
    if (loadingRef.current) return
    loadingRef.current = true
    const requestId = ++requestIdRef.current
    const cursor = !replace && products.length
      ? { id: products[products.length - 1].id, created_at: products[products.length - 1].created_at }
      : undefined

    setLoading(true)
    setErrorMessage("")
    if (replace) {
      setProducts([])
      setHasMore(true)
      setMigrationPending(false)
    }

    try {
      const page = await getPublicMarketplaceProducts(shopId ?? null, PAGE_SIZE, cursor, searchTerm)
      if (requestId !== requestIdRef.current) return

      if (page.error) {
        setErrorMessage(page.error)
        setHasMore(true)
        return
      }

      setProducts((current) => {
        if (replace) return page.items
        const knownIds = new Set(current.map((product) => product.id))
        return [...current, ...page.items.filter((product) => !knownIds.has(product.id))]
      })
      setHasMore(page.hasMore)
      setMigrationPending(Boolean(page.migrationPending))
    } catch {
      if (requestId === requestIdRef.current) {
        setErrorMessage("Не удалось загрузить товары. Попробуйте ещё раз.")
        setHasMore(true)
      }
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [products, shopId])

  const loadMore = useCallback(() => {
    if (hasMore && !loading) void loadPage(false, activeSearch)
  }, [activeSearch, hasMore, loadPage, loading])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || loading || errorMessage || migrationPending) return
    if (typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: "400px 0px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [errorMessage, hasMore, loadMore, loading, migrationPending])

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextSearch = searchInput.trim().slice(0, 100)
    if (loadingRef.current || nextSearch === activeSearch) return
    setActiveSearch(nextSearch)
    void loadPage(true, nextSearch)
  }

  return (
    <section aria-labelledby="public-products-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="public-products-heading" className="font-serif text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Только изделия в наличии в открытых витринах магазинов.
          </p>
        </div>
        <form onSubmit={submitSearch} className="flex w-full gap-2 sm:w-auto">
          <label className="sr-only" htmlFor="public-marketplace-search">Поиск по товарам</label>
          <input
            id="public-marketplace-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            maxLength={100}
            placeholder={searchPlaceholder}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-80"
          />
          <Button type="submit" size="sm" className="h-10 gap-2" disabled={loading}>
            <Search aria-hidden="true" className="h-4 w-4" />
            Найти
          </Button>
        </form>
      </div>

      {products.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <Button type="button" variant="outline" onClick={() => void loadPage(true, activeSearch)} disabled={loading}>
            {loading ? "Загружаем…" : "Повторить"}
          </Button>
        </div>
      )}

      {migrationPending && (
        <p role="status" className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
          Показана первая страница каталога. Полная подгрузка станет доступна после обновления базы данных.
        </p>
      )}

      {errorMessage && products.length > 0 && (
        <div className="mt-5 text-center">
          <p role="alert" className="mb-2 text-sm text-destructive">{errorMessage}</p>
          <Button type="button" variant="outline" onClick={loadMore} disabled={loading}>
            Повторить загрузку
          </Button>
        </div>
      )}

      {hasMore && !errorMessage && !migrationPending && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <div ref={sentinelRef} aria-hidden="true" className="h-1 w-full" />
          <Button type="button" variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? (
              <>
                <LoaderCircle aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                Загружаем…
              </>
            ) : (
              <>
                Показать ещё
                <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}

      {!hasMore && products.length > 0 && !migrationPending && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Вы просмотрели весь каталог.
        </p>
      )}
    </section>
  )
}

function MarketplaceProductCard({ product }: { product: PublicProduct }) {
  const cover = product.images?.[0] ?? product.image_url
  const shopKey = product.shop_seq_id ?? product.shop_id
  const href = product.sku
    ? `/q/${shopKey}/${encodeURIComponent(product.sku.toUpperCase())}`
    : null
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
