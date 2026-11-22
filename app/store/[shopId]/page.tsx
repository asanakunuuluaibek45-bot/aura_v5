import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  getPublicMarketplaceFacets,
  getPublicMarketplacePage,
  getPublicMarketplaceSettings,
  getPublicShopProducts,
} from "@/app/actions/store"
import { isPublicShopEnabled } from "@/app/actions/shops"
import { PublicProductGrid } from "@/components/public/marketplace/product-grid"
import { AuraMark } from "@/components/shared/brand/aura-mark"
import { ThemeToggle } from "@/components/shared/theme-toggle"

type Params = { shopId: string }

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { shopId } = await params
  if (!(await isPublicShopEnabled(shopId))) {
    return { title: "Витрина не найдена", robots: { index: false, follow: false } }
  }
  const products = await getPublicShopProducts(shopId, 1)
  const shop = products[0]?.shop_name ?? "Ювелирный магазин"
  const title = `${shop} — витрина на GOLDUCHET`
  const description = `Изделия магазина ${shop}: золото, серебро, вес, проба и цены.`
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  }
}

export default async function StorePage({ params }: { params: Promise<Params> }) {
  const { shopId } = await params
  if (!(await isPublicShopEnabled(shopId))) notFound()
  const settings = await getPublicMarketplaceSettings()
  const [productPage, facets] = await Promise.all([
    getPublicMarketplacePage(
      shopId,
      1,
      settings.productsPerPage,
      "",
      {},
      settings.hideProductsWithoutPhoto,
    ),
    getPublicMarketplaceFacets(shopId, settings.hideProductsWithoutPhoto),
  ])
  const shop = productPage.items[0]?.shop_name ?? "Ювелирный магазин"

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <Link href="/" className="flex items-center gap-2">
          <AuraMark className="h-7 w-7" />
          <span className="font-serif text-lg">GOLDUCHET</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="max-w-[45vw] truncate text-sm text-muted-foreground">{shop}</span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="rounded-[2rem] border border-border/70 bg-gradient-to-br from-primary/10 via-muted/30 to-background px-6 py-8 sm:px-10 sm:py-10">
          <Link href="/" className="text-xs font-medium text-muted-foreground transition hover:text-primary">
            ← Все магазины
          </Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Открытая витрина</p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl">{shop}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Выберите категорию и металл, укажите бюджет или найдите изделие по названию и артикулу.
          </p>
        </div>
        <div className="mt-10">
          <PublicProductGrid
            key={shopId}
            shopId={shopId}
            initialPage={productPage}
            facets={facets}
            pageSize={settings.productsPerPage}
            hideProductsWithoutPhoto={settings.hideProductsWithoutPhoto}
            title="Каталог магазина"
            searchPlaceholder="Название, артикул или металл"
          />
        </div>
      </section>
    </main>
  )
}