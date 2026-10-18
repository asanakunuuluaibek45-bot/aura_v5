"use client"

import { memo, useMemo, useState, useTransition, useEffect, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import type { Customer, Product, Profile, Role, Sale, SaleReturn } from "@/lib/types"
import { AppHeader } from "@/components/app-header"
import { AppNav, SCREEN_PATHS, type ScreenId } from "@/components/app-nav"
import { KassaScreen } from "@/components/screens/kassa/index"
import { CashPanel } from "@/components/screens/kassa/cash-panel"
import type { CabinetData } from "@/app/actions/cabinet"
import type { MetalRate } from "@/lib/types"
import type { CashData } from "@/app/actions/cash"
import type { ShopBillingRow } from "@/app/actions/superadmin"
import type { SupplierDebtData } from "@/app/actions/suppliers"
import { impersonateShop } from "@/app/actions/superadmin"
import { useRouter } from "next/navigation"
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useLocalCrm } from "@/lib/local-db/use-local-crm"
import { runLogoutCleanup } from "@/lib/local-db/logout-cleanup"
import { saveUserSession } from "@/lib/local-db/db"

const SectionLoading = () => (
  <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground" role="status">
    ÐÐ¾Ð´Ð³Ð¾ÑÐ°Ð²Ð»Ð¸Ð²Ð°ÐµÐ¼ ÑÐ°Ð·Ð´ÐµÐ»â¦
  </div>
)

// Load infrequently used screens only when opened. Keep the point-of-sale
// screen in the first bundle; it is the primary workflow.
const VitrinaScreen = memo(dynamic(() => import("@/components/screens/vitrina").then((mod) => mod.VitrinaScreen), { loading: SectionLoading }))
const SkladScreen = memo(dynamic(() => import("@/components/screens/sklad").then((mod) => mod.SkladScreen), { loading: SectionLoading }))
const OtchetyScreen = memo(dynamic(() => import("@/components/screens/otchety").then((mod) => mod.OtchetyScreen), { loading: SectionLoading }))
const KabinetScreen = memo(dynamic(() => import("@/components/screens/kabinet").then((mod) => mod.KabinetScreen), { loading: SectionLoading }))
const ClientsScreen = memo(dynamic(() => import("@/components/screens/clients").then((mod) => mod.ClientsScreen), { loading: SectionLoading }))
const SuppliersScreen = memo(dynamic(() => import("@/components/screens/suppliers").then((mod) => mod.SuppliersScreen), { loading: SectionLoading }))
const NotificationsPage = memo(dynamic(() => import("@/components/notifications").then((mod) => mod.NotificationsPage), { loading: SectionLoading }))
const SuperAdminShopsScreen = memo(dynamic(() => import("@/components/screens/superadmin/shops-panel").then((mod) => mod.SuperAdminShopsScreen), { loading: SectionLoading }))
const ImpersonationBanner = dynamic(() => import("@/components/screens/superadmin/shops-panel").then((mod) => mod.ImpersonationBanner), { loading: () => null })
const MemoizedKassaScreen = memo(KassaScreen)
const MemoizedCashPanel = memo(CashPanel)

