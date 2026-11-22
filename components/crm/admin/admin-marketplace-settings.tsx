"use client"

import { useState, type FormEvent } from "react"
import { Check, Image as ImageIcon, LoaderCircle, RotateCcw } from "lucide-react"
import { updateMarketplaceSettings } from "@/app/actions/marketplace-admin"
import type { PublicMarketplaceSettings } from "@/app/actions/store"
import { Button } from "@/components/shared/ui/button"
import { Switch } from "@/components/shared/ui/switch"

const PAGE_SIZES = [8, 12, 16, 24]

export function AdminMarketplaceSettings({
  initialSettings,
}: {
  initialSettings: PublicMarketplaceSettings
}) {
  const [heroImageUrl, setHeroImageUrl] = useState(initialSettings.heroImageUrl ?? "")
  const [hideProductsWithoutPhoto, setHideProductsWithoutPhoto] = useState(
    initialSettings.hideProductsWithoutPhoto,
  )
  const [productsPerPage, setProductsPerPage] = useState(initialSettings.productsPerPage)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage("")
    setIsError(false)
    try {
      await updateMarketplaceSettings({
        heroImageUrl: heroImageUrl.trim() || null,
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
          Настройте фоновое фото карусели, видимость карточек и размер страницы каталога.
        </p>
      </header>

      {!initialSettings.available && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          Настройки станут доступны после применения миграции 019 к базе данных.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
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
          <Button type="submit" className="min-w-36 rounded-full" disabled={!initialSettings.available || saving}>
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
