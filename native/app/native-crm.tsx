"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { App as CapacitorApp } from "@capacitor/app"
import { Network } from "@capacitor/network"
import { SplashScreen } from "@capacitor/splash-screen"
import { Dashboard } from "@/components/dashboard"
import { PendingScreen } from "@/components/pending-screen"
import { SCREEN_PATHS, type ScreenId } from "@/components/app-nav"
import { PageLoader } from "@/components/ui/page-loader"
import { getSavedUserSession, getMeta, setMeta, saveUserSession } from "@/lib/local-db/db"
import { isDeviceSignedOut, createClient } from "@/lib/supabase/client"
import { getCabinetData } from "@/app/actions/cabinet"
import { getOwnShopPublicState } from "@/app/actions/shops"
import { getSuperAdminShops, getImpersonatedShop } from "@/app/actions/superadmin"
import { getProducts } from "@/app/actions/products"
import { getSales } from "@/app/actions/sales"
import { getSaleReturns } from "@/app/actions/returns"
import { getCashData } from "@/app/actions/cash"
import { getMetalRates } from "@/app/actions/rates"
import { getClients } from "@/app/actions/clients"
import type { Profile } from "@/lib/types"

type WebMetadata = {
  cabinet: Awaited<ReturnType<typeof getCabinetData>>
  publicStorefrontState: Awaited<ReturnType<typeof getOwnShopPublicState>>
  superAdminShops?: Awaited<ReturnType<typeof getSuperAdminShops>>
  impersonatedShop?: Awaited<ReturnType<typeof getImpersonatedShop>>
  onlineData?: {
    products: Awaited<ReturnType<typeof getProducts>>
    sales: Awaited<ReturnType<typeof getSales>>
    returns: Awaited<ReturnType<typeof getSaleReturns>>
    cash: Awaited<ReturnType<typeof getCashData>>
    rates: Awaited<ReturnType<typeof getMetalRates>>
    clients: Awaited<ReturnType<typeof getClients>>
  }
}
const defaults: WebMetadata = {
  cabinet: { team: [], requests: [], defaultBonusRate: 2, defaultReceiptType: "ask" },
  publicStorefrontState: { enabled: true, canToggle: false },
}

/**
 * Native lifecycle/bootstrap ONLY. Every screen, form, menu, barcode modal,
 * label editor and local-first business operation is the ORIGINAL PWA.
 * Offline HTML/JS/fonts are shipped inside the IPA, not fetched from a site.
 */
export function NativeCrm() {
  const router = useRouter()
  const pathname = usePathname()
  const [identity, setIdentity] = useState<{ profile: Profile; email: string } | null>(null)
  const [metadata, setMetadata] = useState<WebMetadata>(defaults)

  useEffect(() => {
    let active = true
    const handles: Array<{ remove(): Promise<void> }> = []
    const retain = async (promise: Promise<{ remove(): Promise<void> }>) => {
      const handle = await promise
      if (active) handles.push(handle)
      else await handle.remove()
    }
    const refreshMetadata = async (profile: Profile) => {
      if (!navigator.onLine || await isDeviceSignedOut()) return
      try {
        const [cabinet, publicStorefrontState, superAdminShops, impersonatedShop] = await Promise.all([
          getCabinetData(),
          getOwnShopPublicState(),
          profile.role === "super_admin" ? getSuperAdminShops() : Promise.resolve(undefined),
          profile.role === "super_admin" ? getImpersonatedShop() : Promise.resolve(null),
        ])
        // As in the PWA, an impersonated shop is online-only. Never seed its
        // records into the account's own IndexedDB/outbox or offline metadata.
        let onlineData: WebMetadata["onlineData"]
        if (impersonatedShop) {
          const [products, sales, returns, cash, rates, clients] = await Promise.all([
            getProducts(), getSales(), getSaleReturns(), getCashData(), getMetalRates(), getClients(),
          ])
          onlineData = { products, sales, returns, cash, rates, clients }
        }
        if (!active || await isDeviceSignedOut()) return
        const next = { cabinet, publicStorefrontState, superAdminShops, impersonatedShop, onlineData }
        setMetadata(next)
        if (!impersonatedShop) {
          await setMeta(`native_web_metadata:${profile.id}:${profile.shop_id ?? "global"}`, next)
        }
      } catch {
        // An unavailable backend must not replace the working offline PWA UI.
      }
    }
    let currentProfile: Profile | null = null
    const refresh = () => { if (currentProfile) void refreshMetadata(currentProfile) }
    void (async () => {
      try {
        if (await isDeviceSignedOut()) { router.replace("/auth/login"); return }
        const saved = await getSavedUserSession()
        if (!saved?.profile || saved.profile.id !== saved.userId) {
          router.replace("/auth/login")
          return
        }
        currentProfile = saved.profile
        const cached = await getMeta<WebMetadata>(`native_web_metadata:${saved.userId}:${saved.profile.shop_id ?? "global"}`, defaults)
        if (!active) return
        setMetadata(cached)
        if (saved.profile.role === "super_admin" && navigator.onLine) {
          await refreshMetadata(saved.profile)
        }
        setIdentity({ profile: saved.profile, email: saved.email ?? "" })
        // Display the persisted UI immediately, before any session/network call.
        refresh()
        if (navigator.onLine) {
          const supabase = createClient()
          const { data } = await supabase.auth.getSession()
          if (data.session?.user.id === saved.userId) {
            const { data: profile } = await supabase.from("profiles").select("*").eq("id", saved.userId).single()
            if (active && profile && !(await isDeviceSignedOut())) {
              currentProfile = profile as Profile
              setIdentity({ profile: currentProfile, email: saved.email ?? "" })
              await saveUserSession({
                ...saved,
                profile: { ...currentProfile, impersonated_shop_id: undefined },
                shopId: currentProfile.shop_id ?? undefined,
                session: data.session,
              })
              refresh()
            }
          }
        }
      } finally {
        await SplashScreen.hide().catch(() => {})
      }
    })().catch(() => { if (active) router.replace("/auth/login") })

    window.addEventListener("online", refresh)
    window.addEventListener("aura:native_action_complete", refresh)
    void retain(Network.addListener("networkStatusChange", ({ connected }) => {
      window.dispatchEvent(new Event(connected ? "online" : "offline"))
    }))
    void retain(CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) { createClient().auth.startAutoRefresh(); refresh() }
      else createClient().auth.stopAutoRefresh()
    }))
    void retain(CapacitorApp.addListener("backButton", () => window.history.back()))
    return () => {
      active = false
      window.removeEventListener("online", refresh)
      window.removeEventListener("aura:native_action_complete", refresh)
      for (const handle of handles) void handle.remove()
    }
  }, [router])

  if (!identity) return <PageLoader />
  const { profile, email } = identity
  if (profile.status !== "approved") return <PendingScreen profile={profile} email={email} />
  const screen = (Object.entries(SCREEN_PATHS).find(([, path]) => path === pathname?.replace(/\/$/, ""))?.[0] ?? "kassa") as ScreenId
  const { onlineData, ...webMetadata } = metadata
  return (
    <Dashboard
      key={profile.id}
      screen={screen}
      profile={profile}
      email={email}
      products={[]}
      sales={[]}
      returns={[]}
      clients={[]}
      rates={[]}
      cash={{ operations: [], presets: [] }}
      supplierDebts={{ suppliers: [], operations: [], profiles: [] }}
      {...onlineData}
      {...webMetadata}
      impersonatedShop={webMetadata.impersonatedShop ?? undefined}
    />
  )
}
