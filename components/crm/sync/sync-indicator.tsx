"use client"

import { useState, useEffect, useRef } from "react"
import { subscribeSyncState, getSyncState, type SyncProgressState } from "@/lib/local-db/sync-store"
import { syncEngine } from "@/lib/sync/sync-engine"
import { toast } from "sonner"
import { Button } from "@/components/shared/ui/button"
import { Badge } from "@/components/shared/ui/badge"
import {
  RefreshCw,
  AlertCircle,
  Database,
  X,
  Wifi,
  WifiOff,
} from "lucide-react"

/**
 * Isolated Sync Indicator component.
 * Uses subscribeSyncState directly, so it updates at up to 4fps WITHOUT
 * causing any parent screens or the main dashboard to re-render!
 */
export function SyncIndicator() {
  const [state, setState] = useState<SyncProgressState>(getSyncState())
  const [isOpen, setIsOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return subscribeSyncState((newState) => {
      setState({ ...newState })
    })
  }, [])

  useEffect(() => {
    const updateNetworkStatus = () => setIsOnline(navigator.onLine)
    updateNetworkStatus()
    window.addEventListener("online", updateNetworkStatus)
    window.addEventListener("offline", updateNetworkStatus)
    return () => {
      window.removeEventListener("online", updateNetworkStatus)
      window.removeEventListener("offline", updateNetworkStatus)
    }
  }, [])

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const {
    status,
    percent,
    outboxPendingCount,
    outboxNeedsAttentionCount,
    outboxLastError,
    lastSuccessAt,
    currentTask,
    lastError,
    isStale,
  } = state

  const handleSyncNow = () => {
    syncEngine.triggerSync()
  }

  const handleRetryDeadOutbox = async () => {
    try {
      const retried = await syncEngine.retryDeadOutbox()
      if (retried > 0) toast.info(`Повторная отправка: ${retried} операций`)
      else toast.info("Нет операций для повторной отправки")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось повторить отправку")
    }
  }

  const unresolvedOperationCount = outboxPendingCount + outboxNeedsAttentionCount
  const dotColor =
    outboxNeedsAttentionCount > 0
      ? "bg-destructive"
      : outboxPendingCount > 0
      ? "bg-amber-500"
      : status === "synced"
      ? "bg-emerald-500"
      : status === "syncing"
      ? "bg-blue-500 animate-pulse"
      : status === "offline"
      ? "bg-amber-500"
      : status === "error"
      ? "bg-destructive"
      : "bg-muted-foreground"
  const progressPercent = Math.max(0, Math.min(100, Math.round(percent)))
  const statusDescription =
    outboxNeedsAttentionCount > 0
      ? `Требуют внимания: ${outboxNeedsAttentionCount}`
      : outboxPendingCount > 0
      ? isOnline ? `Ожидают отправки: ${outboxPendingCount}` : `Сохранены локально: ${outboxPendingCount}`
      : status === "synced"
      ? "Онлайн"
      : status === "syncing"
      ? `Сверка данных, ${progressPercent}%`
      : status === "offline"
      ? "Офлайн"
      : status === "error"
      ? "Ошибка связи"
      : "Ожидание"

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/60 shadow-xs transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        title={`Статус синхронизации: ${statusDescription}${unresolvedOperationCount > 0 ? `; неподтверждённых операций: ${unresolvedOperationCount}` : ""}`}
        aria-label={`Статус синхронизации: ${statusDescription}${unresolvedOperationCount > 0 ? `; неподтверждённых операций: ${unresolvedOperationCount}` : ""}`}
        aria-expanded={isOpen}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} aria-hidden="true" />
        {unresolvedOperationCount > 0 && (
          <span
            className={`absolute right-0 top-0 h-2 w-2 rounded-full ${outboxNeedsAttentionCount > 0 ? "bg-destructive" : "bg-amber-500"} ring-2 ring-card`}
            title="Есть неподтверждённые операции"
            aria-hidden="true"
          />
        )}
      </button>

      {/* Detail Popover Panel */}
      {isOpen && (
        <div className="fixed inset-x-3 top-[4.5rem] z-50 max-h-[calc(100dvh-5.5rem)] w-auto overflow-y-auto rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl animate-in fade-in-50 zoom-in-95 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[calc(100dvh-6rem)] sm:w-80 sm:max-w-[calc(100vw-1.5rem)]">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2">
              <div className="flex min-w-0 items-center gap-2">
                <Database className="w-4 h-4 shrink-0 text-primary" />
                <span className="min-w-0 font-semibold leading-snug text-foreground">Синхронизация данных</span>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={
                    outboxNeedsAttentionCount > 0
                      ? "bg-destructive/10 text-destructive border-destructive/20"
                      : outboxPendingCount > 0
                      ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300"
                      : status === "synced"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : status === "syncing"
                      ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300"
                      : status === "offline"
                      ? "bg-muted text-muted-foreground"
                      : status === "error"
                      ? "bg-destructive/10 text-destructive border-destructive/20"
                      : "bg-muted text-muted-foreground border-border"
                  }
                >
                  {outboxNeedsAttentionCount > 0 && `Требуют внимания: ${outboxNeedsAttentionCount}`}
                  {outboxNeedsAttentionCount === 0 && outboxPendingCount > 0 && (isOnline ? `Ожидают отправки: ${outboxPendingCount}` : `Сохранены локально: ${outboxPendingCount}`)}
                  {unresolvedOperationCount === 0 && status === "synced" && "Всё зеркально"}
                  {unresolvedOperationCount === 0 && status === "syncing" && `Обмен (${Math.round(percent)}%)`}
                  {unresolvedOperationCount === 0 && status === "offline" && "Локальный режим"}
                  {unresolvedOperationCount === 0 && status === "error" && "Сбой связи"}
                  {unresolvedOperationCount === 0 && status === "idle" && "Ожидание"}
                </Badge>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-2 rounded-lg bg-muted/50 p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Загрузка данных с сервера</span>
                <span className="font-medium text-foreground">{progressPercent}%</span>
              </div>
              {status === "syncing" && currentTask && (
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Загрузка данных с сервера"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                >
                  <div
                    className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Состояние сети:</span>
              <span className={`inline-flex items-center gap-1.5 font-medium ${isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {isOnline ? "Подключение есть" : "Нет подключения"}
              </span>
            </div>

            {isStale && (
              <div>
                <Badge
                  variant="outline"
                  className="h-5 border-amber-300 bg-amber-50 px-2 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                  title="Показаны локальные данные, не подтверждённые облаком"
                >
                  Устаревшие данные
                </Badge>
              </div>
            )}

            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Локальное хранилище:</span>
                <span className="font-medium text-foreground">IndexedDB (активно)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Неподтверждённые операции:</span>
                <span className={`font-medium ${unresolvedOperationCount > 0 ? "text-amber-700 dark:text-amber-400" : "text-foreground"}`}>
                  {unresolvedOperationCount === 0 ? "Нет" : `${outboxPendingCount} в очереди · ${outboxNeedsAttentionCount} требуют внимания`}
                </span>
              </div>
              {lastSuccessAt && (
                <div className="flex items-center justify-between">
                  <span>Последняя сверка:</span>
                  <span className="font-medium text-foreground">
                    {new Date(lastSuccessAt).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>

            {currentTask && (
              <div className="p-2 rounded bg-muted/60 text-xs text-muted-foreground flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                <span className="truncate">{currentTask}</span>
              </div>
            )}

            {lastError && (
              <div className="flex items-start gap-1.5 rounded bg-destructive/10 p-2 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">{lastError}</span>
              </div>
            )}

            {unresolvedOperationCount > 0 && outboxLastError && (
              <div className="flex items-start gap-1.5 rounded bg-destructive/10 p-2 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">
                  {outboxNeedsAttentionCount > 0 ? "Операция требует внимания: " : "Последняя ошибка отправки: "}{outboxLastError}
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
              <span className="text-[11px] text-muted-foreground">
                Работает без интернета
              </span>
              {outboxNeedsAttentionCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2.5 text-xs"
                  onClick={handleRetryDeadOutbox}
                  disabled={!isOnline || status === "syncing"}
                >
                  Повторить ошибки
                </Button>
              )}
              <Button
                size="sm"
                variant="default"
                className="h-7 shrink-0 px-2.5 text-xs"
                onClick={handleSyncNow}
                disabled={status === "syncing"}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${status === "syncing" ? "animate-spin" : ""}`} />
                Синхронизировать
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
