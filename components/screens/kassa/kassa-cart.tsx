"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  Minus, 
  Plus, 
  RefreshCw, 
  ShoppingCart, 
  Trash2,
  User,
  Phone,
  Gift,
  CreditCard
} from "lucide-react"
import { PAYMENT_METHODS, type Product } from "@/lib/types"
import { formatSom } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ExtendedSaleItem } from "./index" // или ваш файл типов

interface KassaCartProps {
  cart: ExtendedSaleItem[]
  isMobile: boolean
  isCartOpenMobile: boolean
  setIsCartOpenMobile: (open: boolean) => void
  hasLoss: boolean
  lossAmount: number
  lossItems: ExtendedSaleItem[]
  stockOf: (id: string) => number
  removeItem: (lineId: string) => void
  addToCart: (p: Product) => void
  products: Product[]
  changeItemDiscountSom: (lineId: string, val: number) => void
  changeItemDiscountPercent: (lineId: string, val: number) => void
  applyDiscountToAll: (item: ExtendedSaleItem) => void
  customerName: string
  setCustomerName: (name: string) => void
  customerPhone: string
  setCustomerPhone: (phone: string) => void
  showBonus: boolean
  bonusUsed: string
  setBonusUsed: (bonus: string) => void
  payment: string
  setPayment: (payment: string | null) => void
  subtotal: number
  totalDiscountAmount: number
  overallDiscountPercent: number
  bonusNum: number
  total: number
  bonusEarned: number
  submitting: boolean
  submit: () => void
  handleReset: () => void
}

