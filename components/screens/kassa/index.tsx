"use client"

<<<<<<< HEAD
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import dynamic from "next/dynamic"
import type { MetalRate, Product, Profile, Role, Sale, SaleItem, Customer, SaleReturn } from "@/lib/types"
import { formatSom } from "@/lib/format"
import { buildRateMap, scrapRateOf } from "@/lib/rates"
import { round, toNumber } from "@/hooks/useCalculator"
import { checkout } from "@/app/actions/sales"
import type { SalesHistoryProps } from "@/components/sales-history"
=======
import { useEffect, useMemo, useRef, useState } from "react"
import type { Product, Profile, Role, Sale, SaleItem } from "@/lib/types"
import { formatSom } from "@/lib/format"
import { checkout } from "@/app/actions/sales"
import { SalesHistory } from "@/components/sales-history"
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
import { CashPanel } from "@/components/screens/kassa/cash-panel"
import type { CashData } from "@/app/actions/cash"
import { Button } from "@/components/ui/button"
import { ArrowUp } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
<<<<<<< HEAD
import { PageLoader } from "@/components/ui/page-loader"
import { filterProducts, isSearchReady } from "@/lib/product-search"
import { getClientOperationAttempt, type ClientOperationAttempt } from "@/lib/client-operation"
=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6

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

<<<<<<< HEAD
const LazySalesHistory = dynamic(
  () => import("@/components/sales-history").then((mod) => mod.SalesHistory),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-48 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground" role="status">
        Подготавливаем историю продаж…
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
          История загрузится при прокрутке к этому разделу
        </div>
      )}
    </div>
  )
}

=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
export function KassaScreen({
  products,
  profile,
  viewRole,
  sales,
  cash,
<<<<<<< HEAD
  rates = [],
  clients = [],
  returns = [],
  onLocalCheckout,
  onlineOnly = false,
  shopId,
=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
}: {
  products: Product[]
  profile: Profile
  viewRole: Role
  sales: Sale[]
  cash: CashData
<<<<<<< HEAD
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
=======
}) {
  const router = useRouter()
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  
  const [cart, setCart] = useState<ExtendedSaleItem[]>([])
  const [bonusUsed, setBonusUsed] = useState("")
  const [payment, setPayment] = useState("cash")
<<<<<<< HEAD
  const [payCash, setPayCash] = useState("")
  const [payElectronic, setPayElectronic] = useState("")
=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  
  const [submitting, setSubmitting] = useState(false)
<<<<<<< HEAD
  const checkoutAttempt = useRef<ClientOperationAttempt | null>(null)
  const checkoutBusy = useRef(false)
  const [confirmLoss, setConfirmLoss] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const cartStorageKey = `${LOCAL_STORAGE_KEY}:${shopId || profile.shop_id || "default"}`

  const [showScrollTop, setShowScrollTop] = useState(false)
  const [isCartOpenMobile, setIsCartOpenMobile] = useState(false)
=======
  const [confirmLoss, setConfirmLoss] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  const [showScrollTop, setShowScrollTop] = useState(false)
  const [isCartOpenMobile, setIsCartOpenMobile] = useState(true)
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6

  const showBonus = viewRole === "seller"
  const canSeeProfit = viewRole !== "seller"
  const isAdmin = viewRole !== "seller"

<<<<<<< HEAD
  const rateMap = useMemo(() => buildRateMap(rates), [rates])

=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
  const sellers = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sales) map.set(s.seller_id, s.seller_name || "Без имени")
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [sales])

  useEffect(() => {
<<<<<<< HEAD
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
              // Старые черновики могли содержать количество больше единицы.
              // В ювелирном CRM каждая строка — отдельное уникальное изделие.
              setCart(parsed.cart.map((item: ExtendedSaleItem) => ({ ...item, quantity: 1 })))
            }
=======
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed.cart)) setCart(parsed.cart)
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
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
<<<<<<< HEAD
  }, [cartStorageKey, onlineOnly])

  useEffect(() => {
    if (!isLoaded || onlineOnly) return
    try {
      localStorage.setItem(
        cartStorageKey,
=======
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    try {
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
        JSON.stringify({ cart, bonusUsed, payment, customerName, customerPhone })
      )
    } catch (e) {
      console.error("[kassa] Error saving to localStorage:", e)
    }
<<<<<<< HEAD
  }, [cart, bonusUsed, payment, customerName, customerPhone, isLoaded, onlineOnly, cartStorageKey])
=======
  }, [cart, bonusUsed, payment, customerName, customerPhone, isLoaded])
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6

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

