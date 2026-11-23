"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2, Check, ChevronDown, Pencil, Plus, Store } from "lucide-react"
import {
  requestBusinessBranch,
  renameActiveBusinessBranch,
  setActiveBusinessBranch,
} from "@/app/actions/shops"
import type { BranchContext } from "@/lib/supabase/current-shop"
import type { BranchCreationRequest } from "@/app/actions/shops"
import { Button } from "@/components/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shared/ui/dialog"
import { toast } from "sonner"

type EditorMode = "manage" | "request" | "rename"

export function BranchControl({
  context,
  businessName,
  branchRequest,
  canManage,
  online,
}: {
  context: BranchContext
  businessName: string | null
  branchRequest: BranchCreationRequest | null
  canManage: boolean
  online: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<EditorMode>("manage")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const branches = context.branches.filter(
    (branch) => branch.businessId === context.businessId,
  )
  const activeBranch = branches.find((branch) => branch.isActive)
  const activeName = activeBranch?.shopName?.trim() || "Филиал"
  const hasSwitcher = branches.length >= 2
  const canOpen = canManage || hasSwitcher

  const resetEditor = () => {
    setMode("manage")
    setName("")
    setError(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && pending) return
    setOpen(nextOpen)
    if (!nextOpen) resetEditor()
  }

  const handleSwitch = (shopId: string) => {
    if (!online || pending || shopId === context.activeShopId) return
    setError(null)
    startTransition(async () => {
      try {
        await setActiveBusinessBranch(shopId)
        setOpen(false)
        toast.success("Активный филиал изменён")
        router.refresh()
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Не удалось переключить филиал")
      }
    })
  }

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!online || pending) return
    setError(null)
    startTransition(async () => {
      try {
        if (mode === "request") {
          await requestBusinessBranch(name)
          toast.success("Запрос отправлен супер-администратору")
          setMode("manage")
          setName("")
        } else {
          await renameActiveBusinessBranch(name)
          toast.success("Название филиала изменено")
          setOpen(false)
          resetEditor()
        }
        router.refresh()
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Не удалось сохранить изменения")
      }
    })
  }

  const trigger = (
    <button
      type="button"
      disabled={!online && canManage}
      aria-label={hasSwitcher ? "Выбрать активный филиал" : "Управление филиалами"}
      className="flex min-w-0 max-w-[190px] items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-left transition-colors hover:bg-primary/10 disabled:opacity-60 sm:max-w-64 sm:px-3 sm:py-2"
    >
      <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-xs font-semibold sm:text-sm">{activeName}</span>
      {canOpen && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  )

  if (!canOpen) {
    return (
      <div
        aria-label={activeName}
        className="flex min-w-0 max-w-[190px] items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-left sm:max-w-64 sm:px-3 sm:py-2"
      >
        <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold sm:text-sm">{activeName}</span>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        {mode === "manage" ? (
          <>
            <DialogHeader>
              <DialogTitle>Филиалы бизнеса</DialogTitle>
              <DialogDescription>
                {businessName?.trim() || "Бизнес"} · активный филиал: {activeName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {branches.map((branch) => {
                const selected = branch.shopId === context.activeShopId
                return (
                  <div
                    key={branch.shopId}
                    className="flex items-center gap-2 rounded-xl border border-border p-3"
                  >
                    <button
                      type="button"
                      onClick={() => handleSwitch(branch.shopId)}
                      disabled={!online || pending || selected}
                      aria-current={selected ? "true" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                    >
                      <Store className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {branch.shopName?.trim() || "Филиал без названия"}
                      </span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Активный" />}
                    </button>
                    {canManage && selected && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!online || pending}
                        onClick={() => {
                          setName(branch.shopName?.trim() ?? "")
                          setMode("rename")
                          setError(null)
                        }}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Название
                      </Button>
                    )}
                  </div>
                )
              })}
              {branches.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Нет доступных филиалов.
                </p>
              )}
            </div>
            {canManage && branchRequest?.status === "pending" && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm" role="status">
                Запрос «{branchRequest.requested_shop_name}» ожидает одобрения супер-администратора.
                До решения вы останетесь в текущем магазине.
              </div>
            )}
            {canManage && branchRequest?.status === "rejected" && (
              <p className="rounded-xl border border-border p-3 text-sm text-muted-foreground" role="status">
                Последний запрос отклонён. Вы можете отправить новый запрос.
              </p>
            )}
            {canManage && branchRequest?.status === "approved" && (
              <p className="rounded-xl border border-border p-3 text-sm text-muted-foreground" role="status">
                Точка одобрена. Вы остались в текущем магазине; выберите новую точку в списке, когда будете готовы.
              </p>
            )}
            {canManage && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={!online || pending || branchRequest?.status === "pending"}
                onClick={() => {
                  setName("")
                  setMode("request")
                  setError(null)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Запросить новую точку
              </Button>
            )}
            {!online && (
              <p className="text-xs text-muted-foreground">Управление филиалами доступно при подключении к интернету.</p>
            )}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{mode === "request" ? "Запрос новой точки" : "Название филиала"}</DialogTitle>
              <DialogDescription>
                {mode === "request"
                  ? "После одобрения супер-администратором точка появится в списке. До этого вы останетесь в текущем магазине."
                  : "Название активного филиала будет видно пользователям бизнеса."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <input
                autoFocus
                maxLength={200}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Название филиала"
                placeholder="Например, Центральный"
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setMode("manage")
                    setError(null)
                  }}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={!online || pending || !name.trim()}>
                  {pending ? "Отправляем…" : mode === "request" ? "Отправить на одобрение" : "Сохранить"}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
