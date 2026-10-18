"use client"

import { useEffect, useState } from "react"
import type { Product } from "@/lib/types"
import { CATEGORIES, METALS } from "@/lib/types"
import { createProduct, updateProduct, type ProductInput } from "@/app/actions/products"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ProductImages } from "@/components/product-images"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

type FormState = Required<Pick<ProductInput, "name" | "category" | "metal" | "weight" | "size" | "sku" | "purchase_price" | "sale_price">> & {
  images: string[]
  supplier_name: string
  supplier_phone: string
}

const EMPTY: FormState = {
  name: "",
  category: "Кольца",
  metal: "Золото 585",
  weight: 0,
  size: "",
  sku: "",
  purchase_price: 0,
  sale_price: 0,
  images: [],
  supplier_name: "",
  supplier_phone: "",
}

/** Проба вытягивается из названия металла: «Золото 585» → «585». */
function purityFromMetal(metal: string) {
  const m = metal.match(/(\d{3})/)
  return m ? m[1] : ""
}

export function ProductDialog({
  open,
  onOpenChange,
  product,
  canSeePurchasePrice,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  product: Product | null
  canSeePurchasePrice: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (product) {
      const gallery = product.images?.length
        ? product.images
        : product.image_url
          ? [product.image_url]
          : []
      setForm({
        name: product.name,
        category: product.category ?? "Кольца",
        metal: product.metal ?? "Золото 585",
        weight: product.weight,
        size: product.size ?? "",
        sku: product.sku ?? "",
        purchase_price: product.purchase_price,
        sale_price: product.sale_price,
        images: gallery,
        supplier_name: product.supplier_name ?? "",
        supplier_phone: product.supplier_phone ?? "",
      })
    } else {
      setForm(EMPTY)
    }
  }, [product, open])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const pickMetal = (m: string) =>
    setForm((f) => ({ ...f, metal: m }))

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Укажите название")
      return
    }
    setSaving(true)
    try {
      const payload: ProductInput = {
        ...form,
        image_url: form.images[0] ?? null,
        supplier_name: form.supplier_name.trim() || null,
        supplier_phone: form.supplier_phone.trim() || null,
      }
      if (product) {
        await updateProduct(product.id, payload)
        toast.success("Товар обновлён")
      } else {
        await createProduct(payload)
        toast.success("Товар добавлен")
      }
      onOpenChange(false)
      router.refresh()
    } catch (e) {
      console.error("[aura] save product error:", e)
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Редактировать товар" : "Новый товар"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="p-name">Название</Label>
            <Input id="p-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Металл</Label>
            <div className="flex flex-wrap gap-1.5">
              {METALS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMetal(m)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    form.metal === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Категория</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v ?? "")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Проба</Label>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                {purityFromMetal(form.metal) || "—"} <span className="ml-2 text-xs">по выбранному металлу</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="p-weight">Вес (г)</Label>
              <Input
                id="p-weight"
                type="number"
                min={0}
                step="0.01"
                value={form.weight || ""}
                onChange={(e) => set("weight", Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-size">Размер</Label>
              <Input id="p-size" value={form.size} onChange={(e) => set("size", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="p-sku">Артикул</Label>
              <Input id="p-sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-sell">Цена продажи (с)</Label>
              <Input
                id="p-sell"
                type="number"
                min={0}
                value={form.sale_price || ""}
                onChange={(e) => set("sale_price", Number(e.target.value))}
              />
            </div>
          </div>

          {canSeePurchasePrice && (
            <div className="grid gap-2">
              <Label htmlFor="p-buy">Закупка (с)</Label>
              <Input
                id="p-buy"
                type="number"
                min={0}
                value={form.purchase_price || ""}
                onChange={(e) => set("purchase_price", Number(e.target.value))}
              />
            </div>
          )}

          {/* Источник товара */}
          <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <div className="text-sm font-medium">Источник товара</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="p-supplier">ФИО поставщика</Label>
                <Input
                  id="p-supplier"
                  placeholder="Иванов Иван"
                  value={form.supplier_name}
                  onChange={(e) => set("supplier_name", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-supplier-phone">Номер телефона</Label>
                <Input
                  id="p-supplier-phone"
                  type="tel"
                  placeholder="+996 ..."
                  value={form.supplier_phone}
                  onChange={(e) => set("supplier_phone", e.target.value)}
                />
              </div>
            </div>
          </div>

          <ProductImages images={form.images} onChange={(next) => set("images", next)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-transparent">
            Отмена
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
