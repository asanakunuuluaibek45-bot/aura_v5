"use client"

import { isOfflineSection } from "@/lib/offline-sections"
import { memo, useMemo, useState, useEffect, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import type { Customer, Product, Profile, Role, Sale, SaleReturn } from "@/lib/types"
import { AppHeader } from "@/components/crm/app-header"
import { SiteHelp } from "@/components/crm/site-help"
import { AppNav, SCREEN_PATHS, type ScreenId } from "@/components/crm/app-nav"
import { KassaScreen } from "@/components/crm/screens/kassa/index"
import { SkladScreen as OfflineSkladScreen } from "@/components/crm/screens/sklad"
import { KabinetScreen as OfflineKabinetScreen } from "@/components/crm/screens/kabinet"
import { RevisionsScreen as OfflineRevisionsScreen } from "@/components/crm/screens/revisions"
import { CashPanel } from "@/components/crm/screens/kassa/cash-panel"
import type { CabinetData } from "@/app/actions/cabinet"
import type { MetalRate } from "@/lib/types"
import type { CashData } from "@/app/actions/cash"
import type { ShopBillingRow } from "@/app/actions/superadmin"
import type { BranchCreationRequest } from "@/app/actions/shops"
import type { BranchContext } from "@/lib/supabase/current-shop"
import {
  getSupplierDebtData,
  type SupplierDebtData,
  type SupplierProfile,
} from "@/app/actions/suppliers"
import { useRouter } from "next/navigation"
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useLocalCrm } from "@/lib/local-db/use-local-crm"
import { logoutDeviceAccount } from "@/lib/local-db/device-logout"
import { UnsyncedLogoutError } from "@/lib/offline-policy"
import { saveUserSession } from "@/lib/local-db/db"
import { supplierIdentityKey } from "@/lib/supplier-identity"

const SectionLoading = () => (
  <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground" role="status">
    Подготавливаем раздел…
  </div>
)

// Offline-capable screens belong to the initial dependency graph.
// Only online-only screens may depend on on-demand network chunks.
const VitrinaScreen = memo(dynamic(() => import("@/components/crm/screens/vitrina").then((mod) => mod.VitrinaScreen), { loading: SectionLoading }))
const SkladScreen = memo(OfflineSkladScreen)
const RevisionsScreen = memo(OfflineRevisionsScreen)
const OtchetyScreen = memo(dynamic(() => import("@/components/crm/screens/otchety").then((mod) => mod.OtchetyScreen), { loading: SectionLoading }))
const KabinetScreen = memo(OfflineKabinetScreen)
const ClientsScreen = memo(dynamic(() => import("@/components/crm/screens/clients").then((mod) => mod.ClientsScreen), { loading: SectionLoading }))
const SuppliersScreen = memo(dynamic(() => import("@/components/crm/screens/suppliers").then((mod) => mod.SuppliersScreen), { loading: SectionLoading }))
const StoreNotificationsPage = memo(dynamic(() => import("@/components/crm/notifications/StoreNotificationsPage").then((mod) => mod.StoreNotificationsPage), { loading: SectionLoading }))
const MemoizedKassaScreen = memo(KassaScreen)
const MemoizedCashPanel = memo(CashPanel)

// ---------------------------------------------------------------------------
// Двухэтапная защита от случайного выхода из CRM через кнопку «Назад»
//
// Принцип работы:
//   1. При каждом переключении экрана внутри CRM вызываем history.pushState —
//      это добавляет «шаги» в стек браузера, так что кнопка «Назад» сначала
//      проходит по ним, не покидая CRM.
//   2. Когда пользователь на главном экране (начало истории CRM) и нажимает
//      «Назад» — перехватываем событие popstate.
//      • 1-е нажатие: ничего не происходит — шаг восстанавливается через
//        history.pushState, счётчик = 1.
//      • 2-е нажатие: показываем модальное окно подтверждения выхода.
//      • «Отмена» → закрываем модал, сбрасываем счётчик.
//      • «Выйти» → разлогиниваем пользователя и уводим на /auth/login.
// ---------------------------------------------------------------------------

const CRM_HISTORY_KEY = "crm_nav"

/** Добавляет фиктивную запись в history, чтобы «поглотить» одно нажатие «Назад». */
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
        <h2 className="text-base font-semibold">Вы действительно хотите выйти из CRM?</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Текущая сессия будет завершена, и потребуется повторный вход.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90"
          >
            Выйти
          </button>
        </div>
      </div>
    </div>
  )
}