export function KassaCart({
  cart,
  isMobile,
  isCartOpenMobile,
  setIsCartOpenMobile,
  hasLoss,
  lossAmount,
  lossItems,
  stockOf,
  removeItem,
  addToCart,
  products,
  changeItemDiscountSom,
  changeItemDiscountPercent,
  applyDiscountToAll,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  showBonus,
  bonusUsed,
  setBonusUsed,
  payment,
  setPayment,
  subtotal,
  totalDiscountAmount,
  overallDiscountPercent,
  bonusNum,
  total,
  bonusEarned,
  submitting,
  submit,
  handleReset,
}: KassaCartProps) {
  return (
    <div className="flex flex-col rounded-2xl border border-border/80 bg-card/90 backdrop-blur shadow-xl overflow-hidden">
      <div 
        className="flex items-center justify-between border-b border-border/80 px-4 py-3.5 bg-muted/20 cursor-pointer lg:cursor-default"
        onClick={() => isMobile && setIsCartOpenMobile(!isCartOpenMobile)}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <h2 className="font-semibold text-sm tracking-tight">Чек / Корзина</h2>
          {cart.length > 0 && (
            <Badge variant="secondary" className="px-2 py-0.5 text-xs font-mono font-bold bg-primary/15 text-primary border-primary/20">
              {cart.length}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {cart.length > 0 && !isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors px-2"
              title="Очистить чек и сбросить данные"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Сброс
            </Button>
          )}
          {isMobile && (
            <Button variant="ghost" size="icon" className="h-7 w-7">
              {isCartOpenMobile ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      <div className={cn("flex-col", isMobile && !isCartOpenMobile ? "hidden" : "flex")}>
        {hasLoss && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span>⚠️ Товар продаётся в убыток! Убыток: −{formatSom(lossAmount)}</span>
              <span className="mt-0.5 block text-[10px] font-normal opacity-90">{lossItems.map((i) => i.name).join(", ")}</span>
            </div>
          </div>
        )}

        <div className="max-h-[35vh] lg:max-h-[40vh] overflow-y-auto px-4 py-2 scrollbar-thin">
          {cart.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <ShoppingCart className="h-8 w-8 stroke-1 text-muted-foreground/30" />
              <p>Добавьте товары из поиска в чек</p>
            </div>
          ) : (
            cart.map((i) => {
              const stock = stockOf(i.product_id)
              const sameProduct = cart.filter((c) => c.product_id === i.product_id)
              const unitNo = sameProduct.findIndex((c) => c.lineId === i.lineId) + 1
              const canAddMore = sameProduct.length < stock
              const discountVal = i.discountSom ?? ((i.price * (i.discountPercent || 0)) / 100)
              const effectiveUnitPrice = Math.max(0, i.price - discountVal)
              const itemLoss = effectiveUnitPrice < i.cost
              const product = products.find((p) => p.id === i.product_id)

              return (
                <div key={i.lineId} className="flex flex-col border-b border-border/50 py-3 last:border-0 gap-2">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-xs font-semibold">
                        {i.name}
                        {sameProduct.length > 1 && (
                          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                            ед. {unitNo} из {sameProduct.length}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                        {discountVal > 0 ? (
                          <>
                            <span className="line-through mr-1 opacity-60 text-[10px]">{formatSom(i.price)}</span>
                            <span className="text-primary font-semibold">{formatSom(effectiveUnitPrice)}</span>
                          </>
                        ) : (
                          formatSom(i.price)
                        )}{" "}
                        <span className="text-[10px] opacity-70">· остаток {stock} шт.</span>
                      </div>
                      {itemLoss && (
                        <div className="font-mono text-[10px] font-semibold text-destructive mt-0.5">
                          убыток −{formatSom(i.cost - effectiveUnitPrice)}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 border border-border/40">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-md hover:bg-background"
                        title="Убрать единицу"
                        onClick={() => removeItem(i.lineId)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-5 text-center text-xs font-mono font-medium tabular-nums">1</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-md hover:bg-background"
                        disabled={!canAddMore || !product}
                        title={canAddMore ? "Добавить ещё единицу" : `Остаток: ${stock} шт.`}
                        onClick={() => product && addToCart(product)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      onClick={() => removeItem(i.lineId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-[10px] bg-muted/30 p-1.5 rounded-lg border border-border/30 gap-2">
                    <span className="text-muted-foreground font-medium">Скидка на ед:</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={i.discountSom || ""}
                          onChange={(e) => changeItemDiscountSom(i.lineId, parseFloat(e.target.value))}
                          className="h-6 w-14 text-center px-1 text-[11px] font-mono bg-background"
                        />
                        <span className="text-[10px] text-muted-foreground">с</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="0"
                          value={i.discountPercent || ""}
                          onChange={(e) => changeItemDiscountPercent(i.lineId, parseFloat(e.target.value))}
                          className="h-6 w-12 text-center px-1 text-[11px] font-mono bg-background"
                        />
                        <span className="text-[10px] text-muted-foreground">%</span>
                      </div>
                      {sameProduct.length > 1 && (
                        <button
                          onClick={() => applyDiscountToAll(i)}
                          className="rounded border border-border/80 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                        >
                          Ко всем
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="space-y-3 border-t border-border/80 p-4 bg-muted/20">
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input 
                placeholder="Клиент" 
                value={customerName} 
                onChange={(e) => setCustomerName(e.target.value)} 
                className="h-8 pl-8 text-xs bg-background" 
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input 
                placeholder="Телефон" 
                value={customerPhone} 
                onChange={(e) => setCustomerPhone(e.target.value)} 
                className="h-8 pl-8 text-xs bg-background" 
              />
            </div>
          </div>

          <div className={cn("grid gap-2", showBonus ? "grid-cols-2" : "grid-cols-1")}>
            {showBonus && (
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Gift className="h-3 w-3 text-primary" /> Бонусами (с)
                </Label>
                <Input type="number" min={0} value={bonusUsed} onChange={(e) => setBonusUsed(e.target.value)} className="h-8 text-xs font-mono bg-background" />
              </div>
            )}
            
            {cart.length > 0 && isMobile && (
              <div className="flex items-end justify-end">
                <Button variant="outline" size="sm" onClick={handleReset} className="h-8 text-xs w-full text-muted-foreground bg-background">
                  <RefreshCw className="mr-1 h-3 w-3" /> Очистить
                </Button>
              </div>
            )}
          </div>

          <div className="relative">
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger className="h-8 text-xs bg-background">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 rounded-xl bg-background/80 border border-border/50 p-3 text-xs shadow-inner">
            <div className="flex justify-between text-muted-foreground">
              <span>Подытог</span>
              <span className="font-mono">{formatSom(subtotal)}</span>
            </div>
            {totalDiscountAmount > 0 && (
              <div className="flex justify-between text-destructive font-medium">
                <span>Скидка ({overallDiscountPercent.toFixed(1)}%)</span>
                <span className="font-mono">−{formatSom(totalDiscountAmount)}</span>
              </div>
            )}
            {bonusNum > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Бонусами</span>
                <span className="font-mono">−{formatSom(bonusNum)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 text-sm font-bold border-t border-border/60">
              <span>Итого</span>
              <span className="font-mono text-primary text-base">{formatSom(total)}</span>
            </div>
            {showBonus && total > 0 && (
              <div className="flex items-center justify-between pt-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                <span>Начислится бонусов</span>
                <span className="font-mono font-bold">+{bonusEarned}</span>
              </div>
            )}
          </div>

          <Button 
            className="w-full text-xs font-bold shadow-md h-10 transition-transform active:scale-[0.99]" 
            size="default" 
            disabled={cart.length === 0 || submitting} 
            onClick={submit}
          >
            {submitting ? "Оформление..." : `Оформить · ${formatSom(total)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}