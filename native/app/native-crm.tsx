"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { App as CapacitorApp } from "@capacitor/app"
import { SplashScreen } from "@capacitor/splash-screen"
import { Dashboard } from "@/components/crm/dashboard"
import { PendingScreen } from "@/components/crm/pending-screen"
import { SCREEN_PATHS, type ScreenId } from "@/components/crm/app-nav"
import { PageLoader } from "@/components/shared/ui/page-loader"
import { getSavedUserSession, getMeta, setMeta, saveUserSession } from "@/lib/local-db/db"
import { isDeviceSignedOut, createClient } from "@/lib/supabase/client"
import { purgeDeletedAccountData } from "@/lib/local-db/device-logout"
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
        await setMeta(`native_web_metadata:${profile.id}:${profile.shop_id ?? "global"}`, next)
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
        const metadataKey = `native_web_metadata:${saved.userId}:${saved.profile.shop_id ?? "global"}`
        const cached = await getMeta<Partial<WebMetadata>>(metadataKey, defaults).catch(() => defaults)
        if (!active) return
        const safeCached: WebMetadata = {
          cabinet: cached.cabinet ?? defaults.cabinet,
          publicStorefrontState: cached.publicStorefrontState ?? defaults.publicStorefrontState,
          ...(cached.superAdminShops ? { superAdminShops: cached.superAdminShops } : {}),
        }
        setMetadata(safeCached)
        await setMeta(metadataKey, safeCached).catch(() => {})
        if (saved.profile.role === "super_admin" && navigator.onLine) {
          await refreshMetadata(saved.profile)
        }
        setIdentity({ profile: saved.profile, email: saved.email ?? "" })
        await SplashScreen.hide().catch(() => {})
        // Display the persisted UI immediately, before any session/network call.
        refresh()
        if (navigator.onLine) {
          const supabase = createClient()
          const { data } = await supabase.auth.getSession()
          if (data.session?.user.id === saved.userId) {
            const { data: profile, error: profileError } = await supabase
              .from("profiles")
              .select("id,full_name,shop_name,shop_id,phone,requested_role,role,status,bonus_points,bonus_rate,manager_id,last_seen_at,email,created_at")
              .eq("id", saved.userId)
              .maybeSingle()
            if (active && !profileError && !profile) {
              // A verified online session with no Auth-linked profile means
              // the account was deleted elsewhere. Purge this device's offline
              // copy and keep it from reopening on a later offline launch.
              let cleanupPending = false
              try {
                await purgeDeletedAccountData()
              } catch {
                // Continue to local sign-out even if IndexedDB cleanup fails.
                cleanupPending = true
              }
              await supabase.auth.signOut({ scope: "local" }).catch(() => {})
              if (active) {
                router.replace(`/auth/login?accountDeleted=1${cleanupPending ? "&cleanupPending=1" : ""}`)
              }
              return
            }
            if (active && profile && !(await isDeviceSignedOut())) {
              currentProfile = profile as Profile
              setIdentity({ profile: currentProfile, email: saved.email ?? "" })
              await saveUserSession({
                ...saved,
                profile: currentProfile,
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
    })().catch(() => {
      // A failed token refresh/network request is NOT device logout. A loaded
      // offline identity must keep its cashier and unsent operations available.
      if (active && !currentProfile) router.replace("/auth/login")
    })

    window.addEventListener("online", refresh)
    window.addEventListener("aura:native_action_complete", refresh)
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
  return (
    <Dashboard
      key={profile.id}
      screen={screen}
      profile={profile}
      branchContext={{
        businessId: profile.shop_id,
        activeShopId: profile.shop_id,
        branches: profile.shop_id
          ? [{
              businessId: profile.shop_id,
              shopId: profile.shop_id,
              shopName: profile.shop_name,
              isActive: true,
            }]
          : [],
      }}
      businessName={profile.shop_name}
      email={email}
      products={[]}
      sales={[]}
      returns={[]}
      clients={[]}
      rates={[]}
      cash={{ operations: [], presets: [] }}
      supplierDebts={{ suppliers: [], operations: [], profiles: [] }}
      {...metadata}
    />
  )
}
