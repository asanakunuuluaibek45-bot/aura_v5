import type { Metadata } from "next"
import { AdminNav } from "@/components/crm/admin/admin-nav"
import { requireSuperAdminPageAccess } from "@/lib/admin/require-page-access"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Админ — GOLDUCHET",
  robots: { index: false, follow: false },
}

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireSuperAdminPageAccess()

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto flex min-h-svh max-w-[1600px] flex-col lg:flex-row">
        <AdminNav />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
