import Link from "next/link"
import type { Metadata } from "next"
import { getPublicShops } from "@/app/actions/shops"
import { getPublicMarketplaceFacets, getPublicMarketplaceProducts } from "@/app/actions/store"
import { GoldUchetLogo } from "@/components/shared/brand/golduchet-logo"
import { PublicProductGrid } from "@/components/public/marketplace/product-grid"
import { ShopDirectory } from "@/components/public/marketplace/shop-directory"
import { Button } from "@/components/shared/ui/button"
import { ArrowRight, ArrowDown, Sparkles } from "lucide-react"
import { ThemeToggle } from "@/components/shared/theme-toggle"

export const revalidate = 300

export const metadata: Metadata = {
  title: "GOLDUCHET — маркетплейс ювелирных магазинов и CRM",
  description:
    "GOLDUCHET объединяет витрины ювелирных магазинов и CRM для учёта: склад, касса, этикетки и бонусы продавцов.",
  openGraph: {
    title: "GOLDUCHET — маркетплейс ювелирных магазинов и CRM",
    description: "Витрины ювелирных магазинов и CRM для учёта: склад, касса, этикетки, бонусы.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
}

export default async function LandingPage() {
  const [shops, productPage, facets] = await Promise.all([
    getPublicShops(),
    getPublicMarketplaceProducts(null, 24),
    getPublicMarketplaceFacets(),
  ])
  const heroProduct = productPage.items[0]
  const heroImage = heroProduct?.images?.[0] ?? heroProduct?.image_url

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4">
          <GoldUchetLogo className="block w-24 max-w-full sm:w-28" />
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground md:block">
            Ювелирный маркетплейс
          </span>
          <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline" size="sm" className="hidden rounded-full bg-transparent sm:inline-flex">
            <Link href="/for-shops">Для магазинов</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link href="/auth/login">Войти</Link>
          </Button>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden border-b border-border/60">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-muted/30 to-background" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              GOLDUCHET · маркетплейс
            </div>
            <h1 className="mt-6 font-serif text-4xl leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Найдите украшение, которое <span className="text-primary">останется с вами</span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              Открытые каталоги ювелирных магазинов: реальные изделия, цены и наличие. Выбирайте магазин или сразу ищите по всему каталогу.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2 rounded-full px-6">
                <Link href="#products">
                  Смотреть каталог <ArrowDown aria-hidden="true" className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full bg-background/70 px-6">
                <Link href="#shops">Выбрать магазин</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/70 pt-5 text-xs text-muted-foreground">
              <span><strong className="mr-1.5 text-foreground">{shops.length}</strong> открытых магазинов</span>
              <span>Каталог доступен без регистрации</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[34rem]">
            <div aria-hidden="true" className="absolute -inset-4 rounded-[2.5rem] bg-primary/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-2 shadow-2xl shadow-primary/10">
              <div className="relative aspect-[5/4] overflow-hidden rounded-[1.5rem] bg-[linear-gradient(145deg,#e9dfca,#c6b397_52%,#71614c)]">
                {heroImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={heroImage} alt={heroProduct?.name ?? "Украшение из каталога"} className="h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-44 w-44 items-center justify-center rounded-full border border-white/60 bg-white/15 text-white shadow-xl backdrop-blur-sm">
                      <span className="font-serif text-6xl">Au</span>
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
                  <span className="inline-flex rounded-full border border-white/30 bg-black/20 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] backdrop-blur">
                    {heroProduct ? "Из открытой витрины" : "Украшения местных магазинов"}
                  </span>
                  <p className="mt-3 font-serif text-2xl sm:text-3xl">
                    {heroProduct?.name ?? "Выберите свою историю"}
                  </p>
                  <p className="mt-1 text-sm text-white/80">
                    {heroProduct?.shop_name ?? "Каталоги магазинов GOLDUCHET"}
                  </p>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -left-3 rounded-2xl border border-border/70 bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:-left-8">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ассортимент</p>
              <p className="mt-0.5 text-sm font-semibold">{productPage.items.length} изделий в подборке</p>
            </div>
          </div>
        </div>
      </section>

      <section id="products" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-14 sm:px-8 sm:py-16">
        <PublicProductGrid initialPage={productPage} facets={facets} title="Украшения в наличии" />
      </section>

      <section id="shops" className="scroll-mt-20 border-y border-border/60 bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
          <ShopDirectory shops={shops} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="overflow-hidden rounded-[2rem] border border-primary/20 bg-primary/5 p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Для владельцев и администраторов
          </p>
          <h2 className="mt-2 font-serif text-2xl sm:text-3xl">
            Управляйте магазином и откройте свою витрину
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Склад, касса, отчёты, сотрудники и публичный каталог — в одной системе для ювелирного магазина.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="gap-2 rounded-full px-5">
              <Link href="/for-shops">
                Как работает GOLDUCHET
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full bg-transparent px-5">
              <Link href="/auth/sign-up">Создать аккаунт магазина</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-muted/20 px-5 py-8 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} GOLDUCHET · маркетплейс и система учёта</p>
        <nav aria-label="Юридическая информация" className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link href="/for-shops" className="underline underline-offset-4 hover:text-foreground">
            Для магазинов
          </Link>
          <Link href="/crm" className="underline underline-offset-4 hover:text-foreground">
            Войти в CRM
          </Link>
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Конфиденциальность
          </Link>
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Условия использования
          </Link>
          <a href="mailto:asanakunuuluaibek45@gmail.com" className="underline underline-offset-4 hover:text-foreground">
            Связаться
          </a>
        </nav>
      </footer>
    </main>
  )
}
