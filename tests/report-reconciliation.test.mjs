import assert from "node:assert/strict"
import test from "node:test"
import {
  defaultReportSettings,
  normalizeReportSettings,
  prepareConfiguredReport,
} from "../lib/report-export.ts"

const day = Date.parse("2026-11-01T00:00:00.000Z")
const nextDay = Date.parse("2026-11-02T00:00:00.000Z")
const createdAt = "2026-11-01T10:00:00.000Z"

function makeSale(id, { receiptType = "fiscal", total = 100, itemKind = "product", syncStatus = "confirmed" } = {}) {
  return {
    id,
    created_at: createdAt,
    receipt_type: receiptType,
    payment_method: "cash",
    amount_cash: total,
    amount_electronic: 0,
    total,
    discount: 0,
    bonus_used: 0,
    deleted_at: null,
    sync_status: syncStatus,
    seller_name: "Кассир",
    customer_name: "",
    items: [{
      product_id: itemKind === "scrap" ? null : "product-1",
      kind: itemKind,
      quantity: 1,
      name: itemKind === "scrap" ? "Лом" : "Кольцо",
      sku: "SKU-1",
      weight: 1,
      metal: "Золото 585",
      price: total,
      cost: 40,
    }],
  }
}

function makeReturn(id, saleId, { amount = 10, itemKind = "product" } = {}) {
  return {
    id,
    sale_id: saleId,
    item_index: 0,
    product_id: itemKind === "scrap" ? null : "product-1",
    amount,
    return_amount: amount,
    cost: 4,
    created_at: createdAt,
    deleted_at: null,
    reason: "Тест",
  }
}

function summaryValue(report, label) {
  const summary = report.sheets.find((sheet) => sheet.id === "summary")
  const metricIndex = summary.columns.findIndex((column) => column.header === "Показатель")
  const valueIndex = summary.columns.findIndex((column) => column.header === "Сумма (сом)")
  const row = summary.rows.find((cells) => cells[metricIndex] === label)
  return row?.[valueIndex]
}

test("GNS defaults and legacy settings never enable tax or current stock", () => {
  const defaults = defaultReportSettings("gns")
  assert.equal(defaults.tax.regime, "none")
  assert.equal(defaults.tax.singleCash, 4)
  assert.equal(defaults.tax.singleJewelryRate, 0.25)
  assert.equal(defaults.tax.singleThreshold, 50_000_000)
  assert.equal(defaults.sheets.stock.enabled, false)

  const legacy = {
    ...defaults,
    version: 1,
    tax: { ...defaults.tax, regime: "single", singleCash: 4, singleElectronic: 2 },
    sheets: { ...defaults.sheets, stock: { ...defaults.sheets.stock, enabled: true } },
  }
  const normalized = normalizeReportSettings("gns", legacy)
  assert.equal(normalized.tax.regime, "none")
  assert.equal(normalized.tax.singleCash, 4)
  assert.equal(normalized.sheets.stock.enabled, false)

  const selectedInCurrentVersion = normalizeReportSettings("gns", {
    ...defaults,
    tax: { ...defaults.tax, regime: "general" },
  })
  assert.equal(selectedInCurrentVersion.tax.regime, "general")

  const beforeEstimate = normalizeReportSettings("gns", {
    ...defaults,
    version: 2,
    tax: { ...defaults.tax, regime: "single", singleCash: 0, singleElectronic: 0 },
  })
  assert.equal(beforeEstimate.tax.regime, "single")
  assert.equal(beforeEstimate.tax.singleCash, 4)
  assert.equal(beforeEstimate.tax.singleElectronic, 2)
})

