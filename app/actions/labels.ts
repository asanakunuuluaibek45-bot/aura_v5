"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

const DEFAULT_CATEGORY = "Прочее"
const GLOBAL_SCOPE = "global"

async function getContext() {
  const supabase = await createClient()

  // 1. Быстрая проверка сессии из кук (без лишнего сетевого RTT к GoTrue Auth API)
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user
  if (!user) throw new Error("Сессия истекла. Войдите в систему заново")

  // 2. Селективный запрос профиля
  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id, role, status")
    .eq("id", user.id)
    .single()

  if (!profile || profile.status !== "approved") {
    throw new Error("Аккаунт не подтверждён")
  }

  // Super Admin label templates intentionally remain in the shared global scope.
  const shopId = profile.role === "super_admin" ? null : profile.shop_id

  return { supabase, user, profile, shopId }
}

function normalizeKey(category: string, sizeKey?: string) {
  return {
    category: category?.trim() || DEFAULT_CATEGORY,
    sizeKey: sizeKey?.trim() || "default",
  }
}

function normalizeCategories(categories: string | string[]) {
  const values = Array.isArray(categories) ? categories : [categories]
  return [...new Set(values
    .filter((category): category is string => typeof category === "string")
    .map((category) => category.trim() || DEFAULT_CATEGORY))]
}