export function Dashboard({
  screen,
  profile,
  branchContext,
  businessName,
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
  publicStorefrontState = { enabled: true, canToggle: false },
  branchCreationRequest = null,
}: {
  /** Текущий экран определяется URL-роутом, а не внутренним состоянием. */
  screen: ScreenId
  profile: Profile
  branchContext: BranchContext
  businessName: string | null
  products: Product[]
  sales: Sale[]
  /** Возвраты товара — уменьшают кассу, выручку и прибыль. */
  returns?: SaleReturn[]
  cabinet: CabinetData
  rates?: MetalRate[]
  cash: CashData
  supplierDebts: SupplierDebtData
  email: string
  clients?: Customer[]
  superAdminShops?: ShopBillingRow[]
  publicStorefrontState?: { enabled: boolean; canToggle: boolean }
  branchCreationRequest?: BranchCreationRequest | null
}) {
  const router = useRouter()
  const [activeScreen, setActiveScreen] = useState<ScreenId>(screen)
  const activeScreenRef = useRef(screen)
  useEffect(() => { activeScreenRef.current = activeScreen }, [activeScreen])
  const [viewRole, setViewRole] = useState<Role>(profile.role ?? "seller")
  const [supplierDebtData, setSupplierDebtData] = useState(supplierDebts)
  const [supplierDebtLoaded, setSupplierDebtLoaded] = useState(screen === "suppliers")
  const [supplierDebtLoading, setSupplierDebtLoading] = useState(false)
  const [supplierDebtLoadError, setSupplierDebtLoadError] = useState<string | null>(null)
  const [supplierInventoryTarget, setSupplierInventoryTarget] = useState<Pick<Product, "id" | "name" | "sku"> | null>(null)

  const handleSupplierProfileUpdated = useCallback((profile: SupplierProfile) => {
    const key = supplierIdentityKey(profile.supplier_name, profile.supplier_phone)
    setSupplierDebtData((current) => ({
      ...current,
      profiles: [...current.profiles.filter(
        (item) => supplierIdentityKey(item.supplier_name, item.supplier_phone) !== key,
      ), profile],
      suppliers: profile.deleted_at
        ? current.suppliers.filter(
            (item) => supplierIdentityKey(item.supplier_name, item.supplier_phone) !== key,
          )
        : current.suppliers,
    }))
  }, [])
  const [showExitModal, setShowExitModal] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [siteHelpOpener, setSiteHelpOpener] = useState<(() => void) | null>(null)
  const registerSiteHelpOpener = useCallback((openHelp: () => void) => {
    setSiteHelpOpener(() => openHelp)
  }, [])
  const openSiteHelp = useCallback(() => siteHelpOpener?.(), [siteHelpOpener])

  // Счётчик нажатий «Назад» с главного экрана (0 или 1)
  const backCountRef = useRef(0)
  // Открыт ли модал подтверждения выхода (для обработчика popstate)
  const exitModalOpenRef = useRef(false)

  const canSeePurchasePrice = viewRole === "admin" || viewRole === "super_admin"
  const isAdmin = viewRole === "admin" || viewRole === "super_admin"
  const isSuperAdmin = profile.role === "super_admin"
  const activeShopId = profile.shop_id
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      if (!isOfflineSection(activeScreenRef.current)) {
        setActiveScreen("kassa")
        window.history.replaceState({ [CRM_HISTORY_KEY]: "kassa" }, "", SCREEN_PATHS.kassa)
        toast.info("Нет интернета — открыта офлайн-касса")
      }
    }
    setIsOnline(navigator.onLine)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  useEffect(() => {
    setActiveScreen(screen)
  }, [screen])

  // This ledger can contain the store's full history. Keep it off the first
  // POS/cash-screen response and request it only when an admin opens Suppliers.
  // Do not depend on supplierDebtLoading: setting it would run cleanup and
  // cancel this very request before its result can clear the spinner.
  useEffect(() => {
    if (
      activeScreen !== "suppliers" ||
      !isAdmin ||
      supplierDebtLoaded ||
      supplierDebtLoadError
    ) return
    let cancelled = false
    setSupplierDebtLoading(true)
    getSupplierDebtData()
      .then((data) => {
        if (!cancelled) {
          setSupplierDebtData(data)
          setSupplierDebtLoaded(true)
          setSupplierDebtLoading(false)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSupplierDebtLoadError(
            error instanceof Error ? error.message : "Не удалось загрузить долги поставщиков",
          )
          setSupplierDebtLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeScreen, isAdmin, supplierDebtLoaded, supplierDebtLoadError])

  // Local-first data is scoped to the server-selected branch; profile.shop_id remains
  // the original assignment and must not override the active branch.
  const localShopId = branchContext.activeShopId ?? profile.shop_id
  const localProfile = useMemo(
    () => localShopId ? { ...profile, shop_id: localShopId } : profile,
    [profile, localShopId],
  )
  const localCrm = useLocalCrm({
    profile: localProfile,
    shopId: localShopId,
    businessId: branchContext.businessId,
    enabled: Boolean(localShopId),
    products,
    sales,
    returns,
    cash,
    rates,
    clients,
    supplierDebts,
  })

  useEffect(() => {
    if (profile?.id) {
      saveUserSession({
        userId: profile.id,
        email: email || profile.email || undefined,
        profile: localProfile,
        shopId: localShopId || undefined,
      }).catch((err) => console.warn("Failed to persist offline session:", err))
    }
  }, [profile, localProfile, localShopId, email])

  const currentProducts = localCrm.isReady ? localCrm.products : products
  const currentSales = localCrm.isReady ? localCrm.sales : sales
  const confirmedSales = useMemo(
    () => currentSales.filter((sale) => sale.sync_status !== "pending" && sale.sync_status !== "rejected"),
    [currentSales],
  )
  const currentReturns = localCrm.isReady ? localCrm.returns : returns
  const currentCash = localCrm.isReady ? localCrm.cash : cash
  const currentRates = localCrm.isReady ? localCrm.rates : rates
  const currentClients = localCrm.isReady ? localCrm.clients : clients

  /** Переключение экрана: переход по отдельному URL. */
  const handleScreenChange = useCallback(
    (next: ScreenId) => {
      if (!navigator.onLine && !isOfflineSection(next)) {
        toast.info("Этот раздел доступен только с интернетом")
        return
      }
      backCountRef.current = 0 // сбрасываем счётчик при навигации вперёд
      setActiveScreen(next)
      window.history.pushState({ [CRM_HISTORY_KEY]: next }, "", SCREEN_PATHS[next])
    },
    [],
  )

  /**
   * Защита от случайного выхода из CRM работает только на главном экране
   * (/pos). На остальных экранах «Назад» — обычная навигация браузера
   * между URL-адресами разделов.
   */
  useEffect(() => {
    if (activeScreen !== "kassa") {
      const onSectionPopState = () => {
        const next = (Object.entries(SCREEN_PATHS) as [ScreenId, string][]).find(
          ([, path]) => path === window.location.pathname,
        )?.[0]
        if (!next) return
        if (!navigator.onLine && !isOfflineSection(next)) {
          setActiveScreen("kassa")
          window.history.replaceState({ [CRM_HISTORY_KEY]: "kassa" }, "", SCREEN_PATHS.kassa)
          return
        }
        setActiveScreen(next)
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
        if (!navigator.onLine && !isOfflineSection(next)) {
          window.history.replaceState({ [CRM_HISTORY_KEY]: "kassa" }, "", SCREEN_PATHS.kassa)
          setActiveScreen("kassa")
          toast.info("Без интернета доступны касса, склад, кабинет и ревизии")
          return
        }
        backCountRef.current = 0
        setActiveScreen(next)
        return
      }

      // Возвращаем «сторожевой» шаг в стек истории.
      pushCrmState("kassa")

      // Если модал уже открыт — повторное «Назад» его просто закрывает.
      if (exitModalOpenRef.current) {
        exitModalOpenRef.current = false
        setShowExitModal(false)
        backCountRef.current = 0
        return
      }

      // 1-е нажатие: ничего не происходит, остаёмся на месте.
      if (backCountRef.current === 0) {
        backCountRef.current = 1
        return
      }

      // 2-е нажатие: модальное окно подтверждения выхода.
      backCountRef.current = 0
      exitModalOpenRef.current = true
      setShowExitModal(true)
    }

    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [activeScreen])

  /** «Выйти» — разлогиниваем пользователя и уводим на страницу входа. */
  const handleExitCrm = async () => {
    exitModalOpenRef.current = false
    setShowExitModal(false)
    // Полная очистка локальных данных и кэшей перед выходом
    try {
      try { await logoutDeviceAccount() }
      catch (error) {
        if (!(error instanceof UnsyncedLogoutError)) throw error
        if (!window.confirm(error.message + " Восстановление невозможно. Стереть данные и выйти?")) return
        await logoutDeviceAccount({ discardUnsynced: true })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось безопасно завершить выход")
      return
    }
    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut({ scope: "local" })
    } catch {
      // даже при ошибке сети уводим пользователя на экран входа
    }
    router.replace("/auth/login")
  }

  /** «Отмена» — закрываем модал и сбрасываем счётчик нажатий «Назад». */
  const handleCancelExit = () => {
    exitModalOpenRef.current = false
    setShowExitModal(false)
    backCountRef.current = 0
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Модал подтверждения выхода из CRM */}
      <ExitConfirmModal
        open={showExitModal}
        onCancel={handleCancelExit}
        onConfirm={handleExitCrm}
      />

      <AppHeader
        profile={profile}
        branchContext={branchContext}
        businessName={businessName}
        branchCreationRequest={branchCreationRequest}
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
  activeShopId={activeShopId}
  branchContext={branchContext}
  onNavigate={handleScreenChange}
  onOpenCabinet={() => handleScreenChange("kabinet")} 
  onOpenHelp={openSiteHelp}
  mobileOpen={mobileNavOpen}
  onClose={() => setMobileNavOpen(false)}
  collapsed={sidebarCollapsed}
  onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
/>

        <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-6 md:px-6">
        {activeScreen === "kassa" && (
          <MemoizedKassaScreen
            key={activeShopId ?? "no-shop"}
            profile={profile}
            products={currentProducts}
            viewRole={viewRole}
            sales={currentSales}
            returns={currentReturns}
            cash={currentCash}
            ledgerBalance={isOnline ? cash.ledgerBalance : null}
            rates={currentRates}
            clients={currentClients}
            shopId={activeShopId}
            defaultReceiptType={cabinet.defaultReceiptType}
            onLocalCheckout={localCrm.localCheckout}
          />
        )}
        {activeScreen === "money" && (
          <MemoizedCashPanel
            sales={currentSales}
            operations={currentCash.operations}
            presets={currentCash.presets}
            ledgerBalance={isOnline ? cash.ledgerBalance : null}
            isAdmin={isAdmin}
          />
        )}
        {activeScreen === "vitrina" && (
          <VitrinaScreen
            products={currentProducts}
            canSeePurchasePrice={canSeePurchasePrice}
            isAdmin={isAdmin}
            isShopAdmin={profile.role === "admin"}
            storeId={profile.shop_id ?? ""}
            publicEnabled={publicStorefrontState.enabled}
            canManagePublicStorefront={publicStorefrontState.canToggle}
          />
        )}
        {activeScreen === "sklad" && (
          <SkladScreen
            products={currentProducts}
            branchContext={branchContext}
            sales={confirmedSales}
            canSeePurchasePrice={canSeePurchasePrice}
            isAdmin={isAdmin}
            allowOffline
            onProductSaved={localCrm.cacheSavedProduct}
            onProductDeleted={localCrm.cacheDeletedProduct}
            onOfflineDeleteProduct={localCrm.localDeleteProduct}
            focusProduct={supplierInventoryTarget}
            onFocusProductHandled={(productId: string) =>
              setSupplierInventoryTarget((current) => current?.id === productId ? null : current)
            }
          />
        )}
        {activeScreen === "revisions" && (
          <RevisionsScreen
            key={activeShopId ?? "no-shop"}
            products={currentProducts}
            shopId={activeShopId}
            productsReady={localCrm.isReady}
          />
        )}
        {activeScreen === "clients" && (
          <ClientsScreen clients={currentClients} allowOffline />
        )}
        {activeScreen === "suppliers" && isAdmin && (
          supplierDebtLoading && !supplierDebtLoaded ? (
            <SectionLoading />
          ) : supplierDebtLoadError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert">
              <p>{supplierDebtLoadError}</p>
              <button
                type="button"
                onClick={() => setSupplierDebtLoadError(null)}
                className="mt-3 rounded-lg border border-border px-3 py-1.5 font-medium"
              >
                Повторить
              </button>
            </div>
          ) : (
            <SuppliersScreen
              supplierDebts={supplierDebtData}
              products={currentProducts}
              sales={confirmedSales}
              isAdmin={isAdmin}
              onSupplierProfileUpdated={handleSupplierProfileUpdated}
              onOpenProduct={(product: Product) => {
                setSupplierInventoryTarget({ id: product.id, name: product.name, sku: product.sku })
                handleScreenChange("sklad")
              }}
            />
          )
        )}
        {activeScreen === "kabinet" && (
          <KabinetScreen
            profile={profile}
            viewRole={viewRole}
            sales={currentSales}
            returns={currentReturns}
            data={cabinet}
            email={email}
            syncLocal
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
        {activeScreen === "notifications" && <StoreNotificationsPage key={profile.id} profile={profile} shops={superAdminShops ?? []} />}
        {activeScreen === "announcements" && <StoreNotificationsPage key={profile.id} profile={profile} shops={superAdminShops ?? []} />}
        </main>
      </div>
      <SiteHelp screen={activeScreen} isAdmin={isAdmin} onRegisterOpenHelp={registerSiteHelpOpener} />
    </div>
  )
}
