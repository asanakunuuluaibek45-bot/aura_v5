/**
 * Подготовка строк для Excel-выгрузок экрана «Отчёты».
 *
 * Модуль чистый (без React, браузера и алиасов "@/"), поэтому его можно
 * проверять тестами напрямую через node. Само создание файла — в
 * lib/report-export-xlsx.ts.
 *
 * Два набора данных:
 *  • Налоговая сверка — внутреннее сопоставление фискальных продаж и возвратов.
 *    Это не декларация, не официальный формат ГНС и не файл для отправки.
 *    Себестоимость, прибыль, закупочные цены и поставщики сюда не попадают.
 *  • Управленческий — все чеки, себестоимость, скидки, прибыль, маржа,
 *    закупка, поставщики и стоимость лома.
 */
import type { Product, Sale, SaleItem, SaleReturn } from "./types"

export type CellKind = "text" | "datetime" | "weight" | "money" | "int" | "percent"
export type Column<Row> = { header: string; kind: CellKind; width: number; value: (row: Row) => string | number | null }
export type ProductInfo = Pick<Product, "id" | "category" | "metal">

export type SaleLine = {
  createdAt: string
  receiptNo: string
  receiptType: string
  seller: string
  customer: string
  sku: string
  name: string
  category: string
  metal: string
  purity: string
  /** Внутренний тип позиции нужен для исключения лома из сверки готовых изделий. */
  itemKind: "product" | "scrap" | "unknown"
  weight: number
  quantity: number
  payment: string
  cash: number
  electronic: number
  unallocated: number
  /** Сумма позиции до скидки чека и списания бонусов. */
  gross: number
  /** Фактическая скидка: доля скидки чека + доля оплаченных бонусов. */
  discount: number
  /** Фактически оплаченная сумма позиции (доля итога чека). */
  total: number
  cost: number
  profit: number
  /** Доля 0..1 для формата Excel «0.0%». */
  margin: number
}

export type ReturnLine = {
  createdAt: string
  receiptNo: string
  author: string
  sku: string
  name: string
  metal: string
  purity: string
  itemKind: "product" | "scrap" | "unknown"
  weight: number
  amount: number
  cost: number
  reason: string
  cash: number
  electronic: number
  unallocated: number
}

export type SummaryLine = { metric: string; value: number }
export type ReconciliationException = {
  createdAt: string
  document: string
  operation: string
  amount: number
  reason: string
}

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0)
export const round2 = (value: number) => Math.round((num(value) + Number.EPSILON) * 100) / 100

/** Короткий номер чека — так же, как его показывают в истории продаж. */
export const receiptNumber = (sale: Pick<Sale, "id">) => sale.id.slice(0, 8).toUpperCase()

/** «Золото 585» → «585»; «Платина» → «». */
export function purityOfMetal(metal: string | null | undefined): string {
  const match = (metal ?? "").trim().match(/(\d{3,4})\s*$/)
  return match ? match[1] : ""
}

/** «Вторичное золото 585» → «Вторичное золото»; «Золото 585» → «Золото». */
export function metalBase(metal: string | null | undefined): string {
  const raw = (metal ?? "").trim()
  const base = raw.replace(/\s*\d{3,4}\s*$/, "").trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : ""
}

export function metalWithPurity(metal: string | null | undefined): string {
  const base = metalBase(metal)
  const purity = purityOfMetal(metal)
  return [base, purity].filter(Boolean).join(" ")
}

/** Способ оплаты для налоговой: нал / безнал. */
export function paymentLabel(sale: Pick<Sale, "payment_method">): string {
  switch (sale.payment_method) {
    case "cash":
      return "Наличные"
    case "card":
    case "transfer":
      return "Безналичные"
    case "mixed":
      return "Наличные + безналичные"
    case "credit":
      return "В долг"
    default:
      return sale.payment_method || "—"
  }
}

/** Чек, который реально проведён: не удалён и не ждёт/не отклонён синхронизацией. */
export function isCountedSale(sale: Sale): boolean {
  return !sale.deleted_at && sale.sync_status !== "pending" && sale.sync_status !== "rejected"
}

export function inRange(iso: string, from: number | null, to: number): boolean {
  const time = Date.parse(iso)
  return Number.isFinite(time) && (from === null || time >= from) && time < to
}

/** Строго фискальные чеки — старые чеки без типа и нефискальные исключаются. */
export function fiscalSales(sales: Sale[], from: number | null, to: number): Sale[] {
  return sales.filter((s) => s.receipt_type === "fiscal" && isCountedSale(s) && inRange(s.created_at, from, to))
}

export function allSales(sales: Sale[], from: number | null, to: number): Sale[] {
  return sales.filter((s) => isCountedSale(s) && inRange(s.created_at, from, to))
}

/**
 * Раскладывает итог чека по позициям пропорционально цене позиции.
 * Последняя позиция забирает остаток округления, поэтому сумма строк
 * всегда равна итогу чека до копейки.
 */
function splitByShare(total: number, items: SaleItem[]): number[] {
  const weights = items.map((item) => Math.max(0, num(item.price) * Math.max(1, num(item.quantity))))
  const gross = weights.reduce((a, b) => a + b, 0)
  const parts = items.map((_, i) => (gross > 0 ? weights[i] / gross : 1 / items.length))
  let rest = round2(total)
  return parts.map((share, i) => {
    if (i === items.length - 1) return round2(rest)
    const value = round2(total * share)
    rest -= value
    return value
  })
}