export async function saveLabelTemplate(
  categories: string | string[],
  templateJson: string,
  sizeKey?: string,
  scope: "category" | "shop" = "category",
): Promise<void> {
  const { supabase, user, profile, shopId } = await getContext()
  const normalizedCategories = normalizeCategories(categories)
  const normalizedSize = sizeKey?.trim() || "default"
  const isGlobal = profile.role === "super_admin" && !shopId

  if (normalizedCategories.length === 0) throw new Error("Не выбрана категория")
  if (!shopId && !isGlobal) throw new Error("Магазин не выбран")
  if (scope === "shop" && !shopId) throw new Error("Для сохранения по магазину выберите магазин")
  if (normalizedCategories.length > 200) throw new Error("Слишком много категорий для одного шаблона")
  if (isGlobal && normalizedCategories.length > 1) {
    throw new Error("Для применения ко всем категориям сначала выберите магазин")
  }

  const { error } = await supabase
    .from("label_templates")
    .upsert(
      normalizedCategories.map((normalizedCategory) => ({
        shop_id: isGlobal ? null : shopId,
        scope_key: isGlobal ? GLOBAL_SCOPE : shopId,
        category: normalizedCategory,
        size_key: normalizedSize,
        template_json: templateJson,
        created_by: user.id,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "scope_key,category,size_key" },
    )

  if (error) throw new Error(`Не удалось сохранить шаблон этикетки: ${error.message}`)

  // Оптимизация: Инвалидируем только конкретную страницу, а не весь лейаут /crm
  revalidatePath("/crm/inventory", "page")
}

export async function getLabelTemplate(
  category: string,
  sizeKey?: string,
  source: "effective" | "shop" | "global" = "effective",
): Promise<string | null> {
  const { supabase, shopId } = await getContext()
  const { category: normalizedCategory, sizeKey: normalizedSize } = normalizeKey(category, sizeKey)

  if (source === "global") {
    const { data, error } = await supabase
      .from("label_templates")
      .select("template_json")
      .eq("scope_key", GLOBAL_SCOPE)
      .eq("category", normalizedCategory)
      .eq("size_key", normalizedSize)
      .maybeSingle()
    if (error) throw new Error(`Не удалось загрузить глобальный шаблон: ${error.message}`)
    return data?.template_json ?? null
  }

  if (source === "shop") {
    if (!shopId) return null
    const { data, error } = await supabase
      .from("label_templates")
      .select("template_json")
      .eq("scope_key", shopId)
      .eq("category", normalizedCategory)
      .eq("size_key", normalizedSize)
      .maybeSingle()
    if (error) throw new Error(`Не удалось загрузить шаблон магазина: ${error.message}`)
    return data?.template_json ?? null
  }

  // Оптимизация: Запрашиваем локальный и глобальный шаблон параллельно в один round-trip
  if (shopId) {
    const [shopRes, globalRes] = await Promise.all([
      supabase
        .from("label_templates")
        .select("template_json")
        .eq("scope_key", shopId)
        .eq("category", normalizedCategory)
        .eq("size_key", normalizedSize)
        .maybeSingle(),
      supabase
        .from("label_templates")
        .select("template_json")
        .eq("scope_key", GLOBAL_SCOPE)
        .eq("category", normalizedCategory)
        .eq("size_key", normalizedSize)
        .maybeSingle(),
    ])

    if (shopRes.error) throw new Error(`Не удалось загрузить шаблон этикетки: ${shopRes.error.message}`)
    if (shopRes.data?.template_json) return shopRes.data.template_json

    if (globalRes.error) throw new Error(`Не удалось загрузить шаблон по умолчанию: ${globalRes.error.message}`)
    return globalRes.data?.template_json ?? null
  }

  // Если shopId нет (только глобальный контекст)
  const { data: globalTemplate, error: globalError } = await supabase
    .from("label_templates")
    .select("template_json")
    .eq("scope_key", GLOBAL_SCOPE)
    .eq("category", normalizedCategory)
    .eq("size_key", normalizedSize)
    .maybeSingle()

  if (globalError) throw new Error(`Не удалось загрузить шаблон по умолчанию: ${globalError.message}`)
  return globalTemplate?.template_json ?? null
}

/**
 * Restores templates only inside the authenticated user's active shop.
 * "shop" source reloads the last server-saved shop templates; "global" removes
 * the selected shop overrides so the global templates become effective.
 */
export async function restoreShopLabelTemplates(
  category: string,
  sizeKey: string | undefined,
  scope: "category" | "shop",
  source: "global" | "shop",
): Promise<Record<string, string>> {
  const { supabase, shopId } = await getContext()
  if (!shopId) throw new Error("Сначала выберите магазин")

  const { category: normalizedCategory, sizeKey: normalizedSize } = normalizeKey(category, sizeKey)
  const sourceQuery = supabase
    .from("label_templates")
    .select("category, template_json")
    .eq("scope_key", source === "global" ? GLOBAL_SCOPE : shopId)
    .eq("size_key", normalizedSize)
  const { data, error: loadError } = scope === "category"
    ? await sourceQuery.eq("category", normalizedCategory)
    : await sourceQuery
  if (loadError) {
    throw new Error(`Не удалось загрузить сохранённые шаблоны: ${loadError.message}`)
  }

  const templates = Object.fromEntries(
    (data ?? []).map((row) => [row.category, row.template_json]),
  ) as Record<string, string>

  if (source === "shop" && !templates[normalizedCategory]) {
    throw new Error(`Для категории «${normalizedCategory}» нет сохранённого шаблона магазина`)
  }

  if (source === "global") {
    let deleteQuery = supabase
      .from("label_templates")
      .delete()
      .eq("scope_key", shopId)
      .eq("size_key", normalizedSize)
    if (scope === "category") {
      deleteQuery = deleteQuery.eq("category", normalizedCategory)
    }
    const { error: deleteError } = await deleteQuery
    if (deleteError) {
      throw new Error(`Не удалось восстановить глобальные шаблоны: ${deleteError.message}`)
    }
  }

  if (source === "global") revalidatePath("/crm/inventory", "page")
  return templates
}

export async function deleteLabelTemplate(category: string, sizeKey?: string): Promise<void> {
  const { supabase, profile, shopId } = await getContext()
  const { category: normalizedCategory, sizeKey: normalizedSize } = normalizeKey(category, sizeKey)
  const isGlobal = profile.role === "super_admin" && !shopId

  if (!shopId && !isGlobal) throw new Error("Магазин не выбран")

  const { error } = await supabase
    .from("label_templates")
    .delete()
    .eq("scope_key", isGlobal ? GLOBAL_SCOPE : shopId)
    .eq("category", normalizedCategory)
    .eq("size_key", normalizedSize)

  if (error) throw new Error(`Не удалось удалить шаблон этикетки: ${error.message}`)

  revalidatePath("/crm/inventory", "page")
}