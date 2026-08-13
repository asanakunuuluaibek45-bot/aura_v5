"use client"

import { useState } from "react"
import type { Product, Profile, Role, Sale } from "@/lib/types"
import { Toaster } from "@/components/ui/sonner"
import { AppHeader } from "@/components/app-header"
import { RatesTicker } from "@/components/rates-ticker"
import { AppNav, type ScreenId } from "@/components/app-nav"
import { KassaScreen } from "@/components/screens/kassa/index"
import { VitrinaScreen } from "@/components/screens/vitrina-screen"
import { SkladScreen } from "@/components/screens/sklad-screen"
import { OtchetyScreen } from "@/components/screens/otchety-screen"
import { KabinetScreen } from "@/components/screens/kabinet-screen"
import type { CabinetData } from "@/app/actions/cabinet"
import type { CashData } from "@/app/actions/cash"

export function Dashboard({
  profile,
  products,
  sales,
  cabinet,
  cash,
  email,
}: {
  profile: Profile
  products: Product[]
  sales: Sale[]
  cabinet: CabinetData
  cash: CashData
  email: string
}) {
  const [screen, setScreen] = useState<ScreenId>("kassa")
  // Preview role: admins can view the app as a lower role without leaving their session.
  const [viewRole, setViewRole] = useState<Role>(profile.role ?? "seller")

  const canSeePurchasePrice = viewRole === "admin" || viewRole === "super_admin"
  const isAdmin = viewRole === "admin" || viewRole === "super_admin"

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <RatesTicker />
      <AppHeader
        profile={profile}
        viewRole={viewRole}
        onChangeViewRole={setViewRole}
        onOpenCabinet={() => setScreen("kabinet")}
      />
      <AppNav screen={screen} onChange={setScreen} isAdmin={isAdmin} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">
        {screen === "kassa" && (
          <KassaScreen profile={profile} products={products} viewRole={viewRole} sales={sales} cash={cash} />
        )}
        {screen === "vitrina" && (
          <VitrinaScreen products={products} canSeePurchasePrice={canSeePurchasePrice} />
        )}
        {screen === "sklad" && (
          <SkladScreen products={products} canSeePurchasePrice={canSeePurchasePrice} isAdmin={isAdmin} />
        )}
        {screen === "kabinet" && (
          <KabinetScreen profile={profile} viewRole={viewRole} sales={sales} data={cabinet} email={email} />
        )}
        {screen === "otchety" && isAdmin && (
          <OtchetyScreen sales={sales} products={products} viewRole={viewRole} profile={profile} />
        )}
      </main>
      <Toaster position="top-center" richColors />
    </div>
  )
}
