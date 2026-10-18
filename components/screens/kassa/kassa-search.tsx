"use client"

<<<<<<< HEAD
import { Button } from "@/components/ui/button"
import { PackageSearch, Plus, Check, X } from "lucide-react"
import { formatDate, formatSom, formatWeight } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Product } from "@/lib/types"
import { ProductSearch } from "@/components/product-search"
import { isSearchReady } from "@/lib/product-search"
=======
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, PackageSearch, Sparkles, Plus, Camera } from "lucide-react"
import { formatSom, formatWeight } from "@/lib/format"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { Product } from "@/lib/types"
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal"
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6

interface KassaSearchProps {
  query: string
  setQuery: (q: string) => void
  debounced: string
  results: Product[]
  visible: number
  setVisible: React.Dispatch<React.SetStateAction<number>>
  pageSize: number
  trackRef: React.RefObject<HTMLDivElement | null>
  onTrackScroll: () => void
  qtyInCart: (id: string) => number
  addToCart: (p: Product) => void
<<<<<<< HEAD
  onToggleCart?: (p: Product) => void
  minQuery: number
  isAdmin: boolean
}

// Компактная карточка-строка для быстрого поиска и работы без перегрузки экрана
function ProductRow({
  p,
  inCart,
  isLoss,
  isAdmin,
  onToggleCart,
}: {
  p: Product
  inCart: number
  isLoss: boolean
  isAdmin: boolean
  onToggleCart: (p: Product) => void
}) {
  const salePerGram = p.price_per_gram_sale ?? (p.weight > 0 ? p.sale_price / p.weight : null)
  const sellerPerGram = p.price_per_gram_purchase_visible ?? (p.weight > 0 && p.purchase_price_visible != null ? p.purchase_price_visible / p.weight : null)
  const purchasePerGram = p.price_per_gram_purchase ?? (p.weight > 0 ? p.purchase_price / p.weight : null)
  const isInCart = inCart > 0

  return (
    <div
      className={cn(
        "flex flex-col min-w-0 gap-2.5 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/60 sm:p-3.5",
        isLoss ? "border-destructive/40 bg-destructive/5" : "border-border/60"
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {p.image_url && (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted sm:h-14 sm:w-14">
              <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="font-mono text-xs font-bold text-primary">
                {p.sku || "Без Арт."}
              </span>
              <span className="font-medium text-[11px] text-muted-foreground">
                {p.metal || "Металл не указан"}
              </span>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="font-mono text-[11px] text-muted-foreground">{formatWeight(p.weight)}</span>
            </div>
            <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground sm:text-sm mt-0.5">{p.name}</p>
          </div>
        </div>

        {/* Компактная интерактивная кнопка добавления / удаления из чека */}
        <Button
          type="button"
          size="sm"
          variant={isInCart ? "default" : "outline"}
          onClick={() => onToggleCart(p)}
          className={cn(
            "h-7 shrink-0 rounded-lg px-2 text-xs font-medium transition-all active:scale-95 sm:h-8 sm:px-2.5",
            isInCart
              ? "bg-primary text-primary-foreground border-primary hover:bg-destructive hover:text-destructive-foreground hover:border-destructive shadow-sm group/btn"
              : "border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
          )}
          title={isInCart ? "В чеке · Нажмите, чтобы убрать" : "Добавить в чек"}
          aria-label={isInCart ? `Убрать ${p.name} из чека` : `Добавить ${p.name} в чек`}
        >
          {isInCart ? (
            <span className="flex items-center gap-1 font-mono text-[11px] font-semibold">
              <Check className="h-3.5 w-3.5 group-hover/btn:hidden" />
              <X className="h-3.5 w-3.5 hidden group-hover/btn:inline" />
              <span className="group-hover/btn:hidden">В чеке</span>
              <span className="hidden group-hover/btn:inline">Убрать</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px]">
              <Plus className="h-3.5 w-3.5" />
              <span>В чек</span>
            </span>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs border-t border-border/50 pt-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-muted-foreground">Цена:</span>
          <strong className="font-mono text-sm font-bold text-primary">{formatSom(p.sale_price)}</strong>
          {salePerGram != null && (
            <span className="font-mono text-[10px] text-muted-foreground">
              ({formatSom(salePerGram)}/г)
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          {p.supplier_name && (
            <span className="max-w-[140px] truncate">{p.supplier_name}</span>
          )}
          <span className="shrink-0">{formatDate(p.created_at)}</span>
        </div>
      </div>
  {<div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground bg-muted/30 px-2 py-1 rounded-md">
      {isAdmin && (
          <div>
            Себестоимость: <strong className="font-mono text-foreground">{formatSom(p.purchase_price)}</strong>
            {purchasePerGram != null && <span className="font-mono ml-1">({formatSom(purchasePerGram)}/г)</span>}
          </div>
      )}
                   <div>
          {p.purchase_price_visible != null && (
            <div>
              Цена продажи: <strong className="font-mono text-foreground">{formatSom(p.purchase_price_visible)}</strong>
              {sellerPerGram != null && <span className="font-mono ml-1">({formatSom(sellerPerGram)}/г)</span>}
            </div>
            
          )}</div>
    </div>}
    </div>
  )
=======
  minQuery: number
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
}

export function KassaSearch({
  query,
  setQuery,
  debounced,
  results,
  visible,
  setVisible,
  pageSize,
  trackRef,
  onTrackScroll,
  qtyInCart,
  addToCart,
<<<<<<< HEAD
  onToggleCart,
  minQuery,
  isAdmin,
}: KassaSearchProps) {
  const isSearching = isSearchReady(query, minQuery)
  const isTooShort = query.trim().length > 0 && query.trim().length < minQuery && !isSearchReady(query, minQuery)

  const handleToggle = onToggleCart || addToCart

  return (
    <div className="w-full space-y-3 min-w-0 max-w-full">
      {/* Поисковая панель */}
      <ProductSearch
        value={query}
        onChange={setQuery}
        placeholder="Артикул, название, 1,25 г, 12300 с, 11.09.2026..."
        className="w-full"
        inputClassName="h-11 rounded-xl bg-card text-sm shadow-sm"
      />

      {isTooShort && (
        <p className="text-center text-xs text-muted-foreground py-1">
          Введите от <span className="font-semibold text-foreground">{minQuery}</span> символов
        </p>
      )}

      {/* Основной список результатов */}
      <div className="relative w-full">
        {query.trim().length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 py-8 text-center bg-card/30">
            <PackageSearch className="mx-auto h-7 w-7 text-muted-foreground/40 mb-1.5" />
            <p className="text-xs text-muted-foreground">Введите артикул или название товара</p>
          </div>
        )}

        {isSearching && (
          !isSearchReady(debounced, minQuery) ? null : results.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 py-8 text-center bg-card/30">
              <p className="text-xs font-medium text-muted-foreground">Ничего не найдено</p>
            </div>
          ) : (
            <div
              ref={trackRef}
              onScroll={onTrackScroll}
              className="flex flex-col gap-2 max-h-[65vh] overflow-y-auto pr-1 scrollbar-thin"
            >
              {results.slice(0, visible).map((p) => (
                <ProductRow
                  key={p.id}
                  p={p}
                  inCart={qtyInCart(p.id)}
                  isLoss={p.sale_price < p.purchase_price}
                  isAdmin={isAdmin}
                  onToggleCart={handleToggle}
                />
              ))}

              {visible < results.length && (
                <Button
                  variant="ghost"
                  onClick={() => setVisible((v) => Math.min(v + pageSize, results.length))}
                  className="w-full text-xs text-muted-foreground mt-1"
                >
                  Показать ещё
                </Button>
              )}
            </div>
          )
        )}
      </div>

    </div>
  )
}
=======
  minQuery,
}: KassaSearchProps) {
  const [isScannerOpen, setIsScannerOpen] = useState(false)

  return (
    <div className="w-full space-y-3 min-w-0 max-w-full">
      {/* Строка поиска и кнопка сканирования рядом */}
      <div className="flex items-center gap-2">
        <div className="relative group flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            placeholder="Поиск: название, артикул, металл (от 3 символов)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-11 text-sm bg-card/60 backdrop-blur border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary shadow-sm transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted rounded-md px-1.5 py-0.5"
            >
              Очистить
            </button>
          )}
        </div>

        <Button
          variant="outline"
          className="h-11 px-3.5 shrink-0 bg-card/60 backdrop-blur border-border/80 text-foreground hover:bg-muted rounded-xl shadow-sm"
          onClick={() => setIsScannerOpen(true)}
          title="Быстрое сканирование QR / Штрихкод"
        >
          <Camera className="h-4 w-4 text-primary sm:mr-1.5" />
          <span className="hidden sm:inline text-xs font-medium">Сканировать QR / Штрихкод</span>
        </Button>
      </div>

      {query.trim().length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center bg-card/20">
          <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs font-medium text-muted-foreground">Введите артикул или название ювелирного изделия</p>
        </div>
      )}

      {query.trim().length > 0 && query.trim().length < minQuery && (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-center">
          <p className="text-xs text-muted-foreground">
            Введите минимум <span className="font-semibold text-foreground">{minQuery}</span> символа для начала поиска
          </p>
        </div>
      )}

      {debounced.length >= minQuery &&
        (results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 py-10 text-center text-sm text-muted-foreground bg-card/30">
            <p className="font-medium">Ничего не найдено</p>
            <p className="text-xs text-muted-foreground/80 mt-1">Проверьте правильность запроса</p>
          </div>
        ) : (
          <div className="relative w-full overflow-hidden">
            <div
              ref={trackRef}
              onScroll={onTrackScroll}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[58vh] overflow-y-auto p-1 pr-2 scrollbar-thin shadow-inner rounded-xl"
            >
              {results.slice(0, visible).map((p) => {
                const inCart = qtyInCart(p.id)
                const full = inCart >= p.quantity
                const isLoss = p.sale_price < p.purchase_price

                return (
                  <div
                    key={p.id}
                    className={cn(
                      "flex flex-col h-full w-full rounded-xl border bg-card/80 backdrop-blur p-3 transition-all duration-200 hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5",
                      isLoss ? "border-destructive/50 bg-destructive/5" : "border-border/80"
                    )}
                  >
                    <div className="relative mb-2.5 flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted/60 shrink-0 group">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <Sparkles className="h-7 w-7 text-muted-foreground/30" />
                      )}
                      {inCart > 0 && (
                        <Badge className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground font-mono text-[10px] px-1.5 py-0.2 shadow-sm">
                          {inCart} в чеке
                        </Badge>
                      )}
                    </div>

                    <span className="line-clamp-2 text-xs font-semibold leading-tight min-h-[2rem]" title={p.name}>
                      {p.name}
                    </span>

                    <div className="mt-2 space-y-0.5 text-[11px]">
                      <div className="font-mono font-medium text-primary/90 truncate">
                        Арт: {p.sku || "—"}
                      </div>
                      <div className="text-muted-foreground truncate text-[10px]">
                        {p.metal} · {formatWeight(p.weight)}
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        В наличии: <span className="font-medium text-foreground">{p.quantity} шт.</span>
                      </div>
                    </div>

                    <div className="mt-auto pt-3 border-t border-border/40">
                      <span className="block font-mono text-sm font-bold text-primary mb-2">
                        {formatSom(p.sale_price)}
                      </span>

                      <Button
                        size="sm"
                        className={cn("h-8 text-xs w-full font-medium transition-all", full ? "opacity-60" : "shadow-sm")}
                        variant={full ? "secondary" : "default"}
                        disabled={full}
                        onClick={() => addToCart(p)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {full ? "Макс." : "В чек"}
                      </Button>
                    </div>
                  </div>
                )
              })}

              {visible < results.length && (
                <button
                  onClick={() => setVisible((v) => Math.min(v + pageSize, results.length))}
                  className="flex w-full min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 text-xs text-muted-foreground transition-all hover:bg-muted/50 hover:border-primary/50"
                >
                  <Plus className="h-5 w-5 mb-1 opacity-70" />
                  Показать ещё
                </button>
              )}
            </div>
          </div>
        ))}

      {/* Модальное окно сканера с камерой */}
      {isScannerOpen && (
        <BarcodeScannerModal
          onClose={() => setIsScannerOpen(false)}
          onScan={(code) => {
            setQuery(code)
            toast.success(`Код успешно считан: ${code}`)
          }}
        />
      )}
    </div>
  )
}
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