<<<<<<< HEAD
  const qtyInCart = (id: string) => cart.filter((i) => i.product_id === id).length

  const results = useMemo(() => {
    if (!isSearchReady(debounced, MIN_QUERY)) return []
    return filterProducts(products, debounced).filter(
      (p) => p.status === "in_stock" && !p.is_hidden,
=======
  const stockOf = (id: string) => products.find((p) => p.id === id)?.quantity ?? 0
  const qtyInCart = (id: string) => cart.filter((i) => i.product_id === id).length

  const results = useMemo(() => {
    if (debounced.length < MIN_QUERY) return []
    const q = debounced.toLowerCase()
    return products.filter(
      (p) =>
        p.quantity > 0 &&
        p.status !== "sold" &&
        (p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.metal ?? "").toLowerCase().includes(q)),
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
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
<<<<<<< HEAD
      if (already >= 1) {
        toast.error("Этот товар уже добавлен в чек")
=======
      if (already >= p.quantity) {
        toast.error(`Достигнуто максимальное количество товара в наличии (Остаток: ${p.quantity} шт.)`)
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
        return prev
      }
      if (p.sale_price < p.purchase_price) {
        toast.warning(`«${p.name}» продаётся ниже закупочной цены`)
      }
      const line: ExtendedSaleItem = {
        lineId: `${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        product_id: p.id,
        name: p.name,
        weight: p.weight,
        metal: p.metal,
<<<<<<< HEAD
        kind: "product",
        price_per_gram:
          p.price_per_gram_sale ?? (p.weight > 0 ? round(p.sale_price / p.weight, 2) : null),
=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
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

<<<<<<< HEAD
  const removeProductFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product_id !== productId))
  }

  const toggleCartProduct = (p: Product) => {
    const inCart = cart.some((i) => i.product_id === p.id)
    if (inCart) {
      removeProductFromCart(p.id)
      toast.info(`«${p.name}» убран из чека`)
    } else {
      addToCart(p)
    }
  }

  /** Пересчёт строки чека по цене за грамм. */
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
          // цена пересчитана заново — прежняя скидка к ней уже не относится
          discountSom: 0,
          discountPercent: 0,
        }
      }),
    )
  }

  /** Изменение веса строки: имеет смысл для лома. */
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

=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
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

<<<<<<< HEAD
  const removeItem = (lineId: string) => setCart((prev) => prev.filter((i) => i.lineId !== lineId))

  const handleReset = () => {
    checkoutAttempt.current = null
=======
  const applyDiscountToAll = (line: ExtendedSaleItem) => {
    setCart((prev) =>
      prev.map((i) =>
        i.product_id === line.product_id
          ? { ...i, discountSom: line.discountSom ?? 0, discountPercent: line.discountPercent ?? 0 }
          : i,
      ),
    )
    toast.success("Скидка применена ко всем единицам товара")
  }

  const removeItem = (lineId: string) => setCart((prev) => prev.filter((i) => i.lineId !== lineId))

  const handleReset = () => {
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
    setCart([])
    setBonusUsed("")
    setCustomerName("")
    setCustomerPhone("")
    setPayment("cash")
    setQuery("")
<<<<<<< HEAD
    if (!onlineOnly) localStorage.removeItem(cartStorageKey)
=======
    localStorage.removeItem(LOCAL_STORAGE_KEY)
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
    toast.info("Чек полностью сброшен")
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
<<<<<<< HEAD
    if (i.kind === "scrap") return false
=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
    const disc = i.discountSom ?? ((i.price * (i.discountPercent || 0)) / 100)
    const eff = i.price - disc
    return eff < i.cost
  })
  
  const lossAmount = cart.reduce((s, i) => {
<<<<<<< HEAD
    if (i.kind === "scrap") return s
=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
    const disc = i.discountSom ?? ((i.price * (i.discountPercent || 0)) / 100)
    const eff = i.price - disc
    return eff < i.cost ? s + (i.cost - eff) * i.quantity : s
  }, 0) + (total < cartCost ? cartCost - total : 0)
  
  const hasLoss = lossAmount > 0

  const doCheckout = async () => {
<<<<<<< HEAD
    if (checkoutBusy.current) return
    checkoutBusy.current = true
    setConfirmLoss(false)
    setSubmitting(true)
    try {
      const checkoutPayload = {
=======
    setConfirmLoss(false)
    setSubmitting(true)
    try {
      const res = await checkout({
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
        items: cart.map((item) => {
          const disc = item.discountSom ?? ((item.price * (item.discountPercent || 0)) / 100)
          const { lineId: _lineId, discountPercent: _dp, discountSom: _ds, ...rest } = item
          return { ...rest, price: Math.max(0, item.price - disc) }
        }),
        discount: totalDiscountAmount,
        bonus_used: bonusNum,
        payment_method: payment,
<<<<<<< HEAD
        amount_cash: payment === "mixed" ? Number(payCash) || 0 : undefined,
        amount_electronic: payment === "mixed" ? Number(payElectronic) || 0 : undefined,
        customer_name: customerName,
        customer_phone: customerPhone,
      }

      if (onLocalCheckout) {
        const res = await onLocalCheckout(checkoutPayload)
        toast.success(`Продажа записана локально: ${formatSom(res.sale?.final_price || total)}`, {
          description: "Ожидает подтверждения сервера. При конфликте с другой продажей приложение сообщит об этом.",
        })
      } else {
        checkoutAttempt.current = getClientOperationAttempt(checkoutAttempt.current, checkoutPayload)
        const res = await checkout({
          ...checkoutPayload,
          client_op_id: checkoutAttempt.current.clientOpId,
        })
        toast.success(`Продажа оформлена: ${formatSom(res.total)}`, {
          description: showBonus ? `Начислено ${res.bonusEarned} бонусов` : undefined,
        })
      }
      handleReset()
      startTransition(() => router.refresh())
=======
        customer_name: customerName,
        customer_phone: customerPhone,
      })
      toast.success(`Продажа оформлена: ${formatSom(res.total)}`, {
        description: showBonus ? `Начислено ${res.bonusEarned} бонусов` : undefined,
      })
      handleReset()
      router.refresh()
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
    } catch (e) {
      console.error("[kassa] checkout error:", e)
      toast.error(e instanceof Error ? e.message : "Ошибка оформления продажи")
    } finally {
<<<<<<< HEAD
      checkoutBusy.current = false
=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
      setSubmitting(false)
    }
  }

  const submit = () => {
    if (cart.length === 0) return
<<<<<<< HEAD
    // Смешанная оплата: две суммы должны закрывать чек.
    if (payment === "mixed") {
      const paid = (Number(payCash) || 0) + (Number(payElectronic) || 0)
      if (Math.abs(paid - total) > 1) {
        toast.error(`Суммы оплаты должны давать ${formatSom(total)}`)
        return
      }
    }
=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
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
<<<<<<< HEAD
      {/* Лоадер при оформлении продажи */}
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
=======
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-6 items-start">
        
        <div className="flex flex-col gap-6 order-1 min-w-0 w-full">
          <CashPanel sales={sales} operations={cash.operations} presets={cash.presets} isAdmin={isAdmin} />
          
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
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
<<<<<<< HEAD
            onToggleCart={toggleCartProduct}
            minQuery={MIN_QUERY}
            isAdmin={isAdmin}
          />
        </div>
        <div className="order-3 z-10 w-full min-w-0 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:row-span-3">
=======
            minQuery={MIN_QUERY}
          />
          
          <div className="hidden lg:block">
             <SalesHistory sales={sales} canSeeProfit={canSeeProfit} sellers={sellers} />
          </div>
        </div>
        
        <div className="order-2 w-full lg:sticky lg:top-4 z-10 min-w-0">
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
          <KassaCart
            cart={cart}
            isMobile={isMobile}
            isCartOpenMobile={isCartOpenMobile}
            setIsCartOpenMobile={setIsCartOpenMobile}
            hasLoss={hasLoss}
            lossAmount={lossAmount}
            lossItems={lossItems}
<<<<<<< HEAD
            removeItem={removeItem}
            products={products}
            changeItemPricePerGram={changeItemPricePerGram}
            changeItemWeight={changeItemWeight}
            scrapRateOf={(metal: string) => scrapRateOf(rateMap, metal)}
            changeItemDiscountSom={changeItemDiscountSom}
            changeItemDiscountPercent={changeItemDiscountPercent}
            customers={clients}
=======
            stockOf={stockOf}
            removeItem={removeItem}
            addToCart={addToCart}
            products={products}
            changeItemDiscountSom={changeItemDiscountSom}
            changeItemDiscountPercent={changeItemDiscountPercent}
            applyDiscountToAll={applyDiscountToAll}
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerPhone={customerPhone}
            setCustomerPhone={setCustomerPhone}
            showBonus={showBonus}
            bonusUsed={bonusUsed}
            setBonusUsed={setBonusUsed}
            payment={payment}
<<<<<<< HEAD
            payCash={payCash}
            setPayCash={setPayCash}
            payElectronic={payElectronic}
            setPayElectronic={setPayElectronic}
            isAdmin={isAdmin}
=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
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
<<<<<<< HEAD
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
=======

        <div className="order-3 lg:hidden w-full min-w-0 mt-2">
           <SalesHistory sales={sales} canSeeProfit={canSeeProfit} sellers={sellers} />
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
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
          aria-label="Наверх"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </div>
  )
<<<<<<< HEAD
}
=======
}
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
