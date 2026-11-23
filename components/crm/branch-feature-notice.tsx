import Link from "next/link"

export function BranchFeatureNotice() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Раздел доступен при работе с филиалами</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Для этого раздела нужен доступ как минимум к двум активным филиалам
          одного бизнеса. Попросите владельца предоставить доступ или вернитесь
          в обычные разделы CRM.
        </p>
        <Link
          href="/crm/pos"
          className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Перейти в кассу
        </Link>
      </section>
    </main>
  )
}
