import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getPlatformShopDirectory } from "@/app/actions/superadmin"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"
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
  const shops = await getPlatformShopDirectory()
  const shop = shops.find((row) => row.shop_id === shopId)
  if (!shop) notFound()

  const frozen = shop.is_frozen || shop.status === "frozen"

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Платформа · Магазины
        </p>
        <h1 className="mt-2 break-words font-serif text-3xl tracking-tight">
          {shop.shop_name?.trim() || "Без названия"}
        </h1>
        <p className="mt-2 break-all font-mono text-sm text-muted-foreground">{shop.shop_id}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Основные сведения</CardTitle>
          <CardDescription>Только безопасные метаданные; действия над магазином недоступны.</CardDescription>
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
    </div>
  )
}
