"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react"
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react"
import type { PublicProduct } from "@/app/actions/store"
import { formatSom, formatWeight } from "@/lib/format"

type StackLayer = {
  rotate: number
  translateX: number
  translateY: number
  scale: number
  opacity: number
  zIndex: number
}

type DragState = {
  pointerId: number
  cardIndex: number
  startX: number
  startY: number
  deltaX: number
  deltaY: number
  moved: boolean
}

const STACK_LAYERS: StackLayer[] = [
  { rotate: -5.5, translateX: 0, translateY: 0, scale: 1, opacity: 1, zIndex: 30 },
  { rotate: 6.5, translateX: 18, translateY: 6, scale: 0.955, opacity: 0.96, zIndex: 20 },
  { rotate: -7.5, translateX: -16, translateY: 12, scale: 0.91, opacity: 0.88, zIndex: 10 },
  { rotate: 9, translateX: 12, translateY: 16, scale: 0.865, opacity: 0.55, zIndex: 5 },
  { rotate: -9, translateX: -8, translateY: 18, scale: 0.83, opacity: 0, zIndex: 1 },
]

const MAX_CARDS = 5
const SWIPE_THRESHOLD = 75

type HeroProductCarouselProps = {
  products: PublicProduct[]
  featuredImageUrl: string | null
  featuredProductId: string | null
  featuredPhotoIndex: number
}