export function saleLines(sales: Sale[], products: Map<string, ProductInfo>): SaleLine[] {
  const lines: SaleLine[] = []
  const sorted = [...sales].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const sale of sorted) {
    const items = sale.items ?? []
    if (items.length === 0) continue
    const totals = splitByShare(num(sale.total), items)
    const discounts = splitByShare(num(sale.discount) + num(sale.bonus_used), items)
    const split = reportPaymentSplit(sale, num(sale.total))
    const cashParts = splitByShare(split.cash, items)
    const electronicParts = totals.map((total, i) => split.unallocated === 0 ? round2(total - cashParts[i]) : 0)
    items.forEach((item, i) => {
      const product = products.get(item.product_id ?? "")
      const metal = item.metal ?? product?.metal ?? null
      const quantity = Math.max(1, num(item.quantity))
      const total = totals[i]
      const cost = round2(num(item.cost) * quantity)
      const profit = round2(total - cost)
      lines.push({
        createdAt: sale.created_at,
        receiptNo: receiptNumber(sale),
        receiptType: sale.receipt_type === "fiscal" ? "Фискальный" : sale.receipt_type === "non_fiscal" ? "Нефискальный" : "Не указан",
        seller: sale.seller_name ?? "",
        customer: sale.customer_name ?? "",
        sku: item.kind === "scrap" ? "" : item.sku ?? "",
        name: item.name || (item.kind === "scrap" ? "Лом" : ""),
        category: item.kind === "scrap" ? "Лом" : product?.category ?? "Прочее",
        metal: metalBase(metal),
        purity: purityOfMetal(metal),
        itemKind: item.kind === "scrap" || (!item.kind && !item.product_id)
          ? "scrap"
          : item.kind === "product" || item.product_id ? "product" : "unknown",
        weight: round2(num(item.weight)),
        quantity,
        payment: paymentLabel(sale),
        cash: cashParts[i],
        electronic: electronicParts[i],
        unallocated: round2(total - cashParts[i] - electronicParts[i]),
        gross: round2(total + discounts[i]),
        discount: discounts[i],
        total,
        cost,
        profit,
        margin: total > 0 ? Math.round((profit / total) * 10000) / 10000 : 0,
      })
    })
  }
  return lines
}

