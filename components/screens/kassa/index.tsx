"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import dynamic from "next/dynamic"
import type { MetalRate, Product, Profile, Role, Sale, SaleItem, Customer, SaleReturn } from "@/lib/types"
import { formatSom } from "@/lib/format"
import { buildRateMap, scrapRateOf } from "@/lib/rates"
import { round, toNumber } from "@/hooks/useCalculator"
import { checkout } from "@/app/actions/sales"
import type { SalesHistoryProps } from "@/components/sales-history"
import { CashPanel } from "@/components/screens/kassa/cash-panel"
import type { CashData } from "@/app/actions/cash"
import { Button } from "@/components/ui/button"
import { ArrowUp } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { PageLoader } from "@/components/ui/page-loader"
import { filterProducts, isSearchReady } from "@/lib/product-search"
import { getClientOperationAttempt, type ClientOperationAttempt } from "@/lib/client-operation"

import { KassaSearch } from "./kassa-search"
import { KassaCart } from "./kassa-cart"
import { KassaLossModal } from "./kassa-loss-modal"

export interface ExtendedSaleItem extends SaleItem {
  lineId: string
  discountPercent?: number
  discountSom?: number
}

const DEBOUNCE_MS = 350
const MIN_QUERY = 3
const LOCAL_STORAGE_KEY = "kassa_cart_state_v2"

const LazySalesHistory = dynamic(
  () => import("@/components/sales-history").then((mod) => mod.SalesHistory),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-48 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground" role="status">
        ÐÐ¾Ð´Ð³Ð¾ÑÐ°Ð²Ð»Ð¸Ð²Ð°ÐµÐ¼ Ð¸ÑÑÐ¾ÑÐ¸Ñ Ð¿ÑÐ¾Ð´Ð°Ð¶â¦
      </div>
    ),
  },
)

function DeferredSalesHistory(props: SalesHistoryProps) {
  const container = useRef<HTMLDivElement | null>(null)
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    const element = container.current
    if (!element) return
    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      { rootMargin: "600px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={container} className="min-w-0">
      {shouldLoad ? (
        <LazySalesHistory {...props} />
      ) : (
        <div className="min-h-48 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          ÐÑÑÐ¾ÑÐ¸Ñ Ð·Ð°Ð³ÑÑÐ·Ð¸ÑÑÑ Ð¿ÑÐ¸ Ð¿ÑÐ¾ÐºÑÑÑÐºÐµ Ðº ÑÑÐ¾Ð¼Ñ ÑÐ°Ð·Ð´ÐµÐ»Ñ
        </div>
      )}
    </div>
  )
}