// ---------------------------------------------------------------------------
// ÐÐ²ÑÑÑÑÐ°Ð¿Ð½Ð°Ñ Ð·Ð°ÑÐ¸ÑÐ° Ð¾Ñ ÑÐ»ÑÑÐ°Ð¹Ð½Ð¾Ð³Ð¾ Ð²ÑÑÐ¾Ð´Ð° Ð¸Ð· CRM ÑÐµÑÐµÐ· ÐºÐ½Ð¾Ð¿ÐºÑ Â«ÐÐ°Ð·Ð°Ð´Â»
//
// ÐÑÐ¸Ð½ÑÐ¸Ð¿ ÑÐ°Ð±Ð¾ÑÑ:
//   1. ÐÑÐ¸ ÐºÐ°Ð¶Ð´Ð¾Ð¼ Ð¿ÐµÑÐµÐºÐ»ÑÑÐµÐ½Ð¸Ð¸ ÑÐºÑÐ°Ð½Ð° Ð²Ð½ÑÑÑÐ¸ CRM Ð²ÑÐ·ÑÐ²Ð°ÐµÐ¼ history.pushState â
//      ÑÑÐ¾ Ð´Ð¾Ð±Ð°Ð²Ð»ÑÐµÑ Â«ÑÐ°Ð³Ð¸Â» Ð² ÑÑÐµÐº Ð±ÑÐ°ÑÐ·ÐµÑÐ°, ÑÐ°Ðº ÑÑÐ¾ ÐºÐ½Ð¾Ð¿ÐºÐ° Â«ÐÐ°Ð·Ð°Ð´Â» ÑÐ½Ð°ÑÐ°Ð»Ð°
//      Ð¿ÑÐ¾ÑÐ¾Ð´Ð¸Ñ Ð¿Ð¾ Ð½Ð¸Ð¼, Ð½Ðµ Ð¿Ð¾ÐºÐ¸Ð´Ð°Ñ CRM.
//   2. ÐÐ¾Ð³Ð´Ð° Ð¿Ð¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»Ñ Ð½Ð° Ð³Ð»Ð°Ð²Ð½Ð¾Ð¼ ÑÐºÑÐ°Ð½Ðµ (Ð½Ð°ÑÐ°Ð»Ð¾ Ð¸ÑÑÐ¾ÑÐ¸Ð¸ CRM) Ð¸ Ð½Ð°Ð¶Ð¸Ð¼Ð°ÐµÑ
//      Â«ÐÐ°Ð·Ð°Ð´Â» â Ð¿ÐµÑÐµÑÐ²Ð°ÑÑÐ²Ð°ÐµÐ¼ ÑÐ¾Ð±ÑÑÐ¸Ðµ popstate.
//      â¢ 1-Ðµ Ð½Ð°Ð¶Ð°ÑÐ¸Ðµ: Ð½Ð¸ÑÐµÐ³Ð¾ Ð½Ðµ Ð¿ÑÐ¾Ð¸ÑÑÐ¾Ð´Ð¸Ñ â ÑÐ°Ð³ Ð²Ð¾ÑÑÑÐ°Ð½Ð°Ð²Ð»Ð¸Ð²Ð°ÐµÑÑÑ ÑÐµÑÐµÐ·
//        history.pushState, ÑÑÑÑÑÐ¸Ðº = 1.
//      â¢ 2-Ðµ Ð½Ð°Ð¶Ð°ÑÐ¸Ðµ: Ð¿Ð¾ÐºÐ°Ð·ÑÐ²Ð°ÐµÐ¼ Ð¼Ð¾Ð´Ð°Ð»ÑÐ½Ð¾Ðµ Ð¾ÐºÐ½Ð¾ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ¶Ð´ÐµÐ½Ð¸Ñ Ð²ÑÑÐ¾Ð´Ð°.
//      â¢ Â«ÐÑÐ¼ÐµÐ½Ð°Â» â Ð·Ð°ÐºÑÑÐ²Ð°ÐµÐ¼ Ð¼Ð¾Ð´Ð°Ð», ÑÐ±ÑÐ°ÑÑÐ²Ð°ÐµÐ¼ ÑÑÑÑÑÐ¸Ðº.
//      â¢ Â«ÐÑÐ¹ÑÐ¸Â» â ÑÐ°Ð·Ð»Ð¾Ð³Ð¸Ð½Ð¸Ð²Ð°ÐµÐ¼ Ð¿Ð¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»Ñ Ð¸ ÑÐ²Ð¾Ð´Ð¸Ð¼ Ð½Ð° /auth/login.
// ---------------------------------------------------------------------------

const CRM_HISTORY_KEY = "crm_nav"

/** ÐÐ¾Ð±Ð°Ð²Ð»ÑÐµÑ ÑÐ¸ÐºÑÐ¸Ð²Ð½ÑÑ Ð·Ð°Ð¿Ð¸ÑÑ Ð² history, ÑÑÐ¾Ð±Ñ Â«Ð¿Ð¾Ð³Ð»Ð¾ÑÐ¸ÑÑÂ» Ð¾Ð´Ð½Ð¾ Ð½Ð°Ð¶Ð°ÑÐ¸Ðµ Â«ÐÐ°Ð·Ð°Ð´Â». */
function pushCrmState(screenId: string) {
  window.history.pushState({ [CRM_HISTORY_KEY]: screenId }, "")
}

function ExitConfirmModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h2 className="text-base font-semibold">ÐÑ Ð´ÐµÐ¹ÑÑÐ²Ð¸ÑÐµÐ»ÑÐ½Ð¾ ÑÐ¾ÑÐ¸ÑÐµ Ð²ÑÐ¹ÑÐ¸ Ð¸Ð· CRM?</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Ð¢ÐµÐºÑÑÐ°Ñ ÑÐµÑÑÐ¸Ñ Ð±ÑÐ´ÐµÑ Ð·Ð°Ð²ÐµÑÑÐµÐ½Ð°, Ð¸ Ð¿Ð¾ÑÑÐµÐ±ÑÐµÑÑÑ Ð¿Ð¾Ð²ÑÐ¾ÑÐ½ÑÐ¹ Ð²ÑÐ¾Ð´.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            ÐÑÐ¼ÐµÐ½Ð°
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90"
          >
            ÐÑÐ¹ÑÐ¸
          </button>
        </div>
      </div>
    </div>
  )
}

export function Dashboard({
  screen,
  profile,
  products,
  sales,
  returns = [],
  cabinet,
  rates = [],
  cash,
  supplierDebts,
  email,
  clients = [],
  superAdminShops,
  impersonatedShop,
}: {
  /** Ð¢ÐµÐºÑÑÐ¸Ð¹ ÑÐºÑÐ°Ð½ Ð¾Ð¿ÑÐµÐ´ÐµÐ»ÑÐµÑÑÑ URL-ÑÐ¾ÑÑÐ¾Ð¼, Ð° Ð½Ðµ Ð²Ð½ÑÑÑÐµÐ½Ð½Ð¸Ð¼ ÑÐ¾ÑÑÐ¾ÑÐ½Ð¸ÐµÐ¼. */
  screen: ScreenId
  profile: Profile
  products: Product[]
  sales: Sale[]
  /** ÐÐ¾Ð·Ð²ÑÐ°ÑÑ ÑÐ¾Ð²Ð°ÑÐ° â ÑÐ¼ÐµÐ½ÑÑÐ°ÑÑ ÐºÐ°ÑÑÑ, Ð²ÑÑÑÑÐºÑ Ð¸ Ð¿ÑÐ¸Ð±ÑÐ»Ñ. */
  returns?: SaleReturn[]
  cabinet: CabinetData
  rates?: MetalRate[]
  cash: CashData
  supplierDebts: SupplierDebtData
  email: string
  clients?: Customer[]
  superAdminShops?: ShopBillingRow[]
  impersonatedShop?: { shop_id: string; shop_name: string | null }
}) {
  const router = useRouter()
  const [activeScreen, setActiveScreen] = useState<ScreenId>(screen)
  const [viewRole, setViewRole] = useState<Role>(profile.role ?? "seller")
  const [showExitModal, setShowExitModal] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Ð¡ÑÑÑÑÐ¸Ðº Ð½Ð°Ð¶Ð°ÑÐ¸Ð¹ Â«ÐÐ°Ð·Ð°Ð´Â» Ñ Ð³Ð»Ð°Ð²Ð½Ð¾Ð³Ð¾ ÑÐºÑÐ°Ð½Ð° (0 Ð¸Ð»Ð¸ 1)
  const backCountRef = useRef(0)
  // ÐÑÐºÑÑÑ Ð»Ð¸ Ð¼Ð¾Ð´Ð°Ð» Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ¶Ð´ÐµÐ½Ð¸Ñ Ð²ÑÑÐ¾Ð´Ð° (Ð´Ð»Ñ Ð¾Ð±ÑÐ°Ð±Ð¾ÑÑÐ¸ÐºÐ° popstate)
  const exitModalOpenRef = useRef(false)

  const canSeePurchasePrice = viewRole === "admin" || viewRole === "super_admin"
  const isAdmin = viewRole === "admin" || viewRole === "super_admin"
  const isSuperAdmin = profile.role === "super_admin"
  const isImpersonating = isSuperAdmin && Boolean(impersonatedShop?.shop_id)
  const activeShopId = impersonatedShop?.shop_id ?? profile.shop_id ?? null
  const [isOnline, setIsOnline] = useState(true)

  const [, startTransition] = useTransition()

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (isImpersonating) router.refresh()
    }
    const handleOffline = () => setIsOnline(false)
    setIsOnline(navigator.onLine)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [isImpersonating, router])

  useEffect(() => {
    setActiveScreen(screen)
  }, [screen])

  // Local-first data is disabled while the super admin views another store.
  const localCrm = useLocalCrm({
    profile,
    enabled: !isImpersonating && Boolean(profile.shop_id),
    products,
    sales,
    returns,
    cash,
    rates,
    clients,
    supplierDebts,
  })

  // Never persist the super-admin's impersonation session for offline startup.
  useEffect(() => {
    if (profile?.id && !isImpersonating) {
      saveUserSession({
        userId: profile.id,
        email: email || profile.email || undefined,
        profile,
        shopId: profile.shop_id || undefined,
      }).catch((err) => console.warn("Failed to persist offline session:", err))
    }
  }, [profile, email, isImpersonating])

  const currentProducts = !isImpersonating && localCrm.isReady ? localCrm.products : products
  const currentSales = !isImpersonating && localCrm.isReady ? localCrm.sales : sales
  const confirmedSales = useMemo(
    () => currentSales.filter((sale) => sale.sync_status !== "pending" && sale.sync_status !== "rejected"),
    [currentSales],
  )
  const currentReturns = !isImpersonating && localCrm.isReady ? localCrm.returns : returns
  const currentCash = !isImpersonating && localCrm.isReady ? localCrm.cash : cash
  const currentRates = !isImpersonating && localCrm.isReady ? localCrm.rates : rates
  const currentClients = !isImpersonating && localCrm.isReady ? localCrm.clients : clients

  /** ÐÐµÑÐµÐºÐ»ÑÑÐµÐ½Ð¸Ðµ ÑÐºÑÐ°Ð½Ð°: Ð¿ÐµÑÐµÑÐ¾Ð´ Ð¿Ð¾ Ð¾ÑÐ´ÐµÐ»ÑÐ½Ð¾Ð¼Ñ URL. */
  const handleScreenChange = useCallback(
    (next: ScreenId) => {
      backCountRef.current = 0 // ÑÐ±ÑÐ°ÑÑÐ²Ð°ÐµÐ¼ ÑÑÑÑÑÐ¸Ðº Ð¿ÑÐ¸ Ð½Ð°Ð²Ð¸Ð³Ð°ÑÐ¸Ð¸ Ð²Ð¿ÐµÑÑÐ´
      setActiveScreen(next)
      window.history.pushState({ [CRM_HISTORY_KEY]: next }, "", SCREEN_PATHS[next])
    },
    [],
  )

  /**
   * ÐÐ°ÑÐ¸ÑÐ° Ð¾Ñ ÑÐ»ÑÑÐ°Ð¹Ð½Ð¾Ð³Ð¾ Ð²ÑÑÐ¾Ð´Ð° Ð¸Ð· CRM ÑÐ°Ð±Ð¾ÑÐ°ÐµÑ ÑÐ¾Ð»ÑÐºÐ¾ Ð½Ð° Ð³Ð»Ð°Ð²Ð½Ð¾Ð¼ ÑÐºÑÐ°Ð½Ðµ
   * (/pos). ÐÐ° Ð¾ÑÑÐ°Ð»ÑÐ½ÑÑ ÑÐºÑÐ°Ð½Ð°Ñ Â«ÐÐ°Ð·Ð°Ð´Â» â Ð¾Ð±ÑÑÐ½Ð°Ñ Ð½Ð°Ð²Ð¸Ð³Ð°ÑÐ¸Ñ Ð±ÑÐ°ÑÐ·ÐµÑÐ°
   * Ð¼ÐµÐ¶Ð´Ñ URL-Ð°Ð´ÑÐµÑÐ°Ð¼Ð¸ ÑÐ°Ð·Ð´ÐµÐ»Ð¾Ð².
   */
  useEffect(() => {
    if (activeScreen !== "kassa") {
      const onSectionPopState = () => {
        const next = (Object.entries(SCREEN_PATHS) as [ScreenId, string][]).find(
          ([, path]) => path === window.location.pathname,
        )?.[0]
        if (next) setActiveScreen(next)
      }

      window.addEventListener("popstate", onSectionPopState)
      return () => window.removeEventListener("popstate", onSectionPopState)
    }

    pushCrmState("kassa")
    backCountRef.current = 0

    const onPopState = () => {
      const next = (Object.entries(SCREEN_PATHS) as [ScreenId, string][]).find(
        ([, path]) => path === window.location.pathname,
      )?.[0]
      if (next && next !== "kassa") {
        backCountRef.current = 0
        setActiveScreen(next)
        return
      }

      // ÐÐ¾Ð·Ð²ÑÐ°ÑÐ°ÐµÐ¼ Â«ÑÑÐ¾ÑÐ¾Ð¶ÐµÐ²Ð¾Ð¹Â» ÑÐ°Ð³ Ð² ÑÑÐµÐº Ð¸ÑÑÐ¾ÑÐ¸Ð¸.
      pushCrmState("kassa")

      // ÐÑÐ»Ð¸ Ð¼Ð¾Ð´Ð°Ð» ÑÐ¶Ðµ Ð¾ÑÐºÑÑÑ â Ð¿Ð¾Ð²ÑÐ¾ÑÐ½Ð¾Ðµ Â«ÐÐ°Ð·Ð°Ð´Â» ÐµÐ³Ð¾ Ð¿ÑÐ¾ÑÑÐ¾ Ð·Ð°ÐºÑÑÐ²Ð°ÐµÑ.
      if (exitModalOpenRef.current) {
        exitModalOpenRef.current = false
        setShowExitModal(false)
        backCountRef.current = 0
        return
      }

      // 1-Ðµ Ð½Ð°Ð¶Ð°ÑÐ¸Ðµ: Ð½Ð¸ÑÐµÐ³Ð¾ Ð½Ðµ Ð¿ÑÐ¾Ð¸ÑÑÐ¾Ð´Ð¸Ñ, Ð¾ÑÑÐ°ÑÐ¼ÑÑ Ð½Ð° Ð¼ÐµÑÑÐµ.
      if (backCountRef.current === 0) {
        backCountRef.current = 1
        return
      }

      // 2-Ðµ Ð½Ð°Ð¶Ð°ÑÐ¸Ðµ: Ð¼Ð¾Ð´Ð°Ð»ÑÐ½Ð¾Ðµ Ð¾ÐºÐ½Ð¾ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ¶Ð´ÐµÐ½Ð¸Ñ Ð²ÑÑÐ¾Ð´Ð°.
      backCountRef.current = 0
      exitModalOpenRef.current = true
      setShowExitModal(true)
    }

    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [activeScreen])

  /** Â«ÐÑÐ¹ÑÐ¸Â» â ÑÐ°Ð·Ð»Ð¾Ð³Ð¸Ð½Ð¸Ð²Ð°ÐµÐ¼ Ð¿Ð¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»Ñ Ð¸ ÑÐ²Ð¾Ð´Ð¸Ð¼ Ð½Ð° ÑÑÑÐ°Ð½Ð¸ÑÑ Ð²ÑÐ¾Ð´Ð°. */
  const handleExitCrm = async () => {
    exitModalOpenRef.current = false
    setShowExitModal(false)
    // ÐÐ¾Ð»Ð½Ð°Ñ Ð¾ÑÐ¸ÑÑÐºÐ° Ð»Ð¾ÐºÐ°Ð»ÑÐ½ÑÑ Ð´Ð°Ð½Ð½ÑÑ Ð¸ ÐºÑÑÐµÐ¹ Ð¿ÐµÑÐµÐ´ Ð²ÑÑÐ¾Ð´Ð¾Ð¼
    await runLogoutCleanup()
    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut()
    } catch {
      // Ð´Ð°Ð¶Ðµ Ð¿ÑÐ¸ Ð¾ÑÐ¸Ð±ÐºÐµ ÑÐµÑÐ¸ ÑÐ²Ð¾Ð´Ð¸Ð¼ Ð¿Ð¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»Ñ Ð½Ð° ÑÐºÑÐ°Ð½ Ð²ÑÐ¾Ð´Ð°
    }
    router.replace("/auth/login")
  }

  /** Â«ÐÑÐ¼ÐµÐ½Ð°Â» â Ð·Ð°ÐºÑÑÐ²Ð°ÐµÐ¼ Ð¼Ð¾Ð´Ð°Ð» Ð¸ ÑÐ±ÑÐ°ÑÑÐ²Ð°ÐµÐ¼ ÑÑÑÑÑÐ¸Ðº Ð½Ð°Ð¶Ð°ÑÐ¸Ð¹ Â«ÐÐ°Ð·Ð°Ð´Â». */
  const handleCancelExit = () => {
    exitModalOpenRef.current = false
    setShowExitModal(false)
    backCountRef.current = 0
  }

  const handleExitImpersonation = async () => {
    try {
      await impersonateShop(null)
      toast.success("ÐÐµÑÐ½ÑÐ»Ð¸ÑÑ Ð² Ð¿Ð°Ð½ÐµÐ»Ñ ÑÑÐ¿ÐµÑÐ°Ð´Ð¼Ð¸Ð½Ð°")
      router.push(SCREEN_PATHS.shops)
      startTransition(() => router.refresh())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ÐÑÐ¸Ð±ÐºÐ°")
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* ÐÐ¾Ð´Ð°Ð» Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ¶Ð´ÐµÐ½Ð¸Ñ Ð²ÑÑÐ¾Ð´Ð° Ð¸Ð· CRM */}
      <ExitConfirmModal
        open={showExitModal}
        onCancel={handleCancelExit}
        onConfirm={handleExitCrm}
      />

      {/* ÐÐ°Ð½Ð½ÐµÑ ÑÐµÐ¶Ð¸Ð¼Ð° Ð¸Ð¼Ð¿ÐµÑÑÐ¾Ð½Ð°ÑÐ¸Ð¸ â Ð¾ÑÐ¾Ð±ÑÐ°Ð¶Ð°ÐµÑÑÑ Ð¿Ð¾Ð²ÐµÑÑ Ð²ÑÐµÐ³Ð¾ */}
      {isImpersonating && impersonatedShop && (
        <ImpersonationBanner
          shopName={impersonatedShop.shop_name}
          onExit={handleExitImpersonation}
          onSwitch={() => handleScreenChange("shops")}
        />
      )}

      <AppHeader
        profile={profile}
        currentShopName={isImpersonating ? impersonatedShop?.shop_name : profile.shop_name}
        onlineOnly={isImpersonating}
        viewRole={viewRole}
        onChangeViewRole={setViewRole}
        onOpenCabinet={() => handleScreenChange("kabinet")}
        onOpenNotifications={() => handleScreenChange("notifications")}
        onOpenNav={() => {
          if (window.matchMedia("(min-width: 1024px)").matches) {
            setSidebarCollapsed((value) => !value)
          } else {
            setMobileNavOpen(true)
          }
        }}
        onNavigate={handleScreenChange}
      />
      <div className="flex min-h-0 flex-1">
<AppNav
  screen={activeScreen}
  profile={profile} 
  isAdmin={isAdmin}
  viewRole={viewRole}                      
  onChangeViewRole={setViewRole}  
  isSuperAdmin={isSuperAdmin}
  onNavigate={handleScreenChange}
  onOpenCabinet={() => handleScreenChange("kabinet")} 
  mobileOpen={mobileNavOpen}
  onClose={() => setMobileNavOpen(false)}
  collapsed={sidebarCollapsed}
  onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
/>

        <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-6 md:px-6">
        {isImpersonating && !isOnline ? (
          <div
            role="alert"
            className="mx-auto mt-10 max-w-xl rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-center"
          >
            <p className="font-semibold text-amber-800 dark:text-amber-300">ÐÐµÑ Ð¿Ð¾Ð´ÐºÐ»ÑÑÐµÐ½Ð¸Ñ Ðº Ð¸Ð½ÑÐµÑÐ½ÐµÑÑ</p>
            <p className="mt-2 text-sm text-muted-foreground">
              ÐÑÐ¾ÑÐ¼Ð¾ÑÑ Ð´ÑÑÐ³Ð¾Ð³Ð¾ Ð¼Ð°Ð³Ð°Ð·Ð¸Ð½Ð° ÑÐ°Ð±Ð¾ÑÐ°ÐµÑ ÑÐ¾Ð»ÑÐºÐ¾ Ð¾Ð½Ð»Ð°Ð¹Ð½. ÐÐ¾ÐºÐ°Ð»ÑÐ½ÑÐµ Ð´Ð°Ð½Ð½ÑÐµ Ð½Ðµ Ð¸ÑÐ¿Ð¾Ð»ÑÐ·ÑÑÑÑÑ; Ð¿Ð¾Ð´ÐºÐ»ÑÑÐ¸ÑÐµÑÑ Ðº ÑÐµÑÐ¸, ÑÑÐ¾Ð±Ñ Ð¿ÑÐ¾Ð´Ð¾Ð»Ð¶Ð¸ÑÑ.
            </p>
          </div>
        ) : (
          <>
        {activeScreen === "kassa" && (
          <MemoizedKassaScreen
            key={activeShopId ?? "no-shop"}
            profile={profile}
            products={currentProducts}
            viewRole={viewRole}
            sales={currentSales}
            returns={currentReturns}
            cash={currentCash}
            rates={currentRates}
            clients={currentClients}
            onlineOnly={isImpersonating}
            shopId={activeShopId}
            onLocalCheckout={isImpersonating ? undefined : localCrm.localCheckout}
          />
        )}
        {activeScreen === "money" && (
          <MemoizedCashPanel
            sales={currentSales}
            operations={currentCash.operations}
            presets={currentCash.presets}
            isAdmin={isAdmin}
          />
        )}
        {activeScreen === "vitrina" && (
          <VitrinaScreen products={currentProducts} canSeePurchasePrice={canSeePurchasePrice} isAdmin={isAdmin} />
        )}
        {activeScreen === "sklad" && (
          <SkladScreen
            products={currentProducts}
            sales={confirmedSales}
            canSeePurchasePrice={canSeePurchasePrice}
            isAdmin={isAdmin}
            allowOffline={!isImpersonating}
            onProductSaved={!isImpersonating ? localCrm.cacheSavedProduct : undefined}
            onProductDeleted={!isImpersonating ? localCrm.cacheDeletedProduct : undefined}
            onOfflineDeleteProduct={!isImpersonating ? localCrm.localDeleteProduct : undefined}
          />
        )}
        {activeScreen === "clients" && (
          <ClientsScreen clients={currentClients} allowOffline={!isImpersonating} />
        )}
        {activeScreen === "suppliers" && isAdmin && (
          <SuppliersScreen
            supplierDebts={supplierDebts}
            products={currentProducts}
            sales={confirmedSales}
            isAdmin={isAdmin}
          />
        )}
        {activeScreen === "kabinet" && (
          <KabinetScreen
            profile={profile}
            viewRole={viewRole}
            sales={currentSales}
            returns={currentReturns}
            data={cabinet}
            email={email}
            syncLocal={!isImpersonating}
            historyShopId={activeShopId}
            onActionUndone={localCrm.cacheRestoredAction}
          />
        )}
        {activeScreen === "otchety" && isAdmin && (
          <OtchetyScreen
            sales={currentSales}
            products={currentProducts}
            returns={currentReturns}
            viewRole={viewRole}
            profile={profile}
          />
        )}
        {activeScreen === "shops" && isSuperAdmin && superAdminShops && (
          <SuperAdminShopsScreen initialShops={superAdminShops} />
        )}
        {activeScreen === "notifications" && isSuperAdmin && <NotificationsPage />}
          </>
        )}
        </main>
      </div>
    </div>
  )
}