/** Возвраты отражаются в день фактической выплаты, а не в день исходной продажи. */
export function returnLines(
  returns: SaleReturn[],
  sales: Sale[],
  products: Map<string, ProductInfo>,
): ReturnLine[] {
  const saleById = new Map(sales.map((sale) => [sale.id, sale]))
  return [...returns]
    .filter((refund) => !refund.deleted_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((refund) => {
      const sale = saleById.get(refund.sale_id)
      const item = sale?.items?.[refund.item_index]
      const product = products.get(refund.product_id ?? item?.product_id ?? "")
      const metal = refund.item_metal ?? item?.metal ?? product?.metal ?? null
      const amount = round2(num(refund.amount ?? refund.return_amount))
      const split = reportPaymentSplit(sale, amount)
      return {
        createdAt: refund.created_at,
        receiptNo: sale ? receiptNumber(sale) : refund.sale_id.slice(0, 8).toUpperCase(),
        author: refund.author_name ?? "",
        sku: item?.sku ?? refund.sku ?? "",
        name: refund.item_name ?? refund.product_name ?? item?.name ?? "",
        metal: metalBase(metal),
        purity: purityOfMetal(metal),
        itemKind: item?.kind === "scrap"
          ? "scrap"
          : item?.kind === "product" || item?.product_id || refund.product_id
            ? "product"
            : "unknown",
        weight: round2(num(refund.item_weight ?? item?.weight)),
        amount,
        ...split,
        cost: round2(num(refund.cost)),
        reason: refund.reason ?? "",
      }
    })
}

export function managerNetSummary(sales: SaleLine[], refunds: ReturnLine[]): SummaryLine[] {
  const revenue = round2(sales.reduce((sum, line) => sum + line.total, 0))
  const refundAmount = round2(refunds.reduce((sum, line) => sum + line.amount, 0))
  const cost = round2(sales.reduce((sum, line) => sum + line.cost, 0))
  const returnedCost = round2(refunds.reduce((sum, line) => sum + line.cost, 0))
  const netRevenue = round2(revenue - refundAmount)
  const netCost = round2(cost - returnedCost)
  return [
    { metric: "Сумма продаж", value: revenue },
    { metric: "Возвращено покупателям", value: refundAmount },
    { metric: "Выручка после возвратов", value: netRevenue },
    { metric: "Себестоимость продаж", value: cost },
    { metric: "Себестоимость возвращённых изделий", value: returnedCost },
    { metric: "Чистая себестоимость", value: netCost },
    { metric: "Чистая прибыль после возвратов", value: round2(netRevenue - netCost) },
  ]
}

export function gnsNetSummary(sales: SaleLine[], refunds: ReturnLine[]): SummaryLine[] {
  const revenue = round2(sales.reduce((sum, line) => sum + line.total, 0))
  const refundAmount = round2(refunds.reduce((sum, line) => sum + line.amount, 0))
  return [
    { metric: "Фискальные продажи", value: revenue },
    { metric: "Возвраты по фискальным чекам", value: refundAmount },
    { metric: "Фискальная выручка после возвратов", value: round2(revenue - refundAmount) },
  ]
}

export const inStock = (products: Product[]) =>
  products
    .filter((p) => p.status === "in_stock" && !p.deleted_at)
    .sort((a, b) => (a.sku ?? "").localeCompare(b.sku ?? "", "ru"))

/* ─── Колонки ГНС ─────────────────────────────────────────────────────── */

export const GNS_SALES_COLUMNS: Column<SaleLine>[] = [
  { header: "Дата и время", kind: "datetime", width: 17, value: (r) => r.createdAt },
  { header: "Номер чека/продажи", kind: "text", width: 14, value: (r) => r.receiptNo },
  { header: "Артикул", kind: "text", width: 14, value: (r) => r.sku },
  { header: "Наименование изделия", kind: "text", width: 32, value: (r) => r.name },
  { header: "Металл и проба", kind: "text", width: 20, value: (r) => [r.metal, r.purity].filter(Boolean).join(" ") },
  { header: "Вес (г)", kind: "weight", width: 10, value: (r) => r.weight },
  { header: "Количество", kind: "int", width: 11, value: (r) => r.quantity },
  { header: "Способ оплаты", kind: "text", width: 22, value: (r) => r.payment },
  { header: "Сумма (сом)", kind: "money", width: 14, value: (r) => r.total },
]

export const GNS_STOCK_COLUMNS: Column<Product>[] = [
  { header: "Артикул", kind: "text", width: 14, value: (p) => p.sku ?? "" },
  { header: "Категория", kind: "text", width: 14, value: (p) => p.category ?? "Прочее" },
  { header: "Металл", kind: "text", width: 18, value: (p) => metalBase(p.metal) },
  { header: "Проба", kind: "text", width: 8, value: (p) => purityOfMetal(p.metal) },
  { header: "Вес (г)", kind: "weight", width: 10, value: (p) => round2(num(p.weight)) },
  { header: "Размер", kind: "text", width: 9, value: (p) => p.size ?? "" },
  { header: "Количество", kind: "int", width: 11, value: () => 1 },
  { header: "Розничная цена (сом)", kind: "money", width: 18, value: (p) => round2(num(p.sale_price)) },
]

export const RETURN_COLUMNS: Column<ReturnLine>[] = [
  { header: "Дата и время возврата", kind: "datetime", width: 20, value: (r) => r.createdAt },
  { header: "Номер исходного чека", kind: "text", width: 18, value: (r) => r.receiptNo },
  { header: "Оформил возврат", kind: "text", width: 20, value: (r) => r.author },
  { header: "Артикул", kind: "text", width: 14, value: (r) => r.sku },
  { header: "Наименование", kind: "text", width: 30, value: (r) => r.name },
  { header: "Металл", kind: "text", width: 16, value: (r) => r.metal },
  { header: "Проба", kind: "text", width: 8, value: (r) => r.purity },
  { header: "Вес (г)", kind: "weight", width: 10, value: (r) => r.weight },
  { header: "Возвращено покупателю (сом)", kind: "money", width: 24, value: (r) => r.amount },
  { header: "Возвращённая себестоимость (сом)", kind: "money", width: 28, value: (r) => r.cost },
  { header: "Причина", kind: "text", width: 34, value: (r) => r.reason },
]

export const GNS_RETURN_COLUMNS: Column<ReturnLine>[] = [
  { header: "Дата и время возврата", kind: "datetime", width: 20, value: (r) => r.createdAt },
  { header: "Номер исходного чека", kind: "text", width: 18, value: (r) => r.receiptNo },
  { header: "Артикул", kind: "text", width: 14, value: (r) => r.sku },
  { header: "Наименование", kind: "text", width: 30, value: (r) => r.name },
  { header: "Металл", kind: "text", width: 16, value: (r) => r.metal },
  { header: "Проба", kind: "text", width: 8, value: (r) => r.purity },
  { header: "Вес (г)", kind: "weight", width: 10, value: (r) => r.weight },
  { header: "Возвращено покупателю (сом)", kind: "money", width: 24, value: (r) => r.amount },
  { header: "Причина", kind: "text", width: 34, value: (r) => r.reason },
]

export const SUMMARY_COLUMNS: Column<SummaryLine>[] = [
  { header: "Показатель", kind: "text", width: 42, value: (r) => r.metric },
  { header: "Сумма (сом)", kind: "money", width: 20, value: (r) => r.value },
]

export const RECONCILIATION_EXCEPTION_COLUMNS: Column<ReconciliationException>[] = [
  { header: "Дата и время", kind: "datetime", width: 20, value: (r) => r.createdAt },
  { header: "Чек / документ", kind: "text", width: 20, value: (r) => r.document },
  { header: "Тип операции", kind: "text", width: 24, value: (r) => r.operation },
  { header: "Сумма (сом)", kind: "money", width: 18, value: (r) => r.amount },
  { header: "Причина проверки", kind: "text", width: 64, value: (r) => r.reason },
]

/* ─── Колонки управленческого отчёта ──────────────────────────────────── */

export const MANAGER_SALES_COLUMNS: Column<SaleLine>[] = [
  { header: "Дата и время", kind: "datetime", width: 17, value: (r) => r.createdAt },
  { header: "Номер чека", kind: "text", width: 12, value: (r) => r.receiptNo },
  { header: "Тип чека", kind: "text", width: 14, value: (r) => r.receiptType },
  { header: "Продавец", kind: "text", width: 18, value: (r) => r.seller },
  { header: "Покупатель", kind: "text", width: 18, value: (r) => r.customer },
  { header: "Артикул", kind: "text", width: 14, value: (r) => r.sku },
  { header: "Наименование", kind: "text", width: 30, value: (r) => r.name },
  { header: "Категория", kind: "text", width: 13, value: (r) => r.category },
  { header: "Металл", kind: "text", width: 16, value: (r) => r.metal },
  { header: "Проба", kind: "text", width: 8, value: (r) => r.purity },
  { header: "Вес (г)", kind: "weight", width: 10, value: (r) => r.weight },
  { header: "Количество", kind: "int", width: 11, value: (r) => r.quantity },
  { header: "Способ оплаты", kind: "text", width: 22, value: (r) => r.payment },
  { header: "Сумма до скидки (сом)", kind: "money", width: 18, value: (r) => r.gross },
  { header: "Фактическая скидка (сом)", kind: "money", width: 20, value: (r) => r.discount },
  { header: "Сумма продажи (сом)", kind: "money", width: 18, value: (r) => r.total },
  { header: "Себестоимость (сом)", kind: "money", width: 18, value: (r) => r.cost },
  { header: "Чистая прибыль (сом)", kind: "money", width: 18, value: (r) => r.profit },
  { header: "Маржа", kind: "percent", width: 9, value: (r) => r.margin },
]

export function managerStockColumns(scrapPrices: Record<string, number>): Column<Product>[] {
  const scrapPrice = (p: Product) => num(scrapPrices[purityOfMetal(p.metal) || (/платин/i.test(p.metal ?? "") ? "950" : "Прочее")])
  return [
    { header: "Артикул", kind: "text", width: 14, value: (p) => p.sku ?? "" },
    { header: "Наименование", kind: "text", width: 30, value: (p) => p.name },
    { header: "Категория", kind: "text", width: 13, value: (p) => p.category ?? "Прочее" },
    { header: "Металл", kind: "text", width: 18, value: (p) => metalBase(p.metal) },
    { header: "Проба", kind: "text", width: 8, value: (p) => purityOfMetal(p.metal) },
    { header: "Вес (г)", kind: "weight", width: 10, value: (p) => round2(num(p.weight)) },
    { header: "Размер", kind: "text", width: 9, value: (p) => p.size ?? "" },
    { header: "Количество", kind: "int", width: 11, value: () => 1 },
    { header: "Цена закупки (сом)", kind: "money", width: 17, value: (p) => round2(num(p.purchase_price)) },
    { header: "Закупка за грамм (сом)", kind: "money", width: 19, value: (p) => round2(num(p.price_per_gram_purchase)) },
    { header: "Розничная цена (сом)", kind: "money", width: 18, value: (p) => round2(num(p.sale_price)) },
    { header: "Поставщик", kind: "text", width: 20, value: (p) => p.supplier_name ?? "" },
    { header: "Телефон поставщика", kind: "text", width: 17, value: (p) => p.supplier_phone ?? "" },
    { header: "Цена лома за грамм (сом)", kind: "money", width: 20, value: (p) => round2(scrapPrice(p)) },
    { header: "Стоимость лома (сом)", kind: "money", width: 18, value: (p) => round2(num(p.weight) * scrapPrice(p)) },
    { header: "Дата поступления", kind: "datetime", width: 17, value: (p) => p.created_at },
  ]
}

/** Сводная строка значений таблицы (для проверки и записи в лист). */
export function tableRows<Row>(columns: Column<Row>[], rows: Row[]) {
  return rows.map((row) => columns.map((column) => column.value(row)))
}

/** Дата для имени файла по времени Бишкека (UTC+6): YYYY-MM-DD. */
export function fileDate(now = new Date()): string {
  return new Date(now.getTime() + 6 * 3_600_000).toISOString().slice(0, 10)
}

/** ISO → серийная дата Excel в часовом поясе Бишкека (UTC+6, без перехода на летнее время). */
export function excelSerialBishkek(iso: string): number | null {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  return (time + 6 * 3_600_000) / 86_400_000 + 25_569
}

/* ─── Настраиваемый экспорт и расчётные налоги КР ─────────────────────── */

export type ReportKind = "gns" | "manager"
export type SheetId = "sales" | "returns" | "stock" | "summary" | "exceptions"
export type TaxSettings = {
  regime: "single" | "general" | "none" | "other"
  singleActivity: "jewelry" | "retail"
  singleJewelryRate: number
  singleReducedRate: number
  singleThreshold: number
  rollingTurnover12m: number | null
  singleCash: number
  singleElectronic: number
  vat: number
  salesCash: number
  salesElectronic: number
}
export type ReportSettings = {
  version: 3
  tax: TaxSettings
  sheets: Record<SheetId, { enabled: boolean; columns: string[] }>
}
export const EXPORT_STORAGE_KEY = "aura:report-export:v1"
export const DEFAULT_TAX: TaxSettings = {
  regime: "none", singleActivity: "retail", singleJewelryRate: 0.25,
  singleReducedRate: 0.5, singleThreshold: 50_000_000, rollingTurnover12m: null,
  singleCash: 4, singleElectronic: 2,
  vat: 12, salesCash: 2, salesElectronic: 0,
}
export const SHEET_LABELS: Record<SheetId, string> = {
  sales: "Продажи", returns: "Возвраты", stock: "Остатки на складе", summary: "Сводка",
  exceptions: "Исключения и проверка",
}
export const SHEET_IDS: SheetId[] = ["sales", "returns", "stock", "summary", "exceptions"]
export type ReportInput = {
  sales: Sale[]
  productInfo: ProductInfo[]
  products: Product[]
  returns: SaleReturn[]
  from: number | null
  to: number
  scrapPrices?: Record<string, number>
  rollingTurnover12m?: number | null
  rollingTurnoverIncomplete?: boolean
}

/**
 * Не приравниваем долг, неизвестный способ и старую смешанную оплату без
 * разбивки к безналу с меньшей ставкой. Такие данные требуют исправления.
 * Возврат распределяется в той же пропорции, что исходная оплата.
 */
export function reportPaymentSplit(sale: Sale | undefined, amount: number) {
  const value = round2(amount)
  if (sale?.payment_method === "cash") return { cash: value, electronic: 0, unallocated: 0 }
  if (sale && ["card", "transfer"].includes(sale.payment_method)) {
    return { cash: 0, electronic: value, unallocated: 0 }
  }
  if (sale?.payment_method === "mixed") {
    const cash = Math.max(0, num(sale.amount_cash))
    const electronic = Math.max(0, num(sale.amount_electronic))
    if (cash + electronic > 0 && Math.abs(cash + electronic - num(sale.total)) <= 0.01) {
      const part = round2(value * cash / (cash + electronic))
      return { cash: part, electronic: round2(value - part), unallocated: 0 }
    }
  }
  return { cash: 0, electronic: 0, unallocated: value }
}

/** Суммы чеков уже включают НДС: выделяем его 12/112, а не начисляем повторно. */
export function calculateKrTax(cash: number, electronic: number, tax: TaxSettings) {
  const base = round2(cash + electronic)
  if (tax.regime === "none" || tax.regime === "other") return { base, vat: 0, salesTax: 0, singleTax: 0, total: 0 }
  if (tax.regime === "single") {
    const jewelry = tax.singleActivity === "jewelry"
    const useReducedRetailRate = jewelry || (
      tax.rollingTurnover12m !== null && tax.rollingTurnover12m <= tax.singleThreshold
    )
    const cashRate = jewelry ? tax.singleJewelryRate :
      useReducedRetailRate ? tax.singleReducedRate : tax.singleCash
    const electronicRate = jewelry ? tax.singleJewelryRate :
      useReducedRetailRate ? tax.singleReducedRate : tax.singleElectronic
    const singleTax = round2(cash * cashRate / 100 + electronic * electronicRate / 100)
    return { base, vat: 0, salesTax: 0, singleTax, total: singleTax }
  }
  const vat = round2(base * tax.vat / (100 + tax.vat))
  // НсП считается с оборота без НДС.
  const salesTax = round2((cash * tax.salesCash + electronic * tax.salesElectronic) / (100 + tax.vat))
  return { base: round2(base - vat), vat, salesTax, singleTax: 0, total: round2(vat + salesTax) }
}

export function configuredSalesColumns(kind: ReportKind, tax: TaxSettings): Column<SaleLine>[] {
  const basic = kind === "gns" ? GNS_SALES_COLUMNS : MANAGER_SALES_COLUMNS.filter(
    (column) => column.header !== "Чистая прибыль (сом)",
  )
  if (kind === "gns" || !["single", "general"].includes(tax.regime)) return basic
  return [
    ...basic,
    { header: "Валовая прибыль (сом)", kind: "money", width: 22, value: (r) => r.profit },
    { header: "Расчётный налог КР (сом)", kind: "money", width: 24,
      value: (r) => calculateKrTax(r.cash, r.electronic, tax).total },
    { header: "Чистая прибыль после налогов (сом)", kind: "money", width: 32,
      value: (r) => round2(r.gross - r.discount - r.cost - calculateKrTax(r.cash, r.electronic, tax).total) },
  ]
}

/** Заголовки — версионированные ключи настроек; чужие колонки не принимаем. */
export function reportColumnOptions(kind: ReportKind): Record<SheetId, string[]> {
  return {
    sales: configuredSalesColumns(kind, DEFAULT_TAX).map((c) => c.header),
    returns: (kind === "gns" ? GNS_RETURN_COLUMNS : RETURN_COLUMNS).map((c) => c.header),
    stock: (kind === "gns" ? GNS_STOCK_COLUMNS : managerStockColumns({})).map((c) => c.header),
    summary: SUMMARY_COLUMNS.map((c) => c.header),
    exceptions: RECONCILIATION_EXCEPTION_COLUMNS.map((c) => c.header),
  }
}

export function defaultReportSettings(kind: ReportKind): ReportSettings {
  const columns = reportColumnOptions(kind)
  return {
    version: 3,
    tax: { ...DEFAULT_TAX, regime: "none", singleActivity: kind === "gns" ? "jewelry" : "retail" },
    sheets: {
      sales: { enabled: true, columns: [...columns.sales] },
      returns: { enabled: true, columns: [...columns.returns] },
      // Остатки — текущий срез, а не операции за выбранный период.
      stock: { enabled: kind === "manager", columns: [...columns.stock] },
      summary: { enabled: true, columns: [...columns.summary] },
      exceptions: { enabled: kind === "gns", columns: [...columns.exceptions] },
    },
  }
}

/** localStorage недоверенный: проверяем версию, ставки, типы и разрешённые колонки. */
export function normalizeReportSettings(kind: ReportKind, raw: unknown): ReportSettings {
  const defaults = defaultReportSettings(kind)
  if (!raw || typeof raw !== "object") return defaults
  const value = raw as Omit<Partial<ReportSettings>, "version"> & { version?: number }
  if (value.version !== 1 && value.version !== 2 && value.version !== 3) return defaults
  const tax = value.tax
  if (tax && typeof tax === "object") {
    if (["single", "general", "none", "other"].includes(tax.regime)) defaults.tax.regime = tax.regime
    if (tax.singleActivity === "jewelry" || tax.singleActivity === "retail") defaults.tax.singleActivity = tax.singleActivity
    for (const key of [
      "singleJewelryRate", "singleReducedRate", "singleThreshold", "singleCash", "singleElectronic",
      "vat", "salesCash", "salesElectronic",
    ] as const) {
      const max = key === "singleThreshold" ? Number.MAX_SAFE_INTEGER : 100
      if (typeof tax[key] === "number" && Number.isFinite(tax[key]) && tax[key] >= 0 && tax[key] <= max) {
        defaults.tax[key] = tax[key]
      }
    }
    if (tax.rollingTurnover12m === null) defaults.tax.rollingTurnover12m = null
    else if (typeof tax.rollingTurnover12m === "number" && Number.isFinite(tax.rollingTurnover12m) && tax.rollingTurnover12m >= 0) {
      defaults.tax.rollingTurnover12m = tax.rollingTurnover12m
    }
  }
  // До версии 3 сверка показывала режим, но не считала налог; используем
  // безопасные стартовые параметры, а не старые нулевые значения ставок.
  if (kind === "gns" && value.version !== 3) {
    const oldCashRate = defaults.tax.singleCash
    const oldElectronicRate = defaults.tax.singleElectronic
    defaults.tax = {
      ...defaults.tax,
      regime: value.version === 1 ? "none" : defaults.tax.regime,
      singleActivity: "jewelry",
      singleCash: oldCashRate === 0 ? DEFAULT_TAX.singleCash : oldCashRate,
      singleElectronic: oldElectronicRate === 0 ? DEFAULT_TAX.singleElectronic : oldElectronicRate,
    }
  }
  for (const id of SHEET_IDS) {
    const saved = value.sheets?.[id]
    if (!saved || typeof saved !== "object") continue
    const sheet = defaults.sheets[id]
    if (typeof saved.enabled === "boolean") sheet.enabled = saved.enabled
    if (id !== "summary" && Array.isArray(saved.columns)) {
      sheet.columns = sheet.columns.filter((header) => saved.columns.includes(header))
    }
  }
  if (kind === "gns") defaults.sheets.stock.enabled = false
  return defaults
}

export function reportSelectionError(settings: ReportSettings): string | null {
  const active = SHEET_IDS.filter((id) => settings.sheets[id].enabled)
  if (!active.length) return "Включите хотя бы один лист."
  const empty = active.find((id) => !settings.sheets[id].columns.length)
  return empty ? `Выберите хотя бы один столбец на листе «${SHEET_LABELS[empty]}» или выключите лист.` : null
}

export type PreparedSheet = {
  id: SheetId
  name: string
  columns: Pick<Column<never>, "header" | "kind" | "width">[]
  rows: (string | number | null)[][]
}
function prepareSheet<Row>(id: SheetId, columns: Column<Row>[], rows: Row[], settings: ReportSettings): PreparedSheet {
  const selected = columns.filter((c) => settings.sheets[id].columns.includes(c.header))
  return {
    id, name: SHEET_LABELS[id],
    columns: selected.map(({ header, kind, width }) => ({ header, kind, width })),
    rows: tableRows(selected, rows),
  }
}

export function taxRegimeLabel(tax: TaxSettings): string {
  if (tax.regime === "none") return "Режим не выбран"
  if (tax.regime === "other") return "Другой / специальный режим"
  if (tax.regime === "single") return singleTaxScenarioLabel(tax)
  return `ОНР: НДС ${tax.vat}%, НсП ${tax.salesCash}% нал / ${tax.salesElectronic}% безнал`
}

function singleTaxScenarioLabel(tax: TaxSettings): string {
  if (tax.singleActivity === "jewelry") return `Единый налог — ювелирные изделия: ${tax.singleJewelryRate}%`
  if (tax.rollingTurnover12m === null) {
    return `Единый налог — обычная торговля: оборот не подтверждён, оценка ${tax.singleCash}% нал / ${tax.singleElectronic}% безнал`
  }
  const aboveThreshold = tax.rollingTurnover12m > tax.singleThreshold
  return aboveThreshold
    ? `Единый налог — обычная торговля выше порога: ${tax.singleCash}% нал / ${tax.singleElectronic}% безнал`
    : `Единый налог — обычная торговля до порога: ${tax.singleReducedRate}%`
}

function reconciliationRegimeLabel(tax: TaxSettings): string {
  if (tax.regime === "none") return "Не выбран"
  if (tax.regime === "single") return singleTaxScenarioLabel(tax)
  if (tax.regime === "general") return "Общий режим — расчёт не настроен"
  return "Другой / специальный режим — правило расчёта не настроено"
}

/** Один источник данных для предпросмотра и .xlsx; скрытие колонок не меняет расчёты. */
export function prepareConfiguredReport(input: ReportInput, kind: ReportKind, raw: ReportSettings) {
  const settings = normalizeReportSettings(kind, raw)
  const info = new Map(input.productInfo.map((p) => [p.id, p]))
  for (const p of input.products) info.set(p.id, p)
  const periodSales = input.sales.filter((sale) => inRange(sale.created_at, input.from, input.to))
  const countedPeriodSales = periodSales.filter(isCountedSale)
  const fiscalPeriodSales = fiscalSales(input.sales, input.from, input.to)
  const allFiscalLines = saleLines(fiscalPeriodSales, info)
  const excludedScrapLines = allFiscalLines.filter((line) => line.itemKind === "scrap")
  const excludedUnknownLines = allFiscalLines.filter((line) => line.itemKind === "unknown")
  const lines = kind === "gns"
    ? allFiscalLines.filter((line) => line.itemKind === "product")
    : saleLines(allSales(input.sales, input.from, input.to), info)
  const eligibleIds = new Set(input.sales.filter(
    (sale) => isCountedSale(sale) && (kind !== "gns" || sale.receipt_type === "fiscal"),
  ).map((sale) => sale.id))
  const rawRefunds = returnLines(input.returns.filter(
    (refund) => eligibleIds.has(refund.sale_id) && inRange(refund.created_at, input.from, input.to),
  ), input.sales, info)
  const excludedScrapReturns = rawRefunds.filter((refund) => refund.itemKind === "scrap")
  const excludedUnknownReturns = rawRefunds.filter((refund) => refund.itemKind === "unknown")
  const refunds = kind === "gns"
    ? rawRefunds.filter((refund) => refund.itemKind === "product")
    : rawRefunds
  const stock = inStock(input.products)
  const sum = <T,>(rows: T[], get: (r: T) => number) => round2(rows.reduce((a, r) => a + get(r), 0))
  const taxForReport = {
    ...settings.tax,
    rollingTurnover12m: settings.tax.rollingTurnover12m ?? input.rollingTurnover12m ?? null,
  }
  const calculationTax = kind === "gns" && settings.tax.regime !== "single" ? DEFAULT_TAX : taxForReport
  const cash = round2(sum(lines, (r) => r.cash) - sum(refunds, (r) => r.cash))
  const electronic = round2(sum(lines, (r) => r.electronic) - sum(refunds, (r) => r.electronic))
  const tax = calculateKrTax(cash, electronic, calculationTax)
  // Сводка точно совпадает с суммой округлённых построчных налогов за вычетом возвратов.
  const saleTax = sum(lines, (r) => calculateKrTax(r.cash, r.electronic, calculationTax).total)
  const refundTax = sum(refunds, (r) => calculateKrTax(r.cash, r.electronic, calculationTax).total)
  const netTax = round2(saleTax - refundTax)
  const vat = round2(sum(lines, (r) => calculateKrTax(r.cash, r.electronic, calculationTax).vat) -
    sum(refunds, (r) => calculateKrTax(r.cash, r.electronic, calculationTax).vat))
  const summary = kind === "gns" ? gnsNetSummary(lines, refunds) : managerNetSummary(lines, refunds)
  const discount = sum(lines, (r) => r.discount)
  const gross = sum(lines, (r) => r.gross)
  const netProfit = round2(sum(lines, (r) => r.profit) - sum(refunds, (r) => r.amount - r.cost) - netTax)
  const unallocated = round2(sum(lines, (r) => Math.abs(r.unallocated)) + sum(refunds, (r) => Math.abs(r.unallocated)))
  const knownSaleIds = new Set(input.sales.map((sale) => sale.id))
  const missingRefunds = input.returns.filter(
    (refund) => !refund.deleted_at && inRange(refund.created_at, input.from, input.to) &&
      !knownSaleIds.has(refund.sale_id),
  ).length
  const unsupportedRefunds = kind === "gns" ? input.returns.filter(
    (refund) => !refund.deleted_at && inRange(refund.created_at, input.from, input.to) &&
      knownSaleIds.has(refund.sale_id) && !eligibleIds.has(refund.sale_id),
  ).length : 0
  const excludedNonFiscalSales = countedPeriodSales.filter((sale) => sale.receipt_type === "non_fiscal").length
  const excludedUnknownReceiptSales = countedPeriodSales.filter((sale) => !sale.receipt_type).length
  const excludedUnsyncedSales = periodSales.filter(
    (sale) => sale.deleted_at || sale.sync_status === "pending" || sale.sync_status === "rejected",
  ).length
  const nonFiscalSaleTotal = sum(countedPeriodSales.filter((sale) => sale.receipt_type === "non_fiscal"), (sale) => num(sale.total))
  const unknownReceiptSaleTotal = sum(countedPeriodSales.filter((sale) => !sale.receipt_type), (sale) => num(sale.total))
  const unsyncedSaleTotal = sum(periodSales.filter(
    (sale) => sale.deleted_at || sale.sync_status === "pending" || sale.sync_status === "rejected",
  ), (sale) => num(sale.total))
  const reconciliationExceptions: ReconciliationException[] = []
  if (kind === "gns") {
    for (const sale of periodSales) {
      if (sale.deleted_at || sale.sync_status === "pending" || sale.sync_status === "rejected") {
        reconciliationExceptions.push({
          createdAt: sale.created_at,
          document: receiptNumber(sale),
          operation: "Продажа исключена",
          amount: num(sale.total),
          reason: sale.deleted_at ? "Продажа удалена в GOLDUCHET." :
            sale.sync_status === "pending" ? "Продажа ещё не синхронизирована." : "Синхронизация продажи отклонена.",
        })
        continue
      }
      if (sale.receipt_type === "non_fiscal" || !sale.receipt_type) {
        reconciliationExceptions.push({
          createdAt: sale.created_at,
          document: receiptNumber(sale),
          operation: "Продажа исключена",
          amount: num(sale.total),
          reason: sale.receipt_type === "non_fiscal"
            ? "В GOLDUCHET отмечен нефискальный чек."
            : "Тип чека не указан; фискальный статус нужно подтвердить.",
        })
      }
    }
    for (const line of [...excludedScrapLines, ...excludedUnknownLines]) {
      reconciliationExceptions.push({
        createdAt: line.createdAt,
        document: line.receiptNo,
        operation: line.itemKind === "scrap" ? "Позиция лома исключена" : "Тип позиции не определён",
        amount: line.total,
        reason: line.itemKind === "scrap"
          ? "Первая версия сверяет готовые изделия; лом вынесен отдельно."
          : "Не удалось определить тип товарной позиции в исходных данных.",
      })
    }
    const salesById = new Map(input.sales.map((sale) => [sale.id, sale]))
    for (const refund of input.returns.filter((row) =>
      !row.deleted_at && inRange(row.created_at, input.from, input.to),
    )) {
      const original = salesById.get(refund.sale_id)
      const amount = round2(num(refund.amount ?? refund.return_amount))
      if (!original) {
        reconciliationExceptions.push({
          createdAt: refund.created_at,
          document: refund.sale_id.slice(0, 8).toUpperCase(),
          operation: "Возврат без исходной продажи",
          amount,
          reason: "Исходный чек не найден в загруженных данных.",
        })
        continue
      }
      if (!isCountedSale(original) || original.receipt_type !== "fiscal") {
        reconciliationExceptions.push({
          createdAt: refund.created_at,
          document: receiptNumber(original),
          operation: "Возврат вне фискальной сверки",
          amount,
          reason: original.receipt_type === "non_fiscal"
            ? "Исходная продажа отмечена как нефискальная."
            : !original.receipt_type
              ? "У исходной продажи не указан тип чека."
              : "Исходная продажа удалена или не синхронизирована.",
        })
        continue
      }
      const originalItem = original.items?.[refund.item_index]
      const returnKind = originalItem?.kind === "scrap"
        ? "scrap"
        : originalItem?.kind === "product" || originalItem?.product_id || refund.product_id
          ? "product"
          : "unknown"
      if (returnKind !== "product") {
        reconciliationExceptions.push({
          createdAt: refund.created_at,
          document: receiptNumber(original),
          operation: returnKind === "scrap" ? "Возврат лома исключён" : "Тип возврата не определён",
          amount,
          reason: returnKind === "scrap"
            ? "Возврат лома не входит в сверку готовых изделий."
            : "Не удалось определить тип возвращённой позиции.",
        })
      }
    }
  }
  const warnings: string[] = []
  if (kind === "gns") {
    if (reconciliationExceptions.length) {
      warnings.push(`${reconciliationExceptions.length} записей вынесено на лист «Исключения и проверка».`)
    }
    if (settings.tax.regime === "single" && settings.tax.singleActivity === "retail" &&
      taxForReport.rollingTurnover12m === null) {
      warnings.push(input.rollingTurnoverIncomplete
        ? `Оборот за 12 месяцев загружен не полностью; применена верхняя оценка ${taxForReport.singleCash}% / ${taxForReport.singleElectronic}%.`
        : `Оборот за 12 месяцев не определён; применена верхняя оценка ${taxForReport.singleCash}% / ${taxForReport.singleElectronic}%.`)
    } else if (settings.tax.regime === "single" && settings.tax.singleActivity === "retail" &&
      taxForReport.rollingTurnover12m! > taxForReport.singleThreshold) {
      warnings.push(`Оборот за 12 месяцев выше порога ${taxForReport.singleThreshold.toLocaleString("ru-RU")} сом; применён сценарий ставок ${taxForReport.singleCash}% / ${taxForReport.singleElectronic}%.`)
    }
  }
  if (unallocated > 0) warnings.push(
    `Не распределено по видам оплаты: ${unallocated.toFixed(2)} сом (долг, неизвестный способ или неполная смешанная оплата). Проверьте исходные чеки.`,
  )
  if (missingRefunds) warnings.push(`Не найдены исходные чеки для ${missingRefunds} возвратов. Сократите период или восстановите доступ к чекам.`)
  const summaryRows: { metric: string; value: string | number }[] = [
    { metric: "Тип документа", value: kind === "gns" ? "Внутренняя сверка GOLDUCHET" : "Управленческий отчёт" },
    { metric: "Начало периода (Бишкек)", value: input.from === null ? "За всё время" : new Date(input.from).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" }) },
    { metric: "Конец периода, не включая (Бишкек)", value: new Date(input.to).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" }) },
    ...(kind === "gns" ? [
      { metric: "Тип налогоплательщика", value: "Не указан (ИП / организация)" },
      { metric: "Выбранный налоговый режим", value: reconciliationRegimeLabel(taxForReport) },
      { metric: "Налоговый расчёт", value: settings.tax.regime === "single"
        ? "Предварительная оценка по выбранному сценарию"
        : settings.tax.regime === "none" ? "Не выполняется" : "Для выбранного режима не настроен" },
      ...(settings.tax.regime === "single" ? [
        { metric: "Предварительная сумма единого налога", value: Math.max(0, netTax) },
        ...(settings.tax.singleActivity === "retail" ? [
          { metric: "Порог обычной торговли за 12 месяцев (сом)", value: taxForReport.singleThreshold },
          { metric: "Оборот за последние 12 месяцев по данным GOLDUCHET (сом)", value: taxForReport.rollingTurnover12m ?? "Не рассчитан" },
          { metric: "Источник оборота за 12 месяцев", value: settings.tax.rollingTurnover12m !== null
            ? input.rollingTurnoverIncomplete ? "Введён вручную; данные GOLDUCHET неполные" : "Скорректирован вручную"
            : input.rollingTurnoverIncomplete ? "Данные GOLDUCHET неполные" : "Продажи GOLDUCHET минус возвраты" },
        ] : []),
      ] : []),
      { metric: "Источник сверки", value: "Внутренние данные GOLDUCHET; сверка с внешними данными ККМ не выполнялась" },
      { metric: "Фискальные чеки в источнике", value: fiscalPeriodSales.length },
      { metric: "Исключено нефискальных чеков", value: excludedNonFiscalSales },
      { metric: "Сумма нефискальных чеков — справочно", value: nonFiscalSaleTotal },
      { metric: "Исключено чеков без указанного типа", value: excludedUnknownReceiptSales },
      { metric: "Сумма чеков без указанного типа — справочно", value: unknownReceiptSaleTotal },
      { metric: "Исключено удалённых/несинхронизированных продаж", value: excludedUnsyncedSales },
      { metric: "Сумма удалённых/несинхронизированных продаж — справочно", value: unsyncedSaleTotal },
      { metric: "Исключено позиций лома", value: excludedScrapLines.length },
      { metric: "Сумма позиций лома — справочно, вне сверки", value: sum(excludedScrapLines, (line) => line.total) },
      { metric: "Исключено товарных позиций с неизвестным типом", value: excludedUnknownLines.length },
      { metric: "Сумма товарных позиций с неизвестным типом — справочно", value: sum(excludedUnknownLines, (line) => line.total) },
      { metric: "Возвраты вне фискальной сверки", value: unsupportedRefunds },
      { metric: "Исключено возвратов лома", value: excludedScrapReturns.length },
      { metric: "Сумма возвратов лома — справочно", value: sum(excludedScrapReturns, (refund) => refund.amount) },
      { metric: "Исключено возвратов с неизвестным типом", value: excludedUnknownReturns.length },
      { metric: "Сумма возвратов с неизвестным типом — справочно", value: sum(excludedUnknownReturns, (refund) => refund.amount) },
    ] : [{ metric: "Налоговый режим КР", value: taxRegimeLabel(settings.tax) }]),
    ...summary,
    ...(kind === "manager" ? [
      { metric: "Выручка до скидок", value: gross },
      { metric: "Скидки и списанные бонусы (уже учтены в сумме продаж)", value: discount },
    ] : []),
    { metric: "Наличные после возвратов", value: cash },
    { metric: "Безналичные после возвратов", value: electronic },
    { metric: "Не распределено по нал/безнал (продажи и возвраты)", value: unallocated },
    ...(kind === "gns" ? [{ metric: "Строк в листе «Исключения и проверка»", value: reconciliationExceptions.length }] : []),
    ...(kind !== "manager" || !["single", "general"].includes(settings.tax.regime) ? [] : [
      { metric: settings.tax.regime === "general" ? "Налогооблагаемая база без НДС" : "Налогооблагаемая база", value: tax.base },
      { metric: "Расчётный налог с продаж (до возвратов)", value: saleTax },
      { metric: "Уменьшение расчётного налога по возвратам", value: refundTax },
      ...(settings.tax.regime === "general" ? [
        { metric: "НДС из суммы продаж (до зачёта входного НДС)", value: vat },
        { metric: "Налог с продаж (НсП)", value: round2(netTax - vat) },
      ] : [{ metric: "Единый налог", value: netTax }]),
      { metric: "Расчётный налог за период (с учётом возвратов)", value: netTax },
      { metric: "Налог к уплате в бюджет (расчётный)", value: Math.max(0, netTax) },
      { metric: "Превышение уменьшения налога (не автоматический возврат из бюджета)", value: Math.max(0, -netTax) },
    ]),
    ...(kind === "manager" ? [{ metric: "Чистая прибыль после налогов", value: netProfit }] : []),
    { metric: "Примечание", value: kind === "gns"
      ? "Предварительная оценка по данным GOLDUCHET, основанная на фискальных продажах и возвратах в выбранном периоде. Не декларация и не официальный файл ГНС; не отправлять. Сверьте оборот и право на режим с бухгалтером."
      : settings.tax.regime === "general"
      ? "Расчётная оценка, не декларация. НДС включён в цены, НсП с оборота без НДС; входной НДС и налог на прибыль не учтены. Ставки и льготы подтвердите с бухгалтером."
      : "Расчётная оценка, не декларация. Ставки и право на льготы подтвердите с бухгалтером. Возвраты уменьшают базу в периоде возврата." },
    ...warnings.map((value) => ({ metric: "Предупреждение", value })),
  ]
  const summaryColumns: Column<{ metric: string; value: string | number }>[] = [
    { header: "Показатель", kind: "text", width: 62, value: (r) => r.metric },
    { header: "Сумма (сом)", kind: "money", width: 45, value: (r) => r.value },
  ]
  const sheets = [
    prepareSheet("sales", configuredSalesColumns(kind, settings.tax), lines, settings),
    prepareSheet("returns", kind === "gns" ? GNS_RETURN_COLUMNS : RETURN_COLUMNS, refunds, settings),
    prepareSheet("stock", kind === "gns" ? GNS_STOCK_COLUMNS : managerStockColumns(input.scrapPrices ?? {}), stock, settings),
    prepareSheet("summary", summaryColumns, summaryRows, settings),
    prepareSheet("exceptions", RECONCILIATION_EXCEPTION_COLUMNS, reconciliationExceptions, settings),
  ].filter((sheet) => settings.sheets[sheet.id].enabled)
  return {
    sheets, warnings,
    error: reportSelectionError(settings) ?? (kind === "manager" && missingRefunds ? "Найдены возвраты без исходных чеков: выгрузка будет неполной." :
      kind === "manager" && ["single", "general"].includes(settings.tax.regime) && unallocated > 0
        ? "Для расчёта налога нужна полная разбивка нал/безнал." : null),
    totals: { cash, electronic, tax: kind === "gns" ? Math.max(0, netTax) : netTax, netProfit },
    rollingTurnover12m: taxForReport.rollingTurnover12m,
    rollingTurnoverIncomplete: Boolean(input.rollingTurnoverIncomplete),
    counts: { sales: lines.length, returns: refunds.length, stock: stock.length },
  }
}
