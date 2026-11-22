"use client"

import { useRef, useState, type FormEvent } from "react"
import { Check, Image as ImageIcon, LoaderCircle, RotateCcw, Search, Store } from "lucide-react"
import { updateMarketplaceSettings } from "@/app/actions/marketplace-admin"
import { getPublicMarketplacePage, type PublicMarketplaceSettings, type PublicProduct } from "@/app/actions/store"
import type { PublicShop } from "@/app/actions/shops"
import { formatSom } from "@/lib/format"
import { Button } from "@/components/shared/ui/button"
import { Switch } from "@/components/shared/ui/switch"

const PAGE_SIZES = [8, 12, 16, 24]

type ProductPhotoChoice = { url: string; index: number }

function productPhotoChoices(product: PublicProduct): ProductPhotoChoice[] {
  const images = (product.images ?? [])
    .map((url, index) => ({ url: url.trim(), index }))
    .filter((photo) => photo.url.length > 0)
  if (images.length > 0) return images
  return product.image_url?.trim() ? [{ url: product.image_url.trim(), index: 0 }] : []
}

function canFeatureProduct(product: PublicProduct): boolean {
  return product.status === "in_stock" && productPhotoChoices(product).length > 0
}

export function AdminMarketplaceSettings({
  initialSettings,
  shops,
  initialProducts,
}: {
  initialSettings: PublicMarketplaceSettings
  shops: PublicShop[]
  initialProducts: PublicProduct[]
}) {
  const [heroImageUrl, setHeroImageUrl] = useState(initialSettings.heroImageUrl ?? "")
  const [hideProductsWithoutPhoto, setHideProductsWithoutPhoto] = useState(
    initialSettings.hideProductsWithoutPhoto,
  )
  const initialSelectableProducts = initialProducts.filter(canFeatureProduct)
  const initialHeroProduct = initialSelectableProducts.find((product) => product.id === initialSettings.heroProductId) ?? null
  const initialHeroPhotos = initialHeroProduct ? productPhotoChoices(initialHeroProduct) : []
  const initialPhotoIndex = initialHeroPhotos.some((photo) => photo.index === initialSettings.heroPhotoIndex)
    ? initialSettings.heroPhotoIndex
    : initialHeroPhotos[0]?.index ?? 0
  const [heroShopId, setHeroShopId] = useState(initialSettings.heroShopId ?? "")
  const [heroProductId, setHeroProductId] = useState(initialHeroProduct?.id ?? "")
  const [heroPhotoIndex, setHeroPhotoIndex] = useState(initialPhotoIndex)
  const [products, setProducts] = useState(initialSelectableProducts)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [productLoadError, setProductLoadError] = useState("")
  const productRequestId = useRef(0)
  const [productSearch, setProductSearch] = useState("")
  const [productsPerPage, setProductsPerPage] = useState(initialSettings.productsPerPage)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const selectedHeroProduct = products.find((product) => product.id === heroProductId) ?? null
  const selectedHeroPhotos = selectedHeroProduct ? productPhotoChoices(selectedHeroProduct) : []

  async function handleStoreChange(nextShopId: string) {
    const requestId = ++productRequestId.current
    setHeroShopId(nextShopId)
    setHeroProductId("")
    setHeroPhotoIndex(0)
    setProductSearch("")
    setProductLoadError("")
    setProducts([])
    setLoadingProducts(Boolean(nextShopId))
    if (!nextShopId) return
    try {
      const page = await getPublicMarketplacePage(nextShopId, 1, 24, "", {}, false)
      if (requestId !== productRequestId.current) return
      setProducts(page.items.filter(canFeatureProduct))
    } catch {
      if (requestId === productRequestId.current) {
        setProductLoadError("Не удалось загрузить изделия этого магазина. Попробуйте выбрать магазин ещё раз.")
      }
    } finally {
      if (requestId === productRequestId.current) setLoadingProducts(false)
    }
  }

  async function handleSearchProducts() {
    if (!heroShopId) return
    const requestId = ++productRequestId.current
    setLoadingProducts(true)
    setProductLoadError("")
    try {
      const page = await getPublicMarketplacePage(heroShopId, 1, 24, productSearch.trim(), {}, false)
      if (requestId !== productRequestId.current) return
      const selected = products.find((product) => product.id === heroProductId)
      const matches = page.items.filter(canFeatureProduct)
      setProducts([...(selected ? [selected] : []), ...matches.filter((product) => product.id !== selected?.id)])
    } catch {
      if (requestId === productRequestId.current) {
        setProductLoadError("Не удалось найти изделия. Попробуйте изменить запрос.")
      }
    } finally {
      if (requestId === productRequestId.current) setLoadingProducts(false)
    }
  }

  function handleProductChange(productId: string) {
    setHeroProductId(productId)
    const product = products.find((item) => item.id === productId)
    setHeroPhotoIndex(product ? productPhotoChoices(product)[0]?.index ?? 0 : 0)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage("")
    setIsError(false)
    try {
      await updateMarketplaceSettings({
        heroImageUrl: heroImageUrl.trim() || null,
        heroShopId: heroShopId || null,
        heroProductId: heroProductId || null,
        heroPhotoIndex: heroProductId ? heroPhotoIndex : 0,
        hideProductsWithoutPhoto,
        productsPerPage,
      })
      setMessage("Настройки маркетплейса сохранены.")
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить настройки.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">GOLDUCHET · Платформа</p>
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Маркетплейс</h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Выберите магазин, реальное изделие и его фото для главной карусели. Настройки видимости и каталога можно задать здесь же.
        </p>
      </header>

      {!initialSettings.available && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          Настройки станут доступны после применения миграций 019–020 к базе данных.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold">Магазин, изделие и фото карточки</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Выберите открытый магазин, затем реальное изделие из его каталога. Его выбранное фото станет первой карточкой; остальные карточки возьмутся из того же магазина.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Магазин</span>
              <select
                value={heroShopId}
                onChange={(event) => void handleStoreChange(event.target.value)}
                disabled={!initialSettings.available || saving || loadingProducts}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Все открытые магазины</option>
                {heroShopId && !shops.some((shop) => shop.shop_id === heroShopId) && (
                  <option value={heroShopId}>Сохранённый магазин недоступен</option>
                )}
                {shops.map((shop) => (
                  <option key={shop.shop_id} value={shop.shop_id}>
                    {shop.shop_name?.trim() || "Ювелирный магазин"}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Изделие на первой карточке</span>
              <select
                value={heroProductId}
                onChange={(event) => handleProductChange(event.target.value)}
                disabled={!initialSettings.available || saving || !heroShopId || loadingProducts || products.length === 0}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Автоматический выбор из магазина</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {formatSom(product.sale_price)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="mb-1.5 block text-sm font-medium">Найти изделие по названию, категории или артикулу</span>
              <input
                type="search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void handleSearchProducts()
                  }
                }}
                disabled={!initialSettings.available || saving || !heroShopId || loadingProducts}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Название, артикул или категория"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => void handleSearchProducts()}
              disabled={!initialSettings.available || saving || !heroShopId || loadingProducts}
            >
              <Search className="mr-2 h-4 w-4" aria-hidden="true" />
              Найти
            </Button>
          </div>
          {loadingProducts && <p role="status" className="mt-3 text-sm text-muted-foreground">Загружаю реальные изделия магазина…</p>}
          {productLoadError && <p role="alert" className="mt-3 text-sm text-destructive">{productLoadError}</p>}
          {heroShopId && !loadingProducts && products.length === 0 && !productLoadError && (
            <p className="mt-3 text-sm text-muted-foreground">В этом магазине пока нет изделий в наличии с фотографиями.</p>
          )}

          {selectedHeroProduct && selectedHeroPhotos.length > 0 && (
            <fieldset className="mt-5" disabled={!initialSettings.available || saving}>
              <legend className="mb-2 block text-sm font-medium">Фото для первой карточки</legend>
              <div className="flex flex-wrap gap-3">
                {selectedHeroPhotos.map((photo, index) => (
                  <button
                    key={photo.index}
                    type="button"
                    aria-pressed={heroPhotoIndex === photo.index}
                    onClick={() => setHeroPhotoIndex(photo.index)}
                    className={"group w-[5.5rem] rounded-xl border p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " + (heroPhotoIndex === photo.index ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-primary/40")}
                  >
                    <span className="block aspect-square overflow-hidden rounded-lg bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={"Фото " + (index + 1) + " изделия " + selectedHeroProduct.name} loading="lazy" className="h-full w-full object-cover" />
                    </span>
                    <span className="mt-1.5 block text-center text-xs font-medium">Фото {index + 1}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {!heroShopId && <p className="mt-3 text-xs text-muted-foreground">Без выбора магазина карусель покажет реальные изделия из всех открытых витрин.</p>}
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold">Фоновое фото карусели</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Это фото отображается мягким размытым фоном за карточками товаров в верхнем блоке главной страницы.
              </p>
            </div>
          </div>
          <label className="mt-5 block">
            <span className="mb-1.5 block text-sm font-medium">HTTPS-ссылка на изображение</span>
            <input
              type="url"
              value={heroImageUrl}
              onChange={(event) => setHeroImageUrl(event.target.value)}
              maxLength={2048}
              placeholder="https://…"
              disabled={!initialSettings.available || saving}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          {heroImageUrl.trim() ? (
            <div className="mt-4 flex items-start gap-4">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={heroImageUrl} alt="Предпросмотр фонового фото" className="h-full w-full object-cover" />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={!initialSettings.available || saving}
                onClick={() => setHeroImageUrl("")}
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Убрать фоновое фото
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Сейчас используется фирменный градиент.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-5">
            <div className="min-w-0">
              <h2 className="font-semibold">Карточки без фото</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Не показывать покупателям товары, у которых нет ни одного изображения.
              </p>
            </div>
            <Switch
              checked={hideProductsWithoutPhoto}
              onCheckedChange={setHideProductsWithoutPhoto}
              disabled={!initialSettings.available || saving}
              aria-label="Скрывать карточки товаров без фотографии"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <label className="block max-w-sm">
            <span className="block font-semibold">Карточек на странице</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Покупатели будут переходить между страницами каталога, а не прокручивать бесконечную ленту.
            </span>
            <select
              value={productsPerPage}
              onChange={(event) => setProductsPerPage(Number(event.target.value))}
              disabled={!initialSettings.available || saving}
              className="mt-4 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size} карточек</option>
              ))}
            </select>
          </label>
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" className="min-w-36 rounded-full" disabled={!initialSettings.available || saving || loadingProducts}>
            {saving ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Сохранить
          </Button>
          {message && (
            <p role={isError ? "alert" : "status"} className={isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {message}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
