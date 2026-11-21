"use client"

import { useState } from "react"
import type { Profile } from "@/lib/types"
import { deleteMyAccount } from "@/app/actions/account"
import { purgeDeletedAccountData } from "@/lib/local-db/device-logout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"

type Props = {
  profile: Pick<Profile, "role" | "status"> | null
}

export function AccountDeletionControl({ profile }: Props) {
  const [open, setOpen] = useState(false)
  const [warningStep, setWarningStep] = useState<1 | 2>(1)
  const [deleting, setDeleting] = useState(false)
  const isApprovedAdmin = profile?.role === "admin" && profile.status === "approved"
  const isApprovedSeller = profile?.role === "seller" && profile.status === "approved"

  const impact = isApprovedAdmin
    ? "Будут удалены ваши записи и все аккаунты продавцов этого магазина. Если вы последний администратор, магазин будет удалён полностью — со всеми данными и фотографиями. Если остаётся другой администратор, магазин и его данные сохранятся."
    : isApprovedSeller
      ? "Будут удалены ваш аккаунт и связанные с ним записи. Магазин и данные остальных пользователей сохранятся."
      : "Будут удалены ваш аккаунт и связанные с ним данные."

  const close = () => {
    if (deleting) return
    setOpen(false)
    setWarningStep(1)
  }

  const confirmDeletion = async () => {
    if (warningStep === 1) {
      setWarningStep(2)
      return
    }

    setDeleting(true)
    try {
      const result = await deleteMyAccount()
      let localCleanupPending = false
      try {
        await purgeDeletedAccountData()
      } catch {
        // The server account is already gone; still clear the local session.
        localCleanupPending = true
      }
      try {
        await createClient().auth.signOut({ scope: "local" })
      } catch {
        // Local storage may be unavailable after the account has been deleted.
      }
      const cleanupPending = result.cleanupPending || localCleanupPending
      if (cleanupPending) {
        toast.error("Аккаунт удалён, но очистка части данных не подтверждена. Свяжитесь с администратором.")
      } else {
        toast.success("Аккаунт и связанные данные удалены")
      }
      window.location.replace(`/auth/login?accountDeleted=1${cleanupPending ? "&cleanupPending=1" : ""}`)
    } catch (error) {
      setDeleting(false)
      toast.error(error instanceof Error ? error.message : "Не удалось удалить аккаунт")
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          setWarningStep(1)
          setOpen(true)
        }}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Удалить аккаунт
      </Button>

      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {warningStep === 1 ? "Предупреждение 1 из 2" : "Предупреждение 2 из 2"}
            </DialogTitle>
            <DialogDescription className="space-y-2 text-sm leading-relaxed">
              <span className="block">
                Удаление необратимо: аккаунт нельзя восстановить. Все перечисленные данные будут
                стёрты без возможности восстановления.
              </span>
              <span className="block">{impact}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={deleting}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDeletion()}
              disabled={deleting}
            >
              {deleting
                ? "Удаляем…"
                : warningStep === 1
                  ? "Продолжить"
                  : "Удалить аккаунт"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