test("internal reconciliation includes only fiscal product sales and their product returns", () => {
  const sales = [
    makeSale("sale0001"),
    makeSale("sale0002", { total: 40, itemKind: "scrap" }),
    makeSale("sale0003", { receiptType: "non_fiscal", total: 50 }),
    makeSale("sale0004", { receiptType: null, total: 20 }),
    makeSale("sale0005", { total: 30, syncStatus: "pending" }),
  ]
  const returns = [
    makeReturn("return01", "sale0001", { amount: 10 }),
    makeReturn("return02", "sale0002", { amount: 5, itemKind: "scrap" }),
    makeReturn("return03", "sale0003", { amount: 2 }),
    makeReturn("return04", "missing1", { amount: 4 }),
  ]
  const settings = defaultReportSettings("gns")
  settings.tax = { ...settings.tax, regime: "single", singleCash: 4, singleElectronic: 2 }

  const report = prepareConfiguredReport({
    sales,
    productInfo: [],
    products: [],
    returns,
    from: day,
    to: nextDay,
  }, "gns", settings)

  assert.equal(report.error, null, "exceptions should remain exportable for human review")
  assert.equal(report.totals.tax, 0.22)
  assert.equal(report.counts.sales, 1)
  assert.equal(report.counts.returns, 1)
  assert.equal(report.sheets.some((sheet) => sheet.id === "stock"), false)
  const exceptions = report.sheets.find((sheet) => sheet.id === "exceptions")
  assert.ok(exceptions)
  assert.equal(exceptions.rows.length, 7)
  assert.ok(exceptions.rows.some((row) => row.includes("Возврат без исходной продажи")))
  assert.equal(summaryValue(report, "Фискальные продажи"), 100)
  assert.equal(summaryValue(report, "Возвраты по фискальным чекам"), 10)
  assert.equal(summaryValue(report, "Сумма позиций лома — справочно, вне сверки"), 40)
  assert.equal(summaryValue(report, "Сумма нефискальных чеков — справочно"), 50)
  assert.equal(summaryValue(report, "Сумма чеков без указанного типа — справочно"), 20)
  assert.equal(summaryValue(report, "Исключено удалённых/несинхронизированных продаж"), 1)
  assert.equal(summaryValue(report, "Возвраты вне фискальной сверки"), 1)
  assert.equal(summaryValue(report, "Строк в листе «Исключения и проверка»"), 7)
  assert.equal(summaryValue(report, "Выбранный налоговый режим"), "Единый налог — ювелирные изделия: 0.25%")
  assert.equal(summaryValue(report, "Налоговый расчёт"), "Предварительная оценка по выбранному сценарию")
  assert.equal(summaryValue(report, "Предварительная сумма единого налога"), 0.22)
  assert.match(String(summaryValue(report, "Тип документа")), /внутренняя сверка/i)
  assert.match(String(summaryValue(report, "Примечание")), /не декларация/i)
  assert.ok(report.warnings.some((warning) => warning.includes("Не найдены исходные чеки")))
})

test("ordinary retail uses editable reduced rate below the 12-month threshold and higher cashless rates above it", async () => {
  const { calculateKrTax, defaultReportSettings } = await import("../lib/report-export.ts")
  const settings = defaultReportSettings("gns").tax
  settings.regime = "single"
  settings.singleActivity = "retail"
  settings.rollingTurnover12m = 49_000_000
  assert.equal(calculateKrTax(10_000, 10_000, settings).total, 100)

  settings.rollingTurnover12m = 50_000_001
  assert.equal(calculateKrTax(10_000, 10_000, settings).total, 600)
  settings.rollingTurnover12m = null
  assert.equal(calculateKrTax(10_000, 10_000, settings).total, 600)
})

test("jewelry activity applies its configurable rate regardless of the ordinary retail threshold", async () => {
  const { calculateKrTax, defaultReportSettings } = await import("../lib/report-export.ts")
  const settings = defaultReportSettings("gns").tax
  settings.regime = "single"
  settings.singleActivity = "jewelry"
  settings.singleJewelryRate = 0.3
  settings.rollingTurnover12m = 60_000_000
  assert.equal(calculateKrTax(10_000, 10_000, settings).total, 60)
})

test("reconciliation applies the higher ordinary retail rates when loaded 12-month turnover exceeds the threshold", () => {
  const settings = defaultReportSettings("gns")
  settings.tax.regime = "single"
  settings.tax.singleActivity = "retail"
  const report = prepareConfiguredReport({
    sales: [makeSale("sale0001")],
    productInfo: [],
    products: [],
    returns: [],
    from: day,
    to: nextDay,
    rollingTurnover12m: 50_000_001,
  }, "gns", settings)

  assert.equal(report.totals.tax, 4)
  assert.ok(report.warnings.some((warning) => warning.includes("выше порога")))
  assert.equal(summaryValue(report, "Оборот за последние 12 месяцев по данным GOLDUCHET (сом)"), 50_000_001)
})
