"use client"

import { useMemo, useState } from "react"
import type { Product } from "@/lib/types"
import { formatSom, formatWeight } from "@/lib/format"
import { deleteProduct } from "@/app/actions/products"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Search, Plus, Pencil, Trash2, Sparkles, PackageX } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { ProductDialog } from "@/components/product-dialog"

export function SkladScreen({
  products,
  canSeePurchasePrice,
  isAdmin,
}: {
  products: Product[]
  canSeePurchasePrice: boolean
  isAdmin: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          (p.sku ?? "").toLowerCase().includes(query.toLowerCase()),
      ),
    [products, query],
  )

  const stockProducts = useMemo(
    () => products.filter((p) => p.status === "in_stock" || p.status === "reserved"),
    [products],
  )
  const totals = useMemo(() => {
    const count = stockProducts.length
    const weight = stockProducts.reduce((s, p) => s + p.weight, 0)
    const retail = stockProducts.reduce((s, p) => s + p.sale_price, 0)
    const cost = stockProducts.reduce((s, p) => s + p.purchase_price, 0)
    return { count, weight, retail, cost }
  }, [stockProducts])

  const onEdit = (p: Product) => {
    setEditing(p)
    setDialogOpen(true)
  }
  const onAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const onDelete = async (p: Product) => {
    if (!confirm(`Удалить «${p.name}»?`)) return
    try {
      await deleteProduct(p.id)
      toast.success("Товар удалён")
      router.refresh()
    } catch (e) {
      console.error("[v0] delete error:", e)
      toast.error("Не удалось удалить")
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl">Склад</h1>
          <p className="text-sm text-muted-foreground">Учёт товарных остатков</p>
        </div>
        <Button onClick={onAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Добавить товар
        </Button>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Позиций" value={String(totals.count)} />
        <StatCard label="Общий вес" value={formatWeight(totals.weight)} />
        <StatCard label="Розн. стоимость" value={formatSom(totals.retail)} />
        {canSeePurchasePrice && <StatCard label="Закуп. стоимость" value={formatSom(totals.cost)} />}
      </div>

      <div className="relative mb-4 sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Поиск..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Товар</TableHead>
              <TableHead className="hidden md:table-cell">Металл</TableHead>
              <TableHead className="hidden sm:table-cell">Вес</TableHead>
              <TableHead className="text-right">Статус</TableHead>
              {canSeePurchasePrice && <TableHead className="hidden text-right lg:table-cell">Закуп</TableHead>}
              <TableHead className="text-right">Цена</TableHead>
              <TableHead className="w-[1%]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                  <PackageX className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  Нет товаров
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url || "/placeholder.svg"} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Sparkles className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="line-clamp-1 text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.sku || p.category}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{p.metal}</TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">{formatWeight(p.weight)}</TableCell>
                  <TableCell className="text-right">
                    {p.status === "in_stock" ? (
                      <Badge variant="secondary" className="text-[10px]">В наличии</Badge>
                    ) : p.status === "reserved" ? (
                      <Badge variant="outline" className="text-[10px]">Резерв</Badge>
                    ) : p.status === "sold" ? (
                      <Badge variant="destructive" className="text-[10px]">Продан</Badge>
                    ) : p.status === "archived" ? (
                      <Badge variant="outline" className="text-[10px]">Архив</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Черновик</Badge>
                    )}
                  </TableCell>
                  {canSeePurchasePrice && (
                    <TableCell className="hidden text-right font-mono text-sm text-muted-foreground lg:table-cell">
                      {formatSom(p.purchase_price)}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-mono text-sm font-medium text-primary">
                    {formatSom(p.sale_price)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Редактировать товар" title="Открыть карточку товара для изменения" onClick={() => onEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          aria-label="Удалить товар"
                          title="Удалить товар со склада"
                          onClick={() => onDelete(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        canSeePurchasePrice={canSeePurchasePrice}
      />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </div>
  )
}
