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
import { getSuperAdminShops } from "@/app/actions/superadmin"
import type { Profile } from "@/lib/types"

type WebMetadata = {
  cabinet: Awaited<ReturnType<typeof getCabinetData>>
  publicStorefrontState: Awaited<ReturnType<typeof getOwnShopPublicState>>
  superAdminShops?: Awaited<ReturnType<typeof getSuperAdminShops>>
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
        const [cabinet, publicStorefrontState, superAdminShops] = await Promise.all([
          getCabinetData(),
          getOwnShopPublicState(),
          profile.role === "super_admin" ? getSuperAdminShops() : Promise.resolve(undefined),
        ])
        if (!active || await isDeviceSignedOut()) return
        const next = { cabinet, publicStorefrontState, superAdminShops }
        setMetadata(next)
        await setMeta(`native_web_metadata:${profile.id}:${profile.impersonated_shop_id ?? profile.shop_id ?? "global"}`, next)
      } catch {
        // An unavailable backend must not replace the working offline PWA UI.
      }
    }
    let currentProfile: Profile | null = null
    const refresh = () => { if (currentProfile) void refreshMetadata(currentProfile) }
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.module === "superadmin" && detail?.action === "impersonateShop") {
        // Refresh the persisted identity/shop scope before rendering another shop.
        window.location.reload()
      } else refresh()
    }
    void (async () => {
      try {
        if (await isDeviceSignedOut()) { router.replace("/auth/login"); return }
        const saved = await getSavedUserSession()
        if (!saved?.profile || saved.profile.id !== saved.userId) {
          router.replace("/auth/login")
          return
        }
        currentProfile = saved.profile
        const cached = await getMeta<WebMetadata>(`native_web_metadata:${saved.userId}:${saved.profile.impersonated_shop_id ?? saved.profile.shop_id ?? "global"}`, defaults)
        if (!active) return
        setMetadata(cached)
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
              await saveUserSession({ ...saved, profile: currentProfile, shopId: currentProfile.shop_id, session: data.session })
              refresh()
            }
          }
        }
      } finally {
        await SplashScreen.hide().catch(() => {})
      }
    })().catch(() => { if (active) router.replace("/auth/login") })

    window.addEventListener("online", refresh)
    window.addEventListener("aura:native_action_complete", onAction)
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
      window.removeEventListener("aura:native_action_complete", onAction)
      for (const handle of handles) void handle.remove()
    }
  }, [router])

  if (!identity) return <PageLoader />
  const { profile, email } = identity
  if (profile.status !== "approved") return <PendingScreen profile={profile} email={email} />
  const screen = (Object.entries(SCREEN_PATHS).find(([, path]) => path === pathname?.replace(/\/$/, ""))?.[0] ?? "kassa") as ScreenId
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
      {...metadata}
      impersonatedShop={profile.impersonated_shop_id ? {
        shop_id: profile.impersonated_shop_id, shop_name: null,
      } : undefined}
    />
  )
}
