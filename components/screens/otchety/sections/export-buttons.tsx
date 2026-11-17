"use client"

import { useMemo, useRef, useState } from "react"
import { FileSpreadsheet, Landmark, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { getSalesInRange } from "@/app/actions/sales"
import { getSaleReturnsInRange } from "@/app/actions/returns"
import {
  EXPORT_STORAGE_KEY, SHEET_IDS, SHEET_LABELS,
  defaultReportSettings, normalizeReportSettings, prepareConfiguredReport, reportColumnOptions,
  type CellKind, type ReportInput, type ReportKind, type ReportSettings, type SheetId, type TaxSettings,
} from "@/lib/report-export"
import type { Product } from "@/lib/types"
import type { DateRange } from "../types"

const controlClass = "w-full rounded-md border bg-background px-3 py-2 text-sm"
const money = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function previewValue(value: string | number | null, kind: CellKind) {
  if (value === null) return "—"
  if (kind === "datetime" && typeof value === "string") {
    return new Date(value).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" })
  }
  if (typeof value === "number") {
    if (kind === "percent") return `${money(value * 100)}%`
    return kind === "int" ? String(value) : money(value)
  }
  return value
}

export function ExportButtons({
  range, allTime, products, scrapPrices,
}: {
  range: DateRange
  allTime: boolean
  products: Product[]
  scrapPrices: Record<string, number>
}) {
  const [kind, setKind] = useState<ReportKind | null>(null)
  const [settings, setSettings] = useState<ReportSettings>(() => defaultReportSettings("gns"))
  const [input, setInput] = useState<ReportInput | null>(null)
  const [phase, setPhase] = useState<"loading" | "building" | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [previewTab, setPreviewTab] = useState<SheetId>("sales")
  const requestId = useRef(0)
  const downloading = useRef(false)
  const settingsRef = useRef(settings)
  const report = useMemo(
    () => input && kind ? prepareConfiguredReport(input, kind, settings) : null,
    [input, kind, settings],
  )
  const available = useMemo(() => reportColumnOptions(kind ?? "gns"), [kind])
  const preview = report?.sheets.find((sheet) => sheet.id === previewTab) ?? report?.sheets[0]

  const saveSettings = (next: ReportSettings) => {
    settingsRef.current = next
    setSettings(next)
    if (!kind) return
    try {
      localStorage.setItem(`${EXPORT_STORAGE_KEY}:${kind}`, JSON.stringify(next))
    } catch {
      setStorageWarning(true)
    }
  }
  const updateTax = (patch: Partial<TaxSettings>) => {
    saveSettings({ ...settingsRef.current, tax: { ...settingsRef.current.tax, ...patch } })
  }
  const updateSheet = (id: SheetId, patch: Partial<ReportSettings["sheets"][SheetId]>) => {
    const current = settingsRef.current
    saveSettings({ ...current, sheets: { ...current.sheets, [id]: { ...current.sheets[id], ...patch } } })
  }

  const load = async (reportKind: ReportKind | null = kind) => {
    const id = ++requestId.current
    setPhase("loading")
    setInput(null)
    setLoadError(null)
    setTruncated(false)
    try {
      const from = allTime ? null : range.from.getTime()
      const to = allTime ? Date.now() + 60_000 : range.to.getTime()
      const dates = { from: from === null ? null : new Date(from).toISOString(), to: new Date(to).toISOString() }
      let rollingTurnover12m: number | null = null
      let rollingTurnoverIncomplete = false
      const rollingFrom = new Date(to)
      rollingFrom.setUTCMonth(rollingFrom.getUTCMonth() - 12)
      const rollingDates = { from: rollingFrom.toISOString(), to: dates.to }
      const [refundData, rollingData] = await Promise.all([
        getSaleReturnsInRange(dates),
        reportKind === "gns"
          ? Promise.all([
              getSalesInRange(rollingDates),
              getSaleReturnsInRange(rollingDates),
            ]).then(([sales, returns]) => ({ sales, returns }))
              .catch(() => null)
          : Promise.resolve(null),
      ])
      if (reportKind === "gns") {
        if (rollingData && !rollingData.sales.truncated && !rollingData.returns.truncated) {
          const knownSaleIds = new Set(rollingData.sales.sales.map((sale) => sale.id))
          const turnover = rollingData.sales.sales.reduce((total, sale) => total + Number(sale.total || 0), 0)
          const refunds = rollingData.returns.returns
            .filter((refund) => knownSaleIds.has(refund.sale_id))
            .reduce((total, refund) => total + Number(refund.amount ?? refund.return_amount ?? 0), 0)
          rollingTurnover12m = Math.max(0, Math.round((turnover - refunds + Number.EPSILON) * 100) / 100)
        } else {
          rollingTurnoverIncomplete = true
        }
      }
      const data = await getSalesInRange({
        ...dates, withProducts: true,
        includeSaleIds: [...new Set(refundData.returns.map((refund) => refund.sale_id))],
      })
      if (id !== requestId.current) return
      setInput({
        sales: data.sales, productInfo: data.products, products,
        returns: refundData.returns, from, to, scrapPrices,
        rollingTurnover12m, rollingTurnoverIncomplete,
      })
      setTruncated(data.truncated || refundData.truncated)
    } catch (error) {
      if (id === requestId.current) setLoadError(error instanceof Error ? error.message : "Не удалось загрузить данные")
    } finally {
      if (id === requestId.current) setPhase(null)
    }
  }

  const open = (nextKind: ReportKind) => {
    if (phase || downloading.current) return
    setStorageWarning(false)
    let next = defaultReportSettings(nextKind)
    try {
      const saved = localStorage.getItem(`${EXPORT_STORAGE_KEY}:${nextKind}`)
      if (saved) next = normalizeReportSettings(nextKind, JSON.parse(saved))
    } catch {
      setStorageWarning(true)
    }
    settingsRef.current = next
    setSettings(next)
    setKind(nextKind)
    setPreviewTab("sales")
    void load(nextKind)
  }
  const close = () => {
    if (downloading.current) return
    ++requestId.current // поздний ответ закрытого окна не заменяет новый предпросмотр
    setKind(null)
    setInput(null)
    setPhase(null)
  }
  const download = async () => {
    if (!kind || !report || report.error || phase || downloading.current) return
    downloading.current = true
    setPhase("building")
    try {
      // Даём браузеру показать индикатор перед синхронной сборкой workbook.
      await new Promise((resolve) => setTimeout(resolve, 30))
      const mod = await import("@/lib/report-export-xlsx")
      await mod.exportConfiguredReport(report, kind)
      toast.success("Excel сформирован. Скачивание началось.")
    } catch (error) {
      toast.error(`Не удалось сформировать файл: ${error instanceof Error ? error.message : "повторите попытку"}`)
    } finally {
      downloading.current = false
      setPhase(null)
    }
  }

  const rateInput = (
    key: Exclude<keyof TaxSettings, "regime" | "singleActivity" | "rollingTurnover12m">,
    label: string,
  ) => (
    <label className="grid gap-1" key={key}>
      <span>{label}</span>
      <input
        className={controlClass} type="number" min="0" max="100" step="0.01" required
        value={settings.tax[key]}
        onChange={(event) => {
          const value = event.currentTarget.valueAsNumber
          if (Number.isFinite(value) && value >= 0 && value <= 100) updateTax({ [key]: value })
        }}
      />
    </label>
  )

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={() => open("gns")} disabled={kind !== null} className="sm:flex-1">
          <Landmark className="h-4 w-4" />Налоговая сверка
        </Button>
        <Button variant="outline" onClick={() => open("manager")} disabled={kind !== null} className="sm:flex-1">
          <FileSpreadsheet className="h-4 w-4" />Экспорт (Управленческий)
        </Button>
      </div>
      <Dialog open={kind !== null} onOpenChange={(isOpen) => { if (!isOpen) close() }}>
        <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-5xl" showCloseButton={phase !== "building"}>
          <DialogHeader className="shrink-0 pr-7">
            <DialogTitle>{kind === "gns" ? "Внутренняя налоговая сверка" : "Excel: управленческий отчёт"}</DialogTitle>
            <DialogDescription>
              {allTime ? "За всё время" : `${range.from.toLocaleDateString("ru-RU")} — ${range.to.toLocaleDateString("ru-RU")}`}.
              {" "}{kind === "gns"
                ? "Черновик для внутренней сверки. Предварительный расчёт не является декларацией и не отправляется в ГНС."
                : "Все проведённые чеки с себестоимостью и прибылью."}
              {" "}{kind === "manager" && "Склад — текущий, а не на конец периода."} Даты в файле — по Бишкеку.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {kind === "gns" ? (
              <section className="space-y-3 rounded-lg border p-3" aria-label="Предварительный налоговый расчёт">
                <h3 className="font-medium">Режим и предварительный расчёт</h3>
                <label className="grid gap-1">
                  <span className="text-sm">Выберите режим клиента</span>
                  <select
                    className={controlClass}
                    value={settings.tax.regime}
                    onChange={(event) => updateTax({ regime: event.target.value as TaxSettings["regime"] })}
                  >
                    <option value="none">Пока не выбран</option>
                    <option value="single">Единый налог</option>
                    <option value="general">Общий режим</option>
                  <option value="other">Патент / другой режим</option>
                  </select>
                </label>
                {settings.tax.regime === "single" && (
                  <div className="space-y-3 rounded-md bg-muted/40 p-3">
                    <label className="grid gap-1">
                      <span className="text-sm">Вид деятельности для сценария</span>
                      <select
                        className={controlClass}
                        value={settings.tax.singleActivity}
                        onChange={(event) => updateTax({ singleActivity: event.target.value as TaxSettings["singleActivity"] })}
                      >
                        <option value="jewelry">Продажа ювелирных изделий</option>
                        <option value="retail">Обычная розничная торговля</option>
                      </select>
                    </label>
                    {settings.tax.singleActivity === "jewelry" ? (
                      <div className="max-w-sm">{rateInput("singleJewelryRate", "Единый налог, %")}</div>
                    ) : (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1">
                              <span className="text-sm">Оборот за последние 12 месяцев, сом</span>
                            <input
                              className={controlClass}
                              type="number" min="0" step="1" placeholder="Введите сумму вручную"
                              value={settings.tax.rollingTurnover12m ?? report?.rollingTurnover12m ?? ""}
                              onChange={(event) => {
                                const value = event.currentTarget.value === "" ? null : event.currentTarget.valueAsNumber
                                if (value === null || (Number.isFinite(value) && value >= 0)) updateTax({ rollingTurnover12m: value })
                              }}
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="text-sm">Порог сниженной ставки, сом</span>
                            <input
                              className={controlClass}
                              type="number" min="0" step="100000" required value={settings.tax.singleThreshold}
                              onChange={(event) => {
                                const value = event.currentTarget.valueAsNumber
                                if (Number.isFinite(value) && value >= 0) updateTax({ singleThreshold: value })
                              }}
                            />
                          </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          {rateInput("singleReducedRate", "Ставка до порога, %")}
                          {rateInput("singleCash", "Ставка выше порога, нал, %")}
                          {rateInput("singleElectronic", "Ставка выше порога, безнал, %")}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Сумма рассчитана по продажам GOLDUCHET за 12 месяцев до конца периода минус связанные возвраты. Можно исправить вручную; очистите поле, чтобы вернуться к автоматической сумме.
                          {report?.rollingTurnoverIncomplete && " Загружены не все данные — введите фактический оборот вручную."}
                          {" "}Если порог превышен, для оценки применяется верхняя ставка к выбранному периоду.
                        </p>
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Стартовые значения для Кыргызской Республики: 0,25% для производства и/или реализации ювелирных изделий; для обычной торговли — 0,5% до 50 млн сомов за 12 месяцев при соблюдении условий, иначе 4% наличными и 2% безналично. Значения можно изменить.
                      {" "}Основание: <a className="underline" href="https://cbd.minjust.gov.kg/112340/edition/1286440/ru" target="_blank" rel="noreferrer">Налоговый кодекс КР, статья 423</a> (редакция от 06.08.2026).
                    </p>
                  </div>
                )}
                {(settings.tax.regime === "general" || settings.tax.regime === "other") && (
                  <p className="text-sm text-muted-foreground">
                    Предварительный расчёт для этого режима пока не настроен. Выгрузка покажет сверку без суммы налога.
                  </p>
                )}
                {settings.tax.regime === "none" && (
                  <p className="text-sm text-muted-foreground">Выберите единый налог, чтобы увидеть оценку по выбранной ставке.</p>
                )}
              </section>
            ) : (
            <fieldset disabled={phase === "building"} className="space-y-3 rounded-lg border p-3">
              <legend className="px-1 font-medium">Сценарный расчёт (не налоговая рекомендация)</legend>
              <label className="grid gap-1">
                <span className="sr-only">Сценарный налоговый режим</span>
                <select className={controlClass} value={settings.tax.regime} onChange={(e) => updateTax({ regime: e.target.value as TaxSettings["regime"] })}>
                  <option value="single">Единый налог (торговля)</option>
                  <option value="general">Общий режим (ОНР)</option>
                  <option value="none">Без налоговых расчётов</option>
                  <option value="other">Другой / специальный режим</option>
                </select>
              </label>
              {settings.tax.regime === "single" && <>
                <div className="grid grid-cols-2 gap-3">
                  {rateInput("singleCash", "Единый налог, нал (%)")}
                  {rateInput("singleElectronic", "Единый налог, безнал (%)")}
                </div>
              </>}
              {settings.tax.regime === "general" && <div className="grid gap-3 sm:grid-cols-3">
                {rateInput("vat", "НДС (%)")}
                <label className="grid gap-1">
                  <span>НсП, нал (%)</span>
                  <select className={controlClass} value={settings.tax.salesCash} onChange={(e) => updateTax({ salesCash: Number(e.target.value) })}>
                    <option value={1}>1%</option><option value={2}>2%</option>
                    {![1, 2].includes(settings.tax.salesCash) && <option value={settings.tax.salesCash}>{settings.tax.salesCash}% (сохранено)</option>}
                  </select>
                </label>
                {rateInput("salesElectronic", "НсП, безнал (%)")}
              </div>}
              <p className="text-xs text-muted-foreground">
                {settings.tax.regime === "general"
                  ? "НДС выделяется из суммы чека (12/112 при ставке 12%). НсП — с оборота без НДС. Входной НДС и налог на прибыль не учтены."
                  : settings.tax.regime === "none" ? "Налоги не вычитаются из финансового результата."
                  : settings.tax.regime === "other" ? "Для другого/специального режима расчётные правила не настроены."
                  : "Налог начисляется на фактически оплаченную сумму после скидок; возвраты уменьшают базу."}
                {" "}Это расчётная оценка, не налоговая декларация. Ставки и право на льготу подтвердите с бухгалтером.
              </p>
            </fieldset>
            )}

            {storageWarning && <p role="status" className="text-amber-700">Настройки применены, но хранилище браузера недоступно или повреждено: сохранение не гарантируется.</p>}
            <fieldset disabled={phase === "building"} className="space-y-2">
              <legend className="mb-2 font-medium">Листы и столбцы</legend>
              {SHEET_IDS.filter((id) => kind !== "gns" || id !== "stock").map((id) => (
                <details key={id} className="rounded-lg border">
                  <summary className="cursor-pointer p-3 font-medium">
                    {SHEET_LABELS[id]}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {settings.sheets[id].enabled ? id === "summary" ? "включён" : `${settings.sheets[id].columns.length} из ${available[id].length} столбцов` : "выключен"}
                    </span>
                  </summary>
                  <div className="space-y-3 border-t p-3">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={settings.sheets[id].enabled} onChange={(e) => updateSheet(id, { enabled: e.target.checked })} />
                      Включить лист «{SHEET_LABELS[id]}»
                    </label>
                    {id !== "summary" && <>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => updateSheet(id, { columns: [...available[id]] })}>Выбрать все</Button>
                        <Button variant="outline" size="sm" onClick={() => updateSheet(id, { columns: [] })}>Снять все</Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {available[id].map((header) => (
                          <label key={header} className="flex items-start gap-2 text-sm">
                            <input className="mt-1" type="checkbox" checked={settings.sheets[id].columns.includes(header)} onChange={(e) => updateSheet(id, {
                              columns: e.target.checked ? [...settings.sheets[id].columns, header] : settings.sheets[id].columns.filter((c) => c !== header),
                            })} />
                            {header}
                          </label>
                        ))}
                      </div>
                    </>}
                  </div>
                </details>
              ))}
            </fieldset>

            <section aria-label="Предварительный просмотр" className="space-y-3">
              <h3 className="font-medium">Предварительный просмотр</h3>
              {phase === "loading" && <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Загружаем продажи и возвраты…</p>}
              {loadError && <div role="alert" className="space-y-2 text-destructive">
                <p>{loadError}</p><Button variant="outline" onClick={() => void load()}>Повторить загрузку</Button>
              </div>}
              {truncated && <p role="alert" className="text-amber-700">Достигнут лимит 5000 чеков или возвратов. Предпросмотр неполный — сократите период перед скачиванием.</p>}
              {!!report?.warnings.length && (
                <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800">
                  {report.warnings.join(" ")}
                </p>
              )}
              {report?.error && <p role="alert" className="text-destructive">{report.error}</p>}
              {report && <>
                <p className="text-xs text-muted-foreground">
                  Продажи: {report.counts.sales} · Возвраты: {report.counts.returns}
                  {kind === "manager" && ` · На складе: ${report.counts.stock}`}.
                  {kind === "gns"
                    ? settings.tax.regime === "single" ? ` Предварительный налог: ${money(report.totals.tax)} сом.` : " Оценка налога не настроена."
                    : ` Расчётный налог: ${money(report.totals.tax)} сом.`}
                  {kind === "manager" && ` Чистая прибыль после налогов: ${money(report.totals.netProfit)} сом.`}
                </p>
                <div className="flex flex-wrap gap-2" aria-label="Листы предпросмотра">
                  {report.sheets.map((sheet) => <Button key={sheet.id} size="sm" variant={preview?.id === sheet.id ? "default" : "outline"} aria-pressed={preview?.id === sheet.id} onClick={() => setPreviewTab(sheet.id)}>{sheet.name}</Button>)}
                </div>
                {preview && preview.columns.length > 0 && <>
                  <div className="max-h-80 overflow-auto rounded-md border">
                    <table className="w-full text-left text-xs">
                      <caption className="sr-only">{preview.name}</caption>
                      <thead className="sticky top-0 bg-muted"><tr>{preview.columns.map((column) => <th key={column.header} className="whitespace-nowrap border-b p-2 font-medium">{column.header}</th>)}</tr></thead>
                      <tbody>
                        {preview.rows.slice(0, preview.id === "summary" ? undefined : 10).map((row, i) => <tr key={i}>
                          {row.map((cell, c) => <td key={c} className="max-w-md border-b p-2">{previewValue(cell, preview.columns[c].kind)}</td>)}
                        </tr>)}
                        {!preview.rows.length && <tr><td colSpan={preview.columns.length} className="p-4 text-muted-foreground">Нет данных за выбранный период</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">{preview.id === "summary" ? "Сводка показана полностью." : `Показано ${Math.min(10, preview.rows.length)} из ${preview.rows.length} строк. В Excel попадут все строки выбранных листов.`}</p>
                </>}
              </>}
            </section>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" disabled={phase === "building"} onClick={() => {
              const next = defaultReportSettings(kind ?? "gns")
              saveSettings(next)
            }}>Сбросить настройки</Button>
            <Button variant="outline" disabled={phase === "building"} onClick={close}>Закрыть</Button>
            <Button disabled={!report || !!report.error || !!phase || truncated} onClick={() => void download()}>
              {phase ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {phase === "building" ? "Формируем Excel…" : phase === "loading" ? "Загружаем данные…" : kind === "gns" ? "Скачать черновик сверки (.xlsx)" : "Скачать Excel (.xlsx)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
