import { getPublicMarketplacePage, getPublicMarketplaceSettings, getPublicProduct } from "@/app/actions/store"
import { getPublicShops } from "@/app/actions/shops"
import { AdminMarketplaceSettings } from "@/components/crm/admin/admin-marketplace-settings"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"

export const metadata = { title: "Маркетплейс — Админ GOLDUCHET" }

export default async function AdminMarketplacePage() {
  await requireSuperAdminPageAccess()
  const [settings, shops] = await Promise.all([
    getPublicMarketplaceSettings(),
    getPublicShops(),
  ])
  const [productPage, selectedProduct] = await Promise.all([
    settings.heroShopId
      ? getPublicMarketplacePage(settings.heroShopId, 1, 24, "", {}, false).catch(() => null)
      : Promise.resolve(null),
    settings.heroShopId && settings.heroProductId
      ? getPublicProduct(settings.heroShopId, settings.heroProductId).catch(() => null)
      : Promise.resolve(null),
  ])
  const initialProducts = [
    ...(selectedProduct ? [selectedProduct] : []),
    ...(productPage?.items ?? []),
  ].filter((product, index, products) => products.findIndex((candidate) => candidate.id === product.id) === index)

  return (
    <AdminMarketplaceSettings
      initialSettings={settings}
      shops={shops}
      initialProducts={initialProducts}
    />
  )
}
