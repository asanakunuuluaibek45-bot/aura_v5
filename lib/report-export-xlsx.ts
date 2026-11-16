"use client"

/** SheetJS загружается только при скачивании; предпросмотр использует чистую модель. */
import {
  defaultReportSettings,
  excelSerialBishkek,
  fileDate,
  prepareConfiguredReport,
  type CellKind,
  type PreparedSheet,
  type ReportInput,
  type ReportKind,
  type ReportSettings,
} from "./report-export"

const FORMATS: Record<CellKind, string | undefined> = {
  text: undefined, datetime: "yyyy-mm-dd hh:mm", weight: "0.00",
  money: "#,##0.00", int: "0", percent: "0.0%",
}
type XlsxModule = typeof import("xlsx")
export type ExportInput = ReportInput

export function buildConfiguredSheet(XLSX: XlsxModule, input: PreparedSheet) {
  const values = input.rows.map((row) => row.map((raw, i) => {
    const kind = input.columns[i].kind
    if (kind === "text") return String(raw ?? "")
    if (kind === "datetime") return typeof raw === "string" ? excelSerialBishkek(raw) : null
    // Текстовые пояснения в сводке не превращаем в нули.
    return raw
  }))
  const sheet = XLSX.utils.aoa_to_sheet([input.columns.map((c) => c.header), ...values])
  for (let c = 0; c < input.columns.length; c++) {
    const format = FORMATS[input.columns[c].kind]
    if (!format) continue
    for (let r = 0; r < input.rows.length; r++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: r + 1, c })]
      if (cell && typeof cell.v === "number") cell.z = format
    }
  }
  sheet["!cols"] = input.columns.map((c) => ({ wch: c.width }))
  if (input.columns.length) sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: input.rows.length, c: input.columns.length - 1 } }),
  }
  return sheet
}

export function preloadXlsx() {
  return import("xlsx")
}

/** Передача подготовленной модели гарантирует совпадение предпросмотра и файла. */
export function buildConfiguredWorkbook(
  XLSX: XlsxModule,
  report: ReturnType<typeof prepareConfiguredReport>,
) {
  if (report.error) throw new Error(report.error)
  if (!report.sheets.length || report.sheets.some((sheet) => !sheet.columns.length)) {
    throw new Error("Выберите листы и столбцы для экспорта")
  }
  const book = XLSX.utils.book_new()
  for (const sheet of report.sheets) {
    XLSX.utils.book_append_sheet(book, buildConfiguredSheet(XLSX, sheet), sheet.name)
  }
  return book
}

export async function exportConfiguredReport(
  report: ReturnType<typeof prepareConfiguredReport>,
  kind: ReportKind,
) {
  const XLSX = await preloadXlsx()
  const book = buildConfiguredWorkbook(XLSX, report)
  const filename = kind === "gns"
    ? `GOLDUCHET_Internal_Tax_Reconciliation_DRAFT_${fileDate()}.xlsx`
    : `Manager_Report_${fileDate()}.xlsx`
  XLSX.writeFile(book, filename, { compression: false })
  return report.counts
}

/** Совместимость с другими вызовами: настройки необязательны. */
export function exportGnsReport(input: ExportInput, settings = defaultReportSettings("gns")) {
  return exportConfiguredReport(prepareConfiguredReport(input, "gns", settings), "gns")
}

export function exportManagerReport(
  input: ExportInput & { scrapPrices: Record<string, number> },
  settings: ReportSettings = defaultReportSettings("manager"),
) {
  return exportConfiguredReport(prepareConfiguredReport(input, "manager", settings), "manager")
}
