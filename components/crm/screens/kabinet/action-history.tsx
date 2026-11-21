"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, History, Loader2, RefreshCw, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { getActionHistoryPage, undoAction } from "@/app/actions/action-history"
import { ACTION_HISTORY_LIMIT, isRemovalEntity, requiresAdminUndo, type ActionHistoryItem, type UndoActionResult } from "@/lib/action-history"
import { getOutboxPendingCount } from "@/lib/local-db/outbox"
import { getLocalDB } from "@/lib/local-db/db"
import { captureUndoBaseline, type UndoLocalBaseline } from "@/lib/local-db/undo-cache"
import { Button } from "@/components/shared/ui/button"
import { Badge } from "@/components/shared/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shared/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shared/ui/dialog"
import { HelpDisclosure } from "./help-disclosure"

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Asia/Bishkek",
  }).format(new Date(value))
}

export function ActionHistory({
  syncLocal = true,
  canUndoRates = false,
  onActionUndone,
}: {
  syncLocal?: boolean
  canUndoRates?: boolean
  onActionUndone?: (result: UndoActionResult, baseline: UndoLocalBaseline) => Promise<boolean>
}) {
  const router = useRouter()
  const [rows, setRows] = useState<ActionHistoryItem[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<ActionHistoryItem | null>(null)
  const [saving, setSaving] = useState(false)
  const requestId = useRef(0)
  const savingRef = useRef(false)
  const loadingRef = useRef(false)
  const expandedRef = useRef(false)
  const pageRef = useRef(0)
  const hasLoadedRef = useRef(false)

  const loadPage = useCallback(async (targetPage: number) => {
    if (loadingRef.current) return
    const id = ++requestId.current
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      if (!navigator.onLine) throw new Error("Для загрузки истории нужен интернет.")
      const result = await getActionHistoryPage(targetPage)
      if (id === requestId.current) {
        setRows(result.items)
        setHasMore(result.hasMore)
        setPage(targetPage)
        pageRef.current = targetPage
        hasLoadedRef.current = true
      }
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : "Не удалось загрузить историю")
    } finally {
      if (id === requestId.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [])

  const toggleExpanded = () => {
    const next = !expandedRef.current
    expandedRef.current = next
    setExpanded(next)
    if (next && !hasLoadedRef.current) void loadPage(0)
  }

  useEffect(() => {
    setOnline(navigator.onLine)
    const connected = () => {
      setOnline(true)
      if (expandedRef.current && !savingRef.current) void loadPage(pageRef.current)
    }
    const disconnected = () => setOnline(false)
    window.addEventListener("online", connected)
    window.addEventListener("offline", disconnected)
    return () => {
      ++requestId.current
      window.removeEventListener("online", connected)
      window.removeEventListener("offline", disconnected)
    }
  }, [loadPage])

  const undo = async () => {
    if (!selected || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      if (!navigator.onLine) throw new Error("Для отмены нужен интернет.")
      // An old queued edit must not replay over a successful server undo.
      if (syncLocal && await getOutboxPendingCount(selected.shop_id) > 0) {
        throw new Error("Сначала дождитесь синхронизации локальных изменений, затем повторите отмену.")
      }
      const baseline = syncLocal
        ? await captureUndoBaseline(await getLocalDB(), selected)
        : null
      const result = await undoAction(selected.id)
      setRows((prev) => prev.map((row) => row.id === selected.id
        ? { ...row, status: "undone", undone_at: new Date().toISOString() }
        : row))
      setSelected(null)
      toast.success(isRemovalEntity(selected.entity_type) ? "Действие отменено. Запись удалена, остатки и касса пересчитаны." : "Действие отменено. Предыдущие значения восстановлены.")
      if (baseline && onActionUndone) {
        try {
          if (!await onActionUndone(result, baseline)) {
            toast.warning("Отмена сохранена на сервере. Более новые локальные изменения не перезаписаны — дождитесь синхронизации.")
          }
        } catch {
          toast.warning("Отмена сохранена на сервере, но локальный кэш не обновился. Обновите приложение после синхронизации.")
        }
      }
      router.refresh()
      await loadPage(pageRef.current)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отменить действие")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls="action-history-content"
                onClick={toggleExpanded}
                className="flex w-full items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {expanded
                  ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <History className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>История действий</span>
              </button>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Последние {ACTION_HISTORY_LIMIT} действий · время Бишкека
            </p>
          </div>
          {expanded && (
            <Button
              variant="outline"
              size="sm"
              disabled={loading || saving || !online}
              onClick={() => void loadPage(pageRef.current)}
            >
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Обновить
            </Button>
          )}
        </CardHeader>
        <CardContent id="action-history-content" hidden={!expanded}>
          {expanded && (
            <>
              <div className="mb-4">
                <HelpDisclosure label="Пояснение к истории действий">
                  Офлайн-действия появляются после синхронизации. Можно отменить правку карточки или курса,
                  добавление товара, продажу (товары вернутся на склад, деньги уйдут из кассы) и кассовую операцию.
                </HelpDisclosure>
              </div>
              {!online && (
                <p role="status" className="mb-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  Нет подключения. Отмена доступна только онлайн.
                </p>
              )}
              {error && <p role="alert" className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <div className="hidden max-h-[32rem] overflow-y-auto rounded-lg border border-border md:block" aria-busy={loading}>
                <Table className="w-full table-fixed">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="px-3">Время</TableHead>
                      <TableHead>Сотрудник</TableHead>
                      <TableHead>Описание действия</TableHead>
                      <TableHead className="px-3">Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-28 text-center text-muted-foreground">
                          {loading ? "Загрузка истории…" : error ? "История недоступна" : "Изменений пока нет"}
                        </TableCell>
                      </TableRow>
                    ) : rows.map((row) => (
                      <TableRow key={row.id} className={row.status === "undone" ? "bg-muted/20" : undefined}>
                        <TableCell className="px-3 align-top font-mono text-xs">
                          <time dateTime={row.created_at}>{formatTime(row.created_at)}</time>
                        </TableCell>
                        <TableCell className="w-[18%] whitespace-normal break-words align-top">{row.employee_name}</TableCell>
                        <TableCell className="w-[42%] whitespace-normal break-words align-top">
                          {row.description.length > 110
                            ? (
                              <HelpDisclosure
                                label="Показать полное описание действия"
                                preview={`${row.description.slice(0, 110).trimEnd()}…`}
                              >
                                {row.description}
                              </HelpDisclosure>
                            )
                            : row.description}
                        </TableCell>
                        <TableCell className="px-3 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className={row.status === "undone" ? "text-muted-foreground" : "bg-primary/10 text-primary"}>
                              {row.status === "undone" ? <><CheckCircle2 className="mr-1 h-3 w-3" />Отменено</> : "Выполнено"}
                            </Badge>
                            {row.status === "active" && (
                              <Button variant="outline" size="xs"
                                disabled={saving || loading || !online || (requiresAdminUndo(row.entity_type) && !canUndoRates)}
                                title={requiresAdminUndo(row.entity_type) && !canUndoRates ? "Это действие может отменить только администратор" : undefined}
                                aria-label={`Отменить: ${row.description}`}
                                onClick={() => setSelected(row)}>
                                <RotateCcw /> Отменить
                              </Button>
                            )}
                          </div>
                          {row.undone_at && <div className="mt-1 text-[10px] text-muted-foreground">{formatTime(row.undone_at)}</div>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 md:hidden" aria-busy={loading}>
                {rows.length === 0 ? (
                  <div className="rounded-lg border border-border px-3 py-8 text-center text-sm text-muted-foreground">
                    {loading ? "Загрузка истории…" : error ? "История недоступна" : "Изменений пока нет"}
                  </div>
                ) : rows.map((row) => (
                  <article key={row.id} className="min-w-0 rounded-xl border border-border p-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <time className="font-mono text-[11px] text-muted-foreground" dateTime={row.created_at}>
                          {formatTime(row.created_at)}
                        </time>
                        <p className="mt-1 break-words text-xs font-medium">{row.employee_name}</p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`shrink-0 ${row.status === "undone" ? "text-muted-foreground" : "bg-primary/10 text-primary"}`}
                      >
                        {row.status === "undone" ? "Отменено" : "Выполнено"}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      {row.description.length > 110
                        ? (
                          <HelpDisclosure
                            label="Показать полное описание действия"
                            preview={`${row.description.slice(0, 110).trimEnd()}…`}
                          >
                            {row.description}
                          </HelpDisclosure>
                        )
                        : <p className="break-words text-sm leading-relaxed">{row.description}</p>}
                    </div>
                    {row.undone_at && (
                      <p className="mt-1 text-[10px] text-muted-foreground">Отменено: {formatTime(row.undone_at)}</p>
                    )}
                    {row.status === "active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        disabled={saving || loading || !online || (requiresAdminUndo(row.entity_type) && !canUndoRates)}
                        title={requiresAdminUndo(row.entity_type) && !canUndoRates ? "Это действие может отменить только администратор" : undefined}
                        aria-label={`Отменить: ${row.description}`}
                        onClick={() => setSelected(row)}
                      >
                        <RotateCcw /> Отменить действие
                      </Button>
                    )}
                  </article>
                ))}
              </div>
              {(rows.length > 0 || page > 0) && (
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Страница {page + 1} · записей на странице: {rows.length} · максимум {ACTION_HISTORY_LIMIT}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading || !online || page === 0}
                      onClick={() => void loadPage(page - 1)}
                    >
                      <ChevronLeft /> Назад
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading || !online || !hasMore}
                      onClick={() => void loadPage(page + 1)}
                    >
                      Далее <ChevronRight />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !savingRef.current) setSelected(null) }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg" showCloseButton={!saving}>
          <DialogHeader>
            <DialogTitle>Отменить действие?</DialogTitle>
            <DialogDescription>
              {selected?.description}.{" "}
              {selected?.entity_type === "product_create" && "Товар будет физически удалён из базы без возможности восстановления; офлайн-устройства удалят его при следующей синхронизации. Если он уже продан или взят на реализацию, отмена будет отклонена."}
              {selected?.entity_type === "sale" && "Чек будет аннулирован: товары вернутся на склад, сумма уйдёт из кассы, статистика клиента и бонусы продавца откатятся. Если по чеку был возврат, отмена будет отклонена."}
              {selected?.entity_type === "cash_operation" && "Кассовая операция будет аннулирована, остаток кассы пересчитается."}
              {selected && !isRemovalEntity(selected.entity_type) && "Будут восстановлены предыдущие значения изменённых полей. Если эти поля уже исправляли позже, отмена будет отклонена."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setSelected(null)}>Не отменять</Button>
            <Button disabled={saving || !online} onClick={() => void undo()}>
              {saving ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              {saving ? "Восстановление…" : "Отменить действие"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}