"use server"

import { revalidatePath } from "next/cache"
import { requireSuperAdminContext } from "@/lib/supabase/request-context"

const ALLOWED_PAGE_SIZES = new Set([8, 12, 16, 24])

export async function updateMarketplaceSettings(input: {
  heroImageUrl: string | null
  hideProductsWithoutPhoto: boolean
  productsPerPage: number
}): Promise<void> {
  const { supabase } = await requireSuperAdminContext()
  if (!input || typeof input !== "object") throw new Error("Некорректные настройки маркетплейса")
  if (input.heroImageUrl !== null && typeof input.heroImageUrl !== "string") {
    throw new Error("Некорректная ссылка на главное фото")
  }
  if (typeof input.hideProductsWithoutPhoto !== "boolean") {
    throw new Error("Укажите, скрывать ли товары без фотографий")
  }
  if (!Number.isInteger(input.productsPerPage) || !ALLOWED_PAGE_SIZES.has(input.productsPerPage)) {
    throw new Error("Выберите допустимое количество карточек на странице")
  }

  const heroImageUrl = typeof input.heroImageUrl === "string" ? input.heroImageUrl.trim() : ""
  if (heroImageUrl.length > 2048) throw new Error("Ссылка на фото слишком длинная")
  if (heroImageUrl) {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(heroImageUrl)
    } catch {
      throw new Error("Введите корректную ссылку на фотографию")
    }
    if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
      throw new Error("Для главного фото используется только безопасная HTTPS-ссылка")
    }
  }

  const { error } = await supabase.rpc("superadmin_update_marketplace_settings", {
    _hero_image_url: heroImageUrl || null,
    _hide_products_without_photo: input.hideProductsWithoutPhoto,
    _products_per_page: input.productsPerPage,
  })
  if (error) {
    if (["PGRST202", "42883"].includes(error.code ?? "")) {
      throw new Error("Сначала примените миграцию 019 для настроек маркетплейса")
    }
    throw new Error(`Не удалось сохранить настройки: ${error.message}`)
  }

  revalidatePath("/")
  revalidatePath("/store/[store_id]", "page")
  revalidatePath("/admin/marketplace")
}
