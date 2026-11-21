import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Badge } from "@/components/shared/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shared/ui/card"
import { AdminShopManagement } from "@/components/crm/admin/admin-shop-management"
import { getPlatformShopDirectory, getSuperAdminShops } from "@/app/actions/superadmin"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"
import { isGlobalAdminShop } from "@/lib/admin/shop-directory"
import { getRequestCrmContext } from "@/lib/supabase/request-context"
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/types"

export const metadata = { title: "Карточка магазина — Админ GOLDUCHET" }

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(date)
}

export default async function AdminShopDetailPage({
  params,
}: Readonly<{ params: Promise<{ shopId: string }> }>) {
  await requireSuperAdminPageAccess()
  const { shopId } = await params
  const [{ profile }, shops, billingShops] = await Promise.all([
    getRequestCrmContext(),
    getPlatformShopDirectory(),
    getSuperAdminShops(),
  ])
  const shop = shops.find((row) => row.shop_id === shopId)
  if (!shop) notFound()
  const billingShop = billingShops.find((row) => row.shop_id === shopId)
  if (!billingShop) notFound()
  const isGlobalShop = isGlobalAdminShop(
    shop.shop_id,
    profile?.role === "super_admin" ? profile.shop_id : null,
  )

  const frozen = shop.is_frozen || shop.status === "frozen"

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/shops"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Все магазины
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Админ · Магазины
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="break-words font-serif text-3xl tracking-tight">
            {shop.shop_name?.trim() || "Без названия"}
          </h1>
          {isGlobalShop && <Badge variant="secondary">Глобальный магазин</Badge>}
        </div>
        <p className="mt-2 break-all font-mono text-sm text-muted-foreground">{shop.shop_id}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Основные сведения</CardTitle>
          <CardDescription>Основные данные магазина на платформе.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Статус</p>
            <Badge variant={frozen ? "destructive" : shop.status === "active" ? "default" : "outline"}>
              {frozen ? "Заморожен" : SUBSCRIPTION_STATUS_LABELS[shop.status]}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Участников</p>
            <p className="font-medium tabular-nums">{shop.member_count}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Создан</p>
            <p className="font-medium">{formatDate(shop.created_at)}</p>
          </div>
        </CardContent>
      </Card>

      <AdminShopManagement shop={billingShop} isGlobalShop={isGlobalShop} />
    </div>
  )
}
