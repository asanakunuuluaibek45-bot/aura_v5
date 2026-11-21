import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicMarketplaceProducts, getPublicShopProducts } from "@/app/actions/store"
import { isPublicShopEnabled } from "@/app/actions/shops"
import { PublicProductGrid } from "@/components/public/marketplace/product-grid"
import { AuraMark } from "@/components/shared/brand/aura-mark"
import { ThemeToggle } from "@/components/shared/theme-toggle"

type Params = { store_id: string }

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { store_id } = await params
  if (!(await isPublicShopEnabled(store_id))) {
    return { title: "Витрина не найдена", robots: { index: false, follow: false } }
  }
  const products = await getPublicShopProducts(store_id, 1)
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
  const { store_id } = await params
  if (!(await isPublicShopEnabled(store_id))) notFound()
  const productPage = await getPublicMarketplaceProducts(store_id, 24)
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

      <section className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="font-serif text-3xl">{shop}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Изделия в наличии</p>
        <div className="mt-8">
          <PublicProductGrid
            key={store_id}
            shopId={store_id}
            initialPage={productPage}
            title="Каталог магазина"
            searchPlaceholder="Название, артикул или металл"
          />
        </div>
      </section>
    </main>
  )
}