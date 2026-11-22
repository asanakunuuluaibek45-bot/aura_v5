"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react"
import type { PublicProduct } from "@/app/actions/store"
import { formatSom, formatWeight } from "@/lib/format"

const CARD_ROTATIONS = [-6, 6, -8, 8, -5.5, 7]

type HeroProductCarouselProps = {
  products: PublicProduct[]
  featuredImageUrl: string | null
}

export function HeroProductCarousel({ products, featuredImageUrl }: HeroProductCarouselProps) {
  const items = products.slice(0, 8)
  const trackRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  function scrollToIndex(index: number) {
    const card = trackRef.current?.children.item(index)
    if (!(card instanceof HTMLElement)) return

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    card.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    })
  }

  function updateActiveIndex() {
    const track = trackRef.current
    if (!track) return

    const center = track.getBoundingClientRect().left + track.clientWidth / 2
    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY

    Array.from(track.children).forEach((card, index) => {
      const rect = card.getBoundingClientRect()
      const distance = Math.abs(rect.left + rect.width / 2 - center)
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })

    setActiveIndex((current) => (current === closestIndex ? current : closestIndex))
  }

  if (items.length === 0) {
    return (
      <div className="relative flex min-h-[20rem] items-center justify-center overflow-hidden rounded-[2rem] border border-border/70 bg-card p-7 text-center shadow-2xl shadow-primary/10 sm:min-h-[24rem]">
        {featuredImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={featuredImageUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl" />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background/75 to-background" />
        <div className="relative max-w-xs rounded-[1.75rem] border border-border/70 bg-background/75 p-7 shadow-xl backdrop-blur-xl">
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
    <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-2 shadow-2xl shadow-primary/10">
      {featuredImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={featuredImageUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl" />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background/75 to-background" />

      <div className="relative flex items-center justify-between gap-3 px-3 pb-1 pt-3 sm:px-4 sm:pt-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Украшения в наличии</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">Реальные изделия из каталогов магазинов</p>
        </div>
        {items.length > 1 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="Предыдущие изделия"
              onClick={() => scrollToIndex(Math.max(0, activeIndex - 1))}
              disabled={activeIndex === 0}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/80 text-foreground shadow-sm transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Следующие изделия"
              onClick={() => scrollToIndex(Math.min(items.length - 1, activeIndex + 1))}
              disabled={activeIndex === items.length - 1}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/80 text-foreground shadow-sm transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        role="region"
        aria-label="Карусель изделий — листайте по горизонтали"
        tabIndex={0}
        onScroll={updateActiveIndex}
        className="no-scrollbar relative flex h-[22rem] items-center overflow-x-auto overscroll-x-contain pb-5 pt-2 touch-pan-x snap-x snap-mandatory sm:h-[25rem]"
        style={{ scrollPaddingInline: "calc((100% - min(70%, 18rem)) / 2)" }}
      >
        {items.map((product, index) => {
          const image = product.images?.find(Boolean) ?? product.image_url
          const rotation = CARD_ROTATIONS[index % CARD_ROTATIONS.length]

          return (
            <Link
              key={product.id}
              href="#products"
              aria-label={"Открыть каталог: " + product.name}
              className="relative -ml-10 block shrink-0 snap-center first:ml-0"
              style={{ flex: "0 0 min(70%, 18rem)", zIndex: items.length - index }}
            >
              <article
                className="relative aspect-[4/5] overflow-hidden rounded-[1.65rem] border-[5px] border-white/90 bg-muted shadow-[0_20px_50px_-20px_rgba(20,14,47,0.55)] ring-1 ring-black/5 transition-[filter] duration-300 hover:brightness-105 dark:border-white/70"
                style={{ transform: "rotate(" + rotation + "deg) translateY(" + (index % 2 === 0 ? "-6px" : "8px") + ")" }}
              >
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt={product.name}
                    loading={index < 2 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    className="absolute inset-0 h-full w-full select-none object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(145deg,#e9dfca,#c6b397_52%,#71614c)] text-white">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/50 bg-white/15 shadow-xl backdrop-blur-sm">
                      <span className="font-serif text-4xl">Au</span>
                    </div>
                  </div>
                )}
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/10" />
                <span className="absolute left-3 top-3 max-w-[75%] truncate rounded-full border border-white/30 bg-black/25 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white backdrop-blur-md">
                  {product.shop_name ?? "Ювелирный магазин"}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
                  <p className="line-clamp-2 font-serif text-lg leading-tight sm:text-xl">{product.name}</p>
                  <p className="mt-1 truncate text-xs text-white/75">
                    {[product.metal, product.weight ? formatWeight(product.weight) : null].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-3 font-mono text-base font-semibold tracking-tight sm:text-lg">{formatSom(product.sale_price)}</p>
                </div>
              </article>
            </Link>
          )
        })}
      </div>

      {items.length > 1 && (
        <div className="relative flex justify-center gap-1.5 pb-3 pt-0.5" aria-label="Положение карусели">
          {items.map((product, index) => (
            <button
              key={product.id}
              type="button"
              aria-label={"Показать изделие " + (index + 1) + " из " + items.length}
              aria-pressed={activeIndex === index}
              onClick={() => scrollToIndex(index)}
              className={"h-1.5 rounded-full transition-all " + (activeIndex === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/35 hover:bg-muted-foreground/60")}
            />
          ))}
        </div>
      )}
    </div>
  )
}
