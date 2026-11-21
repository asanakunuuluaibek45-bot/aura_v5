import Link from "next/link"
import type { Metadata } from "next"
import { getPublicShops } from "@/app/actions/shops"
import { getPublicMarketplaceProducts } from "@/app/actions/store"
import { GoldUchetLogo } from "@/components/brand/golduchet-logo"
import { PublicProductGrid } from "@/components/public-marketplace/product-grid"
import { Button } from "@/components/ui/button"
import { ArrowRight, Store } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

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
  const [shops, productPage] = await Promise.all([
    getPublicShops(),
    getPublicMarketplaceProducts(null, 24),
  ])

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <GoldUchetLogo className="block w-24 max-w-full sm:w-28" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline" size="sm" className="hidden bg-transparent sm:inline-flex">
            <Link href="/for-shops">Для магазинов</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/auth/login">Войти</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
          Украшения из открытых витрин магазинов
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
          Смотрите товары и цены в магазинах GOLDUCHET. Каталог и карточки изделий доступны без регистрации.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link href="#products">
              Смотреть товары
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="bg-transparent">
            <Link href="#shops">Найти магазин</Link>
          </Button>
        </div>
      </section>

      <section id="products" className="mx-auto max-w-6xl scroll-mt-6 px-5 pb-16">
        <PublicProductGrid initialPage={productPage} title="Товары в наличии" />
      </section>

      <section id="shops" className="mx-auto max-w-6xl scroll-mt-6 px-5 pb-16">
        <h2 className="font-serif text-2xl">Магазины</h2>
        <p className="mt-1 text-sm text-muted-foreground">Публичные витрины участников GOLDUCHET</p>

        {shops.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Пока нет открытых витрин. Зарегистрируйте магазин — и он появится здесь.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((s) => (
              <Link
                key={s.shop_id}
                href={`/store/${s.shop_id}`}
                className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-3 font-medium">{s.shop_name ?? "Ювелирный магазин"}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  Смотреть витрину
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Для владельцев и администраторов
          </p>
          <h2 className="mt-2 font-serif text-2xl sm:text-3xl">
            Управляйте магазином и откройте свою витрину
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Склад, касса, отчёты, сотрудники и публичный каталог — в одной системе для ювелирного магазина.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild className="gap-2">
              <Link href="/for-shops">
                Как работает GOLDUCHET
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="bg-transparent">
              <Link href="/auth/sign-up">Создать аккаунт магазина</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} GOLDUCHET · маркетплейс и система учёта</p>
        <nav aria-label="Юридическая информация" className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2">
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