export function KassaScreen({
  products,
  profile,
  viewRole,
  sales,
  cash,
  rates = [],
  clients = [],
  returns = [],
  onLocalCheckout,
  onlineOnly = false,
  shopId,
}: {
  products: Product[]
  profile: Profile
  viewRole: Role
  sales: Sale[]
  cash: CashData
  rates?: MetalRate[]
  clients?: Customer[]
  returns?: SaleReturn[]
  onLocalCheckout?: (input: any) => Promise<any>
  onlineOnly?: boolean
  shopId?: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refreshAfterReturn = useCallback(() => startTransition(() => router.refresh()), [router, startTransition])
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  
  const [cart, setCart] = useState<ExtendedSaleItem[]>([])
  const [bonusUsed, setBonusUsed] = useState("")
  const [payment, setPayment] = useState("cash")
  const [payCash, setPayCash] = useState("")
  const [payElectronic, setPayElectronic] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  
  const [submitting, setSubmitting] = useState(false)
  const checkoutAttempt = useRef<ClientOperationAttempt | null>(null)
  const checkoutBusy = useRef(false)
  const [confirmLoss, setConfirmLoss] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const cartStorageKey = `${LOCAL_STORAGE_KEY}:${shopId || profile.shop_id || "default"}`

  const [showScrollTop, setShowScrollTop] = useState(false)
  const [isCartOpenMobile, setIsCartOpenMobile] = useState(false)

  const showBonus = viewRole === "seller"
  const canSeeProfit = viewRole !== "seller"
  const isAdmin = viewRole !== "seller"

  const rateMap = useMemo(() => buildRateMap(rates), [rates])

  const sellers = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sales) map.set(s.seller_id, s.seller_name || "ÐÐµÐ· Ð¸Ð¼ÐµÐ½Ð¸")
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [sales])

  useEffect(() => {
    if (onlineOnly) {
      setCart([])
      setBonusUsed("")
      setCustomerName("")
      setCustomerPhone("")
      setPayment("cash")
      setIsLoaded(true)
      return
    }
    try {
      const saved = localStorage.getItem(cartStorageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
            if (Array.isArray(parsed.cart)) {
              // Ð¡ÑÐ°ÑÑÐµ ÑÐµÑÐ½Ð¾Ð²Ð¸ÐºÐ¸ Ð¼Ð¾Ð³Ð»Ð¸ ÑÐ¾Ð´ÐµÑÐ¶Ð°ÑÑ ÐºÐ¾Ð»Ð¸ÑÐµÑÑÐ²Ð¾ Ð±Ð¾Ð»ÑÑÐµ ÐµÐ´Ð¸Ð½Ð¸ÑÑ.
              // Ð ÑÐ²ÐµÐ»Ð¸ÑÐ½Ð¾Ð¼ CRM ÐºÐ°Ð¶Ð´Ð°Ñ ÑÑÑÐ¾ÐºÐ° â Ð¾ÑÐ´ÐµÐ»ÑÐ½Ð¾Ðµ ÑÐ½Ð¸ÐºÐ°Ð»ÑÐ½Ð¾Ðµ Ð¸Ð·Ð´ÐµÐ»Ð¸Ðµ.
              setCart(parsed.cart.map((item: ExtendedSaleItem) => ({ ...item, quantity: 1 })))
            }
        if (parsed.bonusUsed !== undefined) setBonusUsed(parsed.bonusUsed)
        if (parsed.payment !== undefined) setPayment(parsed.payment)
        if (parsed.customerName !== undefined) setCustomerName(parsed.customerName)
        if (parsed.customerPhone !== undefined) setCustomerPhone(parsed.customerPhone)
      }
    } catch (e) {
      console.error("[kassa] Error reading localStorage:", e)
    } finally {
      setIsLoaded(true)
    }
  }, [cartStorageKey, onlineOnly])

  useEffect(() => {
    if (!isLoaded || onlineOnly) return
    try {
      localStorage.setItem(
        cartStorageKey,
        JSON.stringify({ cart, bonusUsed, payment, customerName, customerPhone })
      )
    } catch (e) {
      console.error("[kassa] Error saving to localStorage:", e)
    }
  }, [cart, bonusUsed, payment, customerName, customerPhone, isLoaded, onlineOnly, cartStorageKey])

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)")
    const sync = () => setIsMobile(mql.matches)
    sync()
    mql.addEventListener("change", sync)

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement | Document
      let scrollTop = 0
      if (target instanceof Document) {
        scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
      } else if (target instanceof HTMLElement) {
        scrollTop = target.scrollTop
      }
      setShowScrollTop(scrollTop > 200)
    }

    window.addEventListener("scroll", handleScroll, true)
    return () => {
      mql.removeEventListener("change", sync)
      window.removeEventListener("scroll", handleScroll, true)
    }
  }, [])

  const pageSize = isMobile ? 8 : 12
  const [visible, setVisible] = useState(pageSize)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query])

  const qtyInCart = (id: string) => cart.filter((i) => i.product_id === id).length

  const results = useMemo(() => {
    if (!isSearchReady(debounced, MIN_QUERY)) return []
    return filterProducts(products, debounced).filter(
      (p) => p.status === "in_stock" && !p.is_hidden,
    )
  }, [products, debounced])

  useEffect(() => setVisible(pageSize), [debounced, pageSize])

  const trackRef = useRef<HTMLDivElement | null>(null)
  const onTrackScroll = () => {
    const el = trackRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      setVisible((v) => Math.min(v + pageSize, results.length))
    }
  }

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const already = prev.filter((i) => i.product_id === p.id).length
      if (already >= 1) {
        toast.error("Ð­ÑÐ¾Ñ ÑÐ¾Ð²Ð°Ñ ÑÐ¶Ðµ Ð´Ð¾Ð±Ð°Ð²Ð»ÐµÐ½ Ð² ÑÐµÐº")
        return prev
      }
      if (p.sale_price < p.purchase_price) {
        toast.warning(`Â«${p.name}Â» Ð¿ÑÐ¾Ð´Ð°ÑÑÑÑ Ð½Ð¸Ð¶Ðµ Ð·Ð°ÐºÑÐ¿Ð¾ÑÐ½Ð¾Ð¹ ÑÐµÐ½Ñ`)
      }
      const line: ExtendedSaleItem = {
        lineId: `${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        product_id: p.id,
        name: p.name,
        weight: p.weight,
        metal: p.metal,
        kind: "product",
        price_per_gram:
          p.price_per_gram_sale ?? (p.weight > 0 ? round(p.sale_price / p.weight, 2) : null),
        quantity: 1,
        price: p.sale_price,
        cost: p.purchase_price,
        discountPercent: 0,
        discountSom: 0,
      }
      const lastIdx = prev.map((i) => i.product_id).lastIndexOf(p.id)
      if (lastIdx === -1) return [...prev, line]
      return [...prev.slice(0, lastIdx + 1), line, ...prev.slice(lastIdx + 1)]
    })
  }

  const removeProductFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product_id !== productId))
  }

  const toggleCartProduct = (p: Product) => {
    const inCart = cart.some((i) => i.product_id === p.id)
    if (inCart) {
      removeProductFromCart(p.id)
      toast.info(`Â«${p.name}Â» ÑÐ±ÑÐ°Ð½ Ð¸Ð· ÑÐµÐºÐ°`)
    } else {
      addToCart(p)
    }
  }

  /** ÐÐµÑÐµÑÑÑÑ ÑÑÑÐ¾ÐºÐ¸ ÑÐµÐºÐ° Ð¿Ð¾ ÑÐµÐ½Ðµ Ð·Ð° Ð³ÑÐ°Ð¼Ð¼. */
  const changeItemPricePerGram = (lineId: string, value: number) => {
    const perGram = Math.max(0, toNumber(value))
    setCart((prev) =>
      prev.map((i) => {
        if (i.lineId !== lineId) return i
        const price = round(i.weight * perGram)
        const isScrap = i.kind === "scrap"
        return {
          ...i,
          price_per_gram: perGram,
          price,
          cost: isScrap ? price : i.cost,
          // ÑÐµÐ½Ð° Ð¿ÐµÑÐµÑÑÐ¸ÑÐ°Ð½Ð° Ð·Ð°Ð½Ð¾Ð²Ð¾ â Ð¿ÑÐµÐ¶Ð½ÑÑ ÑÐºÐ¸Ð´ÐºÐ° Ðº Ð½ÐµÐ¹ ÑÐ¶Ðµ Ð½Ðµ Ð¾ÑÐ½Ð¾ÑÐ¸ÑÑÑ
          discountSom: 0,
          discountPercent: 0,
        }
      }),
    )
  }

  /** ÐÐ·Ð¼ÐµÐ½ÐµÐ½Ð¸Ðµ Ð²ÐµÑÐ° ÑÑÑÐ¾ÐºÐ¸: Ð¸Ð¼ÐµÐµÑ ÑÐ¼ÑÑÐ» Ð´Ð»Ñ Ð»Ð¾Ð¼Ð°. */
  const changeItemWeight = (lineId: string, value: number) => {
    const weight = Math.max(0, toNumber(value))
    setCart((prev) =>
      prev.map((i) => {
        if (i.lineId !== lineId) return i
        const perGram = toNumber(i.price_per_gram)
        const price = perGram > 0 ? round(weight * perGram) : i.price
        const isScrap = i.kind === "scrap"
        return { ...i, weight, price, cost: isScrap ? price : i.cost }
      }),
    )
  }

  const changeItemDiscountPercent = (lineId: string, percentVal: number) => {
    const validPct = Math.min(100, Math.max(0, percentVal || 0))
    setCart((prev) =>
      prev.map((i) => {
        if (i.lineId !== lineId) return i
        const discountInSom = (i.price * validPct) / 100
        return { ...i, discountPercent: validPct, discountSom: Math.round(discountInSom) }
      }),
    )
  }

  const changeItemDiscountSom = (lineId: string, somVal: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.lineId !== lineId) return i
        const validSom = Math.min(i.price, Math.max(0, somVal || 0))
        const pct = i.price > 0 ? (validSom / i.price) * 100 : 0
        return { ...i, discountSom: validSom, discountPercent: Number(pct.toFixed(1)) }
      }),
    )
  }

  const removeItem = (lineId: string) => setCart((prev) => prev.filter((i) => i.lineId !== lineId))

  const handleReset = () => {
    checkoutAttempt.current = null
    setCart([])
    setBonusUsed("")
    setCustomerName("")
    setCustomerPhone("")
    setPayment("cash")
    setQuery("")
    if (!onlineOnly) localStorage.removeItem(cartStorageKey)
    toast.info("Ð§ÐµÐº Ð¿Ð¾Ð»Ð½Ð¾ÑÑÑÑ ÑÐ±ÑÐ¾ÑÐµÐ½")
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  
  const itemsSubtotalAfterItemDiscounts = cart.reduce((s, i) => {
    const discountPerItem = i.discountSom ?? ((i.price * (i.discountPercent || 0)) / 100)
    const effectiveUnitPrice = Math.max(0, i.price - discountPerItem)
    return s + effectiveUnitPrice * i.quantity
  }, 0)

  const totalDiscountAmount = subtotal - itemsSubtotalAfterItemDiscounts
  const overallDiscountPercent = subtotal > 0 ? (totalDiscountAmount / subtotal) * 100 : 0

  const bonusNum = showBonus ? Math.min(Number(bonusUsed) || 0, itemsSubtotalAfterItemDiscounts) : 0
  const total = Math.max(0, itemsSubtotalAfterItemDiscounts - bonusNum)
  const cartCost = cart.reduce((s, i) => s + i.cost * i.quantity, 0)
  const bonusEarned = Math.round(Math.max(0, total - cartCost) * (Number(profile.bonus_rate ?? 2) / 100))

  const lossItems = cart.filter((i) => {
    if (i.kind === "scrap") return false
    const disc = i.discountSom ?? ((i.price * (i.discountPercent || 0)) / 100)
    const eff = i.price - disc
    return eff < i.cost
  })
  
  const lossAmount = cart.reduce((s, i) => {
    if (i.kind === "scrap") return s
    const disc = i.discountSom ?? ((i.price * (i.discountPercent || 0)) / 100)
    const eff = i.price - disc
    return eff < i.cost ? s + (i.cost - eff) * i.quantity : s
  }, 0) + (total < cartCost ? cartCost - total : 0)
  
  const hasLoss = lossAmount > 0

  const doCheckout = async () => {
    if (checkoutBusy.current) return
    checkoutBusy.current = true
    setConfirmLoss(false)
    setSubmitting(true)
    try {
      const checkoutPayload = {
        items: cart.map((item) => {
          const disc = item.discountSom ?? ((item.price * (item.discountPercent || 0)) / 100)
          const { lineId: _lineId, discountPercent: _dp, discountSom: _ds, ...rest } = item
          return { ...rest, price: Math.max(0, item.price - disc) }
        }),
        discount: totalDiscountAmount,
        bonus_used: bonusNum,
        payment_method: payment,
        amount_cash: payment === "mixed" ? Number(payCash) || 0 : undefined,
        amount_electronic: payment === "mixed" ? Number(payElectronic) || 0 : undefined,
        customer_name: customerName,
        customer_phone: customerPhone,
      }

      if (onLocalCheckout) {
        const res = await onLocalCheckout(checkoutPayload)
        toast.success(`ÐÑÐ¾Ð´Ð°Ð¶Ð° Ð·Ð°Ð¿Ð¸ÑÐ°Ð½Ð° Ð»Ð¾ÐºÐ°Ð»ÑÐ½Ð¾: ${formatSom(res.sale?.final_price || total)}`, {
          description: "ÐÐ¶Ð¸Ð´Ð°ÐµÑ Ð¿Ð¾Ð´ÑÐ²ÐµÑÐ¶Ð´ÐµÐ½Ð¸Ñ ÑÐµÑÐ²ÐµÑÐ°. ÐÑÐ¸ ÐºÐ¾Ð½ÑÐ»Ð¸ÐºÑÐµ Ñ Ð´ÑÑÐ³Ð¾Ð¹ Ð¿ÑÐ¾Ð´Ð°Ð¶ÐµÐ¹ Ð¿ÑÐ¸Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ ÑÐ¾Ð¾Ð±ÑÐ¸Ñ Ð¾Ð± ÑÑÐ¾Ð¼.",
        })
      } else {
        checkoutAttempt.current = getClientOperationAttempt(checkoutAttempt.current, checkoutPayload)
        const res = await checkout({
          ...checkoutPayload,
          client_op_id: checkoutAttempt.current.clientOpId,
        })
        toast.success(`ÐÑÐ¾Ð´Ð°Ð¶Ð° Ð¾ÑÐ¾ÑÐ¼Ð»ÐµÐ½Ð°: ${formatSom(res.total)}`, {
          description: showBonus ? `ÐÐ°ÑÐ¸ÑÐ»ÐµÐ½Ð¾ ${res.bonusEarned} Ð±Ð¾Ð½ÑÑÐ¾Ð²` : undefined,
        })
      }
      handleReset()
      startTransition(() => router.refresh())
    } catch (e) {
      console.error("[kassa] checkout error:", e)
      toast.error(e instanceof Error ? e.message : "ÐÑÐ¸Ð±ÐºÐ° Ð¾ÑÐ¾ÑÐ¼Ð»ÐµÐ½Ð¸Ñ Ð¿ÑÐ¾Ð´Ð°Ð¶Ð¸")
    } finally {
      checkoutBusy.current = false
      setSubmitting(false)
    }
  }

  const submit = () => {
    if (cart.length === 0) return
    // Ð¡Ð¼ÐµÑÐ°Ð½Ð½Ð°Ñ Ð¾Ð¿Ð»Ð°ÑÐ°: Ð´Ð²Ðµ ÑÑÐ¼Ð¼Ñ Ð´Ð¾Ð»Ð¶Ð½Ñ Ð·Ð°ÐºÑÑÐ²Ð°ÑÑ ÑÐµÐº.
    if (payment === "mixed") {
      const paid = (Number(payCash) || 0) + (Number(payElectronic) || 0)
      if (Math.abs(paid - total) > 1) {
        toast.error(`Ð¡ÑÐ¼Ð¼Ñ Ð¾Ð¿Ð»Ð°ÑÑ Ð´Ð¾Ð»Ð¶Ð½Ñ Ð´Ð°Ð²Ð°ÑÑ ${formatSom(total)}`)
        return
      }
    }
    if (hasLoss) {
      setConfirmLoss(true)
      return
    }
    void doCheckout()
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" })
    document.body.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="relative w-full max-w-full overflow-x-hidden pb-12">
      {/* ÐÐ¾Ð°Ð´ÐµÑ Ð¿ÑÐ¸ Ð¾ÑÐ¾ÑÐ¼Ð»ÐµÐ½Ð¸Ð¸ Ð¿ÑÐ¾Ð´Ð°Ð¶Ð¸ */}
      {submitting && <PageLoader />}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
        <div className="order-1 min-w-0 w-full lg:col-start-1 lg:row-start-1">
          <CashPanel
            sales={sales}
            operations={cash.operations}
            presets={cash.presets}
            isAdmin={isAdmin}
            balanceOnly
          />
        </div>
        <div className="order-2 min-w-0 w-full lg:col-start-1 lg:row-start-2">
          <KassaSearch
            query={query}
            setQuery={setQuery}
            debounced={debounced}
            results={results}
            visible={visible}
            setVisible={setVisible}
            pageSize={pageSize}
            trackRef={trackRef}
            onTrackScroll={onTrackScroll}
            qtyInCart={qtyInCart}
            addToCart={addToCart}
            onToggleCart={toggleCartProduct}
            minQuery={MIN_QUERY}
            isAdmin={isAdmin}
          />
        </div>
        <div className="order-3 z-10 w-full min-w-0 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:row-span-3">
          <KassaCart
            cart={cart}
            isMobile={isMobile}
            isCartOpenMobile={isCartOpenMobile}
            setIsCartOpenMobile={setIsCartOpenMobile}
            hasLoss={hasLoss}
            lossAmount={lossAmount}
            lossItems={lossItems}
            removeItem={removeItem}
            products={products}
            changeItemPricePerGram={changeItemPricePerGram}
            changeItemWeight={changeItemWeight}
            scrapRateOf={(metal: string) => scrapRateOf(rateMap, metal)}
            changeItemDiscountSom={changeItemDiscountSom}
            changeItemDiscountPercent={changeItemDiscountPercent}
            customers={clients}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerPhone={customerPhone}
            setCustomerPhone={setCustomerPhone}
            showBonus={showBonus}
            bonusUsed={bonusUsed}
            setBonusUsed={setBonusUsed}
            payment={payment}
            payCash={payCash}
            setPayCash={setPayCash}
            payElectronic={payElectronic}
            setPayElectronic={setPayElectronic}
            isAdmin={isAdmin}
            setPayment={(v) => setPayment(v ?? "")}
            subtotal={subtotal}
            totalDiscountAmount={totalDiscountAmount}
            overallDiscountPercent={overallDiscountPercent}
            bonusNum={bonusNum}
            total={total}
            bonusEarned={bonusEarned}
            submitting={submitting}
            submit={submit}
            handleReset={handleReset}
          />
        </div>
        <div className="order-4 min-w-0 w-full lg:col-start-1 lg:row-start-3">
          <DeferredSalesHistory
            sales={sales}
            returns={returns}
            products={products}
            canSeeProfit={canSeeProfit}
            canReturn
            allowOffline={!onlineOnly}
            sellers={sellers}
            onReturned={refreshAfterReturn}
          />
        </div>
      </div>

      <KassaLossModal
        isOpen={confirmLoss}
        lossAmount={lossAmount}
        onClose={() => setConfirmLoss(false)}
        onConfirm={() => void doCheckout()}
      />

      {showScrollTop && (
        <Button
          onClick={scrollToTop}
          size="icon"
          className="fixed bottom-6 right-6 z-[50] h-10 w-10 rounded-full shadow-2xl transition-all duration-300 animate-in fade-in zoom-in-75 active:scale-90"
          aria-label="ÐÐ°Ð²ÐµÑÑ"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </div>
  )
}