export function HeroProductCarousel({
  products,
  featuredImageUrl,
  featuredProductId,
  featuredPhotoIndex,
}: HeroProductCarouselProps) {
  const items = products.slice(0, MAX_CARDS)
  const [activeIndex, setActiveIndex] = useState(0)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const activeIndexRef = useRef(0)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)

  const setActiveCard = useCallback((index: number) => {
    if (items.length === 0) {
      activeIndexRef.current = 0
      setActiveIndex(0)
      return
    }
    const normalized = ((index % items.length) + items.length) % items.length
    activeIndexRef.current = normalized
    setActiveIndex(normalized)
  }, [items.length])

  useEffect(() => {
    if (items.length === 0 || activeIndexRef.current >= items.length) {
      setActiveCard(0)
    }
  }, [items.length, setActiveCard])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return

      drag.deltaX = event.clientX - drag.startX
      drag.deltaY = event.clientY - drag.startY
      if (Math.abs(drag.deltaX) > 6 || Math.abs(drag.deltaY) > 6) drag.moved = true

      if (Math.abs(drag.deltaX) > Math.abs(drag.deltaY) * 1.15) {
        setDragOffset({ x: drag.deltaX, y: drag.deltaY })
      }
    }

    function finishPointer(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return

      dragRef.current = null
      setDragOffset({ x: 0, y: 0 })
      suppressClickRef.current = drag.moved
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 300)

      if (drag.moved && Math.abs(drag.deltaX) >= SWIPE_THRESHOLD && Math.abs(drag.deltaX) > Math.abs(drag.deltaY)) {
        setActiveCard(drag.cardIndex + (drag.deltaX < 0 ? 1 : -1))
      }
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", finishPointer)
    window.addEventListener("pointercancel", finishPointer)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", finishPointer)
      window.removeEventListener("pointercancel", finishPointer)
    }
  }, [setActiveCard])

  function startPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    const target = event.target
    if (!(target instanceof Element) || target.closest("[data-carousel-control]")) return
    const card = target.closest<HTMLElement>("[data-carousel-card]")
    if (!card) return
    const cardIndex = Number(card.dataset.cardIndex)
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= items.length) return

    suppressClickRef.current = false
    if (cardIndex !== activeIndexRef.current) setActiveCard(cardIndex)
    dragRef.current = {
      pointerId: event.pointerId,
      cardIndex,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      deltaY: 0,
      moved: false,
    }
  }

  function handleCardClick(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (!suppressClickRef.current) return
    event.preventDefault()
    suppressClickRef.current = false
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (items.length < 2) return
    if (event.key === "ArrowRight") {
      event.preventDefault()
      setActiveCard(activeIndex + 1)
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      setActiveCard(activeIndex - 1)
    }
  }

  if (items.length === 0) {
    return (
      <div className="relative flex min-h-[22.5rem] items-center justify-center overflow-hidden rounded-[2rem] border border-border/70 bg-card p-7 text-center shadow-2xl shadow-primary/10 sm:min-h-[27.5rem]">
        {featuredImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={featuredImageUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl" />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background/75 to-background" />
        <div className="relative max-w-xs rounded-[1.75rem] border border-border/70 bg-background/80 p-7 shadow-xl backdrop-blur-xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
            <span className="font-serif text-3xl">Au</span>
          </div>
          <Sparkles aria-hidden="true" className="mx-auto mt-4 h-5 w-5 text-primary" />
          <p className="mt-3 font-serif text-xl">Украшения скоро появятся</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Открытые магазины добавят изделия в каталог — они появятся здесь.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-visible rounded-[2rem] p-1">
      {featuredImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={featuredImageUrl} alt="" aria-hidden="true" className="pointer-events-none absolute -inset-4 h-[calc(100%+2rem)] w-[calc(100%+2rem)] scale-110 rounded-[2.5rem] object-cover opacity-20 blur-2xl" />
      )}
      <div aria-hidden="true" className="pointer-events-none absolute -inset-3 rounded-[2.5rem] bg-gradient-to-br from-primary/10 via-muted/30 to-background blur-xl" />

      <div
        role="region"
        aria-label="Карусель ювелирных изделий"
        tabIndex={0}
        onPointerDown={startPointer}
        onKeyDown={handleKeyDown}
        className="relative mx-auto h-[22.5rem] w-full max-w-[470px] select-none touch-pan-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-[27.5rem]"
        style={{ perspective: "1200px" }}
      >
        {items.map((product, index) => {
          const depth = (index - activeIndex + items.length) % items.length
          const layer = STACK_LAYERS[Math.min(depth, STACK_LAYERS.length - 1)]
          const nextLayer = STACK_LAYERS[Math.max(depth - 1, 0)]
          const dragProgress = Math.min(Math.abs(dragOffset.x) / 160, 1)
          const rotation = depth === 0
            ? layer.rotate + dragOffset.x * 0.045
            : layer.rotate + (nextLayer.rotate - layer.rotate) * dragProgress
          const translateX = depth === 0
            ? layer.translateX + dragOffset.x
            : layer.translateX + (nextLayer.translateX - layer.translateX) * dragProgress
          const translateY = depth === 0
            ? layer.translateY + dragOffset.y * 0.25
            : layer.translateY + (nextLayer.translateY - layer.translateY) * dragProgress
          const scale = depth === 0
            ? layer.scale
            : layer.scale + (nextLayer.scale - layer.scale) * dragProgress
          const opacity = depth === 0
            ? layer.opacity
            : layer.opacity + (nextLayer.opacity - layer.opacity) * dragProgress
          const chosenPhoto = product.id === featuredProductId ? product.images?.[featuredPhotoIndex] : null
          const image = chosenPhoto?.trim() || product.images?.find((photo) => photo.trim()) || product.image_url
          const itemTitle = product.category?.trim() || product.name
          const article = product.id
          const href = "/store/" + encodeURIComponent(product.shop_id) + "/product/" + encodeURIComponent(article)

          return (
            <Link
              key={product.id}
              href={href}
              data-carousel-card="true"
              data-card-index={index}
              aria-label={"Открыть «" + product.name + "» в магазине " + (product.shop_name ?? "Ювелирный магазин")}
              onClick={handleCardClick}
              className="group absolute bottom-6 left-4 right-4 top-3 block rounded-[30px] bg-card p-2 shadow-[0_20px_45px_-12px_rgba(24,28,56,0.16),0_6px_16px_-4px_rgba(24,28,56,0.08)] outline-none ring-primary/50 transition-[transform,opacity,box-shadow] duration-500 focus-visible:ring-2"
              style={{
                transform: "translate3d(" + translateX + "px, " + translateY + "px, 0) rotate(" + rotation + "deg) scale(" + scale + ")",
                opacity,
                zIndex: layer.zIndex,
                touchAction: "pan-y",
                pointerEvents: depth >= 4 ? "none" : "auto",
              }}
            >
              <div className="relative h-full w-full overflow-hidden rounded-[23px] bg-muted">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt={product.name}
                    loading={depth < 2 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    className="absolute inset-0 h-full w-full select-none object-cover transition-transform duration-700 group-hover:scale-[1.035]"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(145deg,#e9dfca,#c6b397_52%,#71614c)] text-white">
                    <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/50 bg-white/15 shadow-xl backdrop-blur-sm">
                      <Sparkles aria-hidden="true" className="h-12 w-12" />
                    </div>
                  </div>
                )}
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/10" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-start p-5 pb-12 sm:p-7 sm:pb-14">
                  <span className="mb-2 inline-block max-w-[90%] truncate rounded-full border border-white/20 bg-black/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-white/95 backdrop-blur-md sm:text-[11px]">
                    {product.shop_name ?? "Ювелирный магазин"}
                  </span>
                  <h2 className="line-clamp-1 font-serif text-[28px] font-medium leading-tight tracking-tight text-white drop-shadow-sm sm:text-[34px]">
                    {itemTitle}
                  </h2>
                  <p className="mt-1 line-clamp-1 max-w-full text-sm text-white/80">{product.name}</p>
                  <div className="mt-1 flex max-w-full items-center gap-2 text-xs text-white/75">
                    {product.metal && <span className="truncate">{product.metal}</span>}
                    {product.metal && product.weight > 0 && <span aria-hidden="true">·</span>}
                    {product.weight > 0 && <span className="truncate">{formatWeight(product.weight)}</span>}
                    {(product.metal || product.weight > 0) && <span aria-hidden="true">·</span>}
                    <span className="shrink-0 font-mono font-semibold text-white">{formatSom(product.sale_price)}</span>
                  </div>
                </div>
              </div>
              <div className="pointer-events-none absolute -bottom-3 -left-3 z-40 rounded-[18px] border border-border/70 bg-card/95 px-4 py-2.5 shadow-[0_14px_32px_-6px_rgba(24,28,56,0.14),0_4px_10px_-2px_rgba(24,28,56,0.06)] backdrop-blur transition-[transform,opacity] duration-500 sm:px-5 sm:py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Ассортимент</p>
                <p className="mt-0.5 text-sm font-bold tracking-tight text-card-foreground">{items.length} изделий в подборке</p>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="relative z-20 mt-4 flex items-center justify-center gap-4">
        <button
          type="button"
          data-carousel-control="true"
          aria-label="Предыдущее изделие"
          onClick={() => setActiveCard(activeIndex - 1)}
          disabled={items.length < 2}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-primary active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2" role="group" aria-label="Выбрать изделие">
          {items.map((product, index) => (
            <button
              key={product.id}
              type="button"
              data-carousel-control="true"
              aria-label={"Показать изделие " + (index + 1) + " из " + items.length}
              aria-pressed={activeIndex === index}
              onClick={() => setActiveCard(index)}
              className={"h-2 rounded-full transition-all duration-300 " + (index === activeIndex ? "w-[22px] bg-primary" : "w-[7px] bg-border hover:bg-primary/50")}
            />
          ))}
        </div>
        <button
          type="button"
          data-carousel-control="true"
          aria-label="Следующее изделие"
          onClick={() => setActiveCard(activeIndex + 1)}
          disabled={items.length < 2}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-primary active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {items.length > 1 && (
        <p className="relative z-20 mt-2.5 flex items-center justify-center gap-1.5 text-[11px] tracking-wide text-muted-foreground opacity-75">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
          Смахните карточку влево или вправо
        </p>
      )}
    </div>
  )
}
