"use client"

import { Button } from "@/components/ui/button"
import { PackageSearch, Plus, Check, X } from "lucide-react"
import { formatDate, formatSom, formatWeight } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Product } from "@/lib/types"
import { ProductSearch } from "@/components/product-search"
import { isSearchReady } from "@/lib/product-search"

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
  onToggleCart?: (p: Product) => void
  minQuery: number
  isAdmin: boolean
}

// ÐÐ¾Ð¼Ð¿Ð°ÐºÑÐ½Ð°Ñ ÐºÐ°ÑÑÐ¾ÑÐºÐ°-ÑÑÑÐ¾ÐºÐ° Ð´Ð»Ñ Ð±ÑÑÑÑÐ¾Ð³Ð¾ Ð¿Ð¾Ð¸ÑÐºÐ° Ð¸ ÑÐ°Ð±Ð¾ÑÑ Ð±ÐµÐ· Ð¿ÐµÑÐµÐ³ÑÑÐ·ÐºÐ¸ ÑÐºÑÐ°Ð½Ð°
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
                {p.sku || "ÐÐµÐ· ÐÑÑ."}
              </span>
              <span className="font-medium text-[11px] text-muted-foreground">
                {p.metal || "ÐÐµÑÐ°Ð»Ð» Ð½Ðµ ÑÐºÐ°Ð·Ð°Ð½"}
              </span>
              <span className="text-[11px] text-muted-foreground">Â·</span>
              <span className="font-mono text-[11px] text-muted-foreground">{formatWeight(p.weight)}</span>
            </div>
            <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground sm:text-sm mt-0.5">{p.name}</p>
          </div>
        </div>

        {/* ÐÐ¾Ð¼Ð¿Ð°ÐºÑÐ½Ð°Ñ Ð¸Ð½ÑÐµÑÐ°ÐºÑÐ¸Ð²Ð½Ð°Ñ ÐºÐ½Ð¾Ð¿ÐºÐ° Ð´Ð¾Ð±Ð°Ð²Ð»ÐµÐ½Ð¸Ñ / ÑÐ´Ð°Ð»ÐµÐ½Ð¸Ñ Ð¸Ð· ÑÐµÐºÐ° */}
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
          title={isInCart ? "Ð ÑÐµÐºÐµ Â· ÐÐ°Ð¶Ð¼Ð¸ÑÐµ, ÑÑÐ¾Ð±Ñ ÑÐ±ÑÐ°ÑÑ" : "ÐÐ¾Ð±Ð°Ð²Ð¸ÑÑ Ð² ÑÐµÐº"}
          aria-label={isInCart ? `Ð£Ð±ÑÐ°ÑÑ ${p.name} Ð¸Ð· ÑÐµÐºÐ°` : `ÐÐ¾Ð±Ð°Ð²Ð¸ÑÑ ${p.name} Ð² ÑÐµÐº`}
        >
          {isInCart ? (
            <span className="flex items-center gap-1 font-mono text-[11px] font-semibold">
              <Check className="h-3.5 w-3.5 group-hover/btn:hidden" />
              <X className="h-3.5 w-3.5 hidden group-hover/btn:inline" />
              <span className="group-hover/btn:hidden">Ð ÑÐµÐºÐµ</span>
              <span className="hidden group-hover/btn:inline">Ð£Ð±ÑÐ°ÑÑ</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px]">
              <Plus className="h-3.5 w-3.5" />
              <span>Ð ÑÐµÐº</span>
            </span>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs border-t border-border/50 pt-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-muted-foreground">Ð¦ÐµÐ½Ð°:</span>
          <strong className="font-mono text-sm font-bold text-primary">{formatSom(p.sale_price)}</strong>
          {salePerGram != null && (
            <span className="font-mono text-[10px] text-muted-foreground">
              ({formatSom(salePerGram)}/Ð³)
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
            Ð¡ÐµÐ±ÐµÑÑÐ¾Ð¸Ð¼Ð¾ÑÑÑ: <strong className="font-mono text-foreground">{formatSom(p.purchase_price)}</strong>
            {purchasePerGram != null && <span className="font-mono ml-1">({formatSom(purchasePerGram)}/Ð³)</span>}
          </div>
      )}
                   <div>
          {p.purchase_price_visible != null && (
            <div>
              Ð¦ÐµÐ½Ð° Ð¿ÑÐ¾Ð´Ð°Ð¶Ð¸: <strong className="font-mono text-foreground">{formatSom(p.purchase_price_visible)}</strong>
              {sellerPerGram != null && <span className="font-mono ml-1">({formatSom(sellerPerGram)}/Ð³)</span>}
            </div>
            
          )}</div>
    </div>}
    </div>
  )
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
  onToggleCart,
  minQuery,
  isAdmin,
}: KassaSearchProps) {
  const isSearching = isSearchReady(query, minQuery)
  const isTooShort = query.trim().length > 0 && query.trim().length < minQuery && !isSearchReady(query, minQuery)

  const handleToggle = onToggleCart || addToCart

  return (
    <div className="w-full space-y-3 min-w-0 max-w-full">
      {/* ÐÐ¾Ð¸ÑÐºÐ¾Ð²Ð°Ñ Ð¿Ð°Ð½ÐµÐ»Ñ */}
      <ProductSearch
        value={query}
        onChange={setQuery}
        placeholder="ÐÑÑÐ¸ÐºÑÐ», Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ, 1,25 Ð³, 12300 Ñ, 11.09.2026..."
        className="w-full"
        inputClassName="h-11 rounded-xl bg-card text-sm shadow-sm"
      />

      {isTooShort && (
        <p className="text-center text-xs text-muted-foreground py-1">
          ÐÐ²ÐµÐ´Ð¸ÑÐµ Ð¾Ñ <span className="font-semibold text-foreground">{minQuery}</span> ÑÐ¸Ð¼Ð²Ð¾Ð»Ð¾Ð²
        </p>
      )}

      {/* ÐÑÐ½Ð¾Ð²Ð½Ð¾Ð¹ ÑÐ¿Ð¸ÑÐ¾Ðº ÑÐµÐ·ÑÐ»ÑÑÐ°ÑÐ¾Ð² */}
      <div className="relative w-full">
        {query.trim().length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 py-8 text-center bg-card/30">
            <PackageSearch className="mx-auto h-7 w-7 text-muted-foreground/40 mb-1.5" />
            <p className="text-xs text-muted-foreground">ÐÐ²ÐµÐ´Ð¸ÑÐµ Ð°ÑÑÐ¸ÐºÑÐ» Ð¸Ð»Ð¸ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ ÑÐ¾Ð²Ð°ÑÐ°</p>
          </div>
        )}

        {isSearching && (
          !isSearchReady(debounced, minQuery) ? null : results.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 py-8 text-center bg-card/30">
              <p className="text-xs font-medium text-muted-foreground">ÐÐ¸ÑÐµÐ³Ð¾ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾</p>
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
                  ÐÐ¾ÐºÐ°Ð·Ð°ÑÑ ÐµÑÑ
                </Button>
              )}
            </div>
          )
        )}
      </div>

    </div>
  )
}
