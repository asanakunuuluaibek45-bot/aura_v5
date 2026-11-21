import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shared/ui/card"
import { getPlatformShopDirectory } from "@/app/actions/superadmin"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"

export default async function AdminPage() {
  await requireSuperAdminPageAccess()
  const shops = await getPlatformShopDirectory()

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          GOLDUCHET · Платформа
        </p>
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Админ-панель</h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Управление платформой отдельно от рабочего интерфейса магазина.
        </p>
      </header>

      <section aria-label="Сводка платформы" className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Всего магазинов</CardDescription>
            <CardTitle className="text-3xl">{shops.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Данные загружены через существующую проверку super_admin.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Область панели</CardDescription>
            <CardTitle className="text-xl">Платформа</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Здесь нет кассы, денежных операций или складских действий.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
